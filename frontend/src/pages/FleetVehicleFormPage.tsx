import React, { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { type Vehicle, type VehicleDocument, type VehicleMaintenance, type VehicleDriver } from "../api/types";

export function FleetVehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"general" | "docs" | "maintenance">("general");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">(new Date().getFullYear());
  const [type, setType] = useState<number>(0);
  const [vinChassis, setVinChassis] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [currentKilometers, setCurrentKilometers] = useState<number | "">("");
  const [currentEngineHours, setCurrentEngineHours] = useState<number | "">("");
  const [fuelType, setFuelType] = useState("Diesel");
  const [status, setStatus] = useState<number>(0);
  const [assignedDriverId, setAssignedDriverId] = useState<string>("");
  const [assignedDriverName, setAssignedDriverName] = useState("");
  const [notes, setNotes] = useState("");

  // Sublists
  const [drivers, setDrivers] = useState<VehicleDriver[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [maintenances, setMaintenances] = useState<VehicleMaintenance[]>([]);

  // Add Document Modal
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [newDocType, setNewDocType] = useState(0);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocNumber, setNewDocNumber] = useState("");
  const [newDocIssuer, setNewDocIssuer] = useState("");
  const [newDocExpDate, setNewDocExpDate] = useState("");
  const [newDocCost, setNewDocCost] = useState<number | "">("");

  // Add Maintenance Modal
  const [showAddMaintModal, setShowAddMaintModal] = useState(false);
  const [newMaintType, setNewMaintType] = useState(0);
  const [newMaintTitle, setNewMaintTitle] = useState("");
  const [newMaintDesc, setNewMaintDesc] = useState("");
  const [newMaintKm, setNewMaintKm] = useState<number | "">("");
  const [newMaintWorkshop, setNewMaintWorkshop] = useState("");
  const [newMaintCost, setNewMaintCost] = useState<number | "">("");
  const [newMaintNextKm, setNewMaintNextKm] = useState<number | "">("");

  useEffect(() => {
    loadDrivers();
    if (isEditing && id) {
      loadVehicle(id);
    }
  }, [id, isEditing]);

  const loadDrivers = async () => {
    const list = await api.listDrivers().catch(() => []);
    setDrivers(list);
  };

  const loadVehicle = async (vehId: string) => {
    try {
      setLoading(true);
      const [v, docs, maints] = await Promise.all([
        api.getVehicle(vehId),
        api.listVehicleDocuments(vehId).catch(() => []),
        api.listMaintenances(vehId).catch(() => [])
      ]);

      setPlate(v.plate);
      setBrand(v.brand);
      setModel(v.model);
      setYear(v.year);
      setType(v.type);
      setVinChassis(v.vinChassis);
      setEngineNumber(v.engineNumber);
      setCurrentKilometers(v.currentKilometers);
      setCurrentEngineHours(v.currentEngineHours);
      setFuelType(v.fuelType);
      setStatus(v.status);
      setAssignedDriverId(v.assignedDriverId || "");
      setAssignedDriverName(v.assignedDriverName || "");
      setNotes(v.notes || "");

      setDocuments(docs);
      setMaintenances(maints);
      setNewMaintKm(v.currentKilometers);
      setNewMaintNextKm(v.currentKilometers + 10000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar vehículo");
    } finally {
      setLoading(false);
    }
  };

  const handleDriverChange = (driverId: string) => {
    setAssignedDriverId(driverId);
    const d = drivers.find((x) => x.id === driverId);
    setAssignedDriverName(d ? d.fullName : "");
  };

  const handleSaveVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!plate.trim() || !brand.trim() || !model.trim()) {
      setError("Completá Dominio/Patente, Marca y Modelo.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload: Partial<Vehicle> = {
        plate: plate.trim().toUpperCase(),
        brand: brand.trim(),
        model: model.trim(),
        year: Number(year) || new Date().getFullYear(),
        type,
        vinChassis: vinChassis.trim(),
        engineNumber: engineNumber.trim(),
        currentKilometers: Number(currentKilometers) || 0,
        currentEngineHours: Number(currentEngineHours) || 0,
        fuelType,
        status,
        assignedDriverId: assignedDriverId || null,
        assignedDriverName: assignedDriverName || null,
        notes: notes.trim() || null
      };

      if (isEditing && id) {
        await api.updateVehicle(id, payload);
        navigate("/flota");
      } else {
        const created = await api.createVehicle(payload);
        navigate(`/flota/vehiculos/${created.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar vehículo");
    } finally {
      setSaving(false);
    }
  };

  const handleAddDocument = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !newDocTitle.trim() || !newDocExpDate) return;

    try {
      const created = await api.createVehicleDocument({
        vehicleId: id,
        documentType: newDocType,
        title: newDocTitle.trim(),
        policyOrDocNumber: newDocNumber.trim(),
        issuerCompany: newDocIssuer.trim(),
        issueDateUtc: new Date().toISOString(),
        expirationDateUtc: new Date(newDocExpDate).toISOString(),
        cost: Number(newDocCost) || 0,
        alertDaysBefore: 30,
        isActive: true
      });
      setDocuments((prev) => [...prev, created]);
      setShowAddDocModal(false);
      setNewDocNumber("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al agregar documento");
    }
  };

  const handleAddMaintenance = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !newMaintTitle.trim()) return;

    try {
      const created = await api.createMaintenance({
        vehicleId: id,
        type: newMaintType,
        title: newMaintTitle.trim(),
        description: newMaintDesc.trim(),
        kmAtService: Number(newMaintKm) || Number(currentKilometers) || 0,
        serviceDateUtc: new Date().toISOString(),
        workshopName: newMaintWorkshop.trim(),
        totalCost: Number(newMaintCost) || 0,
        nextServiceKm: newMaintNextKm ? Number(newMaintNextKm) : null,
        status: 2 // Completed
      });
      setMaintenances((prev) => [created, ...prev]);
      if (Number(newMaintKm) > (Number(currentKilometers) || 0)) {
        setCurrentKilometers(Number(newMaintKm));
      }
      setShowAddMaintModal(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al registrar mantenimiento");
    }
  };

  if (loading) {
    return <div className="card pad" style={{ textAlign: "center" }}>Cargando ficha técnica del vehículo...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>{isEditing ? `Vehículo [${plate}] - ${brand} ${model}` : "Alta de Vehículo en Flota"}</h1>
          <p className="muted">Ficha técnica automotor, control de vencimientos y registro de mantenimientos</p>
        </div>
        <Link to="/flota" className="btn btn-outline">
          ← Volver a Flota
        </Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "16px", border: "1px solid #f87171" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: activeTab === "general" ? 800 : 500,
            color: activeTab === "general" ? "#0d9488" : "#64748b",
            borderBottom: activeTab === "general" ? "3px solid #0d9488" : "none"
          }}
        >
          🚛 1. Ficha Técnica & Chofer
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={() => setActiveTab("docs")}
            style={{
              padding: "10px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === "docs" ? 800 : 500,
              color: activeTab === "docs" ? "#0d9488" : "#64748b",
              borderBottom: activeTab === "docs" ? "3px solid #0d9488" : "none"
            }}
          >
            📋 2. VTV, Seguro & Documentación ({documents.length})
          </button>
        )}

        {isEditing && (
          <button
            type="button"
            onClick={() => setActiveTab("maintenance")}
            style={{
              padding: "10px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === "maintenance" ? 800 : 500,
              color: activeTab === "maintenance" ? "#0d9488" : "#64748b",
              borderBottom: activeTab === "maintenance" ? "3px solid #0d9488" : "none"
            }}
          >
            🔧 3. Historial de Mantenimiento ({maintenances.length})
          </button>
        )}
      </div>

      <form onSubmit={handleSaveVehicle}>
        {activeTab === "general" && (
          <div className="card pad stack">
            <h3>Datos Principales de la Unidad</h3>

            <div className="grid-3">
              <label>
                Patente / Dominio *
                <input
                  type="text"
                  required
                  placeholder="AA123BB o AB123CD"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  style={{ fontFamily: "monospace", fontWeight: 900, textTransform: "uppercase", fontSize: "1.1rem" }}
                />
              </label>
              <label>
                Marca *
                <input type="text" required placeholder="Ej: Toyota, Ford, Scania" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </label>
              <label>
                Modelo *
                <input type="text" required placeholder="Ej: Hilux 4x4 DX" value={model} onChange={(e) => setModel(e.target.value)} />
              </label>
            </div>

            <div className="grid-3">
              <label>
                Año de Fabricación
                <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
              </label>
              <label>
                Tipo de Unidad
                <select value={type} onChange={(e) => setType(Number(e.target.value))}>
                  <option value={0}>🛻 Pick-up / Utilitario</option>
                  <option value={1}>🚐 Furgón / Van</option>
                  <option value={2}>🚛 Camión Chasis / Semi</option>
                  <option value={3}>🚗 Auto Comercial</option>
                  <option value={4}>🚜 Autoelevador / Clark</option>
                  <option value={5}>🚚 Acoplado / Semi</option>
                </select>
              </label>
              <label>
                Tipo de Combustible
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
                  <option value="Diesel">Diesel (Gasoil Grado 2/3)</option>
                  <option value="Nafta">Nafta Súper / Premium</option>
                  <option value="GNC">GNC (Gas Natural Comprimido)</option>
                  <option value="Electric">Eléctrico / Híbrido</option>
                </select>
              </label>
            </div>

            <div className="grid-3">
              <label>
                Kilometraje Odómetro Actual (KM)
                <input
                  type="number"
                  min="0"
                  value={currentKilometers}
                  onChange={(e) => setCurrentKilometers(Number(e.target.value))}
                  style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.05rem" }}
                />
              </label>
              <label>
                Horas de Motor (para autoelevadores)
                <input type="number" step="0.1" value={currentEngineHours} onChange={(e) => setCurrentEngineHours(parseFloat(e.target.value) || 0)} />
              </label>
              <label>
                Estado Operativo
                <select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
                  <option value={0}>🟢 Operativo Activo</option>
                  <option value={1}>🟡 En Mantenimiento / Taller</option>
                  <option value={2}>🔴 Fuera de Servicio</option>
                  <option value={3}>⚪ Vendido / Dado de Baja</option>
                </select>
              </label>
            </div>

            <div className="grid-2">
              <label>
                N° de Chasis / VIN
                <input type="text" placeholder="8AJxxxxxxxxxxxxxx" value={vinChassis} onChange={(e) => setVinChassis(e.target.value)} style={{ fontFamily: "monospace" }} />
              </label>
              <label>
                N° de Motor
                <input type="text" placeholder="1GDxxxxxxxx" value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} style={{ fontFamily: "monospace" }} />
              </label>
            </div>

            <div className="grid-2">
              <label>
                Chofer Habitual Asignado
                <select value={assignedDriverId} onChange={(e) => handleDriverChange(e.target.value)}>
                  <option value="">(Sin chofer fijo asignado)</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName} (Lic. {d.licenseCategory})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Observaciones / Equipamiento Adicional
                <input type="text" placeholder="Ej: Cúpula, enganche para tráiler, GPS integrado..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "20px" }}>
          <button type="button" onClick={() => navigate("/flota")} className="btn btn-outline">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: "10px 24px", background: "#0d9488", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Ficha de Vehículo"}
          </button>
        </div>
      </form>

      {/* TAB 2: DOCUMENTS */}
      {isEditing && activeTab === "docs" && (
        <div className="card pad stack" style={{ marginTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Pólizas, VTV & Vencimientos de Ley</h3>
              <div className="muted">Alertas automáticas de caducidad de seguro, VTV y cédulas</div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddDocModal(true)}
              className="btn btn-primary"
              style={{ background: "#0d9488", fontSize: "0.82rem" }}
            >
              + Agregar Póliza / Documento
            </button>
          </div>

          {documents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
              No hay pólizas ni certificados cargados para esta unidad.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Título / Póliza N°</th>
                    <th>Compañía Emisora</th>
                    <th>Vencimiento</th>
                    <th>Costo</th>
                    <th style={{ textAlign: "center" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => {
                    const isExpiringSoon = (new Date(d.expirationDateUtc).getTime() - Date.now()) / (1000 * 3600 * 24) < 30;
                    return (
                      <tr key={d.id}>
                        <td><strong>{d.title}</strong></td>
                        <td><span style={{ fontFamily: "monospace" }}>{d.policyOrDocNumber || "-"}</span></td>
                        <td>{d.issuerCompany || "-"}</td>
                        <td>
                          <span style={{ fontWeight: isExpiringSoon ? 800 : 500, color: isExpiringSoon ? "#dc2626" : "inherit" }}>
                            {new Date(d.expirationDateUtc).toLocaleDateString("es-AR")}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace" }}>${d.cost.toLocaleString("es-AR")}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: isExpiringSoon ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                              color: isExpiringSoon ? "#b91c1c" : "#047857",
                              fontWeight: 700
                            }}
                          >
                            {isExpiringSoon ? "⚠️ Por Vencer" : "✓ Vigente"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MAINTENANCE */}
      {isEditing && activeTab === "maintenance" && (
        <div className="card pad stack" style={{ marginTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Historial de Mantenimientos & Services</h3>
              <div className="muted">Registro de cambios de aceite, frenos y reparaciones</div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddMaintModal(true)}
              className="btn btn-primary"
              style={{ background: "#0d9488", fontSize: "0.82rem" }}
            >
              + Registrar Mantenimiento / Service
            </button>
          </div>

          {maintenances.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
              No hay registros de service en el historial.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Service / Título</th>
                    <th>KM al Service</th>
                    <th>Taller</th>
                    <th style={{ textAlign: "right" }}>Costo Total</th>
                    <th>Próximo Service</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenances.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.serviceDateUtc).toLocaleDateString("es-AR")}</td>
                      <td>
                        <strong>{m.title}</strong>
                        {m.description && <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{m.description}</div>}
                      </td>
                      <td><strong style={{ fontFamily: "monospace" }}>{m.kmAtService.toLocaleString("es-AR")} KM</strong></td>
                      <td>{m.workshopName}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>${m.totalCost.toLocaleString("es-AR")}</td>
                      <td>
                        {m.nextServiceKm ? <span style={{ color: "#0d9488", fontWeight: 700 }}>{m.nextServiceKm.toLocaleString("es-AR")} KM</span> : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Document */}
      {showAddDocModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "500px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Agregar Póliza / Documentación de Vehículo</h3>
            <form onSubmit={handleAddDocument} className="stack">
              <label>
                Tipo de Documento
                <select value={newDocType} onChange={(e) => setNewDocType(Number(e.target.value))}>
                  <option value={0}>VTV / RTO (Técnica Obligatoria)</option>
                  <option value={1}>Póliza de Seguro Automotor</option>
                  <option value={2}>Cédula Verde / Azul</option>
                  <option value={3}>Oblea de GNC / Cilindro</option>
                  <option value={4}>Habilitación SENASA</option>
                  <option value={5}>Permiso RUTA Provincial/Nacional</option>
                </select>
              </label>

              <label>
                Título / Descripción *
                <input type="text" required value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} />
              </label>

              <div className="grid-2">
                <label>
                  N° de Póliza / Oblea
                  <input type="text" placeholder="POL-123456" value={newDocNumber} onChange={(e) => setNewDocNumber(e.target.value)} />
                </label>
                <label>
                  Compañía Emisora
                  <input type="text" placeholder="Ej: La Segunda Seguros" value={newDocIssuer} onChange={(e) => setNewDocIssuer(e.target.value)} />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Fecha de Vencimiento *
                  <input type="date" required value={newDocExpDate} onChange={(e) => setNewDocExpDate(e.target.value)} />
                </label>
                <label>
                  Costo de Renovación (ARS)
                  <input type="number" value={newDocCost} onChange={(e) => setNewDocCost(parseFloat(e.target.value) || 0)} />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowAddDocModal(false)} className="btn btn-outline">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Guardar Documento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Maintenance */}
      {showAddMaintModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "520px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Registrar Service / Mantenimiento</h3>
            <form onSubmit={handleAddMaintenance} className="stack">
              <label>
                Título del Service *
                <input type="text" required value={newMaintTitle} onChange={(e) => setNewMaintTitle(e.target.value)} />
              </label>

              <div className="grid-2">
                <label>
                  Kilometraje al Service *
                  <input type="number" required value={newMaintKm} onChange={(e) => setNewMaintKm(Number(e.target.value))} />
                </label>
                <label>
                  Próximo Service Estimado (KM)
                  <input type="number" value={newMaintNextKm} onChange={(e) => setNewMaintNextKm(Number(e.target.value))} />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Taller / Proveedor
                  <input type="text" value={newMaintWorkshop} onChange={(e) => setNewMaintWorkshop(e.target.value)} />
                </label>
                <label>
                  Costo Total ($)
                  <input type="number" value={newMaintCost} onChange={(e) => setNewMaintCost(parseFloat(e.target.value) || 0)} />
                </label>
              </div>

              <label>
                Detalle de Trabajos / Repuestos
                <textarea rows={2} placeholder="Filtro de aceite WIX, aceite sintético 5W30..." value={newMaintDesc} onChange={(e) => setNewMaintDesc(e.target.value)} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowAddMaintModal(false)} className="btn btn-outline">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Guardar Service</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
