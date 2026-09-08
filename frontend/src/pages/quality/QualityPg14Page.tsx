import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type {
  QualityEquipment,
  QualityIntermediateCheck,
  QualityMaintenancePlanItem,
  QualityPg14Summary
} from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

type Tab = "equipos" | "r05" | "r06";

const TABS: { id: Tab; label: string }[] = [
  { id: "equipos", label: "Equipos auxiliares" },
  { id: "r05", label: "R05 Verificación" },
  { id: "r06", label: "R06 Mantenimiento" }
];

const KIND_LABEL: Record<string, string> = {
  Truck: "Camión",
  Trailer: "Acoplado",
  Forklift: "Autoelevador",
  Other: "Otro"
};

const EQ_STATUS: Record<string, string> = {
  Active: "Activo",
  OutOfService: "Fuera de servicio",
  Retired: "Baja"
};

const CHECK_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Completed: "Completada",
  Cancelled: "Anulada"
};

const RESULT_LABEL: Record<string, string> = {
  Pass: "Apto",
  Fail: "No apto",
  Conditional: "Condicional"
};

const FREQ_LABEL: Record<string, string> = {
  Monthly: "Mensual",
  Quarterly: "Trimestral",
  Semiannual: "Semestral",
  Annual: "Anual"
};

const MP_STATUS: Record<string, string> = {
  Active: "Activo",
  Done: "Hecho",
  Cancelled: "Anulado"
};

function parseTab(v: string | null): Tab {
  if (v === "r05" || v === "r06") return v;
  return "equipos";
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityPg14Page() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [summary, setSummary] = useState<QualityPg14Summary | null>(null);
  const [equipment, setEquipment] = useState<QualityEquipment[]>([]);
  const [checks, setChecks] = useState<QualityIntermediateCheck[]>([]);
  const [plans, setPlans] = useState<QualityMaintenancePlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Equipment form
  const [eqKind, setEqKind] = useState("Truck");
  const [eqDescription, setEqDescription] = useState("");
  const [eqBrand, setEqBrand] = useState("");
  const [eqModel, setEqModel] = useState("");
  const [eqSerial, setEqSerial] = useState("");
  const [eqPlate, setEqPlate] = useState("");
  const [eqParentId, setEqParentId] = useState("");
  const [eqLocation, setEqLocation] = useState("");
  const [eqNotes, setEqNotes] = useState("");
  const [eqStatus, setEqStatus] = useState("Active");

  // R05 form
  const [cDate, setCDate] = useState(new Date().toISOString().slice(0, 10));
  const [cWeight, setCWeight] = useState("1000 kg");
  const [cInstrument, setCInstrument] = useState("");
  const [cEquipmentId, setCEquipmentId] = useState("");
  const [cReadings, setCReadings] = useState("");
  const [cResult, setCResult] = useState("");
  const [cResponsible, setCResponsible] = useState("");
  const [cNotes, setCNotes] = useState("");

  // R06 form
  const [mEquipmentId, setMEquipmentId] = useState("");
  const [mActivity, setMActivity] = useState("");
  const [mFrequency, setMFrequency] = useState("Monthly");
  const [mNextDue, setMNextDue] = useState("");
  const [mResponsible, setMResponsible] = useState("");
  const [mNotes, setMNotes] = useState("");

  const selectedEq = equipment.find((r) => r.id === selectedId) ?? null;
  const selectedCheck = checks.find((r) => r.id === selectedId) ?? null;
  const selectedPlan = plans.find((r) => r.id === selectedId) ?? null;

  const parentOptions = useMemo(
    () => equipment.filter((e) => e.status !== "Retired" && (e.kind === "Truck" || e.kind === "Trailer")),
    [equipment]
  );
  const activeEquipment = useMemo(
    () => equipment.filter((e) => e.status !== "Retired"),
    [equipment]
  );

  const setTab = (next: Tab) => {
    setSearchParams({ tab: next });
    setSelectedId(null);
    setShowForm(false);
    setError(null);
    setMsg(null);
  };

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      api.getQualityPg14Summary(),
      api.listQualityEquipment(),
      api.listQualityPg14R05(),
      api.listQualityPg14R06()
    ])
      .then(([sum, eq, r05, r06]) => {
        setSummary(sum);
        setEquipment(eq.rows || []);
        setChecks(r05.rows || []);
        setPlans(r06.rows || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === "equipos" && selectedEq) {
      setEqKind(selectedEq.kind);
      setEqDescription(selectedEq.description || "");
      setEqBrand(selectedEq.brand || "");
      setEqModel(selectedEq.model || "");
      setEqSerial(selectedEq.serialNumber || "");
      setEqPlate(selectedEq.plate || "");
      setEqParentId(selectedEq.parentEquipmentId || "");
      setEqLocation(selectedEq.location || "");
      setEqNotes(selectedEq.notes || "");
      setEqStatus(selectedEq.status);
    }
    if (tab === "r05" && selectedCheck) {
      setCDate(selectedCheck.checkDate?.slice(0, 10) || "");
      setCWeight(selectedCheck.weightUsed || "1000 kg");
      setCInstrument(selectedCheck.instrument || "");
      setCEquipmentId(selectedCheck.equipmentId || "");
      setCReadings(selectedCheck.readings || "");
      setCResult(selectedCheck.result || "");
      setCResponsible(selectedCheck.responsible || "");
      setCNotes(selectedCheck.notes || "");
    }
    if (tab === "r06" && selectedPlan) {
      setMEquipmentId(selectedPlan.equipmentId);
      setMActivity(selectedPlan.activity);
      setMFrequency(selectedPlan.frequency);
      setMNextDue(selectedPlan.nextDue?.slice(0, 10) || "");
      setMResponsible(selectedPlan.responsible || "");
      setMNotes(selectedPlan.notes || "");
    }
  }, [tab, selectedId, selectedEq, selectedCheck, selectedPlan]);

  const resetEqForm = () => {
    setEqKind("Truck");
    setEqDescription("");
    setEqBrand("");
    setEqModel("");
    setEqSerial("");
    setEqPlate("");
    setEqParentId("");
    setEqLocation("");
    setEqNotes("");
    setEqStatus("Active");
  };

  const resetCheckForm = () => {
    setCDate(new Date().toISOString().slice(0, 10));
    setCWeight("1000 kg");
    setCInstrument("");
    setCEquipmentId("");
    setCReadings("");
    setCResult("");
    setCResponsible("");
    setCNotes("");
  };

  const resetPlanForm = () => {
    setMEquipmentId("");
    setMActivity("");
    setMFrequency("Monthly");
    setMNextDue("");
    setMResponsible("");
    setMNotes("");
  };

  const createEquipment = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createQualityEquipment({
        kind: eqKind,
        description: eqDescription || undefined,
        brand: eqBrand || undefined,
        model: eqModel || undefined,
        serialNumber: eqSerial || undefined,
        plate: eqPlate || undefined,
        parentEquipmentId: eqParentId || undefined,
        location: eqLocation || undefined,
        notes: eqNotes || undefined
      });
      setMsg("Equipo creado.");
      setShowForm(false);
      resetEqForm();
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEquipment = async () => {
    if (!selectedEq) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateQualityEquipment(selectedEq.id, {
        kind: eqKind,
        description: eqDescription,
        brand: eqBrand,
        model: eqModel,
        serialNumber: eqSerial,
        plate: eqPlate,
        parentEquipmentId: eqParentId || null,
        location: eqLocation,
        status: eqStatus,
        notes: eqNotes
      });
      setMsg("Equipo actualizado.");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const retireEquipment = async (id: string) => {
    if (!confirm("¿Dar de baja este equipo (Retired)?")) return;
    setBusy(true);
    try {
      await api.retireQualityEquipment(id);
      setMsg("Equipo dado de baja.");
      setSelectedId(null);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createCheck = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createQualityIntermediateCheck({
        checkDate: cDate ? new Date(cDate).toISOString() : undefined,
        weightUsed: cWeight || "1000 kg",
        instrument: cInstrument || undefined,
        equipmentId: cEquipmentId || undefined,
        readings: cReadings || undefined,
        result: cResult || undefined,
        responsible: cResponsible || undefined,
        notes: cNotes || undefined
      });
      setMsg("Verificación creada.");
      setShowForm(false);
      resetCheckForm();
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveCheck = async (extra?: { status?: string }) => {
    if (!selectedCheck) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateQualityIntermediateCheck(selectedCheck.id, {
        checkDate: cDate ? new Date(cDate).toISOString() : undefined,
        weightUsed: cWeight,
        instrument: cInstrument,
        equipmentId: cEquipmentId || null,
        readings: cReadings,
        result: cResult || undefined,
        responsible: cResponsible,
        notes: cNotes,
        status: extra?.status
      });
      setMsg(extra?.status === "Completed" ? "Verificación completada." : "Verificación actualizada.");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelCheck = async (id: string) => {
    if (!confirm("¿Anular esta verificación?")) return;
    setBusy(true);
    try {
      await api.cancelQualityIntermediateCheck(id);
      setMsg("Verificación anulada.");
      setSelectedId(null);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createPlan = async (e: FormEvent) => {
    e.preventDefault();
    if (!mEquipmentId) {
      setError("Seleccione un equipo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createQualityMaintenancePlanItem({
        equipmentId: mEquipmentId,
        activity: mActivity,
        frequency: mFrequency,
        nextDue: mNextDue ? new Date(mNextDue).toISOString() : undefined,
        responsible: mResponsible || undefined,
        notes: mNotes || undefined
      });
      setMsg("Ítem de mantenimiento creado.");
      setShowForm(false);
      resetPlanForm();
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!selectedPlan) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateQualityMaintenancePlanItem(selectedPlan.id, {
        activity: mActivity,
        frequency: mFrequency,
        nextDue: mNextDue ? new Date(mNextDue).toISOString() : null,
        responsible: mResponsible,
        notes: mNotes
      });
      setMsg("Ítem actualizado.");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const markDone = async (row: QualityMaintenancePlanItem) => {
    setBusy(true);
    setError(null);
    try {
      await api.updateQualityMaintenancePlanItem(row.id, {
        lastDone: new Date().toISOString()
      });
      setMsg(`Mantenimiento ${row.number} marcado como hecho; próximo vencimiento avanzado.`);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelPlan = async (id: string) => {
    if (!confirm("¿Anular este ítem de mantenimiento?")) return;
    setBusy(true);
    try {
      await api.cancelQualityMaintenancePlanItem(id);
      setMsg("Ítem anulado.");
      setSelectedId(null);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportChecks = () => {
    const columns: ExcelColumn<QualityIntermediateCheck>[] = [
      { key: "number", header: "Número" },
      { key: "checkDate", header: "Fecha", value: (r) => excelDate(r.checkDate) },
      { key: "weightUsed", header: "Pesa", value: (r) => r.weightUsed || "" },
      { key: "instrument", header: "Instrumento", value: (r) => r.instrument || "" },
      { key: "result", header: "Resultado", value: (r) => RESULT_LABEL[r.result || ""] || r.result || "" },
      { key: "responsible", header: "Responsable", value: (r) => r.responsible || "" },
      { key: "status", header: "Estado", value: (r) => CHECK_STATUS[r.status] || r.status },
      { key: "notes", header: "Notas", value: (r) => r.notes || "" }
    ];
    void exportToExcel("PG14-R05_verificaciones", checks, columns);
  };

  const exportPlans = () => {
    const columns: ExcelColumn<QualityMaintenancePlanItem>[] = [
      { key: "number", header: "Número" },
      { key: "equipmentCode", header: "Equipo", value: (r) => r.equipmentCode || "" },
      { key: "equipmentDescription", header: "Descripción equipo", value: (r) => r.equipmentDescription || "" },
      { key: "activity", header: "Actividad" },
      { key: "frequency", header: "Frecuencia", value: (r) => FREQ_LABEL[r.frequency] || r.frequency },
      { key: "nextDue", header: "Próximo", value: (r) => excelDate(r.nextDue) },
      { key: "lastDone", header: "Último", value: (r) => excelDate(r.lastDone) },
      { key: "isOverdue", header: "Vencido", value: (r) => (r.isOverdue ? "Sí" : "No") },
      { key: "responsible", header: "Responsable", value: (r) => r.responsible || "" },
      { key: "status", header: "Estado", value: (r) => MP_STATUS[r.status] || r.status }
    ];
    void exportToExcel("PG14-R06_mantenimiento", plans, columns);
  };

  const exportEquipment = () => {
    const columns: ExcelColumn<QualityEquipment>[] = [
      { key: "code", header: "Código" },
      { key: "kind", header: "Tipo", value: (r) => KIND_LABEL[r.kind] || r.kind },
      { key: "description", header: "Descripción", value: (r) => r.description || "" },
      { key: "brand", header: "Marca", value: (r) => r.brand || "" },
      { key: "model", header: "Modelo", value: (r) => r.model || "" },
      { key: "serialNumber", header: "Serie", value: (r) => r.serialNumber || "" },
      { key: "plate", header: "Patente", value: (r) => r.plate || "" },
      { key: "location", header: "Ubicación", value: (r) => r.location || "" },
      { key: "status", header: "Estado", value: (r) => EQ_STATUS[r.status] || r.status }
    ];
    void exportToExcel("PG14_equipos_auxiliares", equipment, columns);
  };

  if (loading) return <div className="workspace-page pad">Cargando…</div>;

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <Link to="/calidad/registros">← Registros</Link>
          <h1 style={{ margin: "8px 0 4px" }}>PG14 · Equipamiento auxiliar</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Equipos · verificación intermedia (R05) · mantenimiento preventivo (R06)
          </p>
        </div>
        {summary && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span>Activos: <strong>{summary.equipmentActive}</strong></span>
            <span>Verif. borrador: <strong>{summary.checksDraft}</strong></span>
            <span>Mant. ≤30d: <strong>{summary.maintenanceDue}</strong></span>
            <span>Mant. vencidos: <strong style={{ color: summary.maintenanceOverdue ? "#b91c1c" : undefined }}>{summary.maintenanceOverdue}</strong></span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "btn btn-primary" : "btn btn-outline"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {tab === "equipos" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedId(null);
                resetEqForm();
                setShowForm(true);
              }}
            >
              Nuevo equipo
            </button>
            <button type="button" className="btn btn-outline" onClick={exportEquipment}>
              Excel
            </button>
          </div>

          {showForm && !selectedId && (
            <form onSubmit={createEquipment} className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Alta de equipo auxiliar</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
                <label>
                  Tipo
                  <select value={eqKind} onChange={(e) => setEqKind(e.target.value)} required>
                    {Object.entries(KIND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Descripción
                  <input value={eqDescription} onChange={(e) => setEqDescription(e.target.value)} />
                </label>
                <label>
                  Marca
                  <input value={eqBrand} onChange={(e) => setEqBrand(e.target.value)} />
                </label>
                <label>
                  Modelo
                  <input value={eqModel} onChange={(e) => setEqModel(e.target.value)} />
                </label>
                <label>
                  Serie
                  <input value={eqSerial} onChange={(e) => setEqSerial(e.target.value)} />
                </label>
                <label>
                  Patente
                  <input value={eqPlate} onChange={(e) => setEqPlate(e.target.value)} />
                </label>
                <label>
                  Padre (autoelevador → camión)
                  <select value={eqParentId} onChange={(e) => setEqParentId(e.target.value)}>
                    <option value="">—</option>
                    {parentOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} · {KIND_LABEL[p.kind] || p.kind}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Ubicación
                  <input value={eqLocation} onChange={(e) => setEqLocation(e.target.value)} />
                </label>
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                Notas
                <textarea value={eqNotes} onChange={(e) => setEqNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>Guardar</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
              <p style={{ fontSize: 12, color: "#64748b" }}>El código se asigna automáticamente (EQ 001, EQ 002…).</p>
            </form>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card" style={{ padding: 0, overflow: "auto" }}>
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => { setSelectedId(r.id); setShowForm(false); }}
                      style={{ cursor: "pointer", background: selectedId === r.id ? "#e0f2fe" : undefined }}
                    >
                      <td>{r.code}</td>
                      <td>{KIND_LABEL[r.kind] || r.kind}</td>
                      <td>{r.description || "—"}</td>
                      <td>{EQ_STATUS[r.status] || r.status}</td>
                    </tr>
                  ))}
                  {equipment.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 16, color: "#64748b" }}>Sin equipos.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedEq && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{selectedEq.code}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    Tipo
                    <select value={eqKind} onChange={(e) => setEqKind(e.target.value)}>
                      {Object.entries(KIND_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estado
                    <select value={eqStatus} onChange={(e) => setEqStatus(e.target.value)}>
                      {Object.entries(EQ_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descripción
                    <input value={eqDescription} onChange={(e) => setEqDescription(e.target.value)} />
                  </label>
                  <label>
                    Padre
                    <select value={eqParentId} onChange={(e) => setEqParentId(e.target.value)}>
                      <option value="">—</option>
                      {parentOptions.filter((p) => p.id !== selectedEq.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.code}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Marca
                    <input value={eqBrand} onChange={(e) => setEqBrand(e.target.value)} />
                  </label>
                  <label>
                    Modelo
                    <input value={eqModel} onChange={(e) => setEqModel(e.target.value)} />
                  </label>
                  <label>
                    Serie
                    <input value={eqSerial} onChange={(e) => setEqSerial(e.target.value)} />
                  </label>
                  <label>
                    Patente
                    <input value={eqPlate} onChange={(e) => setEqPlate(e.target.value)} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Ubicación
                    <input value={eqLocation} onChange={(e) => setEqLocation(e.target.value)} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Notas
                    <textarea value={eqNotes} onChange={(e) => setEqNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
                  </label>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveEquipment()}>
                    Guardar
                  </button>
                  {selectedEq.status !== "Retired" && (
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void retireEquipment(selectedEq.id)}>
                      Dar de baja
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "r05" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedId(null);
                resetCheckForm();
                setShowForm(true);
              }}
            >
              Nueva verificación
            </button>
            <button type="button" className="btn btn-outline" onClick={exportChecks}>
              Excel
            </button>
          </div>

          {showForm && !selectedId && (
            <form onSubmit={createCheck} className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>PG14-R05 · Verificación intermedia</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
                <label>
                  Fecha
                  <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} required />
                </label>
                <label>
                  Pesa utilizada
                  <input value={cWeight} onChange={(e) => setCWeight(e.target.value)} />
                </label>
                <label>
                  Instrumento / balanza
                  <input value={cInstrument} onChange={(e) => setCInstrument(e.target.value)} />
                </label>
                <label>
                  Equipo auxiliar (opcional)
                  <select value={cEquipmentId} onChange={(e) => setCEquipmentId(e.target.value)}>
                    <option value="">—</option>
                    {activeEquipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.code} · {eq.description || KIND_LABEL[eq.kind]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsable
                  <input value={cResponsible} onChange={(e) => setCResponsible(e.target.value)} />
                </label>
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                Lecturas
                <textarea value={cReadings} onChange={(e) => setCReadings(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                Notas
                <textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>Crear borrador</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </form>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card" style={{ padding: 0, overflow: "auto" }}>
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Resultado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => { setSelectedId(r.id); setShowForm(false); }}
                      style={{ cursor: "pointer", background: selectedId === r.id ? "#e0f2fe" : undefined }}
                    >
                      <td>{r.number}</td>
                      <td>{fmtDate(r.checkDate)}</td>
                      <td>{RESULT_LABEL[r.result || ""] || r.result || "—"}</td>
                      <td>{CHECK_STATUS[r.status] || r.status}</td>
                    </tr>
                  ))}
                  {checks.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 16, color: "#64748b" }}>Sin verificaciones.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedCheck && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{selectedCheck.number}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    Fecha
                    <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} disabled={selectedCheck.status === "Cancelled"} />
                  </label>
                  <label>
                    Pesa
                    <input value={cWeight} onChange={(e) => setCWeight(e.target.value)} disabled={selectedCheck.status === "Cancelled"} />
                  </label>
                  <label>
                    Instrumento
                    <input value={cInstrument} onChange={(e) => setCInstrument(e.target.value)} disabled={selectedCheck.status === "Cancelled"} />
                  </label>
                  <label>
                    Resultado
                    <select value={cResult} onChange={(e) => setCResult(e.target.value)} disabled={selectedCheck.status === "Cancelled"}>
                      <option value="">—</option>
                      {Object.entries(RESULT_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Equipo
                    <select value={cEquipmentId} onChange={(e) => setCEquipmentId(e.target.value)} disabled={selectedCheck.status === "Cancelled"}>
                      <option value="">—</option>
                      {activeEquipment.map((eq) => (
                        <option key={eq.id} value={eq.id}>{eq.code}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Responsable
                    <input value={cResponsible} onChange={(e) => setCResponsible(e.target.value)} disabled={selectedCheck.status === "Cancelled"} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Lecturas
                    <textarea value={cReadings} onChange={(e) => setCReadings(e.target.value)} rows={2} style={{ width: "100%" }} disabled={selectedCheck.status === "Cancelled"} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Notas
                    <textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} style={{ width: "100%" }} disabled={selectedCheck.status === "Cancelled"} />
                  </label>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedCheck.status !== "Cancelled" && (
                    <>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveCheck()}>
                        Guardar
                      </button>
                      {selectedCheck.status === "Draft" && (
                        <button type="button" className="btn btn-outline" disabled={busy || !cResult} onClick={() => void saveCheck({ status: "Completed" })}>
                          Completar
                        </button>
                      )}
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void cancelCheck(selectedCheck.id)}>
                        Anular
                      </button>
                    </>
                  )}
                  <Link className="btn btn-outline" to={`/calidad/registros/equipos/verificacion/${selectedCheck.id}/pdf`}>
                    PDF
                  </Link>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "r06" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedId(null);
                resetPlanForm();
                setShowForm(true);
              }}
            >
              Nuevo ítem
            </button>
            <button type="button" className="btn btn-outline" onClick={exportPlans}>
              Excel
            </button>
          </div>

          {showForm && !selectedId && (
            <form onSubmit={createPlan} className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>PG14-R06 · Mantenimiento preventivo</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
                <label>
                  Equipo *
                  <select value={mEquipmentId} onChange={(e) => setMEquipmentId(e.target.value)} required>
                    <option value="">—</option>
                    {activeEquipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.code} · {eq.description || KIND_LABEL[eq.kind]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Frecuencia
                  <select value={mFrequency} onChange={(e) => setMFrequency(e.target.value)}>
                    {Object.entries(FREQ_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Próximo vencimiento
                  <input type="date" value={mNextDue} onChange={(e) => setMNextDue(e.target.value)} />
                </label>
                <label>
                  Responsable
                  <input value={mResponsible} onChange={(e) => setMResponsible(e.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Actividad *
                  <input value={mActivity} onChange={(e) => setMActivity(e.target.value)} required />
                </label>
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                Notas
                <textarea value={mNotes} onChange={(e) => setMNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>Crear</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </form>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card" style={{ padding: 0, overflow: "auto" }}>
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Equipo</th>
                    <th>Actividad</th>
                    <th>Próximo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => { setSelectedId(r.id); setShowForm(false); }}
                      style={{
                        cursor: "pointer",
                        background: selectedId === r.id ? "#e0f2fe" : r.isOverdue ? "#fef2f2" : undefined
                      }}
                    >
                      <td>{r.number}</td>
                      <td>{r.equipmentCode}</td>
                      <td>{r.activity}</td>
                      <td>{fmtDate(r.nextDue)}{r.isOverdue ? " ⚠" : ""}</td>
                      <td>{MP_STATUS[r.status] || r.status}</td>
                    </tr>
                  ))}
                  {plans.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 16, color: "#64748b" }}>Sin ítems.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedPlan && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{selectedPlan.number}</h3>
                <p style={{ marginTop: 0, color: "#64748b" }}>
                  {selectedPlan.equipmentCode} · {selectedPlan.equipmentDescription}
                  {selectedPlan.isOverdue ? " · Vencido" : ""}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Actividad
                    <input value={mActivity} onChange={(e) => setMActivity(e.target.value)} disabled={selectedPlan.status === "Cancelled"} />
                  </label>
                  <label>
                    Frecuencia
                    <select value={mFrequency} onChange={(e) => setMFrequency(e.target.value)} disabled={selectedPlan.status === "Cancelled"}>
                      {Object.entries(FREQ_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Próximo
                    <input type="date" value={mNextDue} onChange={(e) => setMNextDue(e.target.value)} disabled={selectedPlan.status === "Cancelled"} />
                  </label>
                  <label>
                    Último hecho
                    <input value={fmtDate(selectedPlan.lastDone)} disabled />
                  </label>
                  <label>
                    Responsable
                    <input value={mResponsible} onChange={(e) => setMResponsible(e.target.value)} disabled={selectedPlan.status === "Cancelled"} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Notas
                    <textarea value={mNotes} onChange={(e) => setMNotes(e.target.value)} rows={2} style={{ width: "100%" }} disabled={selectedPlan.status === "Cancelled"} />
                  </label>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedPlan.status !== "Cancelled" && (
                    <>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void savePlan()}>
                        Guardar
                      </button>
                      {selectedPlan.status === "Active" && (
                        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void markDone(selectedPlan)}>
                          Marcar hecho
                        </button>
                      )}
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void cancelPlan(selectedPlan.id)}>
                        Anular
                      </button>
                    </>
                  )}
                  <Link className="btn btn-outline" to={`/calidad/registros/equipos/mantenimiento/${selectedPlan.id}/pdf`}>
                    PDF
                  </Link>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
