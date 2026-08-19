import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { BcraCreditReportModal } from "../components/BcraCreditReportModal";
import { provinces, type CustomerWrite, type EquipmentWrite } from "../api/types";
import { digitsOnly, formatCuitDisplay, isValidCuitChecksum } from "../lib/arContact";

const emptyCustomer: CustomerWrite = {
  legalName: "",
  tradeName: "",
  documentType: "Cuit",
  documentNumber: "",
  taxCondition: "ResponsableInscripto",
  iibbRegime: "ConvenioMultilateral",
  isCustomer: true,
  isSupplier: false,
  email: "",
  phone: "",
  whatsApp: "",
  fiscalStreet: "",
  fiscalCity: "",
  fiscalProvince: "SantaFe",
  fiscalPostalCode: "",
  notes: "",
  creditRating: null,
  bcraWorstSituation: null,
  bcraTotalDebt: null,
  bcraRejectedChequesCount: null,
  creditRecommendation: null
};

interface DraftLocation {
  tempId: string;
  name: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  phone?: string;
  notes?: string;
}

interface DraftContact {
  tempId: string;
  name: string;
  role: string;
  locationTempId?: string;
  email?: string;
  phone?: string;
  whatsApp?: string;
  isPrimary: boolean;
  notes?: string;
}

interface DraftEquipment {
  tempId: string;
  internalCode: string;
  equipmentType: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  maxCapacity?: string;
  divisionScale?: string;
  locationTempId?: string;
  status?: string;
  lastCalibrationDate?: string;
  calibrationIntervalMonths?: number;
  notes?: string;
  customAttributes: Record<string, string>;
}

export function CustomerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const locationState = useLocation();
  const queryParams = new URLSearchParams(locationState.search);
  const isSupplierMode = queryParams.get("type") === "supplier" || locationState.pathname.includes("/proveedores");
  const initialCuit = queryParams.get("cuit") || "";
  const initialName = queryParams.get("name") || "";
  const returnUrl = queryParams.get("returnUrl") || "";

  const [showBcraModal, setShowBcraModal] = useState(false);
  const [model, setModel] = useState<CustomerWrite>(() => ({
    ...emptyCustomer,
    isSupplier: isSupplierMode,
    isCustomer: !isSupplierMode,
    documentNumber: initialCuit ? formatCuitDisplay(initialCuit) : "",
    legalName: initialName || "",
    tradeName: initialName || ""
  }));
  const [tab, setTab] = useState<"general" | "plantas" | "contactos" | "equipos">("general");

  useEffect(() => {
    if (!id) {
      setModel((prev) => ({
        ...prev,
        isSupplier: isSupplierMode ? true : prev.isSupplier,
        isCustomer: isSupplierMode ? false : prev.isCustomer,
        documentNumber: initialCuit ? formatCuitDisplay(initialCuit) : prev.documentNumber,
        legalName: initialName || prev.legalName,
        tradeName: initialName || prev.tradeName
      }));
    }
  }, [id, isSupplierMode, initialCuit, initialName]);

  const [locations, setLocations] = useState<DraftLocation[]>([]);
  const [contacts, setContacts] = useState<DraftContact[]>([]);
  const [equipments, setEquipments] = useState<DraftEquipment[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [arcaSuccessMsg, setArcaSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [consultingArca, setConsultingArca] = useState(false);

  // Sub-form inputs & Editing tempIds
  const [editingLocTempId, setEditingLocTempId] = useState<string | null>(null);
  const [newLoc, setNewLoc] = useState<Omit<DraftLocation, "tempId">>({
    name: "",
    street: "",
    city: "",
    province: "SantaFe",
    postalCode: "",
    phone: "",
    notes: ""
  });
  const [showLocForm, setShowLocForm] = useState(false);

  const [editingConTempId, setEditingConTempId] = useState<string | null>(null);
  const [newContact, setNewContact] = useState<Omit<DraftContact, "tempId">>({
    name: "",
    role: "Commercial",
    locationTempId: "",
    email: "",
    phone: "",
    whatsApp: "",
    isPrimary: false,
    notes: ""
  });
  const [showContactForm, setShowContactForm] = useState(false);

  const [newEq, setNewEq] = useState<Omit<DraftEquipment, "tempId">>({
    internalCode: "",
    equipmentType: "Báscula de Camiones",
    brand: "",
    model: "",
    serialNumber: "",
    maxCapacity: "",
    divisionScale: "",
    locationTempId: "",
    status: "Activo",
    notes: "",
    customAttributes: {}
  });
  const [showEqForm, setShowEqForm] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getCustomer(id).then((c) => {
      setModel({
        legalName: c.legalName,
        tradeName: c.tradeName ?? "",
        documentType: c.documentType,
        documentNumber: c.documentNumber,
        taxCondition: c.taxCondition,
        iibbRegime: c.iibbRegime ?? "ConvenioMultilateral",
        isCustomer: c.isCustomer,
        isSupplier: c.isSupplier,
        email: c.email ?? "",
        phone: c.phone ?? "",
        whatsApp: c.whatsApp ?? "",
        fiscalStreet: c.fiscalAddress?.street ?? "",
        fiscalCity: c.fiscalAddress?.city ?? "",
        fiscalProvince: c.fiscalAddress?.province ?? "SantaFe",
        fiscalPostalCode: c.fiscalAddress?.postalCode ?? "",
        creditLimit: c.creditLimit ?? undefined,
        paymentTermsDays: c.paymentTermsDays ?? undefined,
        notes: c.notes ?? "",
        creditRating: c.creditRating,
        bcraWorstSituation: c.bcraWorstSituation,
        bcraTotalDebt: c.bcraTotalDebt,
        bcraRejectedChequesCount: c.bcraRejectedChequesCount,
        creditRecommendation: c.creditRecommendation
      });

      setLocations((c.locations || []).map((l) => ({
        tempId: l.id,
        name: l.name,
        street: l.address.street,
        city: l.address.city,
        province: l.address.province,
        postalCode: l.address.postalCode,
        phone: l.phone ?? "",
        notes: l.notes ?? ""
      })));

      setContacts((c.contacts || []).map((ct) => ({
        tempId: ct.id,
        name: ct.name,
        role: ct.role,
        locationTempId: ct.locationId ?? "",
        email: ct.email ?? "",
        phone: ct.phone ?? "",
        whatsApp: ct.whatsApp ?? "",
        isPrimary: ct.isPrimary,
        notes: ct.notes ?? ""
      })));

      setEquipments((c.equipments || []).map((eq) => ({
        tempId: eq.id,
        internalCode: eq.internalCode,
        equipmentType: eq.equipmentType,
        brand: eq.brand ?? "",
        model: eq.model ?? "",
        serialNumber: eq.serialNumber ?? "",
        maxCapacity: eq.maxCapacity ?? "",
        divisionScale: eq.divisionScale ?? "",
        locationTempId: eq.locationId ?? "",
        status: eq.status ?? "Activo",
        notes: eq.notes ?? "",
        customAttributes: eq.customAttributes || {}
      })));
    });
  }, [id]);

  const cuitHint = useMemo(() => {
    if (model.documentType !== "Cuit") return null;
    const clean = digitsOnly(model.documentNumber);
    if (!clean) return null;
    if (clean.length !== 11) return "El CUIT debe tener 11 dígitos.";
    if (!isValidCuitChecksum(clean)) return "Dígito verificador de CUIT inválido.";
    return "✓ CUIT válido para consulta ARCA";
  }, [model.documentType, model.documentNumber]);

  const set = (field: keyof CustomerWrite, val: unknown) => {
    setModel((m) => ({ ...m, [field]: val }));
  };

  const handleConsultArca = async () => {
    const cleanCuit = digitsOnly(model.documentNumber);
    if (cleanCuit.length !== 11) {
      setError("Ingresá un CUIT válido de 11 dígitos para consultar en ARCA.");
      return;
    }

    setConsultingArca(true);
    setError(null);
    setArcaSuccessMsg(null);
    try {
      const res = await api.consultArcaCuit(cleanCuit);
      setModel((m) => ({
        ...m,
        documentNumber: cleanCuit,
        legalName: res.legalName,
        tradeName: res.tradeName || m.tradeName,
        taxCondition: res.taxCondition || m.taxCondition,
        fiscalStreet: res.fiscalStreet || m.fiscalStreet,
        fiscalCity: res.fiscalCity || m.fiscalCity,
        fiscalProvince: res.fiscalProvince || m.fiscalProvince,
        fiscalPostalCode: res.fiscalPostalCode || m.fiscalPostalCode
      }));
      setArcaSuccessMsg(`✓ Datos fiscales e impositivos importados desde ARCA para ${res.legalName}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConsultingArca(false);
    }
  };

  // Plantas Handlers
  const handleStartEditLocation = (loc: DraftLocation) => {
    setEditingLocTempId(loc.tempId);
    setNewLoc({
      name: loc.name,
      street: loc.street,
      city: loc.city,
      province: loc.province,
      postalCode: loc.postalCode,
      phone: loc.phone ?? "",
      notes: loc.notes ?? ""
    });
    setShowLocForm(true);
  };

  const handleAddOrUpdateLocation = async (e: FormEvent) => {
    e.preventDefault();
    if (!newLoc.name || !newLoc.street) {
      setError("El nombre de la planta y la calle son obligatorios.");
      return;
    }

    if (id && editingLocTempId && !editingLocTempId.startsWith("loc_")) {
      try {
        const updated = await api.updateLocation(id, editingLocTempId, {
          name: newLoc.name,
          street: newLoc.street,
          city: newLoc.city || "San Lorenzo",
          province: newLoc.province,
          postalCode: newLoc.postalCode || "2200",
          phone: newLoc.phone || undefined,
          notes: newLoc.notes || undefined
        });
        setLocations((updated.locations || []).map((l) => ({
          tempId: l.id,
          name: l.name,
          street: l.address.street,
          city: l.address.city,
          province: l.address.province,
          postalCode: l.address.postalCode,
          phone: l.phone ?? "",
          notes: l.notes ?? ""
        })));
      } catch (err) {
        setError("Error al actualizar planta: " + (err as Error).message);
        return;
      }
    } else if (editingLocTempId) {
      setLocations((prev) =>
        prev.map((l) => (l.tempId === editingLocTempId ? { ...newLoc, tempId: editingLocTempId } : l))
      );
    } else if (id) {
      try {
        const updated = await api.addLocation(id, {
          name: newLoc.name,
          street: newLoc.street,
          city: newLoc.city || "San Lorenzo",
          province: newLoc.province,
          postalCode: newLoc.postalCode || "2200",
          phone: newLoc.phone || undefined,
          notes: newLoc.notes || undefined
        });
        setLocations((updated.locations || []).map((l) => ({
          tempId: l.id,
          name: l.name,
          street: l.address.street,
          city: l.address.city,
          province: l.address.province,
          postalCode: l.address.postalCode,
          phone: l.phone ?? "",
          notes: l.notes ?? ""
        })));
      } catch (err) {
        setError("Error al crear planta: " + (err as Error).message);
        return;
      }
    } else {
      setLocations((prev) => [...prev, { ...newLoc, tempId: `loc_${Date.now()}` }]);
    }

    setNewLoc({ name: "", street: "", city: "", province: "SantaFe", postalCode: "", phone: "", notes: "" });
    setEditingLocTempId(null);
    setShowLocForm(false);
  };

  const handleRemoveLocation = async (tempId: string) => {
    if (id && !tempId.startsWith("loc_")) {
      if (confirm("¿Estás seguro de eliminar esta planta?")) {
        try {
          const updated = await api.deleteLocation(id, tempId);
          setLocations((updated.locations || []).map((l) => ({
            tempId: l.id,
            name: l.name,
            street: l.address.street,
            city: l.address.city,
            province: l.address.province,
            postalCode: l.address.postalCode,
            phone: l.phone ?? "",
            notes: l.notes ?? ""
          })));
        } catch (err) {
          setError("Error al eliminar planta: " + (err as Error).message);
        }
      }
    } else {
      setLocations((prev) => prev.filter((l) => l.tempId !== tempId));
    }
  };

  // Contactos Handlers
  const handleStartEditContact = (c: DraftContact) => {
    setEditingConTempId(c.tempId);
    setNewContact({
      name: c.name,
      role: c.role,
      locationTempId: c.locationTempId ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      whatsApp: c.whatsApp ?? "",
      isPrimary: c.isPrimary,
      notes: c.notes ?? ""
    });
    setShowContactForm(true);
  };

  const handleAddOrUpdateContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!newContact.name) {
      setError("El nombre del contacto es obligatorio.");
      return;
    }

    if (id && editingConTempId && !editingConTempId.startsWith("con_")) {
      try {
        const updated = await api.updateContact(id, editingConTempId, {
          name: newContact.name,
          role: newContact.role,
          locationId: newContact.locationTempId || null,
          email: newContact.email || undefined,
          phone: newContact.phone || undefined,
          whatsApp: newContact.whatsApp || undefined,
          isPrimary: newContact.isPrimary,
          notes: newContact.notes || undefined
        });
        setContacts((updated.contacts || []).map((ct) => ({
          tempId: ct.id,
          name: ct.name,
          role: ct.role,
          locationTempId: ct.locationId ?? "",
          email: ct.email ?? "",
          phone: ct.phone ?? "",
          whatsApp: ct.whatsApp ?? "",
          isPrimary: ct.isPrimary,
          notes: ct.notes ?? ""
        })));
      } catch (err) {
        setError("Error al actualizar contacto: " + (err as Error).message);
        return;
      }
    } else if (editingConTempId) {
      setContacts((prev) =>
        prev.map((c) => (c.tempId === editingConTempId ? { ...newContact, tempId: editingConTempId } : c))
      );
    } else if (id) {
      try {
        const updated = await api.addContact(id, {
          name: newContact.name,
          role: newContact.role,
          locationId: newContact.locationTempId || null,
          email: newContact.email || undefined,
          phone: newContact.phone || undefined,
          whatsApp: newContact.whatsApp || undefined,
          isPrimary: newContact.isPrimary,
          notes: newContact.notes || undefined
        });
        setContacts((updated.contacts || []).map((ct) => ({
          tempId: ct.id,
          name: ct.name,
          role: ct.role,
          locationTempId: ct.locationId ?? "",
          email: ct.email ?? "",
          phone: ct.phone ?? "",
          whatsApp: ct.whatsApp ?? "",
          isPrimary: ct.isPrimary,
          notes: ct.notes ?? ""
        })));
      } catch (err) {
        setError("Error al agregar contacto: " + (err as Error).message);
        return;
      }
    } else {
      setContacts((prev) => [...prev, { ...newContact, tempId: `con_${Date.now()}` }]);
    }

    setNewContact({
      name: "",
      role: "Commercial",
      locationTempId: "",
      email: "",
      phone: "",
      whatsApp: "",
      isPrimary: false,
      notes: ""
    });
    setEditingConTempId(null);
    setShowContactForm(false);
  };

  const handleRemoveContact = async (tempId: string) => {
    if (id && !tempId.startsWith("con_")) {
      if (confirm("¿Estás seguro de eliminar este contacto?")) {
        try {
          const updated = await api.deleteContact(id, tempId);
          setContacts((updated.contacts || []).map((ct) => ({
            tempId: ct.id,
            name: ct.name,
            role: ct.role,
            locationTempId: ct.locationId ?? "",
            email: ct.email ?? "",
            phone: ct.phone ?? "",
            whatsApp: ct.whatsApp ?? "",
            isPrimary: ct.isPrimary,
            notes: ct.notes ?? ""
          })));
        } catch (err) {
          setError("Error al eliminar contacto: " + (err as Error).message);
        }
      }
    } else {
      setContacts((prev) => prev.filter((c) => c.tempId !== tempId));
    }
  };

  // Equipos Handlers
  const handleAddEquipment = (e: FormEvent) => {
    e.preventDefault();
    if (!newEq.internalCode) {
      setError("El código interno del equipo es obligatorio.");
      return;
    }
    setEquipments((prev) => [...prev, { ...newEq, tempId: `eq_${Date.now()}` }]);
    setNewEq({
      internalCode: "",
      equipmentType: "Báscula de Camiones",
      brand: "",
      model: "",
      serialNumber: "",
      maxCapacity: "",
      divisionScale: "",
      locationTempId: "",
      status: "Activo",
      notes: "",
      customAttributes: {}
    });
    setShowEqForm(false);
  };

  const handleRemoveEquipment = (tempId: string) => {
    setEquipments((prev) => prev.filter((e) => e.tempId !== tempId));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      let custId = id;
      if (id) {
        await api.updateCustomer(id, model);
      } else {
        const created = await api.createCustomer(model);
        custId = created.id;

        // Persist local locations first to map GUIDs
        const realLocationMap: Record<string, string> = {};
        for (const loc of locations) {
          const createdLoc = await api.addLocation(custId, {
            name: loc.name,
            street: loc.street,
            city: loc.city || "San Lorenzo",
            province: loc.province,
            postalCode: loc.postalCode || "2200",
            phone: loc.phone || undefined,
            notes: loc.notes || undefined
          });
          const lastLoc = createdLoc.locations[createdLoc.locations.length - 1];
          if (lastLoc) {
            realLocationMap[loc.tempId] = lastLoc.id;
          }
        }

        // Persist local contacts with mapped real location IDs
        for (const con of contacts) {
          const realLocId = con.locationTempId ? realLocationMap[con.locationTempId] : null;
          await api.addContact(custId, {
            name: con.name,
            role: con.role,
            locationId: realLocId || null,
            email: con.email || undefined,
            phone: con.phone || undefined,
            whatsApp: con.whatsApp || undefined,
            isPrimary: con.isPrimary,
            notes: con.notes || undefined
          });
        }

        // Persist local equipments with mapped real location IDs
        for (const eq of equipments) {
          const realLocId = eq.locationTempId ? realLocationMap[eq.locationTempId] : null;
          await api.addEquipment(custId, {
            internalCode: eq.internalCode,
            equipmentType: eq.equipmentType,
            brand: eq.brand || undefined,
            model: eq.model || undefined,
            serialNumber: eq.serialNumber || undefined,
            maxCapacity: eq.maxCapacity || undefined,
            divisionScale: eq.divisionScale || undefined,
            locationId: realLocId || null,
            status: eq.status || "Activo",
            notes: eq.notes || undefined,
            customAttributes: eq.customAttributes
          });
        }
      }

      if (returnUrl) {
        navigate(returnUrl);
      } else if (isSupplierMode) {
        navigate(custId ? `/clientes/${custId}?type=supplier` : "/proveedores");
      } else {
        navigate(custId ? `/clientes/${custId}` : "/clientes");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{id ? "Editar Cliente / Proveedor" : "Nuevo Cliente / Proveedor"}</h1>
          <p className="muted">Ficha completa de registro comercial, plantas, contactos y parque de equipos</p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {arcaSuccessMsg && <div className="alert ok" style={{ background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46", marginBottom: 16 }}>{arcaSuccessMsg}</div>}

      <form onSubmit={submit} className="stack" style={{ gap: 20 }}>
        <div className="tab-row">
          <button type="button" className={`tab-btn ${tab === "general" ? "active" : ""}`} onClick={() => setTab("general")}>
            General y Fiscal
          </button>
          <button type="button" className={`tab-btn ${tab === "plantas" ? "active" : ""}`} onClick={() => setTab("plantas")}>
            Plantas ({locations.length})
          </button>
          <button type="button" className={`tab-btn ${tab === "contactos" ? "active" : ""}`} onClick={() => setTab("contactos")}>
            Contactos ({contacts.length})
          </button>
          <button type="button" className={`tab-btn ${tab === "equipos" ? "active" : ""}`} onClick={() => setTab("equipos")}>
            Parque de Equipos ({equipments.length})
          </button>
        </div>

        {tab === "general" && (
          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <div className="grid-2">
              <label>Razón social *<input required value={model.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Ej. Acme Industrias S.A." /></label>
              <label>Nombre de fantasía<input value={model.tradeName ?? ""} onChange={(e) => set("tradeName", e.target.value)} placeholder="Opcional" /></label>
            </div>
            <div className="grid-3">
              <label>Tipo
                <select value={model.documentType} onChange={(e) => set("documentType", e.target.value)}>
                  <option value="Cuit">Cuit</option>
                  <option value="Dni">Dni</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="Cdi">Cdi</option>
                </select>
              </label>
              <label>Número
                <div className="row" style={{ gap: 8 }}>
                  <input
                    required
                    value={model.documentType === "Cuit" ? formatCuitDisplay(model.documentNumber) : model.documentNumber}
                    onChange={(e) => set("documentNumber", e.target.value)}
                    placeholder="30-00000000-0"
                  />
                  {model.documentType === "Cuit" && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        disabled={consultingArca}
                        onClick={handleConsultArca}
                        title="Consultar padrón impositivo oficial en ARCA / AFIP"
                        style={{ whiteSpace: "nowrap", padding: "0 12px", background: "linear-gradient(180deg, #2563eb, #1d4ed8)", color: "#fff" }}
                      >
                        {consultingArca ? "🔍 ARCA…" : "🔍 ARCA"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setShowBcraModal(true)}
                        title="Consultar Central de Deudores y Calificación Crediticia en BCRA"
                        style={{ whiteSpace: "nowrap", padding: "0 12px", background: "linear-gradient(180deg, #0f172a, #334155)", color: "#fff" }}
                      >
                        🏛️ BCRA
                      </button>
                    </>
                  )}
                </div>
                {cuitHint && <span className="muted" style={{ fontSize: "0.78rem" }}>{cuitHint}</span>}
              </label>
              <label>Condición IVA
                <select value={model.taxCondition} onChange={(e) => set("taxCondition", e.target.value)}>
                  <option value="ResponsableInscripto">Responsable Inscripto</option>
                  <option value="Monotributo">Monotributo</option>
                  <option value="Exento">Exento</option>
                  <option value="ConsumidorFinal">Consumidor Final</option>
                </select>
              </label>
            </div>

            {/* BCRA Status Box in Form */}
            {model.creditRating && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                background: model.creditRating === "A" ? "#ecfdf5" : model.creditRating === "B" ? "#fefce8" : model.creditRating === "C" ? "#fff7ed" : "#fef2f2",
                border: `1px solid ${model.creditRating === "A" ? "#10b981" : model.creditRating === "B" ? "#eab308" : model.creditRating === "C" ? "#f97316" : "#ef4444"}`
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.2rem" }}>
                    {model.creditRating === "A" ? "🟢" : model.creditRating === "B" ? "🟡" : model.creditRating === "C" ? "🟠" : "🔴"}
                  </span>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>
                      Calificación Crediticia BCRA: {model.creditRating} (Situación {model.bcraWorstSituation || 1})
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                      {model.creditRecommendation || "Sin observaciones adicionales."}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBcraModal(true)}
                  className="btn btn-outline"
                  style={{ fontSize: "0.75rem", padding: "4px 10px", background: "#ffffff" }}
                >
                  Ver Detalle BCRA
                </button>
              </div>
            )}
            <div className="grid-3">
              <label>IIBB
                <select value={model.iibbRegime} onChange={(e) => set("iibbRegime", e.target.value)}>
                  <option value="ConvenioMultilateral">Convenio Multilateral</option>
                  <option value="Local">Local</option>
                  <option value="Exento">Exento</option>
                </select>
              </label>
              <label>Email<input type="email" value={model.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="compras@empresa.com" /></label>
              <label>Teléfono<input value={model.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="3415551234" /><span className="muted" style={{ fontSize: "0.75rem" }}>Solo dígitos; se normaliza al guardar.</span></label>
            </div>
            <div className="grid-2">
              <label>WhatsApp<input value={model.whatsApp ?? ""} onChange={(e) => set("whatsApp", e.target.value)} placeholder="5493415551234 o 3415551234" /><span className="muted" style={{ fontSize: "0.75rem" }}>Con este número vas a poder abrir chat profesional desde la ficha.</span></label>
              <label>Calle fiscal<input value={model.fiscalStreet ?? ""} onChange={(e) => set("fiscalStreet", e.target.value)} placeholder="San Martin 1234" /></label>
            </div>
            <div className="grid-3">
              <label>Ciudad<input value={model.fiscalCity ?? ""} onChange={(e) => set("fiscalCity", e.target.value)} /></label>
              <label>Provincia
                <select value={model.fiscalProvince ?? "SantaFe"} onChange={(e) => set("fiscalProvince", e.target.value)}>
                  {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label>CP<input value={model.fiscalPostalCode ?? ""} onChange={(e) => set("fiscalPostalCode", e.target.value)} /></label>
            </div>
            <div className="grid-3">
              <label>Límite de crédito<input type="number" step="0.01" value={model.creditLimit ?? ""} onChange={(e) => set("creditLimit", Number(e.target.value))} /></label>
              <label>Plazo (días)<input type="number" value={model.paymentTermsDays ?? ""} onChange={(e) => set("paymentTermsDays", Number(e.target.value))} /></label>
              <label>Roles
                <div className="row" style={{ gap: 16, height: 40 }}>
                  <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={model.isCustomer} onChange={(e) => set("isCustomer", e.target.checked)} /> Cliente</label>
                  <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={model.isSupplier} onChange={(e) => set("isSupplier", e.target.checked)} /> Proveedor</label>
                </div>
              </label>
            </div>
            <label>Notas u Observaciones
              <textarea rows={3} value={model.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Detalles de facturación..." />
            </label>
          </div>
        )}

        {tab === "plantas" && (
          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3>Plantas y Sucursales de Entrega</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditingLocTempId(null);
                  setNewLoc({ name: "", street: "", city: "", province: "SantaFe", postalCode: "", phone: "", notes: "" });
                  setShowLocForm(true);
                }}
              >
                + Agregar Planta
              </button>
            </div>

            {showLocForm && (
              <div className="card pad" style={{ background: "#f8fafc", border: "1px solid var(--line)" }}>
                <h4>{editingLocTempId ? "Editar Planta" : "Nueva Planta"}</h4>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <label>Nombre de Planta *<input required value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} placeholder="Ej. Planta Puerto" /></label>
                  <label>Calle y Altura *<input required value={newLoc.street} onChange={(e) => setNewLoc({ ...newLoc, street: e.target.value })} placeholder="Ej. Av. Industrial 1200" /></label>
                </div>
                <div className="grid-3" style={{ marginTop: 12 }}>
                  <label>Ciudad<input value={newLoc.city} onChange={(e) => setNewLoc({ ...newLoc, city: e.target.value })} placeholder="San Lorenzo" /></label>
                  <label>Provincia
                    <select value={newLoc.province} onChange={(e) => setNewLoc({ ...newLoc, province: e.target.value })}>
                      {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label>CP<input value={newLoc.postalCode} onChange={(e) => setNewLoc({ ...newLoc, postalCode: e.target.value })} placeholder="2200" /></label>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn ghost" onClick={() => setShowLocForm(false)}>Cancelar</button>
                  <button type="button" className="btn" onClick={handleAddOrUpdateLocation}>
                    {editingLocTempId ? "Guardar Cambios" : "Confirmar Planta"}
                  </button>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre Planta</th>
                    <th>Dirección / Ubicación</th>
                    <th>Teléfono</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc) => (
                    <tr key={loc.tempId}>
                      <td><strong>📌 {loc.name}</strong></td>
                      <td>{loc.street}, {loc.city} ({loc.province})</td>
                      <td>{loc.phone || "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <button type="button" className="btn ghost" style={{ padding: "4px 8px" }} onClick={() => handleStartEditLocation(loc)}>✏️</button>
                          <button type="button" className="btn danger" style={{ padding: "4px 8px" }} onClick={() => handleRemoveLocation(loc.tempId)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        No hay plantas registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "contactos" && (
          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3>Contactos Directos y Vinculación a Planta</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditingConTempId(null);
                  setNewContact({ name: "", role: "Commercial", locationTempId: "", email: "", phone: "", whatsApp: "", isPrimary: false, notes: "" });
                  setShowContactForm(true);
                }}
              >
                + Agregar Contacto
              </button>
            </div>

            {showContactForm && (
              <div className="card pad" style={{ background: "#f8fafc", border: "1px solid var(--line)" }}>
                <h4>{editingConTempId ? "Editar Contacto" : "Nuevo Contacto"}</h4>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <label>Nombre y Apellido *<input required value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} placeholder="Juan Pérez" /></label>
                  <label>Rol / Función
                    <select value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}>
                      <option value="Commercial">Comercial / Compras</option>
                      <option value="Technical">Técnico / Mantenimiento</option>
                      <option value="Administrative">Administración / Pagos</option>
                    </select>
                  </label>
                </div>
                <div className="grid-3" style={{ marginTop: 12 }}>
                  <label>Vincular a Planta / Sucursal
                    <select value={newContact.locationTempId} onChange={(e) => setNewContact({ ...newContact, locationTempId: e.target.value })}>
                      <option value="">(Planta Central / General)</option>
                      {locations.map((l) => (
                        <option key={l.tempId} value={l.tempId}>📌 {l.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Email<input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} placeholder="juan@empresa.com" /></label>
                  <label>Teléfono / Celular<input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} placeholder="3415550000" /></label>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn ghost" onClick={() => setShowContactForm(false)}>Cancelar</button>
                  <button type="button" className="btn" onClick={handleAddOrUpdateContact}>
                    {editingConTempId ? "Guardar Cambios" : "Confirmar Contacto"}
                  </button>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre Contacto</th>
                    <th>Rol</th>
                    <th>Planta Vinculada</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => {
                    const loc = locations.find((l) => l.tempId === c.locationTempId);
                    return (
                      <tr key={c.tempId}>
                        <td><strong>👤 {c.name}</strong></td>
                        <td>{c.role}</td>
                        <td>{loc ? <span className="badge ok">📌 {loc.name}</span> : <span className="muted">General</span>}</td>
                        <td>{c.email || "—"}</td>
                        <td>{c.phone || "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                            <button type="button" className="btn ghost" style={{ padding: "4px 8px" }} onClick={() => handleStartEditContact(c)}>✏️</button>
                            <button type="button" className="btn danger" style={{ padding: "4px 8px" }} onClick={() => handleRemoveContact(c.tempId)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {contacts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        No hay contactos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "equipos" && (
          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3>Parque de Equipos de Metrología e Industria</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowEqForm(true)}
              >
                + Agregar Equipo
              </button>
            </div>

            {showEqForm && (
              <div className="card pad" style={{ background: "#f8fafc", border: "1px solid var(--line)" }}>
                <h4>Nuevo Equipo Registrado</h4>
                <div className="grid-3" style={{ marginTop: 12 }}>
                  <label>Código Interno / TAG *<input required value={newEq.internalCode} onChange={(e) => setNewEq({ ...newEq, internalCode: e.target.value })} placeholder="EQ-001" /></label>
                  <label>Tipo de Equipo<input value={newEq.equipmentType} onChange={(e) => setNewEq({ ...newEq, equipmentType: e.target.value })} placeholder="Báscula Camionera" /></label>
                  <label>Marca / Modelo<input value={newEq.brand} onChange={(e) => setNewEq({ ...newEq, brand: e.target.value })} placeholder="LLEIDA / Systel" /></label>
                </div>
                <div className="grid-3" style={{ marginTop: 12 }}>
                  <label>Capacidad Máxima<input value={newEq.maxCapacity} onChange={(e) => setNewEq({ ...newEq, maxCapacity: e.target.value })} placeholder="80 Tn" /></label>
                  <label>División de Escala (e)<input value={newEq.divisionScale} onChange={(e) => setNewEq({ ...newEq, divisionScale: e.target.value })} placeholder="10 kg" /></label>
                  <label>Planta Asignada
                    <select value={newEq.locationTempId} onChange={(e) => setNewEq({ ...newEq, locationTempId: e.target.value })}>
                      <option value="">(Planta Central)</option>
                      {locations.map((l) => (
                        <option key={l.tempId} value={l.tempId}>📌 {l.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn ghost" onClick={() => setShowEqForm(false)}>Cancelar</button>
                  <button type="button" className="btn" onClick={handleAddEquipment}>Agregar Equipo</button>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código / TAG</th>
                    <th>Tipo</th>
                    <th>Marca / Modelo</th>
                    <th>Capacidad</th>
                    <th>Planta</th>
                    <th style={{ textAlign: "right" }}>Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {equipments.map((eq) => {
                    const loc = locations.find((l) => l.tempId === eq.locationTempId);
                    return (
                      <tr key={eq.tempId}>
                        <td><strong>⚖️ {eq.internalCode}</strong></td>
                        <td>{eq.equipmentType}</td>
                        <td>{eq.brand} {eq.model}</td>
                        <td>{eq.maxCapacity || "—"}</td>
                        <td>{loc ? `📌 ${loc.name}` : "Central"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" className="btn danger" style={{ padding: "4px 8px" }} onClick={() => handleRemoveEquipment(eq.tempId)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                  {equipments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        No hay equipos en el parque técnico.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 12 }}>
          <button type="button" className="btn ghost" onClick={() => navigate(returnUrl || (isSupplierMode ? "/proveedores" : "/clientes"))}>
            Cancelar
          </button>
          <button className="btn" disabled={saving}>
            {id ? "Guardar Cambios" : "Crear Cliente"}
          </button>
        </div>
      </form>

      {/* BCRA Credit Report Modal */}
      <BcraCreditReportModal
        isOpen={showBcraModal}
        cuit={model.documentNumber}
        customerId={id}
        customerName={model.legalName}
        onSavedToCustomer={() => {
          if (id) {
            api.getCustomer(id).then((c) => {
              setModel((m) => ({
                ...m,
                creditRating: c.creditRating,
                bcraWorstSituation: c.bcraWorstSituation,
                bcraTotalDebt: c.bcraTotalDebt,
                bcraRejectedChequesCount: c.bcraRejectedChequesCount,
                creditRecommendation: c.creditRecommendation
              }));
            });
          }
        }}
        onApplyReport={(r) => {
          setModel((m) => ({
            ...m,
            creditRating: r.creditRating,
            bcraWorstSituation: r.worstSituation,
            bcraTotalDebt: r.totalDebtPesos,
            bcraRejectedChequesCount: r.rejectedChequesCount,
            creditRecommendation: r.commercialRecommendation
          }));
        }}
        onClose={() => setShowBcraModal(false)}
      />
    </>
  );
}
