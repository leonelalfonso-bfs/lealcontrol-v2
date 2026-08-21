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
  const [standardFilter, setStandardFilter] = useState("");
  
  // Equipment Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields - Identificación General
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
  
  // Marco Normativo
  const [applicableStandard, setApplicableStandard] = useState<"Res25_2025" | "Res2307_80">("Res25_2025");
  const [platformType, setPlatformType] = useState<"TruckScale" | "Platform" | "Hopper" | "Suspended" | "Counter">("TruckScale");

  // Componente 1: Plataforma / Receptor de Carga
  const [platformApprovalNumber, setPlatformApprovalNumber] = useState("");
  const [platformApprovalDate, setPlatformApprovalDate] = useState("");
  const [platformDimensions, setPlatformDimensions] = useState("");
  const [loadCellsCount, setLoadCellsCount] = useState("6");

  // Componente 2: Indicador Principal (Indicador 1)
  const [indicator1Brand, setIndicator1Brand] = useState("");
  const [indicator1Model, setIndicator1Model] = useState("");
  const [indicator1SerialNumber, setIndicator1SerialNumber] = useState("");
  const [indicator1ApprovalNumber, setIndicator1ApprovalNumber] = useState("");
  const [indicator1ApprovalDate, setIndicator1ApprovalDate] = useState("");
  const [indicator1Type, setIndicator1Type] = useState("Digital");

  // Componente 3: Indicador Secundario (Indicador 2 - Opcional)
  const [hasSecondaryIndicator, setHasSecondaryIndicator] = useState(false);
  const [indicator2Brand, setIndicator2Brand] = useState("");
  const [indicator2Model, setIndicator2Model] = useState("");
  const [indicator2SerialNumber, setIndicator2SerialNumber] = useState("");
  const [indicator2ApprovalNumber, setIndicator2ApprovalNumber] = useState("");
  const [indicator2ApprovalDate, setIndicator2ApprovalDate] = useState("");
  const [indicator2Type, setIndicator2Type] = useState("Mecánico (Romana/Cuadrante)");

  // Parámetros Metrológicos
  const [maxCapacity, setMaxCapacity] = useState("80000");
  const [minCapacity, setMinCapacity] = useState("400");
  const [divisionD, setDivisionD] = useState("20");
  const [verificationIntervalE, setVerificationIntervalE] = useState("20");
  const [unit, setUnit] = useState("kg");
  const [accuracyClass, setAccuracyClass] = useState("III");
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
    setApplicableStandard("Res25_2025");
    setPlatformType("TruckScale");
    setPlatformApprovalNumber("");
    setPlatformApprovalDate("");
    setPlatformDimensions("21.00 x 3.00 m");
    setLoadCellsCount("6");

    setIndicator1Brand("");
    setIndicator1Model("");
    setIndicator1SerialNumber("");
    setIndicator1ApprovalNumber("");
    setIndicator1ApprovalDate("");
    setIndicator1Type("Digital");

    setHasSecondaryIndicator(false);
    setIndicator2Brand("");
    setIndicator2Model("");
    setIndicator2SerialNumber("");
    setIndicator2ApprovalNumber("");
    setIndicator2ApprovalDate("");
    setIndicator2Type("Mecánico (Romana/Cuadrante)");

    setMaxCapacity("80000");
    setMinCapacity("400");
    setDivisionD("20");
    setVerificationIntervalE("20");
    setUnit("kg");
    setAccuracyClass("III");
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
    setApplicableStandard((eq.applicableStandard as any) || "Res25_2025");
    setPlatformType((eq.platformType as any) || "TruckScale");
    
    setPlatformApprovalNumber((eq as any).platformApprovalNumber || "");
    setPlatformApprovalDate((eq as any).platformApprovalDate ? (eq as any).platformApprovalDate.substring(0, 10) : "");
    setPlatformDimensions((eq as any).platformDimensions || "");
    setLoadCellsCount((eq.loadCellsCount || 6).toString());

    setIndicator1Brand((eq as any).indicator1Brand || eq.brand || "");
    setIndicator1Model((eq as any).indicator1Model || eq.model || "");
    setIndicator1SerialNumber((eq as any).indicator1SerialNumber || eq.serialNumber || "");
    setIndicator1ApprovalNumber((eq as any).indicator1ApprovalNumber || eq.approvalCode || "");
    setIndicator1ApprovalDate((eq as any).indicator1ApprovalDate ? (eq as any).indicator1ApprovalDate.substring(0, 10) : "");
    setIndicator1Type((eq as any).indicator1Type || eq.indicationType || "Digital");

    setHasSecondaryIndicator((eq as any).hasSecondaryIndicator || false);
    setIndicator2Brand((eq as any).indicator2Brand || "");
    setIndicator2Model((eq as any).indicator2Model || "");
    setIndicator2SerialNumber((eq as any).indicator2SerialNumber || "");
    setIndicator2ApprovalNumber((eq as any).indicator2ApprovalNumber || "");
    setIndicator2ApprovalDate((eq as any).indicator2ApprovalDate ? (eq as any).indicator2ApprovalDate.substring(0, 10) : "");
    setIndicator2Type((eq as any).indicator2Type || "Mecánico (Romana/Cuadrante)");

    setMaxCapacity(eq.maxCapacity.toString());
    setMinCapacity(eq.minCapacity.toString());
    setDivisionD(eq.divisionD.toString());
    setVerificationIntervalE(eq.verificationIntervalE.toString());
    setUnit(eq.unit || "kg");
    setAccuracyClass(eq.accuracyClass || "III");
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
        brand: brand.trim() || indicator1Brand.trim(),
        model: model.trim() || indicator1Model.trim(),
        serialNumber: serialNumber.trim() || indicator1SerialNumber.trim(),
        customerId: customerId || undefined,
        customerName: customerName.trim(),
        location: location.trim(),
        applicableStandard,
        approvalCode: indicator1ApprovalNumber.trim() || platformApprovalNumber.trim(),
        platformType,
        platformApprovalNumber: platformApprovalNumber.trim(),
        platformApprovalDate: platformApprovalDate ? new Date(platformApprovalDate).toISOString() : undefined,
        platformDimensions: platformDimensions.trim(),
        indicator1Brand: indicator1Brand.trim(),
        indicator1Model: indicator1Model.trim(),
        indicator1SerialNumber: indicator1SerialNumber.trim(),
        indicator1ApprovalNumber: indicator1ApprovalNumber.trim(),
        indicator1ApprovalDate: indicator1ApprovalDate ? new Date(indicator1ApprovalDate).toISOString() : undefined,
        indicator1Type,
        hasSecondaryIndicator,
        indicator2Brand: indicator2Brand.trim(),
        indicator2Model: indicator2Model.trim(),
        indicator2SerialNumber: indicator2SerialNumber.trim(),
        indicator2ApprovalNumber: indicator2ApprovalNumber.trim(),
        indicator2ApprovalDate: indicator2ApprovalDate ? new Date(indicator2ApprovalDate).toISOString() : undefined,
        indicator2Type,
        maxCapacity: parseFloat(maxCapacity) || 0,
        minCapacity: parseFloat(minCapacity) || 0,
        divisionD: parseFloat(divisionD) || 0,
        verificationIntervalE: parseFloat(verificationIntervalE) || 0,
        unit,
        accuracyClass,
        indicationType: indicator1Type,
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
          street: quickStreet.trim() || "S/D",
          city: quickCity.trim() || "S/C",
          province: quickProvince,
          postalCode: "S/C"
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

  // Calculations for live preview of Eccentricity
  const calcMax = parseFloat(maxCapacity) || 0;
  const calcCells = parseInt(loadCellsCount, 10) || 6;
  const calcEccLoad = applicableStandard === "Res2307_80"
    ? (platformType === "Hopper" ? calcMax / 10 : (platformType === "TruckScale" ? calcMax / calcCells : (calcCells <= 4 ? calcMax / 3 : calcMax / calcCells)))
    : (platformType === "Hopper" ? calcMax / 10 : (calcCells > 4 ? calcMax / (calcCells - 1) : calcMax / 3));

  const filteredEquipments = equipments.filter((eq) => {
    if (standardFilter && eq.applicableStandard !== standardFilter) return false;
    return true;
  });

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
            Ficha técnica metrológica conforme a <strong>Res. 25/2025 (OIML R 76-1)</strong> y <strong>Res. 2307/80 (SIMELA)</strong>
          </p>
        </div>

        <button type="button" className="btn" onClick={handleOpenCreate} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", padding: "10px 20px", fontWeight: 700 }}>
          ➕ Registrar Nueva Balanza
        </button>
      </div>

      {/* Filters */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <input
              type="text"
              placeholder="Buscar por código, descripción, cliente, marca, modelo o disposición..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: 220 }}>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="">Todos los clientes ({customers.length})</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.legalName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: 200 }}>
            <select value={standardFilter} onChange={(e) => setStandardFilter(e.target.value)}>
              <option value="">Todas las normativas</option>
              <option value="Res25_2025">Res. 25/2025 (OIML R 76-1)</option>
              <option value="Res2307_80">Res. 2307/80 (SIMELA)</option>
            </select>
          </div>

          <div style={{ width: 170 }}>
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
        ) : filteredEquipments.length === 0 ? (
          <div className="muted" style={{ padding: 36, textAlign: "center" }}>
            No se encontraron balanzas o instrumentos registrados.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código / Identif.</th>
                  <th>Descripción & Configuración</th>
                  <th>Resolución & Aprobaciones</th>
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
                {filteredEquipments.map((eq) => {
                  const isExpired = eq.nextCalibrationDate && new Date(eq.nextCalibrationDate) < new Date();
                  const isRes25 = eq.applicableStandard !== "Res2307_80";
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
                          Plataforma: {eq.platformType === "TruckScale" ? "Camionera" : eq.platformType === "Platform" ? "Plataforma" : eq.platformType === "Hopper" ? "Tolva" : "Comercial"} • {eq.loadCellsCount} apoyos
                        </div>
                        <div className="muted" style={{ fontSize: "0.76rem" }}>
                          Ind 1: {(eq as any).indicator1Brand} {(eq as any).indicator1Model} ({(eq as any).indicator1Type || "Digital"})
                          {(eq as any).hasSecondaryIndicator && ` + Ind 2: ${(eq as any).indicator2Brand} ${(eq as any).indicator2Model}`}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          background: isRes25 ? "rgba(13, 148, 136, 0.12)" : "rgba(71, 85, 105, 0.12)",
                          color: isRes25 ? "#0f766e" : "#334155",
                          border: `1px solid ${isRes25 ? "rgba(13, 148, 136, 0.3)" : "rgba(71, 85, 105, 0.3)"}`
                        }}>
                          {isRes25 ? "Res. 25/2025 (OIML)" : "Res. 2307/80 (SIMELA)"}
                        </span>
                        {(eq as any).platformApprovalNumber && (
                          <div className="muted" style={{ fontSize: "0.74rem", marginTop: 2 }}>
                            Plat: {(eq as any).platformApprovalNumber}
                          </div>
                        )}
                        {(eq as any).indicator1ApprovalNumber && (
                          <div className="muted" style={{ fontSize: "0.74rem" }}>
                            Ind: {(eq as any).indicator1ApprovalNumber}
                          </div>
                        )}
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

      {/* Modal Principal Alta / Edición de Balanza - Amplio, Modular y Completo */}
      {showModal && (
        <div className="modal-backdrop" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="modal-card" style={{ maxWidth: 1040, width: "100%", maxHeight: "95vh", overflowY: "auto", padding: "26px 32px", borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid var(--surface-border)", paddingBottom: 14 }}>
              <div>
                <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.74rem" }}>
                  Ficha Técnica Metrológica Legal
                </span>
                <h2 style={{ margin: "2px 0 0", fontSize: "1.45rem", fontWeight: 800 }}>
                  {editingId ? "✏️ Modificar Ficha de Balanza" : "➕ Registrar Nueva Balanza / Sistema de Pesaje"}
                </h2>
              </div>
              <button type="button" className="alert-close" onClick={() => setShowModal(false)} style={{ fontSize: "1.2rem" }}>✕</button>
            </div>

            {error && <div className="alert" style={{ marginBottom: 18 }}>{error}</div>}

            <form onSubmit={handleSave} style={{ display: "grid", gap: 20 }}>
              {/* Sección 1: Cliente y Planta */}
              <div style={{ background: "rgba(15, 23, 42, 0.02)", padding: "18px 22px", borderRadius: 12, border: "1px solid var(--surface-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink)", fontWeight: 800 }}>
                    1️⃣ Cliente & Planta Propietaria
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
                    <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Cliente / Empresa</span>
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
                        style={{ marginTop: 6 }}
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
                        style={{ marginTop: 6 }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sección 2: MARCO NORMATIVO APLICABLE */}
              <div style={{ background: "rgba(13, 148, 136, 0.05)", padding: "18px 22px", borderRadius: 12, border: "1.5px solid rgba(13, 148, 136, 0.25)" }}>
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f766e", fontWeight: 800 }}>
                    2️⃣ Marco Normativo Metrológico
                  </h4>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.82rem" }}>
                    Seleccione la resolución que rige la aprobación de modelo y los ensayos técnicos de este instrumento
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {/* Tarjeta Res 25/2025 */}
                  <div
                    onClick={() => setApplicableStandard("Res25_2025")}
                    style={{
                      border: `2px solid ${applicableStandard === "Res25_2025" ? "#0d9488" : "var(--surface-border)"}`,
                      background: applicableStandard === "Res25_2025" ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
                      boxShadow: applicableStandard === "Res25_2025" ? "0 4px 14px rgba(13, 148, 136, 0.15)" : "none",
                      padding: 16,
                      borderRadius: 10,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: "1rem", color: applicableStandard === "Res25_2025" ? "#0f766e" : "inherit" }}>
                        ⚖️ Resolución SIyC Nº 25/2025
                      </strong>
                      <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 12, background: "#ccfbf1", color: "#0f766e", fontWeight: 800 }}>
                        Armonizada OIML R 76-1
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem", lineHeight: 1.4 }}>
                      • Tolerancia: <strong>Error Máximo Permitido (emp)</strong><br />
                      • Periodicidad oficial: <strong>24 meses</strong> (Art. 5º)<br />
                      • Excentricidad: Carga <strong>1/(N-1)</strong> de Capacidad Máxima<br />
                      • Enfoque modular OIML (Plataforma + Indicadores independientes)
                    </div>
                  </div>

                  {/* Tarjeta Res 2307/80 */}
                  <div
                    onClick={() => setApplicableStandard("Res2307_80")}
                    style={{
                      border: `2px solid ${applicableStandard === "Res2307_80" ? "#475569" : "var(--surface-border)"}`,
                      background: applicableStandard === "Res2307_80" ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
                      boxShadow: applicableStandard === "Res2307_80" ? "0 4px 14px rgba(71, 85, 105, 0.15)" : "none",
                      padding: 16,
                      borderRadius: 10,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: "1rem", color: applicableStandard === "Res2307_80" ? "#334155" : "inherit" }}>
                        🏛️ Resolución SCyNEI Nº 2307/1980
                      </strong>
                      <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 12, background: "#f1f5f9", color: "#475569", fontWeight: 800 }}>
                        Régimen Histórico SIMELA
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem", lineHeight: 1.4 }}>
                      • Tolerancia: <strong>Error Máximo Tolerado (EMT)</strong><br />
                      • Vigencia de uso para usuarios: <strong>10 años</strong> (Art. 6º Res 25/25)<br />
                      • Excentricidad: Carga <strong>1/N</strong> sobre puntos de apoyo<br />
                      • Ensayos: Fidelidad, Sensibilidad y Movilidad
                    </div>
                  </div>
                </div>
              </div>

              {/* Identificación General del Sistema de Pesaje */}
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

              {/* COMPONENTES METROLÓGICOS INDEPENDIENTES (PLATAFORMA + INDICADOR 1 + INDICADOR 2) */}
              
              {/* COMPONENTE 1: RECEPTOR DE CARGA / PLATAFORMA */}
              <div style={{ background: "rgba(15, 23, 42, 0.02)", padding: "18px 22px", borderRadius: 12, border: "1px solid var(--surface-border)" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink)", fontWeight: 800 }}>
                  📦 Componente 1: Plataforma / Receptor de Carga
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Tipo de Receptor</span>
                    <select
                      value={platformType}
                      onChange={(e) => setPlatformType(e.target.value as any)}
                      style={{ marginTop: 4 }}
                    >
                      <option value="TruckScale">🚚 Camionera (Carga rodante)</option>
                      <option value="Platform">📦 Plataforma Fija (≤ 4 apoyos)</option>
                      <option value="Hopper">🌾 Tolva / Tanque Suspendido</option>
                      <option value="Suspended">🏗️ Colgante / Grúa</option>
                      <option value="Counter">🏪 Mostrador / Comercial (≤ 30 kg)</option>
                    </select>
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Dimensiones (m)</span>
                    <input type="text" placeholder="ej. 21.00 x 3.00 m" value={platformDimensions} onChange={(e) => setPlatformDimensions(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Nº Disposición / Aprobación</span>
                    <input type="text" placeholder="ej. Disp. DNCI 124/2018" value={platformApprovalNumber} onChange={(e) => setPlatformApprovalNumber(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Fecha de Disposición</span>
                    <input type="date" value={platformApprovalDate} onChange={(e) => setPlatformApprovalDate(e.target.value)} style={{ marginTop: 4 }} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Marca de Plataforma</span>
                    <input type="text" placeholder="ej. Latorre / Magris / Brapenta" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Modelo de Plataforma</span>
                    <input type="text" placeholder="ej. P-2100 Heavy Duty" value={model} onChange={(e) => setModel(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Nº Serie Plataforma</span>
                    <input type="text" placeholder="ej. PL-2024-0091" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} style={{ marginTop: 4 }} />
                  </label>
                </div>
              </div>

              {/* COMPONENTE 2: INDICADOR PRINCIPAL (INDICADOR 1) */}
              <div style={{ background: "rgba(13, 148, 136, 0.03)", padding: "18px 22px", borderRadius: 12, border: "1px solid rgba(13, 148, 136, 0.2)" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f766e", fontWeight: 800 }}>
                  📟 Componente 2: Dispositivo Indicador Principal (Indicador 1)
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr 1.2fr 1fr", gap: 12 }}>
                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Marca Indicador 1</span>
                    <input type="text" placeholder="ej. Systel / Toledo / PST" value={indicator1Brand} onChange={(e) => setIndicator1Brand(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Modelo Indicador 1</span>
                    <input type="text" placeholder="ej. Croma / IND560" value={indicator1Model} onChange={(e) => setIndicator1Model(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Nº Serie Ind 1</span>
                    <input type="text" placeholder="ej. SN-88912" value={indicator1SerialNumber} onChange={(e) => setIndicator1SerialNumber(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Nº Disposición / Aprobación</span>
                    <input type="text" placeholder="ej. Disp. DNCI 45/2021" value={indicator1ApprovalNumber} onChange={(e) => setIndicator1ApprovalNumber(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Fecha Disposición</span>
                    <input type="date" value={indicator1ApprovalDate} onChange={(e) => setIndicator1ApprovalDate(e.target.value)} style={{ marginTop: 4 }} />
                  </label>
                </div>
              </div>

              {/* COMPONENTE 3: INDICADOR SECUNDARIO (INDICADOR 2 - OPCIONAL / BALANZA HÍBRIDA) */}
              <div style={{ background: hasSecondaryIndicator ? "rgba(245, 158, 11, 0.04)" : "rgba(15, 23, 42, 0.01)", padding: "16px 22px", borderRadius: 12, border: `1px solid ${hasSecondaryIndicator ? "rgba(245, 158, 11, 0.3)" : "var(--surface-border)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasSecondaryIndicator ? 12 : 0 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={hasSecondaryIndicator}
                      onChange={(e) => setHasSecondaryIndicator(e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    <strong style={{ fontSize: "0.92rem", color: hasSecondaryIndicator ? "#b45309" : "inherit" }}>
                      ⚖️ Balanza Híbrida / Posee Segundo Indicador (Indicador 2 Mecánico, Digital o Repetidor)
                    </strong>
                  </label>
                  {hasSecondaryIndicator && (
                    <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 12, background: "#fef3c7", color: "#b45309", fontWeight: 800 }}>
                      Indicador Secundario Activo
                    </span>
                  )}
                </div>

                {hasSecondaryIndicator && (
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr 1fr", gap: 12, marginTop: 12 }}>
                    <label>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Tipo Indicador 2</span>
                      <select value={indicator2Type} onChange={(e) => setIndicator2Type(e.target.value)} style={{ marginTop: 4 }}>
                        <option value="Mecánico (Romana/Cuadrante)">Mecánico (Romana/Cuadrante)</option>
                        <option value="Digital">Digital / Electrónico</option>
                        <option value="Repetidor">Repetidor Remoto</option>
                        <option value="Impresor">Dispositivo Impresor</option>
                      </select>
                    </label>

                    <label>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Marca Ind 2</span>
                      <input type="text" placeholder="ej. Latorre / Fairbanks" value={indicator2Brand} onChange={(e) => setIndicator2Brand(e.target.value)} style={{ marginTop: 4 }} />
                    </label>

                    <label>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Modelo Ind 2</span>
                      <input type="text" placeholder="ej. Romana R-50" value={indicator2Model} onChange={(e) => setIndicator2Model(e.target.value)} style={{ marginTop: 4 }} />
                    </label>

                    <label>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Nº Serie Ind 2</span>
                      <input type="text" placeholder="ej. SN-MEC-441" value={indicator2SerialNumber} onChange={(e) => setIndicator2SerialNumber(e.target.value)} style={{ marginTop: 4 }} />
                    </label>

                    <label>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Nº Disposición Ind 2</span>
                      <input type="text" placeholder="ej. Disp. DNCI 12/2010" value={indicator2ApprovalNumber} onChange={(e) => setIndicator2ApprovalNumber(e.target.value)} style={{ marginTop: 4 }} />
                    </label>

                    <label>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>Fecha Disposición</span>
                      <input type="date" value={indicator2ApprovalDate} onChange={(e) => setIndicator2ApprovalDate(e.target.value)} style={{ marginTop: 4 }} />
                    </label>
                  </div>
                )}
              </div>

              {/* Sección 4: Parámetros Metrológicos Dinámicos */}
              <div style={{ background: "rgba(15, 23, 42, 0.02)", padding: "18px 22px", borderRadius: 12, border: "1px solid var(--surface-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h4 style={{ margin: 0, color: "var(--ink)", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 800 }}>
                    4️⃣ Capacidades y Escalones Metrológicos ({applicableStandard === "Res25_2025" ? "OIML R 76-1" : "SIMELA"})
                  </h4>
                  <span style={{ fontSize: "0.82rem", color: "#0d9488", fontWeight: 700 }}>
                    Excentricidad: Carga ensayo = <strong>{calcEccLoad.toLocaleString("es-AR")} {unit}</strong>
                  </span>
                </div>

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
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>
                      {applicableStandard === "Res25_2025" ? "División real (d) *" : "División (d / dd) *"}
                    </span>
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
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>
                      {applicableStandard === "Res25_2025" ? "Clase de Exactitud" : "Clase de Precisión"}
                    </span>
                    <select value={accuracyClass} onChange={(e) => setAccuracyClass(e.target.value)} style={{ marginTop: 4 }}>
                      <option value="I">{applicableStandard === "Res25_2025" ? "Clase I (Especial)" : "Clase I (Precisión Especial)"}</option>
                      <option value="II">{applicableStandard === "Res25_2025" ? "Clase II (Alta / Fina)" : "Clase II (Precisión Fina)"}</option>
                      <option value="III">{applicableStandard === "Res25_2025" ? "Clase III (Media - Estándar)" : "Clase III (Precisión Media)"}</option>
                      <option value="IIII">{applicableStandard === "Res25_2025" ? "Clase IIII (Ordinaria)" : "Clase IIII (Precisión Ordinaria)"}</option>
                    </select>
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Apoyos / Celdas (N)</span>
                    <input type="number" step="1" min="1" max="16" value={loadCellsCount} onChange={(e) => setLoadCellsCount(e.target.value)} style={{ marginTop: 4 }} />
                  </label>

                  <label>
                    <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>Tipo de Indicación</span>
                    <select value={indicator1Type} onChange={(e) => setIndicator1Type(e.target.value)} style={{ marginTop: 4 }}>
                      <option value="Digital">Digital (Discontinua)</option>
                      <option value="Analógica">Analógica (Continua / Cuadrante)</option>
                      <option value="Impresora">Con Dispositivo Impresor</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Sección 5: Observaciones */}
              <label>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Observaciones / Notas Técnicas & Precintos</span>
                <textarea rows={3} placeholder="Detalles de instalación, precintos de seguridad colocados, puntos de apoyo, etc." value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 4 }} />
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
