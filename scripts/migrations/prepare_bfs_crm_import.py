#!/usr/bin/env python3
"""Prepare a guarded, transactional CRM import from the private BFS JSONL export.

The generated SQL contains personal data. Keep it outside Git, transfer it over SSH,
and pipe it to psql on the verified, empty BFS tenant database only.
"""

import argparse
import json
import re
import unicodedata
import uuid
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path


TENANT_ID = "e0801f60-d5f0-42bf-84ff-7869a3eb8e3d"
DATABASE = "leal_tenant_bfs"
NAMESPACE = uuid.UUID("32fcfe26-52c5-4cca-9060-90e33c8031a1")
PROVINCES = {
    "CIUDAD AUTONOMA DE BUENOS AIRES": "Caba",
    "CIUDAD AUTONOMA BUENOS AIRES": "Caba",
    **{name.upper(): value for name, value in (
        ("Buenos Aires", "BuenosAires"), ("Catamarca", "Catamarca"),
        ("Chaco", "Chaco"), ("Chubut", "Chubut"),
        ("Cordoba", "Cordoba"), ("Corrientes", "Corrientes"),
        ("Entre Rios", "EntreRios"), ("Formosa", "Formosa"),
        ("Jujuy", "Jujuy"), ("La Pampa", "LaPampa"),
        ("La Rioja", "LaRioja"), ("Mendoza", "Mendoza"),
        ("Misiones", "Misiones"), ("Neuquen", "Neuquen"),
        ("Rio Negro", "RioNegro"), ("Salta", "Salta"),
        ("San Juan", "SanJuan"), ("San Luis", "SanLuis"),
        ("Santa Cruz", "SantaCruz"), ("Santa Fe", "SantaFe"),
        ("Santiago del Estero", "SantiagoDelEstero"),
        ("Tierra del Fuego", "TierraDelFuego"), ("Tucuman", "Tucuman"))},
}


def load(path):
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    value = str(value)
    if "\x00" in value:
        raise ValueError("NUL in source value")
    return "'" + value.replace("'", "''") + "'"


def text(value, max_length, label, issues):
    value = str(value).strip() if value is not None else None
    if not value:
        return None
    if len(value) > max_length:
        issues[label] += 1
        return None
    return value


def phone(value, label, issues):
    if not value:
        return None
    digits = re.sub(r"\D", "", str(value))
    if 8 <= len(digits) <= 15:
        return digits
    issues[label] += 1
    return None


def uid(kind, legacy_id):
    return str(uuid.uuid5(NAMESPACE, f"bfs:{kind}:{legacy_id}"))


def province(value):
    if not value:
        return None
    normalized = unicodedata.normalize("NFKD", str(value))
    normalized = "".join(c for c in normalized if not unicodedata.combining(c)).upper().strip()
    return PROVINCES.get(normalized)


def insert_batch(handle, table, columns, rows):
    if not rows:
        return
    header = "INSERT INTO " + table + " (" + ", ".join(columns) + ") VALUES\n"
    for start in range(0, len(rows), 100):
        chunk = rows[start:start + 100]
        handle.write(header)
        handle.write(",\n".join("(" + ", ".join(sql(v) for v in row) + ")" for row in chunk))
        handle.write(";\n")


def prepare(source, destination):
    entities = load(source / "entities.jsonl")
    if len(entities) != 2098:
        raise ValueError(f"Unexpected source entity count: {len(entities)}")
    issues = Counter()
    customers, suppliers, maps = [], [], []
    imported_at = datetime.now(timezone.utc).isoformat()
    by_legacy_id = {r["legacy"]["id"]: r for r in entities}
    for record in entities:
        old, prepared = record["legacy"], record["prepared"]
        legacy_id = old["id"]
        tax = prepared["tax_condition"]
        if not tax:
            issues["excluded_unknown_tax"] += 1
            continue
        name = text(old["name"], 200, "excluded_long_name", issues)
        if not name:
            raise ValueError(f"Missing/long legal name at legacy ID {legacy_id}")
        c_id = uid("customer", legacy_id) if prepared["is_customer"] else None
        s_id = uid("supplier", legacy_id) if prepared["is_supplier"] else None
        flags = list(prepared["review_flags"])
        province_raw = old.get("fiscal_province")
        fiscal_province = province(province_raw)
        if province_raw and not fiscal_province:
            issues["unmapped_province"] += 1
            flags.append("province_unmapped")
        fiscal_street = text(prepared.get("fiscal_street"), 200, "customer_street_too_long", issues)
        fiscal_city = text(prepared.get("fiscal_city"), 120, "customer_city_too_long", issues)
        fiscal_postal = text(prepared.get("fiscal_postal_code"), 12, "customer_postal_too_long", issues)
        if not fiscal_province and any((fiscal_street, fiscal_city, fiscal_postal)):
            issues["fiscal_address_pending_province"] += 1
            flags.append("fiscal_address_pending_province")
            fiscal_street = fiscal_city = fiscal_postal = None
        number = prepared["document_number"] or ""
        if c_id:
            customer_phone = phone(old.get("phone"), "customer_phone_unmapped", issues)
            if old.get("phone") and customer_phone is None:
                flags.append("customer_phone_unmapped")
            customers.append((
                c_id, TENANT_ID, name, "Cuit", number, tax, "Local", "Active",
                True, bool(s_id),
                text(old.get("email"), 200, "customer_email_too_long", issues),
                customer_phone,
                phone(old.get("whatsapp_phone"), "customer_whatsapp_unmapped", issues),
                fiscal_street,
                fiscal_city,
                fiscal_province,
                fiscal_postal,
                bool(old.get("is_large_company")),
                imported_at, imported_at,
            ))
        if s_id:
            suppliers.append((
                s_id, TENANT_ID, name, "Cuit", number, tax,
                text(old.get("email"), 128, "supplier_email_too_long", issues),
                text(old.get("phone"), 64, "supplier_phone_too_long", issues),
                text(prepared.get("fiscal_street"), 256, "supplier_street_too_long", issues),
                text(prepared.get("fiscal_city"), 128, "supplier_city_too_long", issues),
                text(prepared.get("fiscal_province"), 64, "supplier_province_too_long", issues),
                text(prepared.get("fiscal_postal_code"), 20, "supplier_postal_too_long", issues),
                imported_at,
            ))
        maps.append((
            legacy_id, c_id, s_id,
            json.dumps(flags, ensure_ascii=False),
            json.dumps(old, ensure_ascii=False),
        ))

    if (len(customers), len(suppliers), len(maps)) != (764, 1393, 2095):
        raise ValueError("Unexpected prepared counts; inspect source before importing")

    source_locations = [r["legacy"] for r in load(source / "entity_locations.jsonl")]
    source_contacts = [r["legacy"] for r in load(source / "entity_contacts.jsonl")]
    locations, contacts = [], []
    usable_location_ids = set()
    for row in source_locations:
        entity = by_legacy_id[row["entity_id"]]
        if not entity["prepared"]["is_customer"] or not entity["prepared"]["tax_condition"]:
            continue
        location_province = province(row.get("province")) or province(entity["legacy"].get("fiscal_province"))
        if not location_province:
            issues["excluded_location_no_province"] += 1
            continue
        usable_location_ids.add(row["id"])
        locations.append((
            uid("location", row["id"]), uid("customer", row["entity_id"]),
            text(row["name"], 160, "location_name_too_long", issues),
            text(row.get("address"), 200, "location_street_too_long", issues) or "",
            text(row.get("city"), 120, "location_city_too_long", issues) or "",
            location_province,
            text(row.get("zip_code"), 12, "location_postal_too_long", issues) or "",
        ))
    for row in source_contacts:
        entity = by_legacy_id[row["entity_id"]]
        if not entity["prepared"]["is_customer"] or not entity["prepared"]["tax_condition"]:
            issues["supplier_only_contact_archived"] += 1
            continue
        raw_role = str(row.get("role") or "").strip()
        role = {"Comercial": "Commercial", "Administración": "Administrative"}.get(raw_role, "Other")
        contacts.append((
            uid("contact", row["id"]), uid("customer", row["entity_id"]),
            text(row["name"], 160, "contact_name_too_long", issues), role,
            uid("location", row["location_id"]) if row.get("location_id") in usable_location_ids else None,
            text(row.get("email"), 200, "contact_email_too_long", issues),
            phone(row.get("phone"), "contact_phone_unmapped", issues),
            False, ("Rol anterior: " + raw_role) if raw_role else None,
        ))
    if (len(locations), len(contacts)) != (49, 57):
        raise ValueError("Unexpected customer location/contact counts")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = destination / "bfs_crm_import.sql"
    with path.open("w", encoding="utf-8") as out:
        out.write("\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL client_encoding = 'UTF8';\n")
        out.write(f"""DO $$ BEGIN
            IF current_database() <> '{DATABASE}' THEN
                RAISE EXCEPTION 'Wrong target database: %', current_database();
            END IF;
            IF (SELECT count(*) FROM crm.customers) <> 0
               OR (SELECT count(*) FROM crm.suppliers) <> 0
               OR (SELECT count(*) FROM sales.quotes) <> 0 THEN
                RAISE EXCEPTION 'BFS target is not empty';
            END IF;
        END $$;
        CREATE SCHEMA IF NOT EXISTS legacy_bfs;
        CREATE TABLE legacy_bfs.entities (
            legacy_id bigint PRIMARY KEY,
            customer_id uuid UNIQUE,
            supplier_id uuid UNIQUE,
            review_flags jsonb NOT NULL,
            source_snapshot jsonb NOT NULL
        );
        CREATE TABLE legacy_bfs.locations (legacy_id bigint PRIMARY KEY, source_snapshot jsonb NOT NULL);
        CREATE TABLE legacy_bfs.contacts (legacy_id bigint PRIMARY KEY, source_snapshot jsonb NOT NULL);
        """)
        insert_batch(out, "crm.customers", [
            '"Id"', '"TenantId"', '"LegalName"', 'document_type', 'document_number',
            '"TaxCondition"', '"IibbRegime"', '"Status"', '"IsCustomer"', '"IsSupplier"',
            'email', 'phone', 'whatsapp', 'fiscal_street', 'fiscal_city',
            'fiscal_province', 'fiscal_postal_code', '"IsLargeCompany"',
            '"CreatedAtUtc"', '"UpdatedAtUtc"',
        ], customers)
        insert_batch(out, "crm.suppliers", [
            '"Id"', '"TenantId"', '"LegalName"', '"DocumentType"', '"DocumentNumber"',
            '"TaxCondition"', '"Email"', '"Phone"', '"FiscalStreet"', '"FiscalCity"',
            '"FiscalProvince"', '"FiscalPostalCode"', '"CreatedAtUtc"',
        ], suppliers)
        insert_batch(out, "legacy_bfs.entities", [
            'legacy_id', 'customer_id', 'supplier_id', 'review_flags', 'source_snapshot',
        ], maps)
        insert_batch(out, "crm.customer_locations", [
            '"Id"', 'customer_id', '"Name"', 'street', 'city', 'province', 'postal_code',
        ], locations)
        insert_batch(out, "crm.customer_contacts", [
            '"Id"', 'customer_id', '"Name"', '"Role"', '"LocationId"',
            'email', 'phone', '"IsPrimary"', '"Notes"',
        ], contacts)
        insert_batch(out, "legacy_bfs.locations", ['legacy_id', 'source_snapshot'], [
            (row['id'], json.dumps(row, ensure_ascii=False)) for row in source_locations
        ])
        insert_batch(out, "legacy_bfs.contacts", ['legacy_id', 'source_snapshot'], [
            (row['id'], json.dumps(row, ensure_ascii=False)) for row in source_contacts
        ])
        out.write("""DO $$ BEGIN
            IF (SELECT count(*) FROM crm.customers WHERE "TenantId" = 'e0801f60-d5f0-42bf-84ff-7869a3eb8e3d') <> 764
               OR (SELECT count(*) FROM crm.suppliers WHERE "TenantId" = 'e0801f60-d5f0-42bf-84ff-7869a3eb8e3d') <> 1393
               OR (SELECT count(*) FROM legacy_bfs.entities) <> 2095
               OR (SELECT count(*) FROM crm.customer_locations) <> 49
               OR (SELECT count(*) FROM crm.customer_contacts) <> 57
               OR (SELECT count(*) FROM legacy_bfs.locations) <> 49
               OR (SELECT count(*) FROM legacy_bfs.contacts) <> 58 THEN
                RAISE EXCEPTION 'CRM reconciliation failed';
            END IF;
        END $$;
        COMMIT;
        SELECT (SELECT count(*) FROM crm.customers) AS customers,
               (SELECT count(*) FROM crm.suppliers) AS suppliers,
               (SELECT count(*) FROM legacy_bfs.entities) AS legacy_entities,
               (SELECT count(*) FROM crm.customer_locations) AS locations,
               (SELECT count(*) FROM crm.customer_contacts) AS contacts;
        """)
    path.chmod(0o600)
    return path, issues


def prepare_quotes(source, destination):
    entities = {r["legacy"]["id"]: r for r in load(source / "entities.jsonl")}
    quotes = [r["legacy"] for r in load(source / "quotes.jsonl")]
    lines = [r["legacy"] for r in load(source / "quote_items.jsonl")]
    by_quote = {}
    for line in lines:
        by_quote.setdefault(line["quote_id"], []).append(line)
    if (len(quotes), len(lines)) != (118, 239):
        raise ValueError("Unexpected source quote/line count")

    prepared = []
    for quote in quotes:
        customer = entities[quote["client_id"]]["prepared"]
        if not customer["is_customer"] or not customer["tax_condition"]:
            raise ValueError("Historical quote customer is not in CRM import")
        quote_lines = sorted(by_quote.get(quote["id"], []), key=lambda line: line["id"])
        original_net = Decimal(str(quote["total"] or 0))
        calculated_net = sum(
            (Decimal(str(line["total"] or 0)) for line in quote_lines if not line["is_optional"]),
            Decimal(0),
        )
        if abs(original_net - calculated_net) > Decimal("0.02"):
            raise ValueError(f"Quote {quote['id']} does not reconcile")
        prepared.append((
            uid("historical-quote", quote["id"]), TENANT_ID, "lealcontrol-laravel",
            quote["id"], quote["parent_id"], str(quote["quote_number"]),
            quote["revision"], uid("customer", quote["client_id"]),
            entities[quote["client_id"]]["legacy"]["name"],
            str(quote["date"])[:10], str(quote["currency"]), str(quote["status"]),
            str(original_net), json.dumps(quote, ensure_ascii=False),
            json.dumps(quote_lines, ensure_ascii=False),
        ))

    path = destination / "bfs_historical_quotes_import.sql"
    with path.open("w", encoding="utf-8") as out:
        out.write("\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL client_encoding = 'UTF8';\n")
        out.write(f"""DO $$ BEGIN
            IF current_database() <> '{DATABASE}' THEN
                RAISE EXCEPTION 'Wrong target database: %', current_database();
            END IF;
            IF (SELECT count(*) FROM crm.customers WHERE "TenantId" = '{TENANT_ID}') <> 764
               OR (SELECT count(*) FROM legacy_bfs.entities) <> 2095
               OR (SELECT count(*) FROM sales.historical_quotes WHERE "TenantId" = '{TENANT_ID}') <> 0
               OR (SELECT count(*) FROM sales.quotes WHERE "TenantId" = '{TENANT_ID}') <> 0 THEN
                RAISE EXCEPTION 'BFS historical quote preflight failed';
            END IF;
        END $$;
        """)
        insert_batch(out, "sales.historical_quotes", [
            '"Id"', '"TenantId"', '"SourceSystem"', '"LegacyId"', '"LegacyParentId"',
            '"QuoteNumber"', '"Revision"', '"CustomerId"', '"CustomerName"', '"QuoteDate"',
            '"Currency"', '"Status"', '"NetTotal"', '"SourceSnapshot"', '"LinesSnapshot"',
        ], prepared)
        out.write("""DO $$ BEGIN
            IF (SELECT count(*) FROM sales.historical_quotes) <> 118
               OR (SELECT sum(jsonb_array_length("LinesSnapshot")) FROM sales.historical_quotes) <> 239
               OR EXISTS (
                   SELECT 1 FROM sales.historical_quotes q
                   LEFT JOIN crm.customers c ON c."Id" = q."CustomerId" AND c."TenantId" = q."TenantId"
                   WHERE c."Id" IS NULL
               ) THEN
                RAISE EXCEPTION 'Historical quote reconciliation failed';
            END IF;
        END $$;
        COMMIT;
        SELECT count(*) AS historical_quotes,
               sum(jsonb_array_length("LinesSnapshot")) AS lines
        FROM sales.historical_quotes;
        """)
    path.chmod(0o600)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Private prepared JSONL directory")
    parser.add_argument("destination", type=Path, help="Private output directory, outside Git")
    args = parser.parse_args()
    path, issues = prepare(args.source, args.destination)
    quotes_path = prepare_quotes(args.source, args.destination)
    print("Prepared 764 customers, 1,393 suppliers, 49 locations and 57 contacts;")
    print("3 entities await tax review; 1 supplier-only contact retained in source archive.")
    print("Import SQL (contains personal data):", path)
    print("Historical quotes SQL (contains commercial data):", quotes_path)
    print("Exceptions (counts only):", dict(issues))


if __name__ == "__main__":
    main()
