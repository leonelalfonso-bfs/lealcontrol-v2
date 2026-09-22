import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ExcelToolbar, excelDate, excelNumber } from "../components/ExcelTools";
import type { CustomerSummary, Quote } from "../api/types";

export function QuotesPage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertQuote, setConvertQuote] = useState<Quote | null>(null);
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const [quotesData, customersData] = await Promise.all([
        api.listQuotes(search),
        api.listCustomers()
      ]);
      setQuotes(quotesData);
      setCustomers(customersData.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar presupuestos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, [search]);

  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customers) {
      map[c.id] = c.legalName;
    }
    return map;
  }, [customers]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (statusFilter && q.status !== statusFilter) return false;
      if (currencyFilter && q.currency !== currencyFilter) return false;
      return true;
    });
  }, [quotes, statusFilter, currencyFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Draft":
        return { label: "Borrador", badgeClass: "badge off" };
      case "Sent":
        return { label: "Enviado", badgeClass: "badge warn" };
      case "Accepted":
        return { label: "Aceptado / Ganado", badgeClass: "badge ok" };
      case "Ordered":
        return { label: "Pedido de Venta", badgeClass: "badge ok" };
      case "Rejected":
        return { label: "Rechazado", badgeClass: "badge prio-high" };
      case "Expired":
        return { label: "Vencido", badgeClass: "badge off" };
      default:
        return { label: status, badgeClass: "badge" };
    }
  };

  const getCurrencyDisplay = (curr: string) => {
    switch (curr) {
      case "USD_BILLETE":
        return { label: "U$D Billete", symbol: "U$D" };
      case "USD_DIVISA":
        return { label: "U$D Divisa", symbol: "U$D" };
      default:
        return { label: "ARS $", symbol: "$" };
    }
  };

  const handleSendQuote = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.sendQuote(id);
      fetchQuotes();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al cambiar estado");
    }
  };

  const handleAcceptQuote = async (e: React.MouseEvent, id: string, quoteNumber: string) => {
    e.stopPropagation();
    if (confirm(`¿Marcar el presupuesto #${quoteNumber} como Aceptado y Ganado?`)) {
      try {
        await api.acceptQuote(id);
        fetchQuotes();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Error al aceptar presupuesto");
      }
    }
  };

  const openConvertModal = async (e: React.MouseEvent, quoteId: string) => {
    e.stopPropagation();
    try {
      setConverting(true);
      const full = await api.getQuote(quoteId);
      const optionalLines = (full.lines || []).filter((l) => l.isOptional);
      if (optionalLines.length === 0) {
        const order = await api.createOrderFromQuote(full.id, []);
        navigate(`/pedidos/${order.id}`);
        return;
      }
      setConvertQuote(full);
      setSelectedOptionalIds([]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al preparar la conversión");
    } finally {
      setConverting(false);
    }
  };

  const confirmConvertToOrder = async () => {
    if (!convertQuote) return;
    try {
      setConverting(true);
      const order = await api.createOrderFromQuote(convertQuote.id, selectedOptionalIds);
      setConvertQuote(null);
      navigate(`/pedidos/${order.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al convertir a pedido");
    } finally {
      setConverting(false);
    }
  };

  const toggleOptional = (lineId: string) => {
    setSelectedOptionalIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId]
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Presupuestos Comerciales</h1>
          <p className="muted">Gestión de cotizaciones multimoneda para clientes</p>
        </div>
        <div className="toolbar"><ExcelToolbar fileName="presupuestos" rows={quotes} columns={[{ key: "quoteNumber", header: "Número" }, { key: "customerId", header: "Cliente", value: row => customerMap[row.customerId] ?? "Cliente registrado" }, { key: "status", header: "Estado" }, { key: "currency", header: "Moneda" }, { key: "total", header: "Total", value: row => excelNumber(row.total) }, { key: "createdAtUtc", header: "Fecha", value: row => excelDate(row.createdAtUtc) }]} /><button
          type="button"
          onClick={() => navigate("/presupuestos/nuevo")}
          className="btn"
        >
          + Nuevo Presupuesto
        </button></div>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Toolbar & Filters */}
      <div className="card pad toolbar" style={{ marginBottom: "20px" }}>
        <input
          type="search"
          placeholder="Buscar por Nro. Presupuesto, Nota o Responsable..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: "180px" }}
        >
          <option value="">Todos los Estados</option>
          <option value="Draft">Borrador</option>
          <option value="Sent">Enviado</option>
          <option value="Accepted">Aceptado / Ganado</option>
          <option value="Ordered">Pedido de Venta</option>
          <option value="Rejected">Rechazado</option>
        </select>

        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          style={{ width: "160px" }}
        >
          <option value="">Todas las Monedas</option>
          <option value="ARS">Pesos ($)</option>
          <option value="USD_BILLETE">U$D Billete</option>
          <option value="USD_DIVISA">U$D Divisa</option>
        </select>
      </div>

      {/* Quotes Table */}
      <section className="card">
        {loading ? (
          <div className="pad muted">Cargando presupuestos...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nro. Cotización</th>
                  <th>Rev.</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Moneda</th>
                  <th style={{ textAlign: "right" }}>Subtotal</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Responsable</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((q) => {
                  const statusInfo = getStatusBadge(q.status);
                  const curr = getCurrencyDisplay(q.currency);

                  return (
                    <tr
                      key={q.id}
                      onClick={() => navigate(`/presupuestos/${q.id}/imprimir`)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong>{q.quoteNumber}</strong>
                      </td>
                      <td>v{q.revision}</td>
                      <td>
                        <strong>{customerMap[q.customerId] || "Cliente sin registrar"}</strong>
                      </td>
                      <td>
                        <span className={`badge ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${q.currency !== "ARS" ? "warn" : ""}`}>
                          {curr.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                        {curr.symbol} {q.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                        {curr.symbol} {q.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="muted">{q.ownerName || "—"}</td>
                      <td className="muted">{new Date(q.createdAtUtc).toLocaleDateString("es-AR")}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          {q.status === "Accepted" && (
                            <button
                              type="button"
                              onClick={(e) => void openConvertModal(e, q.id)}
                              className="btn"
                              disabled={converting}
                              style={{ padding: "4px 10px", fontSize: "0.75rem", background: "linear-gradient(180deg, #0284c7, #0369a1)" }}
                            >
                              📦 Convertir a Pedido
                            </button>
                          )}
                          {q.status === "Draft" && (
                            <button
                              type="button"
                              onClick={(e) => handleSendQuote(e, q.id)}
                              className="btn ghost"
                              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                            >
                              Marcar Enviado
                            </button>
                          )}
                          {(q.status === "Draft" || q.status === "Sent") && (
                            <button
                              type="button"
                              onClick={(e) => handleAcceptQuote(e, q.id, q.quoteNumber)}
                              className="btn"
                              style={{ padding: "4px 10px", fontSize: "0.75rem", background: "linear-gradient(180deg, #1aaa97, #128c7e)" }}
                            >
                              ✓ Aceptar & Ganar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/presupuestos/${q.id}/editar`);
                            }}
                            className="btn ghost"
                            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                          >
                            Ver / Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredQuotes.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: "center", padding: "32px" }}>
                      No se encontraron presupuestos comerciales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {convertQuote && (
        <div className="modal-backdrop" onClick={() => !converting && setConvertQuote(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">PEDIDO DE VENTA</span>
                <h2>Ítems opcionales del presupuesto {convertQuote.quoteNumber}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setConvertQuote(null)} disabled={converting}>
                ×
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.88rem" }}>
              Los renglones obligatorios se incluyen siempre. Marcá cuáles opcionales querés pasar al pedido.
            </p>
            <div className="stack" style={{ gap: 8, marginTop: 12, maxHeight: 320, overflow: "auto" }}>
              {(convertQuote.lines || [])
                .filter((l) => !l.isOptional)
                .map((l) => (
                  <label key={l.id} className="card pad" style={{ opacity: 0.85, cursor: "default" }}>
                    <input type="checkbox" checked disabled />{" "}
                    <strong>{l.description}</strong>
                    <span className="muted" style={{ marginLeft: 8 }}>
                      (obligatorio) · cant. {l.quantity}
                    </span>
                  </label>
                ))}
              {(convertQuote.lines || [])
                .filter((l) => l.isOptional)
                .map((l) => (
                  <label key={l.id} className="card pad" style={{ cursor: "pointer", borderColor: selectedOptionalIds.includes(l.id) ? "#0284c7" : undefined }}>
                    <input
                      type="checkbox"
                      checked={selectedOptionalIds.includes(l.id)}
                      onChange={() => toggleOptional(l.id)}
                    />{" "}
                    <strong>{l.description}</strong>
                    <span className="muted" style={{ marginLeft: 8 }}>
                      (opcional) · cant. {l.quantity}
                    </span>
                  </label>
                ))}
            </div>
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={() => setConvertQuote(null)} disabled={converting}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={() => void confirmConvertToOrder()} disabled={converting}>
                {converting ? "Generando…" : "Confirmar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
