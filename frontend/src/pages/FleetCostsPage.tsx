import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { FleetCosts } from "../api/types";
import { todayAr } from "../lib/dates";
import { money, num, vehicleTypeLabel } from "../lib/fleet";

const monthStart = () => `${todayAr().slice(0, 8)}01`;

/** Flota → Costos por unidad: combustible, taller y vencimientos del período, por km y por hora. */
export function FleetCostsPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState({ from: monthStart(), to: todayAr() });
  const [data, setData] = useState<FleetCosts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!range.from || !range.to) return;
    setError(null);
    api.getFleetCosts(range.from, range.to).then(setData).catch((e: Error) => setError(e.message));
  }, [range]);

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Costos por unidad</h1>
          <p className="muted">Combustible, taller y vencimientos (por fecha de emisión) del período, con el costo por km o por hora de uso.</p>
        </div>
      </div>

      <section className="card pad" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ width: 170 }}>Desde<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label style={{ width: 170 }}>Hasta<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      {data && (
        <>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="card pad" style={{ flex: "1 1 180px" }}><span className="muted">Combustible</span><h2 style={{ margin: 0 }}>{money(data.totals.fuelCost)}</h2><span className="muted">{num(data.totals.liters)} litros</span></div>
            <div className="card pad" style={{ flex: "1 1 180px" }}><span className="muted">Taller</span><h2 style={{ margin: 0 }}>{money(data.totals.maintenanceCost)}</h2></div>
            <div className="card pad" style={{ flex: "1 1 180px" }}><span className="muted">Vencimientos</span><h2 style={{ margin: 0 }}>{money(data.totals.documentsCost)}</h2></div>
            <div className="card pad" style={{ flex: "1 1 180px" }}><span className="muted">Total</span><h2 style={{ margin: 0 }}>{money(data.totals.totalCost)}</h2></div>
          </div>

          <section className="card pad">
            {data.rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>No hay unidades cargadas.</p> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unidad</th><th style={{ textAlign: "right" }}>Uso</th><th style={{ textAlign: "right" }}>Combustible</th>
                      <th style={{ textAlign: "right" }}>Taller</th><th style={{ textAlign: "right" }}>Vencimientos</th>
                      <th style={{ textAlign: "right" }}>Total</th><th style={{ textAlign: "right" }}>Costo por uso</th><th style={{ textAlign: "right" }}>Consumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.vehicleId} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/vehiculos/${r.vehicleId}`)}>
                        <td><strong>{r.vehicleLabel}</strong><div className="muted" style={{ fontSize: "0.75rem" }}>{vehicleTypeLabel(r.vehicleType)} · {r.vehicleName}</div></td>
                        <td style={{ textAlign: "right" }}>{[r.km > 0 && `${num(r.km)} km`, r.hours > 0 && `${num(r.hours, 1)} h`].filter(Boolean).join(" · ") || "—"}</td>
                        <td style={{ textAlign: "right" }}>{money(r.fuelCost)}<div className="muted" style={{ fontSize: "0.75rem" }}>{num(r.liters)} l</div></td>
                        <td style={{ textAlign: "right" }}>{money(r.maintenanceCost)}</td>
                        <td style={{ textAlign: "right" }}>{money(r.documentsCost)}</td>
                        <td style={{ textAlign: "right" }}><strong>{money(r.totalCost)}</strong></td>
                        <td style={{ textAlign: "right" }}>
                          {[r.costPerKm != null && `${money(r.costPerKm)}/km`, r.costPerHour != null && `${money(r.costPerHour)}/h`].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {[r.kmPerLiter != null && `${num(r.kmPerLiter, 2)} km/l`, r.litersPerHour != null && `${num(r.litersPerHour, 2)} l/h`].filter(Boolean).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ margin: "12px 0 0", fontSize: "0.8rem" }}>
              El uso sale de las lecturas de km y horas (incluidas las de cargas de combustible y del taller). El consumo es litros cargados sobre uso del período: es aproximado si el tanque no se llena siempre.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
