import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type {
  QualityEquipment,
  QualityEquipmentLogEntry,
  QualityEquipmentLogListResponse,
  QualityIntermediateCheck,
  QualityMaintenancePlanItem,
  QualityPg14CalibrationProgramRow,
  QualityPg14R03Response,
  QualityPg14R04Response,
  QualityPg14Summary,
  QualityPg14UnifiedAsset
} from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";
import {
  CHECK_RESULT,
  EQUIPMENT_KIND,
  EQUIPMENT_STATUS,
  FREQUENCY_LABEL,
  GENERIC_RECORD_STATUS,
  labelOf,
  LOG_KIND_LABEL,
  METROLOGY_VERDICT
} from "./qualityLabels";

type Tab = "r04" | "r03" | "r01" | "equipos" | "r05" | "r06";

const TABS: { id: Tab; label: string }[] = [
  { id: "r04", label: "R04 Listado" },
  { id: "r03", label: "R03 Programa" },
  { id: "r01", label: "R01 Hoja de vida" },
  { id: "equipos", label: "Equipos auxiliares" },
  { id: "r05", label: "R05 Verificación" },
  { id: "r06", label: "R06 Mantenimiento" }
];

const KIND_LABEL = EQUIPMENT_KIND;

const SOURCE_LABEL: Record<string, string> = {
  StandardWeight: "Pesa",
  Instrument: "Instrumento",
  QualityEquipment: "Auxiliar"
};

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  StandardWeight: { bg: "#dbeafe", color: "#1e40af" },
  Instrument: { bg: "#ccfbf1", color: "#0f766e" },
  QualityEquipment: { bg: "#f1f5f9", color: "#475569" }
};

const EQ_STATUS = EQUIPMENT_STATUS;
const CHECK_STATUS = GENERIC_RECORD_STATUS;
const RESULT_LABEL = CHECK_RESULT;
const FREQ_LABEL = FREQUENCY_LABEL;
const MP_STATUS: Record<string, string> = {
  Active: "Activo",
  Done: "Hecho",
  Cancelled: "Anulado"
};
const LOG_VERDICT_LABEL = METROLOGY_VERDICT;
const LOG_STATUS: Record<string, string> = {
  Active: "Activo",
  Cancelled: "Anulado"
};

function parseTab(v: string | null): Tab {
  if (v === "r04" || v === "r03" || v === "r01" || v === "equipos" || v === "r05" || v === "r06") return v;
  return "r04";
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityPg14Page() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [summary, setSummary] = useState<QualityPg14Summary | null>(null);
  const [inventory, setInventory] = useState<QualityPg14UnifiedAsset[]>([]);
  const [inventoryCounts, setInventoryCounts] = useState<QualityPg14R04Response["counts"] | null>(null);
  const [calProgram, setCalProgram] = useState<QualityPg14CalibrationProgramRow[]>([]);
  const [calSummary, setCalSummary] = useState<QualityPg14R03Response["summary"] | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [equipment, setEquipment] = useState<QualityEquipment[]>([]);
  const [checks, setChecks] = useState<QualityIntermediateCheck[]>([]);
  const [plans, setPlans] = useState<QualityMaintenancePlanItem[]>([]);
  const [logEntries, setLogEntries] = useState<QualityEquipmentLogEntry[]>([]);
  const [logCounts, setLogCounts] = useState<QualityEquipmentLogListResponse["countsByKind"] | null>(null);
  const [logAssetKey, setLogAssetKey] = useState<string>("");
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

  // R01 form
  const [lSource, setLSource] = useState("StandardWeight");
  const [lAssetId, setLAssetId] = useState("");
  const [lKind, setLKind] = useState("C");
  const [lDate, setLDate] = useState(new Date().toISOString().slice(0, 10));
  const [lCert, setLCert] = useState("");
  const [lVerdict, setLVerdict] = useState("");
  const [lDt, setLDt] = useState(false);
  const [lResponsible, setLResponsible] = useState("");
  const [lDescription, setLDescription] = useState("");
  const [lNotes, setLNotes] = useState("");

  const selectedEq = equipment.find((r) => r.id === selectedId) ?? null;
  const selectedCheck = checks.find((r) => r.id === selectedId) ?? null;
  const selectedPlan = plans.find((r) => r.id === selectedId) ?? null;
  const selectedLog = logEntries.find((r) => r.id === selectedId) ?? null;

  const parentOptions = useMemo(
    () => equipment.filter((e) => e.status !== "Retired" && (e.kind === "Truck" || e.kind === "Trailer")),
    [equipment]
  );
  const activeEquipment = useMemo(
    () => equipment.filter((e) => e.status !== "Retired"),
    [equipment]
  );
  const filteredInventory = useMemo(
    () => (sourceFilter === "all" ? inventory : inventory.filter((r) => r.source === sourceFilter)),
    [inventory, sourceFilter]
  );
  const filteredLogs = useMemo(() => {
    if (!logAssetKey) return logEntries;
    const [src, id] = logAssetKey.split("|");
    return logEntries.filter((r) => r.assetSource === src && r.assetId === id);
  }, [logEntries, logAssetKey]);
  const assetsForSource = useMemo(
    () => inventory.filter((a) => a.source === lSource),
    [inventory, lSource]
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
      api.listQualityPg14R04(),
      api.listQualityPg14R03(),
      api.listQualityEquipment(),
      api.listQualityPg14R05(),
      api.listQualityPg14R06(),
      api.listQualityEquipmentLogEntries()
    ])
      .then(([sum, r04, r03, eq, r05, r06, r01]) => {
        setSummary(sum);
        setInventory(r04.rows || []);
        setInventoryCounts(r04.counts || null);
        setCalProgram(r03.rows || []);
        setCalSummary(r03.summary || null);
        setEquipment(eq.rows || []);
        setChecks(r05.rows || []);
        setPlans(r06.rows || []);
        setLogEntries(r01.rows || []);
        setLogCounts(r01.countsByKind || null);
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
    if (tab === "r01" && selectedLog) {
      setLSource(selectedLog.assetSource);
      setLAssetId(selectedLog.assetId);
      setLKind(selectedLog.kind);
      setLDate(selectedLog.eventDate?.slice(0, 10) || "");
      setLCert(selectedLog.certificateNumber || "");
      setLVerdict(selectedLog.verdict || "");
      setLDt(!!selectedLog.approvedByTechnicalDirector);
      setLResponsible(selectedLog.responsible || "");
      setLDescription(selectedLog.description || "");
      setLNotes(selectedLog.notes || "");
    }
  }, [tab, selectedId, selectedEq, selectedCheck, selectedPlan, selectedLog]);

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

  const resetLogForm = () => {
    setLSource("StandardWeight");
    setLAssetId("");
    setLKind("C");
    setLDate(new Date().toISOString().slice(0, 10));
    setLCert("");
    setLVerdict("");
    setLDt(false);
    setLResponsible("");
    setLDescription("");
    setLNotes("");
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

  const createLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!lAssetId) {
      setError("Seleccione un activo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const asset = inventory.find((a) => a.id === lAssetId && a.source === lSource);
      await api.createQualityEquipmentLogEntry({
        assetSource: lSource,
        assetId: lAssetId,
        kind: lKind,
        eventDate: lDate ? new Date(lDate).toISOString() : undefined,
        assetCode: asset?.code,
        assetDescription: asset?.description,
        certificateNumber: lCert || undefined,
        verdict: lVerdict || undefined,
        approvedByTechnicalDirector: lDt,
        responsible: lResponsible || undefined,
        description: lDescription || undefined,
        notes: lNotes || undefined
      });
      setMsg("Evento de hoja de vida creado.");
      setShowForm(false);
      resetLogForm();
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveLog = async () => {
    if (!selectedLog) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateQualityEquipmentLogEntry(selectedLog.id, {
        eventDate: lDate ? new Date(lDate).toISOString() : undefined,
        kind: lKind,
        certificateNumber: lCert,
        verdict: lVerdict,
        approvedByTechnicalDirector: lDt,
        responsible: lResponsible,
        description: lDescription,
        notes: lNotes
      });
      setMsg("Evento actualizado.");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelLog = async (id: string) => {
    if (!confirm("¿Anular este evento de hoja de vida?")) return;
    setBusy(true);
    try {
      await api.cancelQualityEquipmentLogEntry(id);
      setMsg("Evento anulado.");
      setSelectedId(null);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const syncCalibrations = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.syncQualityEquipmentLogCalibrations();
      setMsg(`Sincronización: ${res.created} creados, ${res.skipped} omitidos.`);
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

  const exportInventory = () => {
    const columns: ExcelColumn<QualityPg14UnifiedAsset>[] = [
      { key: "source", header: "Origen", value: (r) => SOURCE_LABEL[r.source] || r.source },
      { key: "code", header: "Código" },
      { key: "kind", header: "Tipo", value: (r) => KIND_LABEL[r.kind] || r.kind },
      { key: "description", header: "Descripción", value: (r) => r.description || "" },
      { key: "brandOrManufacturer", header: "Marca / Fabricante", value: (r) => r.brandOrManufacturer || "" },
      { key: "model", header: "Modelo", value: (r) => r.model || "" },
      { key: "serialNumber", header: "Serie", value: (r) => r.serialNumber || "" },
      { key: "certificateNumber", header: "Certificado", value: (r) => r.certificateNumber || "" },
      { key: "calibrationDate", header: "Calibración", value: (r) => excelDate(r.calibrationDate) },
      { key: "expirationDate", header: "Vencimiento", value: (r) => excelDate(r.expirationDate) },
      { key: "status", header: "Estado", value: (r) => labelOf(EQ_STATUS, r.status) },
      { key: "extra", header: "Extra", value: (r) => r.extra || "" },
      { key: "isExpired", header: "Vencido", value: (r) => (r.isExpired ? "Sí" : "No") },
      { key: "deepLinkPath", header: "Enlace", value: (r) => r.deepLinkPath || "" }
    ];
    void exportToExcel("PG14-R04_listado_equipos", filteredInventory, columns);
  };

  const exportCalProgram = () => {
    const columns: ExcelColumn<QualityPg14CalibrationProgramRow>[] = [
      { key: "source", header: "Origen", value: (r) => SOURCE_LABEL[r.source] || r.source },
      { key: "code", header: "Código" },
      { key: "kind", header: "Tipo", value: (r) => KIND_LABEL[r.kind] || r.kind },
      { key: "description", header: "Descripción", value: (r) => r.description || "" },
      { key: "certificateNumber", header: "Certificado", value: (r) => r.certificateNumber || "" },
      { key: "calibrationDate", header: "Calibración", value: (r) => excelDate(r.calibrationDate) },
      { key: "expirationDate", header: "Vencimiento", value: (r) => excelDate(r.expirationDate) },
      { key: "daysUntilExpiry", header: "Días", value: (r) => (r.daysUntilExpiry == null ? "" : String(r.daysUntilExpiry)) },
      { key: "isExpired", header: "Vencido", value: (r) => (r.isExpired ? "Sí" : "No") },
      { key: "isDueSoon", header: "Próximo (≤60d)", value: (r) => (r.isDueSoon ? "Sí" : "No") },
      { key: "status", header: "Estado", value: (r) => labelOf(EQ_STATUS, r.status) },
      { key: "deepLinkPath", header: "Enlace", value: (r) => r.deepLinkPath || "" }
    ];
    void exportToExcel("PG14-R03_programa_calibraciones", calProgram, columns);
  };

  const exportLogs = () => {
    const columns: ExcelColumn<QualityEquipmentLogEntry>[] = [
      { key: "number", header: "Número" },
      { key: "eventDate", header: "Fecha", value: (r) => excelDate(r.eventDate) },
      { key: "assetSource", header: "Origen", value: (r) => SOURCE_LABEL[r.assetSource] || r.assetSource },
      { key: "assetCode", header: "Código activo" },
      { key: "assetDescription", header: "Descripción", value: (r) => r.assetDescription || "" },
      { key: "kind", header: "Tipo", value: (r) => LOG_KIND_LABEL[r.kind] || r.kind },
      { key: "certificateNumber", header: "Certificado", value: (r) => r.certificateNumber || "" },
      { key: "verdict", header: "Dictamen", value: (r) => LOG_VERDICT_LABEL[r.verdict || ""] || r.verdict || "" },
      { key: "approvedByTechnicalDirector", header: "DT", value: (r) => (r.approvedByTechnicalDirector ? "Sí" : "No") },
      { key: "responsible", header: "Responsable", value: (r) => r.responsible || "" },
      { key: "description", header: "Descripción evento", value: (r) => r.description || "" },
      { key: "status", header: "Estado", value: (r) => LOG_STATUS[r.status] || r.status }
    ];
    void exportToExcel("PG14-R01_hoja_de_vida", filteredLogs, columns);
  };

  if (loading) return <div className="workspace-page pad">Cargando…</div>;

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <Link to="/calidad/registros">← Registros</Link>
          <h1 style={{ margin: "8px 0 4px" }}>PG14 · Equipamiento y calibraciones</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Listado (R04) · programa (R03) · hoja de vida (R01) · auxiliares · R05 · R06
          </p>
        </div>
        {summary && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            {summary.weightsCount != null && <span>Pesas: <strong>{summary.weightsCount}</strong></span>}
            {summary.instrumentsCount != null && <span>Instrumentos: <strong>{summary.instrumentsCount}</strong></span>}
            <span>Aux. activos: <strong>{summary.equipmentActive}</strong></span>
            {summary.logEntries != null && <span>HV activos: <strong>{summary.logEntries}</strong></span>}
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

      {tab === "r04" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              Origen
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="StandardWeight">Pesas</option>
                <option value="Instrument">Instrumentos</option>
                <option value="QualityEquipment">Auxiliares</option>
              </select>
            </label>
            <button type="button" className="btn btn-outline" onClick={exportInventory}>
              Excel
            </button>
            {inventoryCounts && (
              <span style={{ fontSize: 13, color: "#64748b" }}>
                Pesas {inventoryCounts.weights} · Instrumentos {inventoryCounts.instruments} · Auxiliares {inventoryCounts.auxiliaries} · Total {inventoryCounts.total}
              </span>
            )}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Marca</th>
                  <th>Serie</th>
                  <th>Certificado</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((r) => {
                  const badge = SOURCE_BADGE[r.source] || SOURCE_BADGE.QualityEquipment;
                  return (
                    <tr key={`${r.source}-${r.id}`} style={r.isExpired ? { background: "#fef2f2" } : undefined}>
                      <td>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: badge.bg,
                          color: badge.color,
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {SOURCE_LABEL[r.source] || r.source}
                        </span>
                      </td>
                      <td><strong>{r.code}</strong></td>
                      <td>{KIND_LABEL[r.kind] || r.kind}</td>
                      <td>{r.description || "—"}{r.extra ? <div style={{ color: "#64748b", fontSize: 12 }}>{r.extra}</div> : null}</td>
                      <td>{r.brandOrManufacturer || "—"}</td>
                      <td>{r.serialNumber || "—"}</td>
                      <td>{r.certificateNumber || "—"}</td>
                      <td style={r.isExpired ? { color: "#b91c1c", fontWeight: 600 } : undefined}>
                        {fmtDate(r.expirationDate)}
                      </td>
                      <td>{labelOf(EQ_STATUS, r.status)}</td>
                      <td>
                        {r.deepLinkPath ? (
                          <Link to={r.deepLinkPath} className="btn ghost compact">Abrir</Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {filteredInventory.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: "center", color: "#64748b" }}>Sin equipos en el listado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "r03" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-outline" onClick={exportCalProgram}>
              Excel
            </button>
            {calSummary && (
              <span style={{ fontSize: 13, color: "#64748b" }}>
                Vencidos <strong style={{ color: calSummary.expired ? "#b91c1c" : undefined }}>{calSummary.expired}</strong>
                {" · "}Próximos ≤60d <strong style={{ color: calSummary.dueSoon ? "#b45309" : undefined }}>{calSummary.dueSoon}</strong>
                {" · "}OK <strong>{calSummary.ok}</strong>
                {" · "}Total {calSummary.total}
              </span>
            )}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Certificado</th>
                  <th>Calibración</th>
                  <th>Vencimiento</th>
                  <th>Días</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {calProgram.map((r) => {
                  const badge = SOURCE_BADGE[r.source] || SOURCE_BADGE.QualityEquipment;
                  const rowBg = r.isExpired ? "#fef2f2" : r.isDueSoon ? "#fffbeb" : undefined;
                  return (
                    <tr key={`cal-${r.source}-${r.id}`} style={rowBg ? { background: rowBg } : undefined}>
                      <td>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: badge.bg,
                          color: badge.color,
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {SOURCE_LABEL[r.source] || r.source}
                        </span>
                      </td>
                      <td><strong>{r.code}</strong></td>
                      <td>{r.description || "—"}</td>
                      <td>{r.certificateNumber || "—"}</td>
                      <td>{fmtDate(r.calibrationDate)}</td>
                      <td style={r.isExpired ? { color: "#b91c1c", fontWeight: 600 } : r.isDueSoon ? { color: "#b45309", fontWeight: 600 } : undefined}>
                        {fmtDate(r.expirationDate)}
                      </td>
                      <td>
                        {r.daysUntilExpiry == null
                          ? "—"
                          : r.isExpired
                            ? `${r.daysUntilExpiry} (vencido)`
                            : r.daysUntilExpiry}
                      </td>
                      <td>
                        {r.isExpired ? "Vencido" : r.isDueSoon ? "Próximo" : labelOf(EQ_STATUS, r.status)}
                      </td>
                      <td>
                        {r.deepLinkPath ? (
                          <Link to={r.deepLinkPath} className="btn ghost compact">Abrir</Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {calProgram.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "#64748b" }}>Sin activos con fechas de calibración.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "r01" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              Activo
              <select value={logAssetKey} onChange={(e) => setLogAssetKey(e.target.value)}>
                <option value="">Todos</option>
                {inventory.map((a) => (
                  <option key={`${a.source}-${a.id}`} value={`${a.source}|${a.id}`}>
                    {SOURCE_LABEL[a.source] || a.source} · {a.code} · {a.description || "—"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedId(null);
                resetLogForm();
                if (logAssetKey) {
                  const [src, id] = logAssetKey.split("|");
                  setLSource(src);
                  setLAssetId(id);
                }
                setShowForm(true);
              }}
            >
              Nuevo evento
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void syncCalibrations()}>
              Sincronizar calibraciones desde Metrología
            </button>
            <button type="button" className="btn btn-outline" onClick={exportLogs}>
              Excel
            </button>
            {logAssetKey && (() => {
              const [src, id] = logAssetKey.split("|");
              return (
                <Link
                  to={`/calidad/registros/equipos/hoja-vida/${encodeURIComponent(src)}/${id}/pdf`}
                  className="btn btn-outline"
                >
                  PDF hoja de vida
                </Link>
              );
            })()}
            {logCounts && (
              <span style={{ fontSize: 13, color: "#64748b" }}>
                C {logCounts.C} · V {logCounts.V} · MP {logCounts.MP} · MC {logCounts.MC} · Baja {logCounts.Baja}
              </span>
            )}
          </div>

          {showForm && !selectedId && (
            <form onSubmit={createLog} className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>PG14-R01 · Evento de hoja de vida</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
                <label>
                  Origen
                  <select
                    value={lSource}
                    onChange={(e) => {
                      setLSource(e.target.value);
                      setLAssetId("");
                    }}
                    required
                  >
                    <option value="StandardWeight">Pesa</option>
                    <option value="Instrument">Instrumento</option>
                    <option value="QualityEquipment">Auxiliar</option>
                  </select>
                </label>
                <label>
                  Activo
                  <select value={lAssetId} onChange={(e) => setLAssetId(e.target.value)} required>
                    <option value="">—</option>
                    {assetsForSource.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.description || "—"}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select value={lKind} onChange={(e) => setLKind(e.target.value)} required>
                    {Object.entries(LOG_KIND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha
                  <input type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} required />
                </label>
                <label>
                  Certificado
                  <input value={lCert} onChange={(e) => setLCert(e.target.value)} />
                </label>
                <label>
                  Dictamen
                  <select value={lVerdict} onChange={(e) => setLVerdict(e.target.value)}>
                    <option value="">—</option>
                    <option value="Apto">Apto</option>
                    <option value="NoApto">No apto</option>
                    <option value="Condicional">Condicional</option>
                  </select>
                </label>
                <label>
                  Responsable
                  <input value={lResponsible} onChange={(e) => setLResponsible(e.target.value)} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
                  <input type="checkbox" checked={lDt} onChange={(e) => setLDt(e.target.checked)} />
                  Aprobado por DT
                </label>
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                Descripción
                <textarea value={lDescription} onChange={(e) => setLDescription(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                Notas
                <textarea value={lNotes} onChange={(e) => setLNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>Crear evento</button>
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
                    <th>Activo</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        cursor: "pointer",
                        background: selectedId === r.id ? "#e0f2fe" : undefined,
                        opacity: r.status === "Cancelled" ? 0.55 : 1
                      }}
                    >
                      <td>{r.number}</td>
                      <td>{fmtDate(r.eventDate)}</td>
                      <td>{r.assetCode}</td>
                      <td>{LOG_KIND_LABEL[r.kind] || r.kind}</td>
                      <td>{LOG_STATUS[r.status] || r.status}</td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748b" }}>Sin eventos.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedLog && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{selectedLog.number}</h3>
                <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                  {SOURCE_LABEL[selectedLog.assetSource] || selectedLog.assetSource} · {selectedLog.assetCode} · {selectedLog.assetDescription || "—"}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label>
                    Tipo
                    <select value={lKind} onChange={(e) => setLKind(e.target.value)} disabled={selectedLog.status === "Cancelled"}>
                      {Object.entries(LOG_KIND_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Fecha
                    <input type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} disabled={selectedLog.status === "Cancelled"} />
                  </label>
                  <label>
                    Certificado
                    <input value={lCert} onChange={(e) => setLCert(e.target.value)} disabled={selectedLog.status === "Cancelled"} />
                  </label>
                  <label>
                    Dictamen
                    <select value={lVerdict} onChange={(e) => setLVerdict(e.target.value)} disabled={selectedLog.status === "Cancelled"}>
                      <option value="">—</option>
                      <option value="Apto">Apto</option>
                      <option value="NoApto">No apto</option>
                      <option value="Condicional">Condicional</option>
                    </select>
                  </label>
                  <label>
                    Responsable
                    <input value={lResponsible} onChange={(e) => setLResponsible(e.target.value)} disabled={selectedLog.status === "Cancelled"} />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
                    <input type="checkbox" checked={lDt} onChange={(e) => setLDt(e.target.checked)} disabled={selectedLog.status === "Cancelled"} />
                    Aprobado por DT
                  </label>
                </div>
                <label style={{ display: "block", marginTop: 12 }}>
                  Descripción
                  <textarea value={lDescription} onChange={(e) => setLDescription(e.target.value)} rows={2} style={{ width: "100%" }} disabled={selectedLog.status === "Cancelled"} />
                </label>
                <label style={{ display: "block", marginTop: 8 }}>
                  Notas
                  <textarea value={lNotes} onChange={(e) => setLNotes(e.target.value)} rows={2} style={{ width: "100%" }} disabled={selectedLog.status === "Cancelled"} />
                </label>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedLog.status !== "Cancelled" && (
                    <>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveLog()}>
                        Guardar
                      </button>
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void cancelLog(selectedLog.id)}>
                        Anular
                      </button>
                    </>
                  )}
                  <Link
                    to={`/calidad/registros/equipos/hoja-vida/${encodeURIComponent(selectedLog.assetSource)}/${selectedLog.assetId}/pdf`}
                    className="btn btn-outline"
                  >
                    PDF del activo
                  </Link>
                </div>
              </div>
            )}
          </div>
        </>
      )}

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
