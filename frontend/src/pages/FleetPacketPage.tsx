import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type FleetPacketItem } from "../api/client";
import type { Employee, Vehicle } from "../api/types";

const day = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const STATE_COLOR: Record<FleetPacketItem["state"], string> = { Vigente: "#2E6B1F", "Por vencer": "#9A5B00", Vencido: "#A1271B" };
const key = (i: { source: string; id: string }) => `${i.source}:${i.id}`;

/** Legajo para ingreso a planta: documentos de las personas (RRHH y Flota) y de las unidades elegidas, en un ZIP para enviar al cliente. */
export function FleetPacketPage() {
  const [params] = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [people, setPeople] = useState<string[]>(() => params.get("employees")?.split(",").filter(Boolean) ?? []);
  const [units, setUnits] = useState<string[]>(() => params.get("vehicles")?.split(",").filter(Boolean) ?? []);
  const [company, setCompany] = useState(true);
  const [items, setItems] = useState<FleetPacketItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listEmployees().then((list) => setEmployees(list.filter((e) => e.status !== 2))).catch(() => setEmployees([]));
    api.listVehicles().then(setVehicles).catch(() => setVehicles([]));
  }, []);
  useEffect(() => {
    if (people.length === 0 && units.length === 0 && !company) { setItems([]); return; }
    api.fleetPacketPreview(people, units, company).then((list) => {
      setItems(list);
      // Por defecto va todo lo que tiene archivo y no está vencido.
      setSelected(new Set(list.filter((i) => i.hasFile && i.state !== "Vencido").map(key)));
    }).catch((err) => setError(err.message));
  }, [people, units, company]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const owners = useMemo(() => [...new Map(items.map((i) => [i.ownerId, i])).values()], [items]);
  const q = search.trim().toLowerCase();
  const missing = items.filter((i) => !i.hasFile).length;
  const expired = items.filter((i) => i.state === "Vencido").length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>📦 Legajo para ingreso a planta</h1>
          <p className="muted">Elegí las personas y las unidades: se arma un ZIP con una carpeta por cada una y sus documentos vigentes, para enviar al cliente.</p>
        </div>
        <Link to="/flota/ayuda#legajo" className="btn btn-outline">💡 Ayuda</Link>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Buscar persona o unidad" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={company} onChange={(e) => setCompany(e.target.checked)} /> Incluir la documentación de la empresa (<Link to="/rrhh/documentacion-empresa">ver</Link>)
        </label>
      </div>
      <div className="grid-2">
        <div className="card pad stack" style={{ gap: 4, maxHeight: 300, overflow: "auto" }}>
          <strong>Personas ({people.length})</strong>
          {employees.filter((e) => !q || `${e.lastName} ${e.firstName} ${e.documentNumber}`.toLowerCase().includes(q)).map((e) => (
            <label key={e.id} className="row" style={{ gap: 6, alignItems: "center", fontWeight: 500 }}>
              <input type="checkbox" checked={people.includes(e.id)} onChange={() => toggle(people, setPeople, e.id)} /> {e.lastName}, {e.firstName}
              <span className="muted" style={{ fontSize: "0.78rem" }}>DNI {e.documentNumber}</span>
            </label>
          ))}
        </div>
        <div className="card pad stack" style={{ gap: 4, maxHeight: 300, overflow: "auto" }}>
          <strong>Unidades ({units.length})</strong>
          {vehicles.filter((v) => !q || `${v.label} ${v.brand} ${v.model}`.toLowerCase().includes(q)).map((v) => (
            <label key={v.id} className="row" style={{ gap: 6, alignItems: "center", fontWeight: 500 }}>
              <input type="checkbox" checked={units.includes(v.id)} onChange={() => toggle(units, setUnits, v.id)} /> {v.label} <span className="muted" style={{ fontSize: "0.78rem" }}>{v.brand} {v.model}</span>
            </label>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div className="card pad stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>Documentos ({selected.size} de {items.length})</strong>
            <button type="button" className="btn" disabled={busy || selected.size === 0} onClick={() => {
              setBusy(true); setError(null);
              api.downloadFleetPacket(items.filter((i) => selected.has(key(i))).map((i) => ({ source: i.source, id: i.id })))
                .catch((err) => setError(err.message)).finally(() => setBusy(false));
            }}>{busy ? "Armando…" : "⬇️ Descargar ZIP"}</button>
          </div>
          {(missing > 0 || expired > 0) && (
            <div className="alert" style={{ marginBottom: 0 }}>
              {missing > 0 && `${missing} documento(s) sin archivo escaneado. `}{expired > 0 && `${expired} vencido(s): renovalos antes de enviar.`}
            </div>
          )}
          {owners.map((o) => (
            <div key={o.ownerId}>
              <div style={{ fontWeight: 700, margin: "6px 0 2px" }}>{o.ownerType === "Person" ? "👤" : o.ownerType === "Company" ? "🏢" : "🚚"} {o.ownerName}</div>
              <table style={{ fontSize: "0.85rem" }}>
                <tbody>
                  {items.filter((i) => i.ownerId === o.ownerId).map((i) => (
                    <tr key={key(i)}>
                      <td style={{ width: 30 }}><input type="checkbox" disabled={!i.hasFile} checked={selected.has(key(i))} onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(key(i))) n.delete(key(i)); else n.add(key(i)); return n; })} /></td>
                      <td>{i.label}{i.number ? <span className="muted"> · N° {i.number}</span> : null}<span className="muted" style={{ fontSize: "0.75rem" }}> · {i.source === "HrDocument" ? "legajo RRHH" : i.source === "CompanyDocument" ? "empresa" : "Flota"}</span></td>
                      <td>{i.expirationDate ? `vence ${day(i.expirationDate)}` : "—"}</td>
                      <td style={{ color: STATE_COLOR[i.state], fontWeight: 700 }}>{i.state}</td>
                      <td>{i.hasFile ? "📎" : <span style={{ color: "#A1271B" }}>sin archivo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
