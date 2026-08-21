import { FormEvent, ChangeEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { provinces, type CompanySettings, type TenantUser } from "../api/types";
import { ALL_SYSTEM_MODULES } from "./superadmin/SuperAdminPlansPage";

export function SettingsPage() {
  const [tab, setTab] = useState<"general" | "arca" | "banks" | "users" | "backup">("general");
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

  // User Modal State (Create & Edit)
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [userRole, setUserRole] = useState("Comercial");
  const [userIsActive, setUserIsActive] = useState(true);
  const [userModules, setUserModules] = useState<string[]>([
    "sales", "crm", "purchases", "inventory", "finance", "fleet", "hr", "grains"
  ]);
  const [savingUser, setSavingUser] = useState(false);

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

  const openNewUserModal = () => {
    setEditingUserId(null);
    setUserName("");
    setUserEmail("");
    setUserPassword("Leal" + Math.floor(1000 + Math.random() * 9000));
    setShowPassword(false);
    setUserRole("Comercial");
    setUserIsActive(true);
    setUserModules(["sales", "crm"]);
    setShowUserModal(true);
  };

  const openEditUserModal = (u: TenantUser) => {
    setEditingUserId(u.id);
    setUserName(u.fullName);
    setUserEmail(u.email);
    setUserPassword("");
    setShowPassword(false);
    setUserRole(u.role);
    setUserIsActive(u.isActive);
    try {
      const mods = typeof u.allowedModulesJson === "string" ? JSON.parse(u.allowedModulesJson) : u.allowedModulesJson || [];
      setUserModules(Array.isArray(mods) && mods.length > 0 ? mods : ["sales", "crm"]);
    } catch {
      setUserModules(["sales", "crm"]);
    }
    setShowUserModal(true);
  };

  const handleRoleChange = (newRole: string) => {
    setUserRole(newRole);
    if (newRole === "Admin") {
      setUserModules(ALL_SYSTEM_MODULES.map((m) => m.id));
    } else if (newRole === "Comercial") {
      setUserModules(["sales", "crm", "inventory"]);
    } else if (newRole === "Técnico") {
      setUserModules(["fleet", "inventory"]);
    } else if (newRole === "Facturación") {
      setUserModules(["sales", "purchases", "finance"]);
    }
  };

  const toggleUserModule = (id: string) => {
    if (userModules.includes(id)) {
      if (userModules.length === 1) return;
      setUserModules(userModules.filter((m) => m !== id));
    } else {
      setUserModules([...userModules, id]);
    }
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) return;
    try {
      setSavingUser(true);
      setError(null);
      const modulesJson = JSON.stringify(userModules);

      if (editingUserId) {
        const updated = await api.updateTenantUser(editingUserId, {
          fullName: userName.trim(),
          role: userRole,
          isActive: userIsActive,
          password: userPassword.trim() || undefined,
          allowedModulesJson: modulesJson
        });
        setUsers((prev) => prev.map((u) => (u.id === editingUserId ? updated : u)));
        setSuccessMsg(`✓ Usuario ${updated.fullName} actualizado con éxito.`);
      } else {
        const created = await api.createTenantUser({
          fullName: userName.trim(),
          email: userEmail.trim(),
          role: userRole,
          password: userPassword.trim() || undefined,
          allowedModulesJson: modulesJson
        });
        setUsers((prev) => [...prev, created]);
        setSuccessMsg(`✓ Usuario ${created.fullName} creado con éxito con clave asignada.`);
      }
      setShowUserModal(false);
    } catch (err: any) {
      setError(err?.message || "Error al guardar el usuario.");
    } finally {
      setSavingUser(false);
    }
  };

  if (loading) return <p>Cargando configuración de la empresa…</p>;
  if (!settings) return <div className="alert">No se pudo cargar la configuración de empresa.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>⚙️ Configuración de Empresa & ERP</h1>
          <p className="muted">Parámetros impositivos, certificado ARCA, marca, cuentas y permisos de usuarios</p>
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
          👥 Usuarios & Permisos ({users.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "backup" ? "active" : ""}`}
          onClick={() => setTab("backup")}
        >
          💾 Base de Datos & Backup (.SQL)
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
                  Recomendado: Formato PNG o JPG transparente de 400x200px. Se utilizará en presupuestos y encabezados.
                </span>
              </div>
            </div>
          </div>

          <div className="card pad">
            <h3>Datos Fiscales de la Empresa</h3>
            <div className="grid-form" style={{ marginTop: 16 }}>
              <label>
                Razón Social *
                <input
                  required
                  value={settings.legalName}
                  onChange={(e) => setSetting("legalName", e.target.value)}
                />
              </label>

              <label>
                Nombre Fantasía / Comercial
                <input
                  value={settings.tradeName || ""}
                  onChange={(e) => setSetting("tradeName", e.target.value)}
                />
              </label>

              <label>
                CUIT *
                <input
                  required
                  value={settings.documentNumber}
                  onChange={(e) => setSetting("documentNumber", e.target.value)}
                />
              </label>

              <label>
                Condición Fiscal *
                <select
                  value={settings.taxCondition}
                  onChange={(e) => setSetting("taxCondition", e.target.value)}
                >
                  <option value="ResponsableInscripto">Responsable Inscripto</option>
                  <option value="Monotributo">Monotributo</option>
                  <option value="Exento">Exento</option>
                </select>
              </label>

              <label>
                Régimen IIBB *
                <select
                  value={settings.iibbRegime}
                  onChange={(e) => setSetting("iibbRegime", e.target.value)}
                >
                  <option value="ConvenioMultilateral">Convenio Multilateral</option>
                  <option value="Local">Local / Jurisdicción Única</option>
                  <option value="Exento">Exento</option>
                </select>
              </label>

              <label>
                Nº de Inscripción IIBB
                <input
                  value={settings.iibbNumber || ""}
                  onChange={(e) => setSetting("iibbNumber", e.target.value)}
                />
              </label>

              <label>
                Fecha Inicio de Actividades
                <input
                  type="date"
                  value={settings.activityStartDate || ""}
                  onChange={(e) => setSetting("activityStartDate", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="card pad">
            <h3>Domicilio Fiscal y Contacto</h3>
            <div className="grid-form" style={{ marginTop: 16 }}>
              <label>
                Calle y Número
                <input
                  value={settings.fiscalStreet || ""}
                  onChange={(e) => setSetting("fiscalStreet", e.target.value)}
                />
              </label>

              <label>
                Ciudad / Localidad
                <input
                  value={settings.fiscalCity || ""}
                  onChange={(e) => setSetting("fiscalCity", e.target.value)}
                />
              </label>

              <label>
                Provincia
                <select
                  value={settings.fiscalProvince || "Santa Fe"}
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
                <input
                  value={settings.fiscalPostalCode || ""}
                  onChange={(e) => setSetting("fiscalPostalCode", e.target.value)}
                />
              </label>

              <label>
                Email Corporativo
                <input
                  type="email"
                  value={settings.email || ""}
                  onChange={(e) => setSetting("email", e.target.value)}
                />
              </label>

              <label>
                Teléfono de Contacto
                <input
                  value={settings.phone || ""}
                  onChange={(e) => setSetting("phone", e.target.value)}
                />
              </label>

              <label>
                WhatsApp Oficial
                <input
                  value={settings.whatsApp || ""}
                  onChange={(e) => setSetting("whatsApp", e.target.value)}
                />
              </label>

              <label>
                Sitio Web
                <input
                  value={settings.website || ""}
                  onChange={(e) => setSetting("website", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={saving}>
              {saving ? "Guardando…" : "💾 Guardar Configuración General"}
            </button>
          </div>
        </form>
      )}

      {tab === "arca" && (
        <form onSubmit={handleUploadCertificate} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <h3>Certificado Digital ARCA / AFIP (WebServices)</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Cargá el certificado X.509 (.crt) y la clave privada (.key) para emitir Facturación Electrónica oficial (WSFE).
            </p>

            <div className="grid-form" style={{ marginTop: 16 }}>
              <label>
                Ambiente ARCA *
                <select value={certEnv} onChange={(e) => setCertEnv(e.target.value)}>
                  <option value="Homologacion">🧪 Homologación / Testing</option>
                  <option value="Produccion">🚀 Producción Real</option>
                </select>
              </label>

              <label>
                CUIT del Firmante / Autorizado
                <input
                  value={certCuit}
                  onChange={(e) => setCertCuit(e.target.value)}
                  placeholder="CUIT asociado al certificado"
                />
              </label>
            </div>

            <div className="grid-2" style={{ gap: 16, marginTop: 20 }}>
              <div className="card pad" style={{ border: "1px dashed var(--line)", background: "rgba(0,0,0,0.02)" }}>
                <h4>1. Certificado Digital (.CRT)</h4>
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                  Archivo emitido por AFIP/ARCA tras delegar el servicio WebService.
                </p>
                <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>
                  📄 Seleccionar archivo .CRT
                  <input type="file" accept=".crt,.pem,.txt" onChange={handleCrtFileUpload} style={{ display: "none" }} />
                </label>
                {crtText && (
                  <span className="badge ok" style={{ marginTop: 10, display: "inline-block" }}>
                    ✓ Certificado cargado ({crtText.length} bytes)
                  </span>
                )}
              </div>

              <div className="card pad" style={{ border: "1px dashed var(--line)", background: "rgba(0,0,0,0.02)" }}>
                <h4>2. Clave Privada (.KEY)</h4>
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                  Clave privada generada con OpenSSL utilizada para firmar el CSR.
                </p>
                <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>
                  🔑 Seleccionar archivo .KEY
                  <input type="file" accept=".key,.pem,.txt" onChange={handleKeyFileUpload} style={{ display: "none" }} />
                </label>
                {keyText && (
                  <span className="badge ok" style={{ marginTop: 10, display: "inline-block" }}>
                    ✓ Clave privada cargada ({keyText.length} bytes)
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginTop: 24, padding: "12px 16px", background: "rgba(245, 158, 11, 0.1)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <div style={{ fontWeight: 600, color: "#d97706", fontSize: "0.88rem" }}>🔒 Almacenamiento Seguro</div>
              <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginTop: 4 }}>
                Los certificados y claves privadas se resguardan de forma segura e independiente en la base de datos de tu empresa.
              </div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={uploadingCert}>
              {uploadingCert ? "Actualizando Certificado…" : "🔐 Guardar Certificado ARCA"}
            </button>
          </div>
        </form>
      )}

      {tab === "banks" && (
        <form onSubmit={handleSaveSettings} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <h3>Datos Bancarios para Cobranzas</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Estos datos se imprimirán automáticamente al pie de los presupuestos y facturas para facilitar transferencias.
            </p>

            <div className="grid-form" style={{ marginTop: 16 }}>
              <label>
                Banco / Entidad
                <input
                  value={settings.bankName || ""}
                  onChange={(e) => setSetting("bankName", e.target.value)}
                  placeholder="Ej. Banco Galicia / Banco Macro"
                />
              </label>

              <label>
                CBU / CVU (22 dígitos)
                <input
                  value={settings.bankCbu || ""}
                  onChange={(e) => setSetting("bankCbu", e.target.value)}
                  placeholder="0070000000000000000000"
                />
              </label>

              <label>
                Alias CBU
                <input
                  value={settings.bankAlias || ""}
                  onChange={(e) => setSetting("bankAlias", e.target.value)}
                  placeholder="EMPRESA.PAGOS.GALICIA"
                />
              </label>
            </div>
          </div>

          <div className="card pad">
            <h3>Términos y Condiciones Predeterminados de Presupuesto</h3>
            <div className="grid-form" style={{ marginTop: 16 }}>
              <label>
                Validez de Oferta (Días)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={settings.defaultQuoteValidDays}
                  onChange={(e) => setSetting("defaultQuoteValidDays", parseInt(e.target.value, 10) || 15)}
                />
              </label>

              <label>
                Plazo de Entrega Estimado (Días)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={settings.defaultDeliveryDays}
                  onChange={(e) => setSetting("defaultDeliveryDays", parseInt(e.target.value, 10) || 7)}
                />
              </label>

              <label style={{ gridColumn: "1 / -1" }}>
                Condiciones de Pago por Defecto
                <input
                  value={settings.defaultPaymentTerms || ""}
                  onChange={(e) => setSetting("defaultPaymentTerms", e.target.value)}
                  placeholder="Ej. 50% anticipo y saldo contra entrega a 30 días echeq"
                />
              </label>

              <label style={{ gridColumn: "1 / -1" }}>
                Garantía y Condiciones del Servicio
                <textarea
                  rows={3}
                  value={settings.defaultWarranty || ""}
                  onChange={(e) => setSetting("defaultWarranty", e.target.value)}
                  placeholder="Ej. 12 meses de garantía oficial sobre componentes instalados y mano de obra."
                />
              </label>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={saving}>
              {saving ? "Guardando…" : "💾 Guardar Parámetros Comerciales"}
            </button>
          </div>
        </form>
      )}

      {tab === "users" && (
        <div className="card pad">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3>👥 Gestión de Usuarios & Control de Accesos</h3>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>
                Asigná qué módulos y secciones específicas puede ver y operar cada empleado de tu empresa.
              </p>
            </div>
            <button type="button" className="btn" onClick={openNewUserModal}>
              + Nuevo Usuario
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email de Acceso</th>
                  <th>Rol</th>
                  <th>Módulos Autorizados</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  let uMods: string[] = [];
                  try {
                    uMods = typeof u.allowedModulesJson === "string" ? JSON.parse(u.allowedModulesJson) : u.allowedModulesJson || [];
                  } catch {
                    uMods = [];
                  }

                  return (
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
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", maxWidth: "320px" }}>
                          {u.role === "Admin" ? (
                            <span className="badge prio-high">⭐ Acceso Total (Admin)</span>
                          ) : uMods.length > 0 ? (
                            uMods.map((mId) => {
                              const mod = ALL_SYSTEM_MODULES.find((s) => s.id === mId);
                              return (
                                <span key={mId} className="badge ok" style={{ fontSize: "0.72rem", padding: "2px 6px" }}>
                                  {mod?.icon} {mod?.name.split(" ")[0]}
                                </span>
                              );
                            })
                          ) : (
                            <span className="badge off">Sin módulos asignados</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${u.isActive ? "ok" : "off"}`}>
                          {u.isActive ? "✓ Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ fontSize: "0.78rem", padding: "4px 8px" }}
                          onClick={() => openEditUserModal(u)}
                        >
                          ✏️ Editar Permisos
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "backup" && (
        <div className="card pad" style={{ maxWidth: "800px", marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
              💾
            </div>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: "0 0 4px" }}>Respaldo & Portabilidad de Base de Datos</h2>
              <p className="muted" style={{ margin: 0, fontSize: "14px" }}>Descarga completa y autocontenida de todos los datos y registros de tu empresa.</p>
            </div>
          </div>

          <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "16px", marginBottom: "20px" }}>
            <h4 style={{ margin: "0 0 8px", color: "#60a5fa" }}>🛡️ Garantía de Soberanía y Propiedad de Datos</h4>
            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.6", color: "#cbd5e1" }}>
              En <strong>LEAL Control ERP</strong>, tus datos te pertenecen. Podés generar y descargar en cualquier momento una copia de seguridad física completa de tu base de datos en formato estándar <code>.sql.gz</code> compatible con PostgreSQL 16+.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "14px" }}>
              <div style={{ fontWeight: "700", marginBottom: "6px" }}>📦 Qué incluye este archivo:</div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "4px" }}>
                <li>Clientes, Contactos y CRM</li>
                <li>Ventas, Presupuestos y Facturas</li>
                <li>Compras, Gastos y Proveedores</li>
                <li>Finanzas, Cuentas y Cheques Echeq</li>
                <li>Flota, Choferes y Mantenimientos</li>
                <li>Cereales, Contratos y Balanza</li>
              </ul>
            </div>

            <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "14px" }}>
              <div style={{ fontWeight: "700", marginBottom: "6px" }}>🔒 Seguridad y Cifrado:</div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "4px" }}>
                <li>Aislamiento físico por cliente</li>
                <li>Compresión GZip de alta densidad</li>
                <li>Generación en caliente sin corte de servicio</li>
                <li>Respaldos nocturnos automáticos a la nube</li>
              </ul>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "20px" }}>
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>Formato: <code>backup_leal_[empresa].sql.gz</code></span>
            <button
              type="button"
              className="btn"
              onClick={() => window.open("/api/v1/company/backup/export-sql", "_blank")}
              style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: "700", padding: "12px 24px", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}
            >
              📥 Descargar Backup Completo (.SQL)
            </button>
          </div>
        </div>
      )}

      {/* Modal Alta / Edición de Usuario con Matriz Modular */}
      {showUserModal && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: "600px", width: "100%" }}>
            <h3>{editingUserId ? `✏️ Editar Permisos: ${userName}` : "+ Alta de Nuevo Usuario"}</h3>
            <form onSubmit={handleSaveUser} className="stack" style={{ marginTop: 12, gap: 14 }}>
              <div className="grid-2" style={{ gap: 12 }}>
                <label>
                  Nombre y Apellido *
                  <input
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    required
                    placeholder="Ej. Martín González"
                  />
                </label>

                <label>
                  Email de Acceso *
                  <input
                    type="email"
                    value={userEmail}
                    disabled={!!editingUserId}
                    onChange={(e) => setUserEmail(e.target.value)}
                    required
                    placeholder="mgonzalez@empresa.com"
                  />
                </label>
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <label>
                  Rol Principal
                  <select value={userRole} onChange={(e) => handleRoleChange(e.target.value)}>
                    <option value="Comercial">Comercial / Ventas</option>
                    <option value="Técnico">Técnico / Servicio / Flota</option>
                    <option value="Facturación">Facturación / Administración</option>
                    <option value="Admin">Administrador Total</option>
                  </select>
                </label>

                <label>
                  Estado
                  <select
                    value={userIsActive ? "true" : "false"}
                    onChange={(e) => setUserIsActive(e.target.value === "true")}
                  >
                    <option value="true">Activo (Puede ingresar)</option>
                    <option value="false">Inactivo (Acceso bloqueado)</option>
                  </select>
                </label>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                  {editingUserId ? "🔑 Modificar Contraseña (dejar en blanco para no cambiarla)" : "🔑 Contraseña de Acceso *"}
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    required={!editingUserId}
                    placeholder={editingUserId ? "•••••••• (Sin cambios)" : "Ingresá clave segura"}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: "12px", padding: "8px 12px", whiteSpace: "nowrap" }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "👁️ Ocultar" : "👁️ Ver"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: "12px", padding: "8px 12px", whiteSpace: "nowrap" }}
                    onClick={() => {
                      setUserPassword("Leal" + Math.floor(1000 + Math.random() * 9000));
                      setShowPassword(true);
                    }}
                    title="Generar contraseña aleatoria"
                  >
                    🎲 Generar
                  </button>
                </div>
                {!editingUserId && (
                  <span className="muted" style={{ fontSize: "0.75rem", marginTop: 4, display: "block" }}>
                    Podés usar la clave sugerida o escribir la que prefieras para el nuevo empleado.
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 8 }}>
                  Módulos y Lugares de Acceso Permitidos:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {ALL_SYSTEM_MODULES.map((m) => {
                    const isChecked = userRole === "Admin" || userModules.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => userRole !== "Admin" && toggleUserModule(m.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: isChecked ? "1px solid var(--accent)" : "1px solid var(--line)",
                          background: isChecked ? "rgba(37, 99, 235, 0.08)" : "transparent",
                          cursor: userRole === "Admin" ? "default" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          opacity: userRole === "Admin" ? 0.85 : 1
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={userRole === "Admin"}
                          onChange={() => {}}
                        />
                        <span style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                          {m.icon} {m.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {userRole === "Admin" && (
                  <span className="muted" style={{ fontSize: "0.75rem", marginTop: 4, display: "block" }}>
                    ⭐ Los administradores tienen acceso irrestricto a todos los módulos.
                  </span>
                )}
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowUserModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={savingUser}>
                  {savingUser ? "Guardando…" : "💾 Guardar Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
