import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { FleetMaintenanceOverview, VehicleMaintenance } from "../api/types";
import { usePermissions } from "../context/PermissionsContext";
import { civilDate, maintenanceTypeLabel, money, num, serviceStateLabel, stateBadge } from "../lib/fleet";

/** Flota → Mantenimiento: services vencidos o próximos, unidades en taller, programados y últimos trabajos. */
export function FleetMaintenancePage() {
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const seesCosts = !permissions || permissions.isSuperAdmin || permissions.sensitive.costs;
  const [data, setData] = useState<FleetMaintenanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getFleetMaintenance().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const jobsTable = (jobs: VehicleMaintenance[], withCost: boolean) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Unidad</th><th>Fecha</th><th>Trabajo</th><th>Lectura</th><th>Taller</th>{withCost && <th style={{ textAlign: "right" }}>Costo</th>}</tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/vehiculos/${j.vehicleId}`)}>
              <td><strong>{j.vehicleLabel}</strong></td>
              <td>{civilDate(j.date)}</td>
              <td>{j.title}<div className="muted" style={{ fontSize: "0.75rem" }}>{maintenanceTypeLabel(j.type)}</div></td>
              <td>{[j.km != null && `${num(j.km)} km`, j.hours != null && `${num(j.hours, 1)} h`].filter(Boolean).join(" · ") || "—"}</td>
              <td>{j.workshop}</td>
              {withCost && <td style={{ textAlign: "right" }}>{money(j.totalCost)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Mantenimiento</h1>
          <p className="muted">Services por km, horas o fecha, unidades en taller y trabajos. El plan de cada unidad se arma desde su ficha.</p>
        </div>
        <div className="toolbar">
          <Link to="/flota" className="btn btn-outline">Unidades</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {!data ? !error && <p className="muted">Cargando…</p> : (
        <>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="card pad" style={{ flex: "1 1 160px" }}><span className="muted">Services vencidos</span><h2 style={{ margin: 0 }}>{data.expired}</h2></div>
            <div className="card pad" style={{ flex: "1 1 160px" }}><span className="muted">Services próximos</span><h2 style={{ margin: 0 }}>{data.dueSoon}</h2></div>
            <div className="card pad" style={{ flex: "1 1 160px" }}><span className="muted">En taller</span><h2 style={{ margin: 0 }}>{data.inShop.length}</h2></div>
            <div className="card pad" style={{ flex: "1 1 160px" }}><span className="muted">Programados</span><h2 style={{ margin: 0 }}>{data.scheduled.length}</h2></div>
          </div>

          <section className="card pad" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Services para atender</h3>
            {data.services.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No hay services vencidos ni próximos. Si todavía no cargaste los planes, entrá a cada unidad → "Plan de mantenimiento".</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Unidad</th><th>Service</th><th>Falta</th><th>Estado</th></tr></thead>
                  <tbody>
                    {data.services.map((s) => (
                      <tr key={s.planId} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/vehiculos/${s.vehicleId}`)}>
                        <td>
                          <strong>{s.vehicleLabel}</strong>
                          <div className="muted" style={{ fontSize: "0.75rem" }}>{s.vehicleName}{s.vehicleStatus === "InMaintenance" ? " · en taller" : ""}</div>
                        </td>
                        <td>{s.title}</td>
                        <td>{s.dueText}</td>
                        <td><span className={`badge ${stateBadge[s.state]}`}>{serviceStateLabel[s.state]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.inShop.length > 0 && (
            <section className="card pad" style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0 }}>En taller ahora (no disponibles)</h3>
              {jobsTable(data.inShop, false)}
            </section>
          )}

          {data.scheduled.length > 0 && (
            <section className="card pad" style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0 }}>Programados</h3>
              {jobsTable(data.scheduled, false)}
            </section>
          )}

          <section className="card pad">
            <h3 style={{ marginTop: 0 }}>Últimos trabajos</h3>
            {data.recent.length === 0 ? <p className="muted" style={{ margin: 0 }}>Todavía no hay trabajos cargados.</p> : jobsTable(data.recent, seesCosts)}
          </section>
        </>
      )}
    </div>
  );
}
