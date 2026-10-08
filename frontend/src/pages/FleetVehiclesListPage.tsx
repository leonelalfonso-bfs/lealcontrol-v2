import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { FleetExpirations, Vehicle } from "../api/types";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import {
  civilDate, daysText, docTypeLabel, meterText, stateBadge, stateLabel, vehicleStatusLabel, vehicleTypeLabel
} from "../lib/fleet";

/** Unidades de la flota con el panel de vencimientos (vencidos, por vencer y sin cargar). */
export function FleetVehiclesListPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expirations, setExpirations] = useState<FleetExpirations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeSold, setIncludeSold] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.listVehicles(debouncedSearch, includeSold), api.getFleetExpirations()])
      .then(([units, panel]) => {
        if (cancelled) return;
        setVehicles(units);
        setExpirations(panel);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [debouncedSearch, includeSold]);

  const problems = expirations?.items ?? [];

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Unidades</h1>
          <p className="muted">Camionetas, camiones, semis, autoelevadores y demás, con sus vencimientos.</p>
        </div>
        <div className="toolbar">
          <Link to="/flota/vehiculos/nuevo" className="btn">+ Nueva unidad</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <section className="card pad" style={{ marginBottom: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Vencimientos</h3>
          {expirations && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className={`badge ${expirations.expired ? "prio-high" : "off"}`}>{expirations.expired} vencidos</span>
              <span className={`badge ${expirations.missing ? "prio-high" : "off"}`}>{expirations.missing} sin cargar</span>
              <span className={`badge ${expirations.dueSoon ? "warn" : "off"}`}>{expirations.dueSoon} por vencer</span>
            </div>
          )}
        </div>
        {expirations && problems.length === 0 && (
          <p className="muted" style={{ margin: "10px 0 0" }}>Todo al día. No hay nada vencido, por vencer ni sin cargar.</p>
        )}
        {problems.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr><th>Unidad</th><th>Vencimiento</th><th>Fecha</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={`${p.vehicleId}-${p.documentType}-${p.documentId ?? "falta"}`} style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/flota/vehiculos/${p.vehicleId}`)}>
                    <td><strong>{p.vehicleLabel}</strong> <span className="muted">· {vehicleTypeLabel(p.vehicleType)} {p.vehicleName}</span></td>
                    <td>{docTypeLabel(p.documentType)}</td>
                    <td>{p.expirationDate ? <>{civilDate(p.expirationDate)} <span className="muted">({daysText(p.daysRemaining)})</span></> : "—"}</td>
                    <td><span className={`badge ${stateBadge[p.state]}`}>{stateLabel[p.state]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card pad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: "1 1 280px", maxWidth: 420 }}>
            <SearchField value={search} onChange={setSearch} placeholder="Buscar por patente, código, marca o modelo" />
          </div>
          <label className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={includeSold} onChange={(e) => setIncludeSold(e.target.checked)} />
            Mostrar dadas de baja
          </label>
        </div>

        {loading ? (
          <p className="muted">Cargando unidades…</p>
        ) : vehicles.length === 0 ? (
          <p className="muted">
            {search ? "No hay unidades que coincidan con la búsqueda." : "Todavía no hay unidades. Cargá la primera con \"+ Nueva unidad\"."}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Unidad</th><th>Tipo</th><th>Marca y modelo</th><th>Uso</th><th>Estado</th><th>Vencimientos</th></tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const pending = v.expiredCount + v.missingCount;
                  return (
                    <tr key={v.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/vehiculos/${v.id}`)}>
                      <td>
                        <strong style={{ fontFamily: "monospace" }}>{v.label}</strong>
                        {v.plate && v.internalCode && <div className="muted" style={{ fontSize: "0.78rem" }}>{v.internalCode}</div>}
                      </td>
                      <td>{vehicleTypeLabel(v.type)}</td>
                      <td>{[v.brand, v.model].filter(Boolean).join(" ")}{v.year ? <span className="muted"> · {v.year}</span> : null}</td>
                      <td>{meterText(v)}</td>
                      <td>
                        <span className={`badge ${v.status === "Active" ? "ok" : v.status === "InMaintenance" ? "warn" : "off"}`}>
                          {vehicleStatusLabel(v.status)}
                        </span>
                      </td>
                      <td>
                        {pending > 0 ? (
                          <span className="badge prio-high">
                            {[v.expiredCount > 0 && `${v.expiredCount} vencido${v.expiredCount > 1 ? "s" : ""}`,
                              v.missingCount > 0 && `${v.missingCount} sin cargar`].filter(Boolean).join(" · ")}
                          </span>
                        ) : v.dueSoonCount > 0 ? (
                          <span className="badge warn">{v.dueSoonCount} por vencer</span>
                        ) : (
                          <span className="badge ok">Al día{v.nextExpirationDate ? ` · próximo ${civilDate(v.nextExpirationDate)}` : ""}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
