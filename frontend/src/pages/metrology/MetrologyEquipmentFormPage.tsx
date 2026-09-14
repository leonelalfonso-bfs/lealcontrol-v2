import { useEffect, useState, useRef, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment } from "../../api/types";

export function MetrologyEquipmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id && id !== "nuevo");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);

  // Customer Autocomplete Search State
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerDoc, setSelectedCustomerDoc] = useState("");
  const [customerLocations, setCustomerLocations] = useState<{ id: string; name: string; fullAddress?: string }[]>([]);
  const [isManualLocation, setIsManualLocation] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Form State
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [location, setLocation] = useState("");
  const [applicableStandard, setApplicableStandard] = useState("Res25_2025");
  const [approvalCode, setApprovalCode] = useState("");

  // Platform
  const [platformType, setPlatformType] = useState("TruckScale");
  const [platformApprovalCode, setPlatformApprovalCode] = useState("");
  const [platformApprovalNumber, setPlatformApprovalNumber] = useState("");
  const [platformApprovalDate, setPlatformApprovalDate] = useState("");
  const [platformDimensions, setPlatformDimensions] = useState("");

  // Indicator 1
  const [indicator1Brand, setIndicator1Brand] = useState("");
  const [indicator1Model, setIndicator1Model] = useState("");
  const [indicator1SerialNumber, setIndicator1SerialNumber] = useState("");
  const [indicator1ApprovalCode, setIndicator1ApprovalCode] = useState("");
  const [indicator1ApprovalNumber, setIndicator1ApprovalNumber] = useState("");
  const [indicator1ApprovalDate, setIndicator1ApprovalDate] = useState("");
  const [indicator1Type, setIndicator1Type] = useState("Digital");

  // Indicator 2 (Optional)
  const [hasSecondaryIndicator, setHasSecondaryIndicator] = useState(false);
  const [indicator2Brand, setIndicator2Brand] = useState("");
  const [indicator2Model, setIndicator2Model] = useState("");
  const [indicator2SerialNumber, setIndicator2SerialNumber] = useState("");
  const [indicator2ApprovalCode, setIndicator2ApprovalCode] = useState("");
  const [indicator2ApprovalNumber, setIndicator2ApprovalNumber] = useState("");
  const [indicator2ApprovalDate, setIndicator2ApprovalDate] = useState("");
  const [indicator2Type, setIndicator2Type] = useState("MechanicalDial");

  // Metrological Specs
  const [maxCapacity, setMaxCapacity] = useState(80000);
  const [maximumOperationalLoad, setMaximumOperationalLoad] = useState(45000);
  const [minCapacity, setMinCapacity] = useState(400);
  const [divisionD, setDivisionD] = useState(20);
  const [verificationIntervalE, setVerificationIntervalE] = useState(20);
  const [unit, setUnit] = useState("kg");
  const [accuracyClass, setAccuracyClass] = useState("III");
  const [indicationType, setIndicationType] = useState("Digital");
  const [loadCellsCount, setLoadCellsCount] = useState(8);
  const [hasTare, setHasTare] = useState(true);
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");

  // Instant local filtering with useMemo
  const filteredSuggestions = (customerSearchQuery.trim() === ""
    ? customers.slice(0, 40)
    : customers.filter((c: any) => {
        const q = customerSearchQuery.trim().toLowerCase();
        const name = (c.legalName || c.tradeName || c.name || "").toLowerCase();
        const doc = (c.documentNumber || "").toLowerCase();
        return name.includes(q) || doc.includes(q);
      })
  );

  // Helper to load customer plants/locations
  const loadCustomerLocations = async (cId: string) => {
    if (!cId) {
      setCustomerLocations([]);
      return;
    }
    try {
      const detail: any = await api.getCustomer(cId).catch(() => null);
      if (detail && detail.locations && detail.locations.length > 0) {
        const locs = detail.locations.map((loc: any) => ({
          id: loc.id,
          name: loc.name || "Planta Principal",
          fullAddress: [
            loc.name,
            loc.address?.street ? `${loc.address.street} ${loc.address.number || ""}` : "",
            loc.address?.city,
            loc.address?.state
          ].filter(Boolean).join(", ")
        }));
        setCustomerLocations(locs);
      } else {
        setCustomerLocations([]);
      }
    } catch (err) {
      console.error("Error cargando plantas del cliente:", err);
      setCustomerLocations([]);
    }
  };

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        if (customerId) setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [customerId]);

  // Search customer on server when query changes (role 'all' to include all contacts)
  useEffect(() => {
    if (!showCustomerDropdown || !customerSearchQuery.trim()) return;
    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const res: any = await api.listCustomers(customerSearchQuery.trim(), "all").catch(() => ({ items: [] }));
        const list = res.items || res || [];
        if (list.length > 0) {
          setCustomers((prev) => {
            const existingIds = new Set(prev.map((x: any) => x.id));
            const newItems = list.filter((x: any) => !existingIds.has(x.id));
            return [...prev, ...newItems];
          });
        }
      } catch (err) {
        console.error("Error buscando clientes:", err);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearchQuery, showCustomerDropdown]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const custsRes: any = await api.listCustomers("", "all").catch(() => ({ items: [] }));
        const custList = custsRes.items || custsRes || [];
        setCustomers(custList);

        if (isEditing && id) {
          const res = await api.getMetrologyEquipment(id);
          const eq = res.equipment || (res as any);
          if (eq) {
            setCode(eq.code || "");
            setDescription(eq.description || "");
            setBrand(eq.brand || "");
            setModel(eq.model || "");
            setSerialNumber(eq.serialNumber || "");
            setCustomerId(eq.customerId || "");
            setCustomerName(eq.customerName || "");

            if (eq.customerId) {
              const matchedCust = custList.find((c: any) => c.id === eq.customerId);
              if (matchedCust) {
                setSelectedCustomerDoc(matchedCust.documentNumber || "");
                setCustomerName(matchedCust.legalName || matchedCust.tradeName || matchedCust.name || eq.customerName || "");
              }
              loadCustomerLocations(eq.customerId);
            }

            setLocation(eq.location || "");
            setApplicableStandard(eq.applicableStandard || "Res25_2025");
            setApprovalCode(eq.approvalCode || "");

            setPlatformType(eq.platformType || "TruckScale");
            setPlatformApprovalCode(eq.platformApprovalCode || "");
            setPlatformApprovalNumber(eq.platformApprovalNumber || "");
            setPlatformApprovalDate(eq.platformApprovalDate ? eq.platformApprovalDate.slice(0, 10) : "");
            setPlatformDimensions(eq.platformDimensions || "");

            setIndicator1Brand(eq.indicator1Brand || "");
            setIndicator1Model(eq.indicator1Model || "");
            setIndicator1SerialNumber(eq.indicator1SerialNumber || "");
            setIndicator1ApprovalCode(eq.indicator1ApprovalCode || "");
            setIndicator1ApprovalNumber(eq.indicator1ApprovalNumber || "");
            setIndicator1ApprovalDate(eq.indicator1ApprovalDate ? eq.indicator1ApprovalDate.slice(0, 10) : "");
            setIndicator1Type(eq.indicator1Type || "Digital");

            setHasSecondaryIndicator(eq.hasSecondaryIndicator || false);
            setIndicator2Brand(eq.indicator2Brand || "");
            setIndicator2Model(eq.indicator2Model || "");
            setIndicator2SerialNumber(eq.indicator2SerialNumber || "");
            setIndicator2ApprovalCode(eq.indicator2ApprovalCode || "");
            setIndicator2ApprovalNumber(eq.indicator2ApprovalNumber || "");
            setIndicator2ApprovalDate(eq.indicator2ApprovalDate ? eq.indicator2ApprovalDate.slice(0, 10) : "");
            setIndicator2Type(eq.indicator2Type || "MechanicalDial");

            setMaxCapacity(eq.maxCapacity || 80000);
            setMaximumOperationalLoad(eq.maximumOperationalLoad || (eq.maxCapacity === 80000 ? 45000 : (eq.maxCapacity || 80000)));
            setMinCapacity(eq.minCapacity || 400);
            setDivisionD(eq.divisionD || 20);
            setVerificationIntervalE(eq.verificationIntervalE || 20);
            setUnit(eq.unit || "kg");
            setAccuracyClass(eq.accuracyClass || "III");
            setIndicationType(eq.indicationType || "Digital");
            setLoadCellsCount(eq.loadCellsCount || 8);
            setHasTare(eq.hasTare !== false);
            setStatus(eq.status || "Active");
            setNotes(eq.notes || "");
          }
        } else {
          setCode(`EQ-${Date.now().toString().slice(-4)}`);
        }
      } catch (err: any) {
        console.error("Error al cargar equipo:", err);
        setError("No se pudo cargar la información del equipo.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditing]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !description.trim()) {
      setError("Código identificador y descripción del instrumento son obligatorios.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Partial<MetrologyEquipment> = {
      code: code.trim(),
      description: description.trim(),
      brand: brand.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      customerId: customerId || undefined,
      customerName: customerName.trim(),
      location: location.trim(),
      applicableStandard: applicableStandard as any,
      approvalCode: approvalCode.trim(),

      platformType: platformType as any,
      platformApprovalCode: platformApprovalCode.trim(),
      platformApprovalNumber: platformApprovalNumber.trim(),
      platformApprovalDate: platformApprovalDate ? new Date(platformApprovalDate).toISOString() : undefined,
      platformDimensions: platformDimensions.trim(),

      indicator1Brand: indicator1Brand.trim(),
      indicator1Model: indicator1Model.trim(),
      indicator1SerialNumber: indicator1SerialNumber.trim(),
      indicator1ApprovalCode: indicator1ApprovalCode.trim(),
      indicator1ApprovalNumber: indicator1ApprovalNumber.trim(),
      indicator1ApprovalDate: indicator1ApprovalDate ? new Date(indicator1ApprovalDate).toISOString() : undefined,
      indicator1Type,

      hasSecondaryIndicator,
      indicator2Brand: indicator2Brand.trim(),
      indicator2Model: indicator2Model.trim(),
      indicator2SerialNumber: indicator2SerialNumber.trim(),
      indicator2ApprovalCode: indicator2ApprovalCode.trim(),
      indicator2ApprovalNumber: indicator2ApprovalNumber.trim(),
      indicator2ApprovalDate: indicator2ApprovalDate ? new Date(indicator2ApprovalDate).toISOString() : undefined,
      indicator2Type,

      maxCapacity: Number(maxCapacity),
      maximumOperationalLoad: Number(maximumOperationalLoad) || Number(maxCapacity),
      minCapacity: Number(minCapacity),
      divisionD: Number(divisionD),
      verificationIntervalE: Number(verificationIntervalE),
      unit,
      accuracyClass,
      indicationType,
      loadCellsCount: Number(loadCellsCount),
      hasTare,
      status: status as any,
      notes: notes.trim()
    };

    try {
      if (isEditing && id) {
        await api.updateMetrologyEquipment(id, payload);
      } else {
        await api.createMetrologyEquipment(payload);
      }
      navigate("/metrologia/equipos");
    } catch (err: any) {
      setError(err?.message || "Error al guardar el equipo metrológico.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <div className="muted">Cargando ficha técnica del instrumento...</div>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Breadcrumb & Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
          <Link to="/metrologia" style={{ color: "inherit", textDecoration: "none" }}>Metrología Legal</Link>
          <span>›</span>
          <Link to="/metrologia/equipos" style={{ color: "inherit", textDecoration: "none" }}>Gestión de Equipos</Link>
          <span>›</span>
          <span style={{ color: "#0d9488", fontWeight: 700 }}>{isEditing ? `Editar [${code}]` : "Alta de Instrumento"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: "1.75rem", fontWeight: 800, color: "#0f172a" }}>
              {isEditing ? `⚖️ Ficha Técnica: ${description || code}` : "➕ Alta de Instrumento de Pesar"}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Registro integral de plataforma, indicadores, disposiciones de aprobación y capacidades según normativa argentina.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/metrologia/equipos" className="btn ghost" style={{ padding: "8px 16px", fontWeight: 600 }}>
              ← Cancelar y Volver
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn"
              style={{ background: "#0d9488", color: "#fff", fontWeight: 800, padding: "8px 24px", fontSize: "0.92rem", minWidth: 160 }}
            >
              {saving ? "Guardando..." : "💾 Guardar Instrumento"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 20, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "14px 18px", borderRadius: 8, fontSize: "0.92rem" }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* SECCIÓN 1: IDENTIFICACIÓN & CLIENTE */}
        <div
          className="card pad"
          style={{
            marginBottom: 20,
            borderLeft: "5px solid #0d9488",
            position: "relative",
            zIndex: showCustomerDropdown ? 9999 : 5
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f766e", marginBottom: 14 }}>
            1. IDENTIFICACIÓN GENERAL & UBICACIÓN
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Código Interno *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ej. BAL-CAM-01"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: 800, fontSize: "0.92rem" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Descripción Completa del Instrumento *</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ej. Balanza para Camiones 80t - Planta Silos Norte"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            {/* Campo Autocomplete de Cliente (Inline no-clipping) */}
            <div ref={customerDropdownRef} style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>
                Cliente / Propietario del Instrumento
              </label>

              {customerId && !showCustomerDropdown ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    borderRadius: 8,
                    padding: "10px 16px",
                    boxSizing: "border-box"
                  }}
                >
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <strong style={{ color: "#166534", fontSize: "0.98rem" }}>🏢 {customerName}</strong>
                    {selectedCustomerDoc && (
                      <span className="muted" style={{ fontSize: "0.86rem", marginLeft: 10 }}>
                        (CUIT: {selectedCustomerDoc})
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomerDropdown(true);
                        setCustomerSearchQuery("");
                      }}
                      className="btn ghost compact"
                      style={{ fontSize: "0.82rem", padding: "5px 12px", background: "#fff", border: "1px solid #cbd5e1" }}
                    >
                      🔍 Cambiar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId("");
                        setCustomerName("");
                        setSelectedCustomerDoc("");
                        setCustomerLocations([]);
                        setLocation("");
                      }}
                      className="btn ghost compact"
                      style={{ fontSize: "0.82rem", color: "#dc2626", padding: "5px 12px", background: "#fff", border: "1px solid #fca5a5" }}
                      title="Asignar como Uso Interno / Propio"
                    >
                      ✕ Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="🔍 Escribí nombre, razón social o CUIT para buscar cliente..."
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: 6,
                        border: "2px solid #0d9488",
                        fontSize: "0.92rem",
                        background: "#fff"
                      }}
                    />
                    {customerId && (
                      <button
                        type="button"
                        onClick={() => setShowCustomerDropdown(false)}
                        className="btn ghost compact"
                        style={{ padding: "0 14px" }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>

                  {/* Lista de selección inline dentro del flujo (Inmune a cualquier corte o z-index) */}
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: "auto",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6
                    }}
                  >
                    {/* Opción Uso Interno */}
                    <div
                      onClick={() => {
                        setCustomerId("");
                        setCustomerName("");
                        setSelectedCustomerDoc("");
                        setShowCustomerDropdown(false);
                        setCustomerSearchQuery("");
                        setCustomerLocations([]);
                      }}
                      style={{
                        padding: "11px 16px",
                        cursor: "pointer",
                        borderBottom: "1px solid #e2e8f0",
                        background: !customerId ? "#f0fdf4" : "#fff",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#475569", fontSize: "0.88rem" }}>
                        🏢 -- Uso Interno / Propio (Sin Cliente Externo) --
                      </span>
                      <span className="tag" style={{ fontSize: "0.72rem", background: "#e2e8f0" }}>Propio</span>
                    </div>

                    {filteredSuggestions.length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center" }} className="muted">
                        {customerSearchQuery ? `No se encontraron clientes con "${customerSearchQuery}"` : "Sin clientes registrados."}
                      </div>
                    ) : (
                      filteredSuggestions.map((c: any) => {
                        const displayName = c.legalName || c.tradeName || c.name || "Sin Razón Social";
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setCustomerId(c.id);
                              setCustomerName(displayName);
                              setSelectedCustomerDoc(c.documentNumber || "");
                              setShowCustomerDropdown(false);
                              setCustomerSearchQuery("");
                              loadCustomerLocations(c.id);
                            }}
                            style={{
                              padding: "10px 16px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f1f5f9",
                              transition: "background 0.15s"
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f0fdf4")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <strong style={{ color: "#0f172a", fontSize: "0.92rem" }}>{displayName}</strong>
                              {c.documentNumber && (
                                <span style={{ fontFamily: "monospace", fontSize: "0.84rem", color: "#0d9488", fontWeight: 700 }}>
                                  CUIT: {c.documentNumber}
                                </span>
                              )}
                            </div>
                            {(c.city || c.province) && (
                              <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                                📍 {[c.city, c.province].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Campo Ubicación Física / Planta vinculado al cliente */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>
                Ubicación Física / Planta del Instrumento
              </label>

              {customerLocations.length > 0 && !isManualLocation ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={location}
                    onChange={(e) => {
                      if (e.target.value === "__MANUAL__") {
                        setIsManualLocation(true);
                      } else {
                        setLocation(e.target.value);
                      }
                    }}
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem", fontWeight: 600 }}
                  >
                    <option value="">-- Seleccionar Planta o Sucursal del Cliente --</option>
                    {customerLocations.map((loc) => (
                      <option key={loc.id} value={loc.fullAddress || loc.name}>
                        📍 {loc.name} {loc.fullAddress && loc.fullAddress !== loc.name ? `(${loc.fullAddress})` : ""}
                      </option>
                    ))}
                    <option value="__MANUAL__">✍️ Ingresar otra ubicación manualmente...</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsManualLocation(true)}
                    className="btn ghost compact"
                    style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}
                  >
                    ✍️ Texto libre
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="ej. Planta Silos Norte, Báscula Entrada, Molino Central"
                      style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                    />
                    {customerLocations.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsManualLocation(false)}
                        className="btn ghost compact"
                        style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}
                      >
                        📍 Ver Plantas del Cliente ({customerLocations.length})
                      </button>
                    )}
                  </div>
                  {customerLocations.length > 0 && (
                    <small className="muted" style={{ fontSize: "0.75rem", display: "block", marginTop: 4 }}>
                      Plantas detectadas en la ficha del cliente: {customerLocations.map((l) => l.name).join(", ")}.
                    </small>
                  )}
                  {customerLocations.length === 0 && customerId && (
                    <small className="muted" style={{ fontSize: "0.75rem", display: "block", marginTop: 4 }}>
                      Este cliente no tiene sucursales cargadas en el Directorio; podés escribir la ubicación libremente.
                    </small>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Normativa Aplicable</label>
              <select
                value={applicableStandard}
                onChange={(e) => setApplicableStandard(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Res25_2025">Resolución 25/2025 (Vigente)</option>
                <option value="Res2307_1980">Resolución 2307/1980 (Histórica)</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: PLATAFORMA */}
        <div className="card pad" style={{ marginBottom: 20, borderLeft: "5px solid #3b82f6" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1d4ed8", marginBottom: 14 }}>
            2. PLATAFORMA DE PESAJES / RECEPTOR DE CARGA
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Tipo de Plataforma</label>
              <select
                value={platformType}
                onChange={(e) => setPlatformType(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="TruckScale">Báscula para Camiones</option>
                <option value="IndustrialPlatform">Plataforma Industrial de Piso</option>
                <option value="BenchScale">Balanza de Mesa / Mostrador</option>
                <option value="HopperScale">Tolva de Pesaje / Silo</option>
                <option value="AxleWeigher">Balanza para Pesaje de Ejes</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Marca Plataforma</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="ej. Toledo, Systel, Básculas Sur"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Modelo Plataforma</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="ej. BF-30 / 80t"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Número de Serie Plataforma</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="S/N de receptor / plataforma"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Código Aprobación Modelo</label>
              <input
                type="text"
                value={platformApprovalCode}
                onChange={(e) => setPlatformApprovalCode(e.target.value)}
                placeholder="ej. CAM-082"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Nº Disposición Aprobación</label>
              <input
                type="text"
                value={platformApprovalNumber}
                onChange={(e) => setPlatformApprovalNumber(e.target.value)}
                placeholder="ej. Disp. DNCI 142/2018"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Fecha de Disposición</label>
              <input
                type="date"
                value={platformApprovalDate}
                onChange={(e) => setPlatformApprovalDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Dimensiones Plataforma</label>
              <input
                type="text"
                value={platformDimensions}
                onChange={(e) => setPlatformDimensions(e.target.value)}
                placeholder="ej. 20.00m x 3.00m"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN 3: INDICADOR PRINCIPAL (1) */}
        <div className="card pad" style={{ marginBottom: 20, borderLeft: "5px solid #8b5cf6" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#6d28d9", marginBottom: 14 }}>
            3. INDICADOR METROLÓGICO PRINCIPAL (INDICADOR 1)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Marca Indicador 1</label>
              <input
                type="text"
                value={indicator1Brand}
                onChange={(e) => setIndicator1Brand(e.target.value)}
                placeholder="ej. Systel, Toledo, Kretz"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Modelo Indicador 1</label>
              <input
                type="text"
                value={indicator1Model}
                onChange={(e) => setIndicator1Model(e.target.value)}
                placeholder="ej. Matrix II / IND560"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Número de Serie</label>
              <input
                type="text"
                value={indicator1SerialNumber}
                onChange={(e) => setIndicator1SerialNumber(e.target.value)}
                placeholder="ej. SN-883492"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Código Aprobación Modelo</label>
              <input
                type="text"
                value={indicator1ApprovalCode}
                onChange={(e) => setIndicator1ApprovalCode(e.target.value)}
                placeholder="ej. IND-044"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Nº Disposición Aprobación</label>
              <input
                type="text"
                value={indicator1ApprovalNumber}
                onChange={(e) => setIndicator1ApprovalNumber(e.target.value)}
                placeholder="ej. Disp. DNCI 88/2019"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Fecha de Disposición</label>
              <input
                type="date"
                value={indicator1ApprovalDate}
                onChange={(e) => setIndicator1ApprovalDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Tipo de Indicador</label>
              <select
                value={indicator1Type}
                onChange={(e) => setIndicator1Type(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Digital">Digital Electrónico</option>
                <option value="MechanicalDial">Mecánico Cuadrante / Aguja</option>
                <option value="MechanicalSteelyard">Mecánico Romano / Pilón</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECCIÓN 4: SEGUNDO INDICADOR (OPCIONAL) */}
        <div className="card pad" style={{ marginBottom: 20, borderLeft: "5px solid #f59e0b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#b45309" }}>
              4. SEGUNDO INDICADOR (BALANZAS HÍBRIDAS / CABEZAL SECUNDARIO)
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 700, fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                checked={hasSecondaryIndicator}
                onChange={(e) => setHasSecondaryIndicator(e.target.checked)}
                style={{ transform: "scale(1.2)" }}
              />
              <span>Posee 2do Indicador (Balanza Híbrida)</span>
            </label>
          </div>

          {hasSecondaryIndicator && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, background: "#fffbeb", padding: 16, borderRadius: 8, border: "1px solid #fef3c7" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Marca Indicador 2</label>
                <input
                  type="text"
                  value={indicator2Brand}
                  onChange={(e) => setIndicator2Brand(e.target.value)}
                  placeholder="ej. Bianchetti"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Modelo Indicador 2</label>
                <input
                  type="text"
                  value={indicator2Model}
                  onChange={(e) => setIndicator2Model(e.target.value)}
                  placeholder="ej. Mecánico Cuadrante"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Número de Serie 2</label>
                <input
                  type="text"
                  value={indicator2SerialNumber}
                  onChange={(e) => setIndicator2SerialNumber(e.target.value)}
                  placeholder="ej. MEC-9912"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Código Aprobación Modelo 2</label>
                <input
                  type="text"
                  value={indicator2ApprovalCode}
                  onChange={(e) => setIndicator2ApprovalCode(e.target.value)}
                  placeholder="ej. IND-012"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Nº Disposición Aprobación 2</label>
                <input
                  type="text"
                  value={indicator2ApprovalNumber}
                  onChange={(e) => setIndicator2ApprovalNumber(e.target.value)}
                  placeholder="ej. Disp. DNCI 05/1998"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Fecha Disposición 2</label>
                <input
                  type="date"
                  value={indicator2ApprovalDate}
                  onChange={(e) => setIndicator2ApprovalDate(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Tipo Indicador 2</label>
                <select
                  value={indicator2Type}
                  onChange={(e) => setIndicator2Type(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                >
                  <option value="MechanicalDial">Mecánico Cuadrante / Aguja</option>
                  <option value="MechanicalSteelyard">Mecánico Romano / Pilón</option>
                  <option value="Digital">Digital Electrónico</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* SECCIÓN 5: ESPECIFICACIONES METROLÓGICAS & RANGOS */}
        <div className="card pad" style={{ marginBottom: 30, borderLeft: "5px solid #059669" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#047857", marginBottom: 14 }}>
            5. ESPECIFICACIONES METROLÓGICAS & RANGOS DE ENSAYO
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Capacidad Máx (Max) *</label>
              <input
                type="number"
                step="any"
                required
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(Number(e.target.value))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: 800, fontSize: "0.95rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Carga máxima de uso (ensayo de campo)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={maximumOperationalLoad}
                onChange={(e) => setMaximumOperationalLoad(Number(e.target.value))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: 800, fontSize: "0.95rem" }}
              />
              <small style={{ display: "block", marginTop: 5, color: "#64748b", lineHeight: 1.35 }}>No modifica el Max metrológico. Se usa para sugerir 50 % y 100 % de fidelidad y siempre puede ajustarse por servicio.</small>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Capacidad Mín (Min) *</label>
              <input
                type="number"
                step="any"
                required
                value={minCapacity}
                onChange={(e) => setMinCapacity(Number(e.target.value))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: 800, fontSize: "0.95rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>División Real (d) *</label>
              <input
                type="number"
                step="any"
                required
                value={divisionD}
                onChange={(e) => setDivisionD(Number(e.target.value))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.95rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Intervalo Verificación (e) *</label>
              <input
                type="number"
                step="any"
                required
                value={verificationIntervalE}
                onChange={(e) => setVerificationIntervalE(Number(e.target.value))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.95rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Unidad de Medida</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="kg">kg (Kilogramos)</option>
                <option value="t">t (Toneladas)</option>
                <option value="g">g (Gramos)</option>
                <option value="lb">lb (Libras)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Clase de Exactitud</label>
              <select
                value={accuracyClass}
                onChange={(e) => setAccuracyClass(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="I">Clase I (Especial / Analítica)</option>
                <option value="II">Clase II (Fina / Precisión)</option>
                <option value="III">Clase III (Media / Camionera / Comercial)</option>
                <option value="IIII">Clase IIII (Ordinaria / Viales)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Cantidad Celdas de Carga</label>
              <input
                type="number"
                step="1"
                min="0"
                value={loadCellsCount}
                onChange={(e) => setLoadCellsCount(parseInt(e.target.value) || 0)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Estado Operativo</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Active">✓ Activo / Operativo</option>
                <option value="UnderMaintenance">En Mantenimiento</option>
                <option value="Decommissioned">Fuera de Servicio</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Notas Técnicas y Observaciones</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Historial de reparaciones, precintos, marcas de verificación..."
              style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
            />
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
            padding: "16px 24px",
            borderRadius: 10,
            border: "1px solid #e2e8f0"
          }}
        >
          <Link to="/metrologia/equipos" className="btn ghost" style={{ padding: "9px 20px" }}>
            ← Cancelar y Volver
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn"
            style={{ background: "#0d9488", color: "#fff", fontWeight: 800, padding: "10px 28px", fontSize: "0.95rem", minWidth: 200 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Instrumento"}
          </button>
        </div>
      </form>
    </div>
  );
}
