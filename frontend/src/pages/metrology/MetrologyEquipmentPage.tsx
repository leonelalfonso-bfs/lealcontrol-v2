import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment } from "../../api/types";

export function MetrologyEquipmentPage() {
  const [equipments, setEquipments] = useState<MetrologyEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [location, setLocation] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("80000");
  const [minCapacity, setMinCapacity] = useState("400");
  const [divisionD, setDivisionD] = useState("20");
  const [verificationIntervalE, setVerificationIntervalE] = useState("20");
  const [unit, setUnit] = useState("kg");
  const [accuracyClass, setAccuracyClass] = useState("III");
  const [indicationType, setIndicationType] = useState("Digital");
  const [loadCellsCount, setLoadCellsCount] = useState("6");
  const [hasTare, setHasTare] = useState(true);
  const [notes, setNotes] = useState("");

  const loadEquipments = () => {
    setLoading(true);
    api.listMetrologyEquipment({ search, status: statusFilter })
      .then(setEquipments)
      .catch((err) => console.error("Error al cargar equipos:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEquipments();
  }, [statusFilter]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    loadEquipments();
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setCode("");
    setDescription("");
    setBrand("");
    setModel("");
    setSerialNumber("");
    setCustomerName("");
    setLocation("");
    setMaxCapacity("80000");
    setMinCapacity("400");
    setDivisionD("20");
    setVerificationIntervalE("20");
    setUnit("kg");
    setAccuracyClass("III");
    setIndicationType("Digital");
    setLoadCellsCount("6");
    setHasTare(true);
    setNotes("");
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (eq: MetrologyEquipment) => {
    setEditingId(eq.id);
    setCode(eq.code);
    setDescription(eq.description);
    setBrand(eq.brand || "");
    setModel(eq.model || "");
    setSerialNumber(eq.serialNumber || "");
    setCustomerName(eq.customerName || "");
    setLocation(eq.location || "");
    setMaxCapacity(eq.maxCapacity.toString());
    setMinCapacity(eq.minCapacity.toString());
    setDivisionD(eq.divisionD.toString());
    setVerificationIntervalE(eq.verificationIntervalE.toString());
    setUnit(eq.unit || "kg");
    setAccuracyClass(eq.accuracyClass || "III");
    setIndicationType(eq.indicationType || "Digital");
    setLoadCellsCount((eq.loadCellsCount || 6).toString());
    setHasTare(eq.hasTare);
    setNotes(eq.notes || "");
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !description.trim()) {
      setError("Código y descripción son obligatorios.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        code: code.trim(),
        description: description.trim(),
        brand: brand.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim(),
        customerName: customerName.trim(),
        location: location.trim(),
        maxCapacity: parseFloat(maxCapacity) || 0,
        minCapacity: parseFloat(minCapacity) || 0,
        divisionD: parseFloat(divisionD) || 0,
        verificationIntervalE: parseFloat(verificationIntervalE) || 0,
        unit,
        accuracyClass,
        indicationType,
        loadCellsCount: parseInt(loadCellsCount, 10) || 6,
        hasTare,
        notes: notes.trim()
      };

      if (editingId) {
        await api.updateMetrologyEquipment(editingId, payload);
      } else {
        await api.createMetrologyEquipment(payload);
      }

      setShowModal(false);
      loadEquipments();
    } catch (err: any) {
      setError(err?.message || "Error al guardar instrumento.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, codeName: string) => {
    if (!confirm(`¿Está seguro de eliminar el instrumento '${codeName}'?`)) return;
    try {
      await api.deleteMetrologyEquipment(id);
      loadEquipments();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar instrumento.");
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Metrología Legal & Calidad
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            🏢 Parque de Balanzas e Instrumentos
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Ficha técnica metrológica, capacidades nominales, escalones e historial de calibraciones
          </p>
        </div>

        <button type="button" className="btn" onClick={handleOpenCreate} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
          ➕ Registrar Nueva Balanza
        </button>
      </div>

      {/* Filters */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <input
              type="text"
              placeholder="Buscar por código, descripción, cliente, marca o Nº serie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: 180 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="Active">Operativas (Activas)</option>
              <option value="Maintenance">En Mantenimiento</option>
              <option value="OutOfService">Fuera de Servicio</option>
            </select>
          </div>

          <button type="submit" className="btn ghost">
            🔍 Filtrar
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando parque de instrumentos...</div>
        ) : equipments.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No se encontraron balanzas o instrumentos registrados.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción / Marca</th>
                  <th>Cliente & Ubicación</th>
                  <th>Capacidad (Max / Min)</th>
                  <th>Escalón (e / d)</th>
                  <th>Clase</th>
                  <th>Estado</th>
                  <th>Próxima Calibración</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {equipments.map((eq) => {
                  const isExpired = eq.nextCalibrationDate && new Date(eq.nextCalibrationDate) < new Date();
                  return (
                    <tr key={eq.id}>
                      <td>
                        <strong style={{ color: "#0d9488" }}>{eq.code}</strong>
                        {eq.serialNumber && (
                          <div className="muted" style={{ fontSize: "0.74rem" }}>S/N: {eq.serialNumber}</div>
                        )}
                      </td>
                      <td>
                        <strong>{eq.description}</strong>
                        <div className="muted" style={{ fontSize: "0.76rem" }}>
                          {eq.brand} {eq.model} • {eq.loadCellsCount} apoyos/celdas
                        </div>
                      </td>
                      <td>
                        <div>{eq.customerName || "—"}</div>
                        <div className="muted" style={{ fontSize: "0.74rem" }}>{eq.location || "—"}</div>
                      </td>
                      <td>
                        <strong>{eq.maxCapacity.toLocaleString("es-AR")} {eq.unit}</strong>
                        <div className="muted" style={{ fontSize: "0.74rem" }}>Min: {eq.minCapacity} {eq.unit}</div>
                      </td>
                      <td>
                        <div>e = {eq.verificationIntervalE} {eq.unit}</div>
                        <div className="muted" style={{ fontSize: "0.74rem" }}>d = {eq.divisionD} {eq.unit}</div>
                      </td>
                      <td>
                        <span className="tag" style={{ fontWeight: 700 }}>Clase {eq.accuracyClass}</span>
                      </td>
                      <td>
                        <span className={`badge ${eq.status === "Active" ? "ok" : eq.status === "Maintenance" ? "warn" : "off"}`}>
                          {eq.status === "Active" ? "Operativa" : eq.status === "Maintenance" ? "Mantenimiento" : "Fuera de Servicio"}
                        </span>
                      </td>
                      <td>
                        {eq.nextCalibrationDate ? (
                          <span style={{ color: isExpired ? "#dc2626" : "inherit", fontWeight: isExpired ? 700 : 400 }}>
                            {new Date(eq.nextCalibrationDate).toLocaleDateString("es-AR")}
                            {isExpired && " ⚠️"}
                          </span>
                        ) : (
                          <span className="muted">Sin calibrar</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <Link to={`/metrologia/ensayos/nuevo?equipmentId=${eq.id}`} className="btn ghost compact" title="Calibrar / Ensayar">
                            ⚖️ Ensayar
                          </Link>
                          <button type="button" className="btn ghost compact" onClick={() => handleOpenEdit(eq)} title="Editar">
                            ✏️
                          </button>
                          <button type="button" className="btn ghost compact" onClick={() => handleDelete(eq.id, eq.code)} style={{ color: "#dc2626" }} title="Eliminar">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Alta / Edición */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 680 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
                {editingId ? "✏️ Modificar Ficha de Balanza" : "➕ Registrar Nueva Balanza / Instrumento"}
              </h2>
              <button type="button" className="alert-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="alert" style={{ marginBottom: 16 }}>{error}</div>}

            <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                <label>
                  Código / Identificador *
                  <input
                    type="text"
                    required
                    placeholder="ej. BAL-CAM-01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>

                <label>
                  Descripción del Instrumento *
                  <input
                    type="text"
                    required
                    placeholder="ej. Balanza Camionera Electrónica de 80t"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label>
                  Marca
                  <input type="text" placeholder="ej. Systel / Toledo" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </label>

                <label>
                  Modelo
                  <input type="text" placeholder="ej. TruckMaster 80T" value={model} onChange={(e) => setModel(e.target.value)} />
                </label>

                <label>
                  Número de Serie
                  <input type="text" placeholder="ej. SN-2024-88912" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                <label>
                  Cliente / Razón Social Propietaria
                  <input type="text" placeholder="ej. Acopio Cereales Los Molinos S.A." value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </label>

                <label>
                  Ubicación Física en Planta
                  <input type="text" placeholder="ej. Ingreso Principal Balanza Nº 1" value={location} onChange={(e) => setLocation(e.target.value)} />
                </label>
              </div>

              {/* Parámetros Metrológicos OIML */}
              <div style={{ background: "rgba(13, 148, 136, 0.05)", padding: 14, borderRadius: 12, border: "1px solid rgba(13, 148, 136, 0.2)" }}>
                <h4 style={{ margin: "0 0 10px", color: "#0d9488", fontSize: "0.86rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  📐 Parámetros Metrológicos OIML R 76-1
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
                  <label>
                    Capacidad Max *
                    <input type="number" step="0.0001" min="0.0001" required value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} />
                  </label>

                  <label>
                    Capacidad Min *
                    <input type="number" step="0.0001" min="0" required value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)} />
                  </label>

                  <label>
                    Escalón Verif. (e) *
                    <input type="number" step="0.0001" min="0.0001" required value={verificationIntervalE} onChange={(e) => setVerificationIntervalE(e.target.value)} />
                  </label>

                  <label>
                    División (d) *
                    <input type="number" step="0.0001" min="0.0001" required value={divisionD} onChange={(e) => setDivisionD(e.target.value)} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  <label>
                    Unidad
                    <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <option value="kg">kg (Kilogramos)</option>
                      <option value="g">g (Gramos)</option>
                      <option value="mg">mg (Miligramos)</option>
                      <option value="t">t (Toneladas)</option>
                    </select>
                  </label>

                  <label>
                    Clase Exactitud
                    <select value={accuracyClass} onChange={(e) => setAccuracyClass(e.target.value)}>
                      <option value="I">Clase I (Especial)</option>
                      <option value="II">Clase II (Fina)</option>
                      <option value="III">Clase III (Media - Estándar)</option>
                      <option value="IIII">Clase IIII (Ordinaria)</option>
                    </select>
                  </label>

                  <label>
                    Puntos de Apoyo / Celdas
                    <input type="number" step="1" min="1" max="16" value={loadCellsCount} onChange={(e) => setLoadCellsCount(e.target.value)} />
                  </label>

                  <label>
                    Tipo de Indicación
                    <select value={indicationType} onChange={(e) => setIndicationType(e.target.value)}>
                      <option value="Digital">Digital</option>
                      <option value="Analógica">Analógica / Mecánica</option>
                      <option value="Impresora">Con Dispositivo Impresor</option>
                    </select>
                  </label>
                </div>
              </div>

              <label>
                Observaciones / Notas Técnicas
                <textarea rows={2} placeholder="Detalles de instalación, tipo de cabezal indicador, precintos, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={saving} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
                  {saving ? "Guardando..." : "💾 Guardar Balanza"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
