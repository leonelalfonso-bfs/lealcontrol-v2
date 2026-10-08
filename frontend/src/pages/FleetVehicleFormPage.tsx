import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type {
  FleetDocType, Vehicle, VehicleDocument, VehicleDocumentWrite, VehicleMeterReading, VehicleType, VehicleWrite
} from "../api/types";
import { todayAr } from "../lib/dates";
import {
  DOC_TYPES, METER_TYPES, VEHICLE_STATUSES, VEHICLE_TYPES, civilDate, daysText, defaultMeterFor, docTypeLabel,
  meterText, requiredDocuments, stateBadge, stateLabel, usesHours, usesKm, vehicleStatusLabel
} from "../lib/fleet";

const EMPTY: VehicleWrite = {
  type: "Pickup", plate: "", internalCode: "", brand: "", model: "", year: new Date().getFullYear(),
  meterType: "Kilometers", vinChassis: "", engineNumber: "", fuelType: "Diesel", status: "Active", notes: "",
  initialKilometers: 0, initialHours: 0
};

const EMPTY_DOC = (type: FleetDocType = "VtvRto"): VehicleDocumentWrite => ({
  documentType: type, expirationDate: "", number: "", issuer: "", issueDate: "", alertDaysBefore: 30, cost: 0
});

const toWrite = (v: Vehicle): VehicleWrite => ({
  type: v.type, plate: v.plate, internalCode: v.internalCode ?? "", brand: v.brand, model: v.model, year: v.year,
  meterType: v.meterType, vinChassis: v.vinChassis, engineNumber: v.engineNumber, fuelType: v.fuelType,
  status: v.status, notes: v.notes ?? ""
});

/** Ficha de la unidad: datos, uso (km / horas) y vencimientos. */
export function FleetVehicleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleWrite>(EMPTY);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [readings, setReadings] = useState<VehicleMeterReading[]>([]);
  const [docForm, setDocForm] = useState<VehicleDocumentWrite | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [reading, setReading] = useState({ km: "", hours: "", date: todayAr(), correction: false, note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (vehicleId: string, history = showHistory) => {
    const [v, docs, reads] = await Promise.all([
      api.getVehicle(vehicleId),
      api.listVehicleDocuments(vehicleId, history),
      api.listVehicleReadings(vehicleId)
    ]);
    setVehicle(v);
    setForm(toWrite(v));
    setDocuments(docs);
    setReadings(reads);
  };

  useEffect(() => {
    if (!id) return;
    load(id).catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (ok) setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof VehicleWrite>(key: K, value: VehicleWrite[K]) => setForm((f) => ({ ...f, [key]: value }));

  const changeType = (type: VehicleType) =>
    setForm((f) => ({ ...f, type, meterType: isNew ? defaultMeterFor(type) : f.meterType }));

  const saveVehicle = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (isNew) {
        const created = await api.createVehicle(form);
        navigate(`/flota/vehiculos/${created.id}`, { replace: true });
      } else {
        await api.updateVehicle(id!, form);
        await load(id!);
      }
    }, isNew ? undefined : "Datos guardados.");
  };

  const saveReading = (event: FormEvent) => {
    event.preventDefault();
    if (!vehicle) return;
    void run(async () => {
      await api.recordVehicleReading(vehicle.id, {
        kilometers: usesKm(vehicle.meterType) && reading.km !== "" ? Number(reading.km) : null,
        hours: usesHours(vehicle.meterType) && reading.hours !== "" ? Number(reading.hours) : null,
        date: reading.date,
        correction: reading.correction,
        note: reading.note.trim() || undefined
      });
      setReading({ km: "", hours: "", date: todayAr(), correction: false, note: "" });
      await load(vehicle.id);
    }, "Lectura registrada.");
  };

  const saveDocument = (event: FormEvent) => {
    event.preventDefault();
    if (!vehicle || !docForm) return;
    void run(async () => {
      const body = { ...docForm, issueDate: docForm.issueDate || undefined };
      if (editingDocId) await api.updateVehicleDocument(editingDocId, body);
      else await api.createVehicleDocument(vehicle.id, body);
      setDocForm(null);
      setEditingDocId(null);
      await load(vehicle.id);
    }, editingDocId ? "Vencimiento actualizado." : "Vencimiento cargado.");
  };

  const deleteDocument = (doc: VehicleDocument) => {
    if (!vehicle) return;
    if (!window.confirm(`¿Borrar ${docTypeLabel(doc.documentType)} con vencimiento ${civilDate(doc.expirationDate)}? Usalo solo para cargas equivocadas: si había uno anterior, vuelve a regir.`)) return;
    void run(async () => {
      await api.deleteVehicleDocument(doc.id);
      await load(vehicle.id);
    }, "Vencimiento borrado.");
  };

  const toggleHistory = () => {
    if (!vehicle) return;
    const next = !showHistory;
    setShowHistory(next);
    api.listVehicleDocuments(vehicle.id, next).then(setDocuments).catch((e: Error) => setError(e.message));
  };

  const activeTypes = new Set(documents.filter((d) => d.isActive).map((d) => d.documentType));
  const missing = vehicle ? requiredDocuments(vehicle.type).filter((t) => !activeTypes.has(t)) : [];

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>{isNew ? "Nueva unidad" : vehicle?.label ?? "Unidad"}</h1>
          {vehicle && (
            <p className="muted">
              {[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ")} · {vehicleStatusLabel(vehicle.status)} · {meterText(vehicle)}
            </p>
          )}
        </div>
        <Link to="/flota" className="btn btn-outline">← Unidades</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <form className="card pad stack" style={{ gap: 14, marginBottom: 20 }} onSubmit={saveVehicle}>
        <h3 style={{ margin: 0 }}>Datos</h3>
        <div className="grid-3">
          <label>Tipo *
            <select value={form.type} onChange={(e) => changeType(e.target.value as VehicleType)}>
              {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label>Patente
            <input value={form.plate} onChange={(e) => set("plate", e.target.value.toUpperCase())} placeholder="AB123CD" maxLength={12} />
          </label>
          <label>Código interno
            <input value={form.internalCode} onChange={(e) => set("internalCode", e.target.value.toUpperCase())} placeholder="AE-01" maxLength={30} />
          </label>
          <label>Marca *
            <input required value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </label>
          <label>Modelo
            <input value={form.model} onChange={(e) => set("model", e.target.value)} />
          </label>
          <label>Año
            <input type="number" min={1950} max={new Date().getFullYear() + 1} value={form.year ?? ""}
              onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} />
          </label>
          <label>Se mide por
            <select value={form.meterType} onChange={(e) => set("meterType", e.target.value as VehicleWrite["meterType"])}>
              {METER_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label>Estado
            <select value={form.status} onChange={(e) => set("status", e.target.value as VehicleWrite["status"])}>
              {VEHICLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Combustible
            <select value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
              {["Diesel", "Nafta", "GNC", "Eléctrico", "Gas (GLP)", "No usa"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>Chasis
            <input value={form.vinChassis} onChange={(e) => set("vinChassis", e.target.value)} />
          </label>
          <label>Motor
            <input value={form.engineNumber} onChange={(e) => set("engineNumber", e.target.value)} />
          </label>
          {isNew && usesKm(form.meterType) && (
            <label>Kilómetros actuales
              <input type="number" min={0} value={form.initialKilometers ?? 0} onChange={(e) => set("initialKilometers", Number(e.target.value))} />
            </label>
          )}
          {isNew && usesHours(form.meterType) && (
            <label>Horas actuales
              <input type="number" min={0} step="0.1" value={form.initialHours ?? 0} onChange={(e) => set("initialHours", Number(e.target.value))} />
            </label>
          )}
        </div>
        <label>Notas
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          Patente o código interno: al menos uno (los autoelevadores suelen no tener patente).
          {!isNew && " Los kilómetros y horas se actualizan con una lectura, abajo."}
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" disabled={busy}>{busy ? "Guardando…" : isNew ? "Crear unidad" : "Guardar datos"}</button>
        </div>
      </form>

      {vehicle && (
        <>
          <section className="card pad stack" style={{ gap: 14, marginBottom: 20 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Vencimientos</h3>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-outline compact" onClick={toggleHistory}>
                  {showHistory ? "Ocultar historial" : "Ver historial"}
                </button>
                <button type="button" className="btn compact" onClick={() => { setEditingDocId(null); setDocForm(EMPTY_DOC(missing[0] ?? "VtvRto")); }}>
                  + Cargar vencimiento
                </button>
              </div>
            </div>

            {missing.length > 0 && (
              <div className="alert" style={{ margin: 0 }}>
                Falta cargar: {missing.map(docTypeLabel).join(", ")}. Sin esto la unidad figura con documentación incompleta.
              </div>
            )}

            {docForm && (
              <form className="card pad stack" style={{ gap: 12, border: "1px solid var(--line)" }} onSubmit={saveDocument}>
                <strong>{editingDocId ? "Editar vencimiento" : "Nuevo vencimiento"}</strong>
                <div className="grid-3">
                  <label>Tipo *
                    <select value={docForm.documentType} disabled={!!editingDocId}
                      onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value as FleetDocType })}>
                      {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </label>
                  <label>Vence el *
                    <input required type="date" value={docForm.expirationDate} onChange={(e) => setDocForm({ ...docForm, expirationDate: e.target.value })} />
                  </label>
                  <label>Avisar con (días de anticipación)
                    <input type="number" min={0} max={365} value={docForm.alertDaysBefore}
                      onChange={(e) => setDocForm({ ...docForm, alertDaysBefore: Number(e.target.value) })} />
                  </label>
                  <label>Número / póliza
                    <input value={docForm.number ?? ""} onChange={(e) => setDocForm({ ...docForm, number: e.target.value })} maxLength={60} />
                  </label>
                  <label>Emisor (aseguradora, taller…)
                    <input value={docForm.issuer ?? ""} onChange={(e) => setDocForm({ ...docForm, issuer: e.target.value })} maxLength={120} />
                  </label>
                  <label>Emitido el
                    <input type="date" value={docForm.issueDate ?? ""} onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })} />
                  </label>
                  <label>Costo
                    <input type="number" min={0} step="0.01" value={docForm.cost ?? 0} onChange={(e) => setDocForm({ ...docForm, cost: Number(e.target.value) })} />
                  </label>
                  {docForm.documentType === "Other" && (
                    <label>Descripción
                      <input value={docForm.title ?? ""} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} maxLength={120} />
                    </label>
                  )}
                </div>
                {!editingDocId && activeTypes.has(docForm.documentType) && docForm.documentType !== "Other" && (
                  <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                    Es una renovación: el {docTypeLabel(docForm.documentType)} vigente pasa al historial.
                  </p>
                )}
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn btn-outline" onClick={() => { setDocForm(null); setEditingDocId(null); }}>Cancelar</button>
                  <button className="btn" disabled={busy}>Guardar</button>
                </div>
              </form>
            )}

            {documents.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No hay vencimientos cargados.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Tipo</th><th>Vence</th><th>Estado</th><th>Número</th><th>Emisor</th><th style={{ textAlign: "right" }}>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id} style={d.isActive ? undefined : { opacity: 0.55 }}>
                        <td>{docTypeLabel(d.documentType)}{d.title ? <span className="muted"> · {d.title}</span> : null}</td>
                        <td>{civilDate(d.expirationDate)} {d.isActive && <span className="muted">({daysText(d.daysRemaining)})</span>}</td>
                        <td>{d.isActive
                          ? <span className={`badge ${stateBadge[d.state]}`}>{stateLabel[d.state]}</span>
                          : <span className="badge off">Renovado</span>}</td>
                        <td>{d.number || "—"}</td>
                        <td>{d.issuer || "—"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {d.isActive && d.documentType !== "Other" && (
                            <button type="button" className="btn btn-outline compact" onClick={() => {
                              setEditingDocId(null);
                              setDocForm({ ...EMPTY_DOC(d.documentType), issuer: d.issuer ?? "", alertDaysBefore: d.alertDaysBefore });
                            }}>Renovar</button>
                          )}{" "}
                          <button type="button" className="btn btn-outline compact" onClick={() => {
                            setEditingDocId(d.id);
                            setDocForm({ documentType: d.documentType, expirationDate: d.expirationDate, number: d.number, issuer: d.issuer ?? "",
                              issueDate: d.issueDate ?? "", alertDaysBefore: d.alertDaysBefore, cost: d.cost, title: d.title });
                          }}>Editar</button>{" "}
                          <button type="button" className="btn btn-outline compact" onClick={() => deleteDocument(d)}>Borrar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {vehicle.meterType !== "None" && (
            <section className="card pad stack" style={{ gap: 14 }}>
              <h3 style={{ margin: 0 }}>Uso: {meterText(vehicle)}</h3>
              <form className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={saveReading}>
                {usesKm(vehicle.meterType) && (
                  <label style={{ width: 160 }}>Kilómetros
                    <input type="number" min={0} value={reading.km} onChange={(e) => setReading({ ...reading, km: e.target.value })} placeholder={String(vehicle.currentKilometers)} />
                  </label>
                )}
                {usesHours(vehicle.meterType) && (
                  <label style={{ width: 140 }}>Horas
                    <input type="number" min={0} step="0.1" value={reading.hours} onChange={(e) => setReading({ ...reading, hours: e.target.value })} placeholder={String(vehicle.currentEngineHours)} />
                  </label>
                )}
                <label style={{ width: 170 }}>Fecha
                  <input type="date" max={todayAr()} value={reading.date} onChange={(e) => setReading({ ...reading, date: e.target.value })} />
                </label>
                <label className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 10 }}>
                  <input type="checkbox" checked={reading.correction} onChange={(e) => setReading({ ...reading, correction: e.target.checked })} />
                  Corrección de un error
                </label>
                {reading.correction && (
                  <label style={{ flex: "1 1 220px" }}>Motivo *
                    <input required value={reading.note} onChange={(e) => setReading({ ...reading, note: e.target.value })} maxLength={300} />
                  </label>
                )}
                <button className="btn" disabled={busy || (reading.km === "" && reading.hours === "")}>Registrar lectura</button>
              </form>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Los valores no pueden bajar. Si se cargó mal, marcá "corrección" y explicá el motivo: queda registrado.
              </p>
              {readings.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fecha</th><th>Kilómetros</th><th>Horas</th><th>Detalle</th><th>Cargó</th></tr></thead>
                    <tbody>
                      {readings.slice(0, 15).map((r) => (
                        <tr key={r.id}>
                          <td>{civilDate(r.readAtUtc)}</td>
                          <td>{r.kilometers != null ? r.kilometers.toLocaleString("es-AR") : "—"}</td>
                          <td>{r.hours != null ? r.hours.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"}</td>
                          <td>{r.isCorrection ? <span className="badge warn">Corrección</span> : null} {r.note}</td>
                          <td className="muted">{r.createdBy || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
