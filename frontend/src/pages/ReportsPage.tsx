import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { label, type PipelineReport } from "../api/types";

function money(n: number) {
  return `ARS ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function ReportsPage() {
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [owners, setOwners] = useState<string[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (filters?: { ownerName?: string; from?: string; to?: string }) => {
    setBusy(true);
    setError(null);
    const o = filters?.ownerName ?? ownerName;
    const f = filters?.from ?? from;
    const t = filters?.to ?? to;
    Promise.all([
      api.pipelineReport({
        ownerName: o || undefined,
        fromUtc: f ? new Date(f).toISOString() : undefined,
        toUtc: t ? new Date(`${t}T23:59:59`).toISOString() : undefined
      }),
      api.listOpportunities()
    ])
      .then(([r, opps]) => {
        setReport(r);
        const names = [...new Set(opps.map((x) => x.ownerName).filter(Boolean) as string[])].sort();
        setOwners(names);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, []);

  const maxStageAmount = useMemo(
    () => Math.max(1, ...(report?.byStage.map((s) => s.amount) ?? [1])),
    [report]
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reportes</h1>
          <div className="muted">Pipeline · ganado / perdido · cartera por responsable</div>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card filters">
        <label>
          Responsable
          <select value={ownerName} onChange={(e) => setOwnerName(e.target.value)}>
            <option value="">Todos</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value="Sin responsable">Sin responsable</option>
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="toolbar" style={{ alignSelf: "end" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => load()}>
            Aplicar
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => {
              setOwnerName("");
              setFrom("");
              setTo("");
              load({ ownerName: "", from: "", to: "" });
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {report && (
        <>
          <div className="kpi kpi-4">
            <div className="card">
              <span className="muted">Pipeline abierto</span>
              <strong>{report.openCount}</strong>
              <div className="muted">{money(report.openAmount)}</div>
            </div>
            <div className="card">
              <span className="muted">Ganado</span>
              <strong>{report.wonCount}</strong>
              <div className="muted">{money(report.wonAmount)}</div>
            </div>
            <div className="card">
              <span className="muted">Perdido</span>
              <strong>{report.lostCount}</strong>
              <div className="muted">{money(report.lostAmount)}</div>
            </div>
            <div className="card">
              <span className="muted">Win rate</span>
              <strong>{report.winRate.toLocaleString("es-AR")}%</strong>
              <div className="muted">sobre cerradas</div>
            </div>
          </div>

          <div className="split">
            <section className="card pad">
              <h3>Por etapa</h3>
              {report.byStage.map((s) => (
                <div key={s.stage} className="report-row">
                  <div className="report-row-head">
                    <strong>{label(s.stage)}</strong>
                    <span className="muted">{s.count} · {money(s.amount)}</span>
                  </div>
                  <div className="report-bar">
                    <span style={{ width: `${Math.max(4, (s.amount / maxStageAmount) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </section>

            <section className="card pad">
              <h3>Motivos de pérdida</h3>
              {report.lostReasons.length === 0 && <p className="muted">Sin oportunidades perdidas en el filtro.</p>}
              {report.lostReasons.map((r) => (
                <div key={r.reason} className="list-item">
                  <strong>{r.reason}</strong>
                  <div className="muted">{r.count} · {money(r.amount)}</div>
                </div>
              ))}
            </section>
          </div>

          <section className="card pad" style={{ marginTop: 12 }}>
            <h3>Cartera por responsable</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Responsable</th>
                    <th>Abiertas</th>
                    <th>Monto abierto</th>
                    <th>Ganadas</th>
                    <th>Monto ganado</th>
                    <th>Perdidas</th>
                    <th>Monto perdido</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byOwner.map((o) => (
                    <tr key={o.ownerName} onClick={() => { setOwnerName(o.ownerName); load({ ownerName: o.ownerName }); }}>
                      <td><strong>{o.ownerName}</strong></td>
                      <td>{o.openCount}</td>
                      <td>{money(o.openAmount)}</td>
                      <td>{o.wonCount}</td>
                      <td>{money(o.wonAmount)}</td>
                      <td>{o.lostCount}</td>
                      <td>{money(o.lostAmount)}</td>
                    </tr>
                  ))}
                  {report.byOwner.length === 0 && (
                    <tr><td colSpan={7} className="muted">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="hint">Click en un responsable para filtrar el reporte.</p>
          </section>
        </>
      )}
    </>
  );
}
