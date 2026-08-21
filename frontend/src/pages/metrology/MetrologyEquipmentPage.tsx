import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment, CustomerSummary, CustomerDetail, CustomerWrite } from "../../api/types";
import { provinces } from "../../api/types";

export function MetrologyEquipmentPage() {
  const [equipments, setEquipments] = useState<MetrologyEquipment[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  
  // Equipment Modal State
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
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<CustomerDetail | null>(null);
  const [locationType, setLocationType] = useState<"select" | "custom">("select");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
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

  // Quick New Customer Modal
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);
  const [quickLegalName, setQuickLegalName] = useState("");
  const [quickTradeName, setQuickTradeName] = useState("");
  const [quickCuit, setQuickCuit] = useState("");
  const [quickTaxCondition, setQuickTaxCondition] = useState("ResponsableInscripto");
  const [quickStreet, setQuickStreet] = useState("");
  const [quickCity, setQuickCity] = useState("");
  const [quickProvince, setQuickProvince] = useState<string>("SantaFe");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [consultingArca, setConsultingArca] = useState(false);

  // Quick New Location (Planta) Modal
  const [showQuickLocationModal, setShowQuickLocationModal] = useState(false);
  const [quickLocName, setQuickLocName] = useState("");
  const [quickLocStreet, setQuickLocStreet] = useState("");
  const [quickLocCity, setQuickLocCity] = useState("");
  const [quickLocProvince, setQuickLocProvince] = useState<string>("SantaFe");
  const [quickLocPostalCode, setQuickLocPostalCode] = useState("");
  const [quickLocSaving, setQuickLocSaving] = useState(false);

  const fetchCustomersList = async () => {
    try {
      setLoadingCustomers(true);
      const res = await api.listCustomers("", "all");
      if (res && Array.isArray(res.items)) {
        setCustomers(res.items);
      } else if (Array.isArray(res)) {
        setCustomers(res);
      }
    } catch (err) {
      console.error("Error al cargar clientes:", err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.listMetrologyEquipment({ search, status: statusFilter, customerId: customerFilter || undefined }),
      api.listCustomers("", "all")
    ])
      .then(([eqs, custPaged]) => {
        setEquipments(eqs || []);
        if (custPaged && Array.isArray(custPaged.items)) {
          setCustomers(custPaged.items);
        } else if (Array.isArray(custPaged)) {
          setCustomers(custPaged);
        }
      })
      .catch((err) => console.error("Error al cargar datos:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, customerFilter]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleSelectCustomer = async (cId: string) => {
    setCustomerId(cId);
    if (!cId) {
      setCustomerName("");
      setSelectedCustomerDetail(null);
      setLocationType("custom");
      return;
    }

    const cSummary = customers.find((c) => c.id === cId);
    if (cSummary) {
      setCustomerName(cSummary.tradeName || cSummary.legalName);
    }

    try {
      const detail = await api.getCustomer(cId);
      setSelectedCustomerDetail(detail);
      if (detail.locations && detail.locations.length > 0) {
        setLocationType("select");
        setSelectedLocationId(detail.locations[0].id);
        setLocation(`${detail.locations[0].name} (${detail.locations[0].address.city || ""})`);
      } else {
        setLocationType("custom");
        setLocation(detail.fiscalAddress?.city ? `Planta ${detail.fiscalAddress.city}` : "Planta Principal");
      }
    } catch {
      setSelectedCustomerDetail(null);
      setLocationType("custom");
    }
  };

  const handleOpenCreate = () => {
    if (customers.length === 0) {
      fetchCustomersList();
    }
    setEditingId(null);
    setCode("");
    setDescription("");
    setBrand("");
    setModel("");
    setSerialNumber("");
    setCustomerId("");
    setCustomerName("");
    setSelectedCustomerDetail(null);
    setLocationType("custom");
    setSelectedLocationId("");
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

  const handleOpenEdit = async (eq: MetrologyEquipment) => {
    if (customers.length === 0) {
      fetchCustomersList();
    }
    setEditingId(eq.id);
    setCode(eq.code);
    setDescription(eq.description);
    setBrand(eq.brand || "");
    setModel(eq.model || "");
    setSerialNumber(eq.serialNumber || "");
    setCustomerId(eq.customerId || "");
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

    if (eq.customerId) {
      try {
        const detail = await api.getCustomer(eq.customerId);
        setSelectedCustomerDetail(detail);
        const matchLoc = detail.locations?.find((l) => eq.location && eq.location.includes(l.name));
        if (matchLoc) {
          setLocationType("select");
          setSelectedLocationId(matchLoc.id);
        } else {
          setLocationType("custom");
        }
      } catch {
        setSelectedCustomerDetail(null);
        setLocationType("custom");
      }
    } else {
      setSelectedCustomerDetail(null);
      setLocationType("custom");
    }

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
        customerId: customerId || undefined,
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
      loadData();
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
      loadData();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar instrumento.");
    }
  };

  // ARCA CUIT Lookup
  const handleConsultArca = async () => {
    const clean = quickCuit.replace(/\D/g, "");
    if (clean.length !== 11) {
      setQuickError("El CUIT debe contener 11 dígitos numéricos.");
      return;
    }

    try {
      setConsultingArca(true);
      setQuickError(null);
      const res = await api.consultArcaCuit(clean);
      if (res && res.legalName) {
        setQuickLegalName(res.legalName);
        setQuickTradeName(res.tradeName || res.legalName);
        if (res.taxCondition) setQuickTaxCondition(res.taxCondition);
        if (res.fiscalAddress?.street) setQuickStreet(res.fiscalAddress.street);
        if (res.fiscalAddress?.city) setQuickCity(res.fiscalAddress.city);
        if (res.fiscalAddress?.province) setQuickProvince(res.fiscalAddress.province);
      }
    } catch (err: any) {
      setQuickError(err?.message || "No se pudo consultar el CUIT en ARCA.");
    } finally {
      setConsultingArca(false);
    }
  };

  // Save Quick Customer
  const handleSaveQuickCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickLegalName.trim()) {
      setQuickError("La Razón Social es obligatoria.");
      return;
    }

    try {
      setQuickSaving(true);
      setQuickError(null);

      const customerPayload: CustomerWrite = {
        legalName: quickLegalName.trim(),
        tradeName: quickTradeName.trim() || quickLegalName.trim(),
        documentType: "Cuit",
        documentNumber: quickCuit.replace(/\D/g, ""),
        taxCondition: quickTaxCondition,
        iibbRegime: "ConvenioMultilateral",
        fiscalAddress: {
          street: quickStreet.trim(),
          city: quickCity.trim(),
          province: quickProvince,
          postalCode: ""
        },
        email: quickEmail.trim() || undefined,
        phone: quickPhone.trim() || undefined,
        isCustomer: true,
        isSupplier: false
      };

      const created = await api.createCustomer(customerPayload);
      
      const newSummary: CustomerSummary = {
        id: created.id,
        legalName: created.legalName,
        tradeName: created.tradeName,
        documentType: created.documentType,
        documentNumber: created.documentNumber,
        taxCondition: created.taxCondition,
        status: "Active",
        isCustomer: true,
        isSupplier: false,
        email: created.email,
        phone: created.phone
      };

      setCustomers((prev) => [newSummary, ...prev]);
      setShowQuickCustomerModal(false);
      
      // Auto-select in equipment form
      handleSelectCustomer(created.id);
    } catch (err: any) {
      setQuickError(err?.message || "Error al crear cliente rápido.");
    } finally {
      setQuickSaving(false);
    }
  };

  // Save Quick Location (Planta)
  const handleSaveQuickLocation = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerId || !quickLocName.trim()) return;

    try {
      setQuickLocSaving(true);
      const locPayload = {
        name: quickLocName.trim(),
        address: {
          street: quickLocStreet.trim() || "S/D",
          city: quickLocCity.trim() || "S/C",
          province: quickLocProvince,
          postalCode: quickLocPostalCode.trim() || "S/C"
        }
      };

      const updatedCust = await api.addLocation(customerId, locPayload);
      setSelectedCustomerDetail(updatedCust);
      const createdLoc = updatedCust.locations?.find((l) => l.name === quickLocName.trim());
      if (createdLoc) {
        setSelectedLocationId(createdLoc.id);
        setLocation(`${createdLoc.name} (${createdLoc.address.city || ""})`);
        setLocationType("select");
      }
      setShowQuickLocationModal(false);
    } catch (err: any) {
      alert(err?.message || "Error al agregar planta.");
    } finally {
      setQuickLocSaving(false);
    }
  };

  return (
    <div className="page-wide" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px" }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.78rem", letterSpacing: "0.08em" }}>
            Metrología Legal & Calidad
          </span>
          <h1 style={{ margin: "4px 0 0", fontSize: "1.85rem", fontWeight: 800 }}>
            🏢 Parque de Balanzas e Instrumentos
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.92rem" }}>
            Ficha técnica metrológica, vinculación con clientes y plantas, capacidades nominales e historial de calibraciones
          </p>
        </div>

        <button type="button" className="btn" onClick={handleOpenCreate} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", padding: "10px 20px", fontWeight: 700 }}>
          ➕ Registrar Nueva Balanza
        </button>
      </div>

      {/* Filters */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              type="text"
              placeholder="Buscar por código, descripción, cliente, marca o Nº serie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: 250 }}>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="">Todos los clientes ({customers.length})</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.legalName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: 190 }}>
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
          <div className="muted" style={{ padding: 30, textAlign: "center" }}>Cargando parque de instrumentos...</div>
        ) : equipments.length === 0 ? (
          <div className="muted" style={{ padding: 36, textAlign: "center" }}>
            No se encontraron balanzas o instrumentos registrados.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción / Marca</th>
                  <th>Cliente & Planta</th>
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
                        <strong style={{ color: "#0d9488", fontSize: "0.95rem" }}>{eq.code}</strong>
                        {eq.serialNumber && (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>S/N: {eq.serialNumber}</div>
                        )}
                      </td>
                      <td>
                        <strong style={{ fontSize: "0.92rem" }}>{eq.description}</strong>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {eq.brand} {eq.model} • {eq.loadCellsCount} apoyos/celdas
                        </div>
                      </td>
                      <td>
                        {eq.customerId ? (
                          <Link to={`/clientes/${eq.customerId}`} style={{ fontWeight: 700, color: "var(--primary)" }}>
                            🏢 {eq.customerName || "Cliente"}
                          </Link>
                        ) : (
                          <span className="muted" style={{ fontWeight: 600 }}>{eq.customerName || "Uso Interno / Propia"}</span>
                        )}
                        <div className="muted" style={{ fontSize: "0.78rem" }}>📍 {eq.location || "Sin planta asignada"}</div>
                      </td>
                      <td>
                        <strong>{eq.maxCapacity.toLocaleString("es-AR")} {eq.unit}</strong>
                        <div className="muted" style={{ fontSize: "0.78rem" }}>Min: {eq.minCapacity} {eq.unit}</div>
                      </td>
                      <td>
                        <div>e = {eq.verificationIntervalE} {eq.unit}</div>
                        <div className="muted" style={{ fontSize: "0.78rem" }}>d = {eq.divisionD} {eq.unit}</div>
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

      {/* Modal Principal Alta / Edición de Balanza - Amplio y Cómodo */}
      {showModal && (
        <div className="modal-backdrop" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="modal-card" style={{ maxWidth: 980, width: "100%", maxHeight: "92vh", overflowY: "auto", padding: "24px 28px", borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid var(--surface-border)", paddingBottom: 12 }}>
              <div>
                <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.72rem" }}>
                  Ficha Técnica Metrológica
                </span>
                <h2 style={{ margin: "2px 0 0", fontSize: "1.4rem", fontWeight: 800 }}>
                  {editingId ? "✏️ Modificar Ficha de Balanza" : "➕ Registrar Nueva Balanza / Instrumento"}
                </h2>
              </div>
              <button type="button" className="alert-close" onClick={() => setShowModal(false)} style={{ fontSize: "1.2rem" }}>✕</button>
            </div>

            {error && <div className="alert" style={{ marginBottom: 18 }}>{error}</div>}

            <form onSubmit={handleSave} style={{ display: "grid", gap: 18 }}>
              {/* Sección 1: Cliente y Planta */}
              <div style={{ background: "rgba(15, 23, 42, 0.02)", padding: "18px 20px", borderRadius: 12, border: "1px solid var(--surface-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink)", fontWeight: 800 }}>
                    🏢 Asignación de Cliente & Planta
                  </h4>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: "0.82rem", background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", padding: "4px 12px" }}
                    onClick={() => {
                      setQuickLegalName("");
                      setQuickTradeName("");
                      setQuickCuit("");
                      setQuickStreet("");
                      setQuickCity("");
                      setQuickProvince("SantaFe");
                      setQuickEmail("");
                      setQuickPhone("");
                      setQuickError(null);
                      setShowQuickCustomerModal(true);
                    }}
                  >
                    ➕ Nuevo Cliente en Directorio
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Cliente / Empresa Propietaria</span>
                    <select
                      value={customerId}
                      onChange={(e) => handleSelectCustomer(e.target.value)}
                      style={{ marginTop: 6 }}
                    >
                      <option value="">— Sin cliente asignado (Instrumento Propio / Uso Interno) —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.tradeName || c.legalName} {c.documentNumber ? `(CUIT ${c.documentNumber})` : ""}
                        </option>
                      ))}
                    </select>
                    {loadingCustomers && <span className="muted" style={{ fontSize: "0.75rem" }}>Cargando clientes...</span>}
                  </label>

                  {/* Planta / Ubicación */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                        Planta / Sucursal de Ubicación
                      </span>
                      {customerId && (
                        <button
                          type="button"
                          className="btn ghost compact"
                          style={{ padding: "2px 8px", fontSize: "0.75rem", color: "var(--primary)", fontWeight: 700 }}
                          onClick={() => {
                            setQuickLocName("");
                            setQuickLocStreet("");
                            setQuickLocCity("");
                            setQuickLocProvince("SantaFe");
                            setQuickLocPostalCode("");
                            setShowQuickLocationModal(true);
                          }}
                        >
                          ➕ Nueva Planta
                        </button>
                      )}
                    </div>

                    {customerId && selectedCustomerDetail?.locations && selectedCustomerDetail.locations.length > 0 && locationType === "select" ? (
                      <select
                        value={selectedLocationId}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "custom") {
                            setLocationType("custom");
                            setSelectedLocationId("");
                          } else {
                            setSelectedLocationId(val);
                            const locObj = selectedCustomerDetail.locations.find((l) => l.id === val);
                            if (locObj) {
                              setLocation(`${locObj.name} (${locObj.address.city || ""})`);
                            }
                          }
                        }}
                      >
                        {selectedCustomerDetail.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            📍 {l.name} — {l.address.city || "S/C"} ({l.address.street || ""})
                          </option>
                        ))}
                        <option value="custom">✍️ Escribir otra ubicación manual...</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="ej. Planta Acopio Silos 1 - Ingreso de Camiones"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sección 2: Identificación del Instrumento */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: 14 }}>
                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Código / Identificador Interno *</span>
                  <input
                    type="text"
                    required
                    placeholder="ej. BAL-CAM-01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Descripción del Instrumento *</span>
                  <input
                    type="text"
                    required
                    placeholder="ej. Balanza Camionera Electrónica de 80 toneladas"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Marca</span>
                  <input type="text" placeholder="ej. Systel / Toledo" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ marginTop: 4 }} />
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Modelo</span>
                  <input type="text" placeholder="ej. TruckMaster 80T" value={model} onChange={(e) => setModel(e.target.value)} style={{ marginTop: 4 }} />
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Número de Serie</span>
                  <input type="text" placeholder="ej. SN-2024-88912" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} style={{ marginTop: 4 }} />
                </label>
              </div>

              {/* Sección 3: Parámetros Metrológicos OIML R 76-1 */}
              <div style={{ background: "rgba(13, 148, 136, 0.04)", padding: "18px 20px", borderRadius: 12, border: "1px solid rgba(13, 148, 136, 0.2)" }}>
                <h4 style={{ margin: "0 0 14px", color: "#0d9488", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 800 }}>
                  📐 Parámetros Metrológicos OIML R 76-1 & Res. 67/2025
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Capacidad Max *</span>
                    <input type="number" step="0.0001" min="0.0001" required value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Capacidad Min *</span>
                    <input type="number" step="0.0001" min="0" required value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Escalón Verif. (e) *</span>
                    <input type="number" step="0.0001" min="0.0001" required value={verificationIntervalE} onChange={(e) => setVerificationIntervalE(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>División (d) *</span>
                    <input type="number" step="0.0001" min="0.0001" required value={divisionD} onChange={(e) => setDivisionD(e.target.value)} style={{ marginTop: 4 }} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 1.3fr", gap: 14 }}>
                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Unidad de Medida</span>
                    <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ marginTop: 4 }}>
                      <option value="kg">kg (Kilogramos)</option>
                      <option value="g">g (Gramos)</option>
                      <option value="mg">mg (Miligramos)</option>
                      <option value="t">t (Toneladas)</option>
                    </select>
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Clase de Exactitud</span>
                    <select value={accuracyClass} onChange={(e) => setAccuracyClass(e.target.value)} style={{ marginTop: 4 }}>
                      <option value="I">Clase I (Especial)</option>
                      <option value="II">Clase II (Fina)</option>
                      <option value="III">Clase III (Media - Estándar)</option>
                      <option value="IIII">Clase IIII (Ordinaria)</option>
                    </select>
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Apoyos / Celdas</span>
                    <input type="number" step="1" min="1" max="16" value={loadCellsCount} onChange={(e) => setLoadCellsCount(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Tipo de Indicación</span>
                    <select value={indicationType} onChange={(e) => setIndicationType(e.target.value)} style={{ marginTop: 4 }}>
                      <option value="Digital">Digital</option>
                      <option value="Analógica">Analógica / Mecánica</option>
                      <option value="Impresora">Con Dispositivo Impresor</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Sección 4: Observaciones */}
              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Observaciones / Notas Técnicas & Precintos</span>
                <textarea rows={3} placeholder="Detalles de instalación, cabezal indicador, precintos de seguridad colocados, etc." value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 4 }} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10, borderTop: "1px solid var(--surface-border)", paddingTop: 14 }}>
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)} style={{ padding: "10px 18px" }}>Cancelar</button>
                <button type="submit" className="btn" disabled={saving} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", padding: "10px 24px", fontWeight: 700 }}>
                  {saving ? "Guardando..." : "💾 Guardar Balanza"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submodal 1: Crear Cliente Rápido */}
      {showQuickCustomerModal && (
        <div className="modal-backdrop" style={{ zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="modal-card" style={{ maxWidth: 580, width: "100%", padding: "22px 26px", borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--surface-border)", paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>🏢 Alta Rápida de Cliente en Directorio</h3>
              <button type="button" className="alert-close" onClick={() => setShowQuickCustomerModal(false)}>✕</button>
            </div>

            {quickError && <div className="alert" style={{ marginBottom: 14 }}>{quickError}</div>}

            <form onSubmit={handleSaveQuickCustomer} style={{ display: "grid", gap: 14 }}>
              {/* CUIT + Consulta ARCA */}
              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>CUIT / Identificación Fiscal</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    placeholder="ej. 30715489629"
                    value={quickCuit}
                    onChange={(e) => setQuickCuit(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={consultingArca}
                    onClick={handleConsultArca}
                    style={{ background: "#0f172a", color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}
                    title="Autocompletar datos con ARCA (Padrón AFIP)"
                  >
                    {consultingArca ? "Consultando..." : "🏛️ Consultar ARCA"}
                  </button>
                </div>
              </label>

              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Razón Social *</span>
                <input
                  type="text"
                  required
                  placeholder="ej. Acopio Cereales Los Molinos S.A."
                  value={quickLegalName}
                  onChange={(e) => setQuickLegalName(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Nombre Fantasía</span>
                <input
                  type="text"
                  placeholder="ej. Los Molinos Acopio"
                  value={quickTradeName}
                  onChange={(e) => setQuickTradeName(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Ciudad / Localidad</span>
                  <input
                    type="text"
                    placeholder="ej. Rosario"
                    value={quickCity}
                    onChange={(e) => setQuickCity(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Provincia</span>
                  <select value={quickProvince} onChange={(e) => setQuickProvince(e.target.value)} style={{ marginTop: 4 }}>
                    {provinces.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Email de Contacto</span>
                  <input
                    type="email"
                    placeholder="contacto@empresa.com"
                    value={quickEmail}
                    onChange={(e) => setQuickEmail(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Teléfono</span>
                  <input
                    type="text"
                    placeholder="341-4455667"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowQuickCustomerModal(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={quickSaving} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}>
                  {quickSaving ? "Creando..." : "✓ Crear y Seleccionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submodal 2: Crear Nueva Planta para el Cliente */}
      {showQuickLocationModal && (
        <div className="modal-backdrop" style={{ zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="modal-card" style={{ maxWidth: 540, width: "100%", padding: "22px 26px", borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--surface-border)", paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>📍 Agregar Planta / Sucursal al Cliente</h3>
              <button type="button" className="alert-close" onClick={() => setShowQuickLocationModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveQuickLocation} style={{ display: "grid", gap: 14 }}>
              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Nombre de la Planta / Sucursal *</span>
                <input
                  type="text"
                  required
                  placeholder="ej. Planta Acopio Silos 2 o Depósito Central"
                  value={quickLocName}
                  onChange={(e) => setQuickLocName(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Dirección / Calle</span>
                <input
                  type="text"
                  placeholder="ej. Ruta Nacional 9 Km 280"
                  value={quickLocStreet}
                  onChange={(e) => setQuickLocStreet(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: 12 }}>
                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Ciudad / Localidad</span>
                  <input
                    type="text"
                    placeholder="ej. San Lorenzo"
                    value={quickLocCity}
                    onChange={(e) => setQuickLocCity(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Provincia</span>
                  <select value={quickLocProvince} onChange={(e) => setQuickLocProvince(e.target.value)} style={{ marginTop: 4 }}>
                    {provinces.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Cód. Postal</span>
                  <input
                    type="text"
                    placeholder="ej. 2200"
                    value={quickLocPostalCode}
                    onChange={(e) => setQuickLocPostalCode(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowQuickLocationModal(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={quickLocSaving} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}>
                  {quickLocSaving ? "Guardando..." : "✓ Agregar Planta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
