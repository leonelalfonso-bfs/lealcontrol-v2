import { useEffect, useState } from "react";
import { api } from "../api/client";

type Account = {
  id: string;
  name: string;
  currency: string;
  type: string;
  balance: number;
  isActive: boolean;
};

type Movement = {
  id: string;
  operationDateUtc: string;
  description: string;
  externalReference?: string;
  kind: string;
  amount: number;
  currency: string;
  reportedBalance?: number;
  systemBalance: number;
  difference?: number;
  conceptName?: string;
  classificationStatus?: string;
};

const money = (n: number, c: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

const statusLabel: Record<string, string> = {
  Confirmed: "Confirmado",
  Suggested: "Sugerido",
  Identified: "Identificado",
  PendingIdentification: "Pendiente",
  Imported: "Pendiente",
  Excluded: "Excluido"
};

export function FinanceAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listFinanceAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, []);

  const openAccount = async (account: Account) => {
    setSelectedAccount(account);
    try {
      setMovements(await api.listFinanceMovementDetails(account.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los movimientos.");
    }
  };

  if (selectedAccount) {
    const confirmedCount = movements.filter((m) => m.classificationStatus === "Confirmed").length;

    return (
      <div className="page-wide">
        <div className="page-head">
          <div>
            <span className="eyebrow">FINANZAS · TESORERÍA</span>
            <h1>{selectedAccount.name}</h1>
            <p className="muted">Detalle bancario · comparación entre extracto y sistema.</p>
          </div>
          <button className="btn btn-outline" onClick={() => setSelectedAccount(null)}>
            ← Bancos y cajas
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        <section className="card pad">
          <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Movimientos bancarios</h2>
            <div className="toolbar" style={{ gap: 8 }}>
              <span
                className="badge ok"
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "#065f46",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 14
                }}
              >
                ✓ {confirmedCount} confirmados
              </span>
              <span className="badge" style={{ padding: "4px 10px", borderRadius: 14 }}>
                {movements.length - confirmedCount} por revisar
              </span>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto / Leyenda</th>
                  <th>Clasificación</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Ingreso</th>
                  <th style={{ textAlign: "right" }}>Egreso</th>
                  <th style={{ textAlign: "right" }}>Saldo sistema</th>
                  <th style={{ textAlign: "right" }}>Saldo extracto</th>
                  <th style={{ textAlign: "right" }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No hay movimientos registrados para esta cuenta.
                    </td>
                  </tr>
                ) : (
                  movements.map((x) => {
                    const isConfirmed = x.classificationStatus === "Confirmed";
                    const isSuggested = x.classificationStatus === "Suggested";
                    const statusText = statusLabel[x.classificationStatus || "Imported"] || x.classificationStatus || "Pendiente";

                    return (
                      <tr
                        key={x.id}
                        style={{
                          background: isConfirmed ? "rgba(16, 185, 129, 0.05)" : undefined,
                          borderLeft: isConfirmed ? "3px solid #10b981" : undefined
                        }}
                      >
                        <td>{new Date(x.operationDateUtc).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{x.description}</strong>
                          <small className="muted" style={{ display: "block", fontSize: "0.76rem" }}>
                            {x.externalReference || "Sin referencia"}
                          </small>
                        </td>
                        <td>
                          {x.conceptName ? (
                            <span style={{ fontWeight: 600, color: isConfirmed ? "#0d9488" : "inherit" }}>
                              🏷️ {x.conceptName}
                            </span>
                          ) : (
                            <span className="muted">Sin identificar</span>
                          )}
                        </td>
                        <td>
                          {isConfirmed ? (
                            <span
                              className="badge ok"
                              style={{
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "#065f46",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              ✓ Confirmado
                            </span>
                          ) : isSuggested ? (
                            <span
                              className="badge warn"
                              style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#92400e",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              🟡 Sugerido
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                background: "rgba(100, 116, 139, 0.1)",
                                color: "#475569",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              ⏳ {statusText}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              color: x.kind === "Credit" ? "#059669" : "#dc2626",
                              fontWeight: 600
                            }}
                          >
                            {x.kind === "Credit" ? "Ingreso" : "Egreso"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", color: "#059669", fontWeight: x.kind === "Credit" ? 700 : 400 }}>
                          {x.kind === "Credit" ? `+${money(x.amount, x.currency)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: "#dc2626", fontWeight: x.kind === "Debit" ? 700 : 400 }}>
                          {x.kind === "Debit" ? `−${money(x.amount, x.currency)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {money(x.systemBalance, x.currency)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {x.reportedBalance == null ? "—" : money(x.reportedBalance, x.currency)}
                        </td>
                        <td
                          style={{ textAlign: "right" }}
                          className={x.difference && Math.abs(x.difference) > 0.01 ? "negative" : ""}
                        >
                          {x.difference == null ? "—" : money(x.difference, x.currency)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · TESORERÍA</span>
          <h1>Bancos y cajas</h1>
          <p className="muted">Seleccioná una cuenta para ver el detalle completo.</p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="account-cards">
        {accounts.map((x) => (
          <button className="account-card" key={x.id} onClick={() => void openAccount(x)}>
            <div className="account-card-title">
              <span className="account-icon">▦</span>
              <strong>{x.name}</strong>
            </div>
            <span className="muted">
              {x.type} · {x.currency}
            </span>
            <div className="account-card-footer">
              <strong className={x.balance < 0 ? "negative" : ""}>{money(x.balance, x.currency)}</strong>
              <span>Ver cuenta →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
