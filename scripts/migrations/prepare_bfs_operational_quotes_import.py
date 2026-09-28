#!/usr/bin/env python3
"""Build the private, guarded BFS operational-quote import from prepared JSONL.

The output contains commercial and customer data; keep it outside the repository.
"""

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from prepare_bfs_crm_import import DATABASE, TENANT_ID, insert_batch, load, uid


CURRENCY = {"ARS": "ARS", "USD_BNA_BILLETE": "USD_BILLETE", "USD_BNA_DIVISA": "USD_DIVISA"}
STATUS = {"draft": "Draft", "ordered": "Ordered", "rejected": "Rejected"}


def timestamp(value):
    if len(value) == 10:
        # Noon UTC keeps a date-only legacy issue date on the same day in Argentina.
        value += "T12:00:00"
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    quotes = [row["legacy"] for row in load(args.source / "quotes.jsonl")]
    lines = [row["legacy"] for row in load(args.source / "quote_items.jsonl")]
    entities = {row["legacy"]["id"]: row for row in load(args.source / "entities.jsonl")}
    contacts = {row["legacy"]["id"]: row["legacy"] for row in load(args.source / "entity_contacts.jsonl")}
    locations = {row["legacy"]["id"]: row["legacy"] for row in load(args.source / "entity_locations.jsonl")}
    if len(quotes) != 118 or len(lines) != 239:
        raise ValueError("Unexpected source count")

    families = defaultdict(list)
    for quote in quotes:
        families[quote["parent_id"] or quote["id"]].append(quote)
    latest = sorted(
        (max(versions, key=lambda q: (int(q["revision"]), str(q["date"]), int(q["id"])))
         for versions in families.values()),
        key=lambda q: q["id"],
    )
    if len(latest) != 66 or len({q["quote_number"] for q in latest}) != 66:
        raise ValueError("Unexpected latest revision families or duplicate active numbers")
    if Counter(q["status"] for q in latest) != {"draft": 50, "ordered": 12, "rejected": 4}:
        raise ValueError("Unexpected active statuses")
    by_quote = defaultdict(list)
    for line in lines:
        by_quote[line["quote_id"]].append(line)

    quote_rows, line_rows, promotion_rows = [], [], []
    for quote in latest:
        customer = entities[quote["client_id"]]["prepared"]
        if not customer["is_customer"] or not customer["tax_condition"]:
            raise ValueError("A selected quote lacks an imported customer")
        for key, source in (("contact_id", contacts), ("location_id", locations)):
            if quote[key] and source[quote[key]]["entity_id"] != quote["client_id"]:
                raise ValueError("A quote contact/location belongs to another customer")
        if quote["currency"] not in CURRENCY or quote["status"] not in STATUS:
            raise ValueError("Unmapped currency/status")
        quote_id = uid("operational-quote", quote["id"])
        historical_id = uid("historical-quote", quote["id"])
        old_net = Decimal(str(quote["total"] or 0))
        selected_lines = by_quote[quote["id"]]
        if not selected_lines:
            raise ValueError("Selected quote has no lines")
        calculated_net = Decimal(0)
        for line in selected_lines:
            if line["currency_code"] not in CURRENCY:
                raise ValueError("Unmapped line currency")
            line_net = (Decimal(str(line["quantity"])) * Decimal(str(line["unit_price"])) *
                        (1 - Decimal(str(line["discount_percent"] or 0)) / 100)).quantize(
                            Decimal("0.01"), rounding=ROUND_HALF_UP)
            if not line["is_optional"]:
                calculated_net += line_net
            line_rows.append((
                uid("operational-quote-line", line["id"]), None, line["description"],
                str(line["quantity"]), str(line["unit_price"]), str(line["discount_percent"] or 0),
                str(line["tax_rate"] or 0), bool(line["is_optional"]),
                CURRENCY[line["currency_code"]], quote_id, line["detailed_description"],
            ))
        if abs(calculated_net - old_net) > Decimal("0.02"):
            raise ValueError("Selected quote net differs from its original")
        # The quote's issue date, not the database insert timestamp, appears on the new PDF.
        created = timestamp(quote["date"])
        quote_rows.append((
            quote_id, TENANT_ID, str(quote["quote_number"]), quote["revision"],
            uid("customer", quote["client_id"]), None, STATUS[quote["status"]],
            CURRENCY[quote["currency"]], 0, max(1, int(quote["valid_days"] or 15)),
            quote["notes"], None, created, created,
            uid("contact", quote["contact_id"]) if quote["contact_id"] else None,
            None, 0, 0,
            uid("location", quote["location_id"]) if quote["location_id"] else None,
            quote["payment_method"], quote["payment_terms"], quote["transportation"],
            quote["warranty"], quote["delivery_time"],
        ))
        promotion_rows.append((quote["id"], historical_id, quote_id, str(old_net)))

    if len(line_rows) != 134:
        raise ValueError("Unexpected selected line count")
    args.destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = args.destination / "bfs_operational_quotes_import.sql"
    with path.open("w", encoding="utf-8") as out:
        out.write("\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL client_encoding = 'UTF8';\n")
        out.write(f"""DO $$ BEGIN
          IF current_database() <> '{DATABASE}'
             OR (SELECT count(*) FROM sales.historical_quotes WHERE "TenantId" = '{TENANT_ID}') <> 118
             OR (SELECT count(*) FROM sales.quotes WHERE "TenantId" = '{TENANT_ID}') <> 0
             OR to_regclass('legacy_bfs.quote_promotions') IS NOT NULL THEN
            RAISE EXCEPTION 'BFS operational quote preflight failed';
          END IF;
        END $$;
        CREATE TABLE legacy_bfs.quote_promotions (
          legacy_id bigint PRIMARY KEY,
          historical_quote_id uuid NOT NULL UNIQUE,
          operational_quote_id uuid NOT NULL UNIQUE,
          original_net numeric(18,2) NOT NULL
        );
        """)
        insert_batch(out, "legacy_bfs.quote_promotions", [
            "legacy_id", "historical_quote_id", "operational_quote_id", "original_net",
        ], promotion_rows)
        out.write(f"""DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM legacy_bfs.quote_promotions p
            LEFT JOIN sales.historical_quotes h ON h."Id" = p.historical_quote_id
              AND h."TenantId" = '{TENANT_ID}' AND h."LegacyId" = p.legacy_id
            WHERE h."Id" IS NULL OR h."NetTotal" <> p.original_net
          ) THEN RAISE EXCEPTION 'Historical quote reference mismatch'; END IF;
        END $$;
        """)
        insert_batch(out, "sales.quotes", [
            '"Id"', '"TenantId"', '"QuoteNumber"', '"Revision"', '"CustomerId"',
            '"OpportunityId"', '"Status"', '"Currency"', '"DiscountPercent"',
            '"ValidDays"', '"Notes"', '"OwnerName"', '"CreatedAtUtc"', '"UpdatedAtUtc"',
            '"ContactId"', '"DeliveryTimeDays"', '"ExchangeRateUsdBillete"',
            '"ExchangeRateUsdDivisa"', '"LocationId"', '"PaymentMethod"', '"PaymentTerms"',
            '"Transportation"', '"Warranty"', '"DeliveryTimeText"',
        ], quote_rows)
        insert_batch(out, "sales.quote_lines", [
            '"Id"', '"ProductId"', '"Description"', '"Quantity"', '"UnitPrice"',
            '"DiscountPercent"', '"TaxRate"', '"IsOptional"', '"CurrencyCode"',
            'quote_id', '"TechnicalDetail"',
        ], line_rows)
        out.write("""UPDATE sales.historical_quotes h
        SET "PromotedQuoteId" = p.operational_quote_id
        FROM legacy_bfs.quote_promotions p
        WHERE h."Id" = p.historical_quote_id;
        DO $$ BEGIN
          IF (SELECT count(*) FROM legacy_bfs.quote_promotions) <> 66
             OR (SELECT count(*) FROM sales.quotes WHERE "TenantId" = 'e0801f60-d5f0-42bf-84ff-7869a3eb8e3d') <> 66
             OR (SELECT count(*) FROM sales.quote_lines) <> 134
             OR (SELECT count(*) FROM sales.historical_quotes WHERE "PromotedQuoteId" IS NULL) <> 52
             OR EXISTS (
                 SELECT 1 FROM sales.quotes q
                 LEFT JOIN crm.customers c ON c."Id" = q."CustomerId" AND c."TenantId" = q."TenantId"
                 LEFT JOIN crm.customer_contacts ct ON ct."Id" = q."ContactId"
                 LEFT JOIN crm.customer_locations loc ON loc."Id" = q."LocationId"
                 WHERE c."Id" IS NULL
                   OR (q."ContactId" IS NOT NULL AND (ct."Id" IS NULL OR ct.customer_id <> q."CustomerId"))
                   OR (q."LocationId" IS NOT NULL AND (loc."Id" IS NULL OR loc.customer_id <> q."CustomerId"))
             ) THEN RAISE EXCEPTION 'Operational quote reconciliation failed'; END IF;
        END $$;
        COMMIT;
        SELECT (SELECT count(*) FROM sales.quotes),
               (SELECT count(*) FROM sales.quote_lines),
               (SELECT count(*) FROM sales.historical_quotes WHERE "PromotedQuoteId" IS NULL);
        """)
    path.chmod(0o600)
    print("Prepared 66 operational quotes, 134 lines, 52 historical revisions:", path)


if __name__ == "__main__":
    main()
