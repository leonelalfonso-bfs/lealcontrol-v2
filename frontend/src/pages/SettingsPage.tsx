import { FormEvent, ChangeEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { provinces, type CompanySettings } from "../api/types";
import { UsersAndPermissions } from "../components/permissions/UsersAndPermissions";

export type SettingsSection = "general" | "arca" | "banks" | "users" | "backup";

const SECTION_HEADERS: Record<SettingsSection, { title: string; subtitle: string }> = {
  general: { title: "Empresa", subtitle: "Logo, datos fiscales y domicilio. Salen en facturas, presupuestos y demás documentos." },
  arca: { title: "Facturación ARCA", subtitle: "Punto de venta, certificado digital y prueba de conexión con ARCA." },
  banks: { title: "Cobros y bancos", subtitle: "Cuenta para transferencias que sale en la factura y se informa en la FCE." },
  users: { title: "Usuarios y permisos", subtitle: "Quién entra al sistema, con qué perfil y qué puede ver y hacer." },
  backup: { title: "Respaldo", subtitle: "Descarga completa de los datos de la empresa." }
};

export function SettingsPage({ section = "general" }: { section?: SettingsSection }) {
  const tab = section;
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Certificate Modal State
  const [crtText, setCrtText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [certEnv, setCertEnv] = useState("Homologacion");
  const [certCuit, setCertCuit] = useState("");
  const [certAlias, setCertAlias] = useState("LealControl");
  const [uploadingCert, setUploadingCert] = useState(false);
  const [generatingCsr, setGeneratingCsr] = useState(false);
  const [csrReady, setCsrReady] = useState(false);
  const [diagnosingArca, setDiagnosingArca] = useState(false);
  const [numberingPoint, setNumberingPoint] = useState("");
  const [numberingType, setNumberingType] = useState<"A" | "B">("A");
  const [checkingNumbering, setCheckingNumbering] = useState(false);
  const [arcaNumbering, setArcaNumbering] = useState<{
    pointOfSale: number; invoiceType: string; lastNumber: number;
    nextNumber: number; environment: string;
  } | null>(null);
  const [arcaDiagnostics, setArcaDiagnostics] = useState<{
    readyForInvoicing: boolean;
    readyForCuitLookup: boolean;
    environment: string;
    signerCuit?: string | null;
    certificateSubject?: string | null;
    certificateThumbprint?: string | null;
    checks: Array<{ code: string; label: string; ok: boolean; detail: string }>;
    summary: string;
  } | null>(null);

  useEffect(() => {
    api.getCompanySettings()
      .then((s) => {
        setSettings(s);
        setCertEnv(s.arcaEnvironment || "Homologacion");
        setCertCuit(s.arcaSignerCuit || s.documentNumber || "");
        setCsrReady(Boolean(s.hasArcaCertificateKey));
        if (s.arcaPointOfSale) setNumberingPoint(String(s.arcaPointOfSale));
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

  const downloadTextFile = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: "application/pkcs10;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleGenerateCsr = async () => {
    const cuitDigits = (certCuit || "").replace(/\D/g, "");
    if (cuitDigits.length !== 11) {
      setError("Ingresá el CUIT del firmante (11 dígitos) para generar el archivo de consulta.");
      return;
    }
    if ((settings?.hasArcaCertificateCrt || settings?.hasArcaCertificateKey) && !window.confirm(
      "Generar otro CSR reemplaza la clave privada guardada y elimina el certificado de esta empresa en el ERP. Necesitarás cargar el certificado correspondiente a la nueva clave. ¿Continuar?"
    )) return;
    try {
      setGeneratingCsr(true);
      setError(null);
      setSuccessMsg(null);
      const result = await api.generateArcaCsr({
        signerCuit: cuitDigits,
        environment: certEnv,
        organizationName: settings?.legalName || undefined,
        commonName: certAlias.trim() || "LealControl"
      });
      setSettings(result.settings);
      setKeyText("");
      setCrtText("");
      setCsrReady(true);
      downloadTextFile(result.csrPem, result.csrFileName);
      // La clave privada se guarda en el servidor; también se descarga como respaldo local.
      downloadTextFile(result.privateKeyPem, result.privateKeyFileName);
      setSuccessMsg(
        `✓ Archivo de consulta (.csr) generado. Subilo en ARCA → ${certEnv === "Produccion" ? "Administrador de Certificados Digitales" : "WSASS (homologación)"}. Cuando ARCA te entregue el .crt, cargalo abajo (la clave privada ya quedó guardada).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el archivo de consulta");
    } finally {
      setGeneratingCsr(false);
    }
  };

  const handleUploadCertificate = async (e: FormEvent) => {
    e.preventDefault();
    if (!crtText && !settings?.hasArcaCertificateCrt) {
      setError("Seleccioná el archivo de Certificado (.crt) emitido por ARCA.");
      return;
    }
    if (!keyText && !settings?.hasArcaCertificateKey) {
      setError("Falta la clave privada (.key). Generá primero el archivo de consulta o cargá el .key manualmente.");
      return;
    }
    try {
      setUploadingCert(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await api.uploadArcaCertificate({
        certificateCrt: crtText || undefined,
        certificateKey: keyText || undefined,
        environment: certEnv,
        signerCuit: certCuit
      });
      setSettings(updated);
      setKeyText("");
      setCrtText("");
      setArcaDiagnostics(null);
      setSuccessMsg("✓ Configuración ARCA guardada. Los archivos no seleccionados se conservaron.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar certificado");
    } finally {
      setUploadingCert(false);
    }
  };

  const handleDiagnoseArca = async () => {
    try {
      setDiagnosingArca(true);
      setError(null);
      setSuccessMsg(null);
      const result = await api.diagnoseArca();
      setArcaDiagnostics(result);
      if (result.readyForInvoicing && result.readyForCuitLookup) {
        setSuccessMsg("✓ " + result.summary);
      } else {
        setError(result.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo diagnosticar ARCA");
    } finally {
      setDiagnosingArca(false);
    }
  };

  const handleCheckArcaNumbering = async () => {
    const point = Number(numberingPoint);
    if (!Number.isInteger(point) || point < 1 || point > 99998) {
      setError("Indicá un punto de venta ARCA válido (1 a 99998).");
      setArcaNumbering(null);
      return;
    }
    try {
      setCheckingNumbering(true);
      setError(null);
      setArcaNumbering(null);
      setArcaNumbering(await api.getArcaLastAuthorized(point, numberingType));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar la numeración en ARCA.");
    } finally {
      setCheckingNumbering(false);
    }
  };

  if (loading) return <p>Cargando configuración de la empresa…</p>;
  if (!settings) return <div className="alert">No se pudo cargar la configuración de empresa.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">CONFIGURACIÓN</span>
          <h1>{SECTION_HEADERS[tab].title}</h1>
          <p className="muted">{SECTION_HEADERS[tab].subtitle}</p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {successMsg && <div className="alert ok">{successMsg}</div>}

      {tab === "general" && (
        <form onSubmit={handleSaveSettings} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <h3>Logo</h3>
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
                  Elegir imagen
                  <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                </label>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Recomendado: Formato PNG o JPG transparente de 400x200px. Se utilizará en presupuestos y encabezados.
                </span>
              </div>
            </div>
          </div>

          <div className="card pad">
            <h3>Datos fiscales</h3>
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
            <h3>Domicilio y contacto</h3>
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
              {saving ? "Guardando…" : "Guardar datos de la empresa"}
            </button>
          </div>
        </form>
      )}

      {tab === "arca" && (
        <div className="stack" style={{ gap: 20 }}>
        <form onSubmit={handleSaveSettings} className="card pad">
          <h3>Punto de venta de este sistema</h3>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
            Todas las facturas y notas salen por este punto de venta RECE y no se puede usar otro.
            Elegí uno que no use ningún otro sistema de facturación, así la numeración no se mezcla.
          </p>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
            <label>
              Punto de venta
              <input
                type="number"
                min={1}
                max={99998}
                value={settings.arcaPointOfSale ?? ""}
                onChange={(e) => setSetting("arcaPointOfSale", e.target.value ? Number(e.target.value) : null)}
                placeholder="Ej. 2"
              />
            </label>
            <button className="btn" disabled={saving}>
              {saving ? "Guardando…" : "Guardar punto de venta"}
            </button>
          </div>
          {!settings.arcaPointOfSale && (
            <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>
              Sin punto de venta fijo, la factura deja elegir cualquiera de los habilitados en ARCA.
            </p>
          )}
        </form>

        <form onSubmit={handleUploadCertificate} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <h3>Certificado digital</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Primero generá el archivo de consulta (.csr) para tramitarlo en ARCA. Después cargá el certificado (.crt)
              que te devolván junto con la clave privada (.key).
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

              <label>
                Alias del certificado (CN)
                <input
                  value={certAlias}
                  onChange={(e) => setCertAlias(e.target.value)}
                  placeholder="Ej. LealControl"
                />
              </label>
            </div>

            <div
              className="card pad"
              style={{
                marginTop: 20,
                border: "1px solid rgba(13, 148, 136, 0.35)",
                background: "rgba(13, 148, 136, 0.06)"
              }}
            >
              <h4 style={{ margin: 0 }}>Paso 1 — Archivo de consulta (.CSR)</h4>
              <p className="muted" style={{ fontSize: "0.8rem", margin: "8px 0 12px" }}>
                Generá el pedido PKCS#10 con el formato exigido por ARCA
                (<code>serialNumber=CUIT …</code>). Subí el <strong>.csr</strong> en el portal ARCA
                (Administrador de Certificados Digitales / WSASS) y descargá el <strong>.crt</strong> firmado.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={generatingCsr}
                  onClick={() => void handleGenerateCsr()}
                >
                  {generatingCsr ? "Generando…" : "📥 Generar y descargar archivo de consulta"}
                </button>
                {csrReady && (
                  <span className="badge ok">✓ CSR y clave privada listos (clave guardada en el servidor)</span>
                )}
              </div>
            </div>

            <div className="grid-2" style={{ gap: 16, marginTop: 20 }}>
              <div className="card pad" style={{ border: "1px dashed var(--line)", background: "rgba(0,0,0,0.02)" }}>
                <h4>Paso 2 — Certificado Digital (.CRT)</h4>
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                  Archivo emitido por AFIP/ARCA tras aprobar tu archivo de consulta.
                </p>
                <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>
                  📄 Seleccionar archivo .CRT
                  <input type="file" accept=".crt,.pem,.txt" onChange={handleCrtFileUpload} style={{ display: "none" }} />
                </label>
                {(crtText || settings?.hasArcaCertificateCrt) && (
                  <span className="badge ok" style={{ marginTop: 10, display: "inline-block" }}>
                    {crtText ? "✓ Certificado seleccionado" : "✓ Certificado guardado en el servidor"}
                  </span>
                )}
              </div>

              <div className="card pad" style={{ border: "1px dashed var(--line)", background: "rgba(0,0,0,0.02)" }}>
                <h4>Paso 2b — Clave Privada (.KEY)</h4>
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                  Se genera automáticamente con el archivo de consulta. Solo cargala manualmente si ya la tenías de OpenSSL.
                </p>
                <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>
                  🔑 Seleccionar archivo .KEY
                  <input type="file" accept=".key,.pem,.txt" onChange={handleKeyFileUpload} style={{ display: "none" }} />
                </label>
                {(keyText || settings?.hasArcaCertificateKey) && (
                  <span className="badge ok" style={{ marginTop: 10, display: "inline-block" }}>
                    {keyText ? "✓ Clave privada seleccionada" : "✓ Clave privada guardada en el servidor"}
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginTop: 24, padding: "12px 16px", background: "rgba(245, 158, 11, 0.1)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <div style={{ fontWeight: 600, color: "#d97706", fontSize: "0.88rem" }}>🔒 Almacenamiento Seguro</div>
              <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginTop: 4 }}>
                Los certificados y claves privadas se resguardan de forma segura e independiente en la base de datos de tu empresa.
                Si regenerás el archivo de consulta, la clave anterior deja de valer y deberás tramitar un certificado nuevo en ARCA.
              </div>
            </div>

            <div className="card pad" style={{ marginTop: 20, border: "1px solid var(--line)" }}>
              <h4 style={{ marginTop: 0 }}>Paso 3 — Probar conexión ARCA</h4>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Verifica certificado, clave, vigencia y tickets WSAA para <strong>facturación (wsfe)</strong> y
                <strong> consulta CUIT / padrón A5</strong>. Corré esto antes de que el cliente empiece a operar.
              </p>
              <button
                type="button"
                className="btn ghost"
                disabled={diagnosingArca}
                onClick={() => void handleDiagnoseArca()}
              >
                {diagnosingArca ? "Probando con ARCA…" : "🔎 Probar certificado y servicios ARCA"}
              </button>
              {arcaDiagnostics && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{arcaDiagnostics.summary}</div>
                  <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 8 }}>
                    Ambiente: {arcaDiagnostics.environment}
                    {arcaDiagnostics.signerCuit ? ` · CUIT ${arcaDiagnostics.signerCuit}` : ""}
                    {arcaDiagnostics.certificateThumbprint ? ` · Thumbprint ${arcaDiagnostics.certificateThumbprint}` : ""}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem" }}>
                    {arcaDiagnostics.checks.map((c) => (
                      <li key={c.code} style={{ marginBottom: 6, color: c.ok ? "var(--ok, #15803d)" : "var(--danger, #b91c1c)" }}>
                        {c.ok ? "✓" : "✗"} <strong>{c.label}</strong> — {c.detail}
                      </li>
                    ))}
                  </ul>
                  {!arcaDiagnostics.readyForCuitLookup && (
                    <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
                      Si falla solo la consulta de CUIT: en ARCA → Administrador de Relaciones asociá el certificado a
                      «Constancia de Inscripción» (<code>ws_sr_constancia_inscripcion</code>). Alcance 5 ya no se usa.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card pad" style={{ border: "1px solid var(--line)" }}>
            <h4 style={{ marginTop: 0 }}>Paso 4 — Consultar numeración oficial</h4>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Leé en ARCA el último comprobante autorizado para un punto de venta y tipo de factura.
              Esta consulta no emite ni autoriza facturas. La numeración del borrador del ERP puede ser distinta.
            </p>
            <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end" }}>
              <label>Punto de venta
                <input type="number" min="1" max="99998" value={numberingPoint}
                  onChange={(e) => { setNumberingPoint(e.target.value); setArcaNumbering(null); }} />
              </label>
              <label>Tipo de factura
                <select value={numberingType} onChange={(e) => {
                  setNumberingType(e.target.value as "A" | "B"); setArcaNumbering(null);
                }}>
                  <option value="A">Factura A</option>
                  <option value="B">Factura B</option>
                </select>
              </label>
              <button type="button" className="btn ghost" disabled={checkingNumbering}
                onClick={() => void handleCheckArcaNumbering()}>
                {checkingNumbering ? "Consultando ARCA…" : "Consultar último autorizado"}
              </button>
            </div>
            {arcaNumbering && <p style={{ marginBottom: 0 }}>
              <strong>{arcaNumbering.environment} · Punto {arcaNumbering.pointOfSale} · Factura {arcaNumbering.invoiceType}</strong>
              <br />Último número autorizado: <strong>{arcaNumbering.lastNumber}</strong>.
              Siguiente número orientativo: <strong>{arcaNumbering.nextNumber}</strong>.
            </p>}
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={uploadingCert}>
              {uploadingCert ? "Guardando configuración…" : "🔐 Guardar configuración ARCA"}
            </button>
          </div>
        </form>
        </div>
      )}

      {tab === "banks" && (
        <form onSubmit={handleSaveSettings} className="stack" style={{ gap: 20 }}>
          <div className="card pad">
            <h3>Cuenta para transferencias</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Se cargan solo acá. Si salen o no en la factura, y las instrucciones de pago, se eligen en Documentos → Factura.
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
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Sale en el PDF de la factura y se informa a ARCA en la Factura de Crédito Electrónica.
                </span>
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

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={saving}>
              {saving ? "Guardando…" : "Guardar datos bancarios"}
            </button>
          </div>
        </form>
      )}

      {tab === "users" && <UsersAndPermissions />}

      {tab === "backup" && (
        <div className="card pad" style={{ maxWidth: 760 }}>
          <h3>Descargar copia de la base de datos</h3>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
            Genera en el momento un archivo <code>.sql.gz</code> (PostgreSQL) con todos los datos de esta empresa:
            clientes, ventas, compras, finanzas, contabilidad, producción, calidad y RRHH. No corta el servicio.
            Solo los administradores pueden descargarlo. Guardalo en un lugar seguro: contiene datos sensibles.
          </p>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => window.open("/api/v1/company/backup/export-sql", "_blank")}
            >
              Descargar copia (.sql.gz)
            </button>
          </div>
        </div>
      )}

    </>
  );
}
