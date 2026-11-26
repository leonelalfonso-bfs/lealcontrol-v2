import React, { useState, useEffect, FormEvent } from "react";
import { api } from "../api/client";
import { provinceLabel, provinces, type CustomerDetail, type CustomerWrite } from "../api/types";
import { digitsOnly, formatCuitDisplay, isValidCuitChecksum } from "../lib/arContact";

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
  email?: string;
  phone?: string;
  whatsApp?: string;
  isPrimary: boolean;
  notes?: string;
}

interface QuickCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: CustomerDetail, defaultLocationId?: string, defaultContactId?: string) => void;
  mode?: "customer" | "supplier";
  initialName?: string;
  initialCuit?: string;
}

export const QuickCustomerModal: React.FC<QuickCustomerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  mode = "customer",
  initialName = "",
  initialCuit = ""
}) => {
  const isSupplier = mode === "supplier";

  const [activeTab, setActiveTab] = useState<"general" | "locations" | "contacts">("general");
  const [saving, setSaving] = useState(false);
  const [consultingArca, setConsultingArca] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General Form
  const [legalName, setLegalName] = useState(initialName);
  const [tradeName, setTradeName] = useState(initialName);
  const [documentType, setDocumentType] = useState<CustomerWrite["documentType"]>("Cuit");
  const [documentNumber, setDocumentNumber] = useState(initialCuit ? formatCuitDisplay(initialCuit) : "");
  const [taxCondition, setTaxCondition] = useState<CustomerWrite["taxCondition"]>("ResponsableInscripto");
  const [iibbRegime, setIibbRegime] = useState<CustomerWrite["iibbRegime"]>("ConvenioMultilateral");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [fiscalStreet, setFiscalStreet] = useState("");
  const [fiscalCity, setFiscalCity] = useState("");
  const [fiscalProvince, setFiscalProvince] = useState<string>("SantaFe");
  const [fiscalPostalCode, setFiscalPostalCode] = useState("");
  const [notes, setNotes] = useState("");

  // Draft Plants / Locations
  const [locations, setLocations] = useState<DraftLocation[]>([]);
  const [newLocName, setNewLocName] = useState("");
  const [newLocStreet, setNewLocStreet] = useState("");
  const [newLocCity, setNewLocCity] = useState("");
  const [newLocProvince, setNewLocProvince] = useState<string>("SantaFe");

  // Draft Contacts
  const [contacts, setContacts] = useState<DraftContact[]>([]);
  const [newConName, setNewConName] = useState("");
  const [newConRole, setNewConRole] = useState("Commercial");
  const [newConEmail, setNewConEmail] = useState("");
  const [newConPhone, setNewConPhone] = useState("");
  const [newConWhatsApp, setNewConWhatsApp] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLegalName(initialName);
      setTradeName(initialName);
      setDocumentNumber(initialCuit ? formatCuitDisplay(initialCuit) : "");
      setActiveTab("general");
      setError(null);
    }
  }, [isOpen, initialName, initialCuit]);

  if (!isOpen) return null;

  const handleCuitChange = (raw: string) => {
    const digits = digitsOnly(raw).slice(0, 11);
    setDocumentNumber(formatCuitDisplay(digits));
  };

  const handleConsultArca = async () => {
    const raw = digitsOnly(documentNumber);
    if (raw.length !== 11) {
      setError("Ingrese un CUIT de 11 dígitos para consultar en ARCA / AFIP.");
      return;
    }
    setError(null);
    setConsultingArca(true);
    try {
      const data = await api.consultArcaCuit(raw);
      if (data) {
        if (data.legalName) {
          setLegalName(data.legalName);
          if (!tradeName) setTradeName(data.legalName);
        }
        if (data.taxCondition) setTaxCondition(data.taxCondition as CustomerWrite["taxCondition"]);
        if (data.fiscalStreet) setFiscalStreet(data.fiscalStreet);
        if (data.fiscalCity) setFiscalCity(data.fiscalCity);
        if (data.fiscalProvince) setFiscalProvince(data.fiscalProvince);
        if (data.fiscalPostalCode) setFiscalPostalCode(data.fiscalPostalCode);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el CUIT en el padrón ARCA.");
    } finally {
      setConsultingArca(false);
    }
  };

  const handleAddDraftLocation = () => {
    if (!newLocName.trim()) return;
    const item: DraftLocation = {
      tempId: `loc_${Date.now()}`,
      name: newLocName.trim(),
      street: newLocStreet.trim() || fiscalStreet,
      city: newLocCity.trim() || fiscalCity,
      province: newLocProvince || fiscalProvince,
      postalCode: fiscalPostalCode
    };
    setLocations([...locations, item]);
    setNewLocName("");
    setNewLocStreet("");
    setNewLocCity("");
  };

  const handleAddDraftContact = () => {
    if (!newConName.trim()) return;
    const item: DraftContact = {
      tempId: `con_${Date.now()}`,
      name: newConName.trim(),
      role: newConRole,
      email: newConEmail.trim() || email,
      phone: newConPhone.trim() || phone,
      whatsApp: newConWhatsApp.trim() || whatsApp,
      isPrimary: contacts.length === 0
    };
    setContacts([...contacts, item]);
    setNewConName("");
    setNewConEmail("");
    setNewConPhone("");
    setNewConWhatsApp("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!legalName.trim()) {
      setError("La Razón Social o Nombre es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CustomerWrite = {
        legalName: legalName.trim(),
        tradeName: tradeName.trim() || legalName.trim(),
        documentType,
        documentNumber: digitsOnly(documentNumber),
        taxCondition,
        iibbRegime,
        isCustomer: !isSupplier,
        isSupplier: isSupplier,
        email: email.trim(),
        phone: phone.trim(),
        whatsApp: whatsApp.trim(),
        fiscalStreet: fiscalStreet.trim(),
        fiscalCity: fiscalCity.trim(),
        fiscalProvince,
        fiscalPostalCode: fiscalPostalCode.trim(),
        notes: notes.trim()
      };

      const created = await api.createCustomer(payload);
      let firstLocationId: string | undefined;
      let firstContactId: string | undefined;

      // Add Plants / Locations if specified
      for (const loc of locations) {
        const res = await api.addLocation(created.id, {
          name: loc.name,
          address: {
            street: loc.street,
            city: loc.city,
            province: loc.province,
            postalCode: loc.postalCode,
            country: "Argentina"
          },
          phone: loc.phone,
          notes: loc.notes
        });
        if (!firstLocationId && res.locations?.length) {
          firstLocationId = res.locations[res.locations.length - 1].id;
        }
      }

      // Add Contacts if specified
      for (const con of contacts) {
        const res = await api.addContact(created.id, {
          name: con.name,
          role: con.role,
          email: con.email,
          phone: con.phone,
          whatsApp: con.whatsApp,
          isPrimary: con.isPrimary,
          notes: con.notes
        });
        if (!firstContactId && res.contacts?.length) {
          firstContactId = res.contacts[res.contacts.length - 1].id;
        }
      }

      const freshCustomer = await api.getCustomer(created.id);
      onSuccess(
        freshCustomer,
        firstLocationId || (freshCustomer.locations?.length ? freshCustomer.locations[0].id : undefined),
        firstContactId || (freshCustomer.contacts?.length ? freshCustomer.contacts[0].id : undefined)
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el registro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{ width: "min(760px, 100%)", maxHeight: "90vh", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--surface-border, var(--lc-line))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(30, 41, 59, 0.04))"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="t-xl">{isSupplier ? "🏭" : "🏢"}</span>
            <div>
              <h2 style={{ margin: 0 }}>
                {isSupplier ? "Alta Rápida de Proveedor" : "Alta Rápida de Cliente"}
              </h2>
              <span className="t-small muted">
                Se creará en el CRM y quedará seleccionado automáticamente en este documento.
              </span>
            </div>
          </div>
          <button className="muted"
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", padding: "4px 8px" }}
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "10px 24px",
            background: "var(--lc-surface-2)",
            borderBottom: "1px solid var(--lc-line)"
          }}
        >
          <button className="t-strong"
            type="button"
            onClick={() => setActiveTab("general")}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: activeTab === "general" ? "#0d9488" : "transparent", color: activeTab === "general" ? "#ffffff" : "#475569", fontSize: "0.84rem", cursor: "pointer" }}
          >
            🏢 Datos Generales & Fiscales
          </button>

          <button className="t-strong"
            type="button"
            onClick={() => setActiveTab("locations")}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: activeTab === "locations" ? "#0d9488" : "transparent", color: activeTab === "locations" ? "#ffffff" : "#475569", fontSize: "0.84rem", cursor: "pointer" }}
          >
            📍 Plantas / Destinos ({locations.length})
          </button>

          <button className="t-strong"
            type="button"
            onClick={() => setActiveTab("contacts")}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: activeTab === "contacts" ? "#0d9488" : "transparent", color: activeTab === "contacts" ? "#ffffff" : "#475569", fontSize: "0.84rem", cursor: "pointer" }}
          >
            👤 Personas de Contacto ({contacts.length})
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
            {error && (
              <div className="alert t-small"
                style={{ marginBottom: "16px" }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* TAB 1: GENERAL */}
            {activeTab === "general" && (
              <div style={{ display: "grid", gap: "16px" }}>
                {/* CUIT & ARCA Consultation */}
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", alignItems: "flex-end" }}>
                  <div>
                    <label>
                      CUIT / Documento Fiscal
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input className="t-strong"
                        type="text"
                        value={documentNumber}
                        onChange={(e) => handleCuitChange(e.target.value)}
                        placeholder="30-71234567-9"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleConsultArca}
                        disabled={consultingArca}
                        className="btn btn-outline"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {consultingArca ? "Consultando..." : "🔍 Padrón ARCA"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label>
                      Condición frente al IVA *
                    </label>
                    <select
                      value={taxCondition}
                      onChange={(e) => setTaxCondition(e.target.value as CustomerWrite["taxCondition"])}
                      style={{ width: "100%" }}
                    >
                      <option value="ResponsableInscripto">IVA Responsable Inscripto</option>
                      <option value="Monotributo">Monotributo</option>
                      <option value="Exento">IVA Exento</option>
                      <option value="ConsumidorFinal">Consumidor Final</option>
                    </select>
                  </div>
                </div>

                {/* Names */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div>
                    <label>
                      Razón Social / Titular *
                    </label>
                    <input className="t-strong"
                      type="text"
                      required
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      placeholder="Ej: Acindar Industria Argentina S.A."
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label>
                      Nombre de Fantasía (Comercial)
                    </label>
                    <input
                      type="text"
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      placeholder="Ej: Planta Villa Constitución"
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>

                {/* Contact Channels */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                  <div>
                    <label>
                      Email Comercial
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="compras@empresa.com"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label>
                      Teléfono Fijo / Central
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0341-4567890"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label>
                      WhatsApp Directo
                    </label>
                    <input
                      type="text"
                      value={whatsApp}
                      onChange={(e) => setWhatsApp(e.target.value)}
                      placeholder="+54 9 341 555-1234"
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>

                {/* Fiscal Address */}
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "14px" }}>
                  <div>
                    <label>
                      Dirección Fiscal (Calle y N°)
                    </label>
                    <input
                      type="text"
                      value={fiscalStreet}
                      onChange={(e) => setFiscalStreet(e.target.value)}
                      placeholder="Ruta 21 km 247"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label>
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={fiscalCity}
                      onChange={(e) => setFiscalCity(e.target.value)}
                      placeholder="Villa Constitución"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label>
                      Provincia
                    </label>
                    <select
                      value={fiscalProvince}
                      onChange={(e) => setFiscalProvince(e.target.value)}
                      style={{ width: "100%" }}
                    >
                      {provinces.map((p) => (
                        <option key={p} value={p}>
                          {provinceLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PLANTS / LOCATIONS */}
            {activeTab === "locations" && (
              <div>
                <div className="box" style={{ marginBottom: "16px" }}>
                  <strong style={{ fontSize: "0.86rem", display: "block", marginBottom: "10px" }}>
                    ➕ Agregar Planta / Sucursal / Depósito de Destino:
                  </strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 1fr auto", gap: "10px", alignItems: "flex-end" }}>
                    <div>
                      <label>
                        Nombre Planta *
                      </label>
                      <input
                        type="text"
                        value={newLocName}
                        onChange={(e) => setNewLocName(e.target.value)}
                        placeholder="Ej: Planta Sur, Silo 4"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label>
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={newLocStreet}
                        onChange={(e) => setNewLocStreet(e.target.value)}
                        placeholder="Calle o Ruta..."
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label>
                        Ciudad
                      </label>
                      <input
                        type="text"
                        value={newLocCity}
                        onChange={(e) => setNewLocCity(e.target.value)}
                        placeholder="Ciudad..."
                        style={{ width: "100%" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDraftLocation}
                      className="btn btn-primary"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>

                {locations.length === 0 ? (
                  <div className="t-center muted t-small" style={{ padding: "20px" }}>
                    (Opcional) Si la empresa tiene varias plantas de entrega, podés crearlas aquí. Si no agregás ninguna, se usará el domicilio fiscal.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {locations.map((loc, idx) => (
                      <div className="box"
                        key={loc.tempId}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <div>
                          <strong>{loc.name}</strong> — {loc.street || "Sin dirección"}, {loc.city} ({loc.province})
                        </div>
                        <button className="t-danger t-strong"
                          type="button"
                          onClick={() => setLocations(locations.filter((_, i) => i !== idx))}
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: CONTACTS */}
            {activeTab === "contacts" && (
              <div>
                <div className="box" style={{ marginBottom: "16px" }}>
                  <strong style={{ fontSize: "0.86rem", display: "block", marginBottom: "10px" }}>
                    ➕ Agregar Persona de Contacto:
                  </strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr 1fr auto", gap: "10px", alignItems: "flex-end" }}>
                    <div>
                      <label>
                        Nombre y Apellido *
                      </label>
                      <input
                        type="text"
                        value={newConName}
                        onChange={(e) => setNewConName(e.target.value)}
                        placeholder="Ing. Carlos Pérez"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label>
                        Cargo
                      </label>
                      <select
                        value={newConRole}
                        onChange={(e) => setNewConRole(e.target.value)}
                        style={{ width: "100%" }}
                      >
                        <option value="Commercial">Compras / Comercial</option>
                        <option value="Technical">Técnico / Mantenimiento</option>
                        <option value="Administrative">Administración / Pagos</option>
                        <option value="Executive">Dirección / Gerencia</option>
                      </select>
                    </div>
                    <div>
                      <label>
                        Email
                      </label>
                      <input
                        type="email"
                        value={newConEmail}
                        onChange={(e) => setNewConEmail(e.target.value)}
                        placeholder="cperez@empresa.com"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label>
                        WhatsApp / Cel
                      </label>
                      <input
                        type="text"
                        value={newConWhatsApp}
                        onChange={(e) => setNewConWhatsApp(e.target.value)}
                        placeholder="341-5551234"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDraftContact}
                      className="btn btn-primary"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>

                {contacts.length === 0 ? (
                  <div className="t-center muted t-small" style={{ padding: "20px" }}>
                    (Opcional) Podés agregar aquí personas específicas de la empresa a quienes dirigir los presupuestos.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {contacts.map((con, idx) => (
                      <div className="box"
                        key={con.tempId}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <div>
                          <strong>{con.name}</strong> ({con.role}) — ✉ {con.email || "—"} | 📱 {con.whatsApp || con.phone || "—"}
                        </div>
                        <button className="t-danger t-strong"
                          type="button"
                          onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--lc-line)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              background: "var(--lc-surface-2)"
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
            >
              Cancelar
            </button>
            <button className="t-strong"
              type="submit"
              disabled={saving}
              style={{ padding: "9px 24px", borderRadius: "8px", background: "var(--lc-accent)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)" }}
            >
              {saving ? "Guardando..." : `💾 Guardar y Seleccionar ${isSupplier ? "Proveedor" : "Cliente"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
