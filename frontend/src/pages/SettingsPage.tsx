import { FormEvent, ChangeEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { provinces, type CompanySettings, type TenantUser } from "../api/types";

export function SettingsPage() {
  const [tab, setTab] = useState<"general" | "arca" | "banks" | "users">("general");
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Certificate Modal State
  const [crtText, setCrtText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [certEnv, setCertEnv] = useState("Homologacion");
  const [certCuit, setCertCuit] = useState("");
  const [uploadingCert, setUploadingCert] = useState(false);

  // New User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("Comercial");
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    Promise.all([api.getCompanySettings(), api.listTenantUsers()])
      .then(([s, u]) => {
        setSettings(s);
        setUsers(u);
        setCertEnv(s.arcaEnvironment || "Homologacion");
        setCertCuit(s.arcaSignerCuit || s.documentNumber || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const setSetting = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSetting("logoUrl", base64);
    };
    reader.readAsDataURL(file);
  };

  const handleCrtFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setCrtText((event.target?.result as string) || "");
    reader.readAsText(file);
  };

  const handleKeyFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setKeyText((event.target?.result as string) || "");
    reader.readAsText(file);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await api.updateCompanySettings(settings);
      setSettings(updated);
      setSuccessMsg("✓ Configuración de empresa guardada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCertificate = async (e: FormEvent) => {
    e.preventDefault();
    if (!crtText || !keyText) {
      setError("Por favor seleccioná los archivos de Certificado (.crt) y Clave Privada (.key).");
      return;
    }
    try {
      setUploadingCert(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await api.uploadArcaCertificate({
        certificateCrt: crtText,
        certificateKey: keyText,
        environment: certEnv,
        signerCuit: certCuit
      });
      setSettings(updated);
      setSuccessMsg("✓ Certificado digital ARCA / AFIP actualizado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar certificado");
    } finally {
      setUploadingCert(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;
    try {
      setCreatingUser(true);
      const created = await api.createTenantUser({
        fullName: newUserName,
        email: newUserEmail,
        role: newUserRole
      });
      setUsers((prev) => [...prev, created]);
      setShowUserModal(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("Comercial");
      setSuccessMsg(`✓ Usuario ${created.fullName} agregado con éxito.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar usuario");
    } finally {
      setCreatingUser(false);
    }
  };

  if (loading) return <p>Cargando configuración de la empresa…</p>;
  if (!settings) return <div className="alert">No se pudo cargar la configuración de empresa.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>⚙️ Configuración de Empresa & ERP</h1>
          <p className="muted">Parámetros impositivos, certificado ARCA, marca e identidad visual, cuentas y usuarios</p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {successMsg && <div className="alert ok">{successMsg}</div>}

      <div className="tab-row">
        <button
          type="button"
          className={`tab-btn ${tab === "general" ? "active" : ""}`}
          onClick={() => setTab("general")}
        >
          🏢 Empresa & Logotipo
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "arca" ? "active" : ""}`}
          onClick={() => setTab("arca")}
        >
          🔐 Certificado ARCA / AFIP
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "banks" ? "active" : ""}`}
          onClick={() => setTab("banks")}
        >
          💳 Bancos & Leyendas
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}
        >
          👥 Usuarios ({users.length})
        </button>
      </div>

      {tab === "general" && (
        <form onSubmit={handleSaveSettings} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <h3>Identidad Visual y Logotipo</h3>
            <div className="row" style={{ gap: 24, marginTop: 16, alignItems: "center" }}>
              <div
                style={{
                  width: 180,
                  height: 100,
                  border: "2px dashed var(--line)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.6)",
                  overflow: "hidden"
                }}
              >
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo Empresa" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <span className="muted" style={{ fontSize: "0.8rem" }}>Sin Logo Cargado</span>
                )}
              </div>

              <div className="stack" style={{ gap: 8 }}>
                <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>
                  📁 Seleccionar Archivo Imagen Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                </label>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Se utilizará en el encabezado de presupuestos en PDF, remitos y documentos impresos.
                </span>
              </div>
            </div>
          </div>

          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <h3>Datos Impositivos y Comerciales</h3>
            <div className="grid-2">
              <label>
                Razón Social *
                <input
                  value={settings.legalName}
                  onChange={(e) => setSetting("legalName", e.target.value)}
                  required
                />
              </label>
              <label>
                Nombre de Fantasía
                <input
                  value={settings.tradeName ?? ""}
                  onChange={(e) => setSetting("tradeName", e.target.value)}
                />
              </label>
            </div>

            <div className="grid-3">
              <label>
                Tipo Documento
                <select value={settings.documentType} onChange={(e) => setSetting("documentType", e.target.value)}>
                  <option value="Cuit">Cuit</option>
                  <option value="Dni">Dni</option>
                </select>
              </label>

              <label>
                Número CUIT *
                <input
                  value={settings.documentNumber}
                  onChange={(e) => setSetting("documentNumber", e.target.value)}
                  required
                />
              </label>

              <label>
                Condición IVA
                <select value={settings.taxCondition} onChange={(e) => setSetting("taxCondition", e.target.value)}>
                  <option value="ResponsableInscripto">Responsable Inscripto</option>
                  <option value="Monotributo">Monotributo</option>
                  <option value="Exento">Exento</option>
                </select>
              </label>
            </div>

            <div className="grid-3">
              <label>
                Régimen IIBB
                <select value={settings.iibbRegime} onChange={(e) => setSetting("iibbRegime", e.target.value)}>
                  <option value="ConvenioMultilateral">Convenio Multilateral</option>
                  <option value="Local">Local</option>
                  <option value="Exento">Exento</option>
                </select>
              </label>

              <label>
                Nro. Inscripción IIBB
                <input
                  value={settings.iibbNumber ?? ""}
                  onChange={(e) => setSetting("iibbNumber", e.target.value)}
                  placeholder="30-71548962-9"
                />
              </label>

              <label>
                Fecha de Inicio de Actividades *
                <input
                  type="date"
                  value={settings.activityStartDate ?? "2018-03-01"}
                  onChange={(e) => setSetting("activityStartDate", e.target.value)}
                  title="Obligatorio según RG 1415 Anexo II de AFIP/ARCA"
                />
              </label>
            </div>

            <div className="grid-4">
              <label>
                Email Corporativo
                <input
                  type="email"
                  value={settings.email ?? ""}
                  onChange={(e) => setSetting("email", e.target.value)}
                />
              </label>

              <label>
                Teléfono Fijo
                <input value={settings.phone ?? ""} onChange={(e) => setSetting("phone", e.target.value)} />
              </label>

              <label>
                WhatsApp Oficial
                <input value={settings.whatsApp ?? ""} onChange={(e) => setSetting("whatsApp", e.target.value)} />
              </label>

              <label>
                Sitio Web
                <input value={settings.website ?? ""} onChange={(e) => setSetting("website", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <h3>Domicilio Fiscal Principal</h3>
            <div className="grid-2">
              <label>
                Calle y Altura
                <input value={settings.fiscalStreet ?? ""} onChange={(e) => setSetting("fiscalStreet", e.target.value)} />
              </label>

              <label>
                Ciudad / Localidad
                <input value={settings.fiscalCity ?? ""} onChange={(e) => setSetting("fiscalCity", e.target.value)} />
              </label>
            </div>

            <div className="grid-2">
              <label>
                Provincia
                <select
                  value={settings.fiscalProvince ?? "SantaFe"}
                  onChange={(e) => setSetting("fiscalProvince", e.target.value)}
                >
                  {provinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Código Postal
                <input value={settings.fiscalPostalCode ?? ""} onChange={(e) => setSetting("fiscalPostalCode", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={saving}>
              {saving ? "Guardando…" : "Guardar Cambios Empresa"}
            </button>
          </div>
        </form>
      )}

      {tab === "arca" && (
        <form onSubmit={handleUploadCertificate} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3>Estado del Certificado Digital ARCA / AFIP</h3>
                <p className="muted">Se utiliza para consultas de CUIT en tiempo real y Facturación Electrónica WSE</p>
              </div>

              <div>
                {settings.hasArcaCertificate ? (
                  <span className="badge ok" style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
                    ✓ Certificado Vinculado & Activo
                  </span>
                ) : (
                  <span className="badge warn" style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
                    ⚠️ Sin Certificado Configurado
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <h3>Configuración del WebService ARCA</h3>
            <div className="grid-2">
              <label>
                Ambiente de Conexión
                <select value={certEnv} onChange={(e) => setCertEnv(e.target.value)}>
                  <option value="Homologacion">Homologación (Pruebas / Sandbox)</option>
                  <option value="Produccion">Producción (Real AFIP / ARCA)</option>
                </select>
              </label>

              <label>
                CUIT Firmante del Certificado
                <input value={certCuit} onChange={(e) => setCertCuit(e.target.value)} placeholder="30715489629" />
              </label>
            </div>

            <div className="grid-2">
              <label>
                Archivo Certificado (.crt / .pem)
                <input type="file" accept=".crt,.pem,.cer" onChange={handleCrtFileUpload} />
                {crtText && <span className="muted" style={{ fontSize: "0.75rem", color: "#065f46" }}>✓ Archivo .crt leído ({crtText.length} bytes)</span>}
              </label>

              <label>
                Archivo Clave Privada (.key)
                <input type="file" accept=".key,.pem" onChange={handleKeyFileUpload} />
                {keyText && <span className="muted" style={{ fontSize: "0.75rem", color: "#065f46" }}>✓ Archivo .key leído ({keyText.length} bytes)</span>}
              </label>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={uploadingCert}>
              {uploadingCert ? "Cargando…" : "Actualizar Certificado ARCA"}
            </button>
          </div>
        </form>
      )}

      {tab === "banks" && (
        <form onSubmit={handleSaveSettings} className="stack" style={{ gap: 20 }}>
          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <h3>Cuentas Bancarias para Cobranza</h3>
            <div className="grid-3">
              <label>
                Banco
                <input
                  value={settings.bankName ?? ""}
                  onChange={(e) => setSetting("bankName", e.target.value)}
                  placeholder="Banco Macro"
                />
              </label>

              <label>
                CBU (22 Dígitos)
                <input
                  value={settings.bankCbu ?? ""}
                  onChange={(e) => setSetting("bankCbu", e.target.value)}
                  placeholder="2850001240000012345678"
                />
              </label>

              <label>
                Alias CBU
                <input
                  value={settings.bankAlias ?? ""}
                  onChange={(e) => setSetting("bankAlias", e.target.value)}
                  placeholder="LEAL.CONTROL.ERP"
                />
              </label>
            </div>
          </div>

          <div className="card pad" style={{ display: "grid", gap: 16 }}>
            <h3>Condiciones y Leyendas Predeterminadas</h3>
            <div className="grid-2">
              <label>
                Validez de Presupuesto (Días)
                <input
                  type="number"
                  value={settings.defaultQuoteValidDays}
                  onChange={(e) => setSetting("defaultQuoteValidDays", Number(e.target.value))}
                />
              </label>

              <label>
                Plazo de Entrega Predeterminado (Días)
                <input
                  type="number"
                  value={settings.defaultDeliveryDays}
                  onChange={(e) => setSetting("defaultDeliveryDays", Number(e.target.value))}
                />
              </label>
            </div>

            <label>
              Garantía por Defecto
              <input
                value={settings.defaultWarranty ?? ""}
                onChange={(e) => setSetting("defaultWarranty", e.target.value)}
              />
            </label>

            <label>
              Forma de Pago por Defecto
              <input
                value={settings.defaultPaymentTerms ?? ""}
                onChange={(e) => setSetting("defaultPaymentTerms", e.target.value)}
              />
            </label>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={saving}>
              {saving ? "Guardando…" : "Guardar Parámetros"}
            </button>
          </div>
        </form>
      )}

      {tab === "users" && (
        <div className="card pad" style={{ display: "grid", gap: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3>Usuarios del Sistema y Roles</h3>
              <p className="muted">Control de acceso y permisos de los operadores del ERP</p>
            </div>

            <button type="button" className="btn ghost" onClick={() => setShowUserModal(true)}>
              + Nuevo Usuario
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre Completo</th>
                  <th>Email de Acceso</th>
                  <th>Rol Asignado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>👤 {u.fullName}</strong>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span
                        className={`badge ${
                          u.role === "Admin" ? "prio-high" : u.role === "Comercial" ? "ok" : "warn"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className="badge ok">✓ Activo</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Alta Usuario */}
      {showUserModal && (
        <div className="modal-backdrop">
          <div className="modal-card card pad">
            <h3>+ Alta de Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} className="stack" style={{ marginTop: 12 }}>
              <label>
                Nombre y Apellido *
                <input
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  required
                  placeholder="Ej. Martín González"
                />
              </label>

              <label>
                Email *
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  placeholder="mgonzalez@lealcontrol.com"
                />
              </label>

              <label>
                Rol
                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                  <option value="Comercial">Comercial / Ventas</option>
                  <option value="Técnico">Técnico / Servicio</option>
                  <option value="Facturación">Facturación / Administración</option>
                  <option value="Admin">Administrador General</option>
                </select>
              </label>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button type="button" className="btn ghost" onClick={() => setShowUserModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={creatingUser}>
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
