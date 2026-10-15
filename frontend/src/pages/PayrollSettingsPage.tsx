import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { PayrollEmployerSettings, PayrollParameters } from "../api/types";
import { todayAr } from "../lib/dates";

const number = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
const month = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Configuración de sueldos: datos del empleador y parámetros legales vigentes por mes (nota 68, S1). */
export function PayrollSettingsPage() {
  const [employer, setEmployer] = useState<PayrollEmployerSettings | null>(null);
  const [company, setCompany] = useState<{ legalName: string; documentNumber: string } | null>(null);
  const [period, setPeriod] = useState(todayAr().slice(0, 7));
  const [params, setParams] = useState<PayrollParameters | null>(null);
  const [newParam, setNewParam] = useState({ key: "base.maxima", validFrom: todayAr().slice(0, 7), value: "", norm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadParams = (m: string) => api.getPayrollParameters(m).then(setParams).catch((err) => setError(err.message));
  useEffect(() => {
    api.getPayrollEmployerSettings().then(setEmployer).catch((err) => setError(err.message));
    api.getCompanySettings().then((c) => setCompany({ legalName: c.legalName, documentNumber: c.documentNumber })).catch(() => setCompany(null));
  }, []);
  useEffect(() => { void loadParams(period); }, [period]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      setMsg(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const saveEmployer = (e: FormEvent) => {
    e.preventDefault();
    if (!employer) return;
    void run(async () => {
      setEmployer(await api.savePayrollEmployerSettings(employer));
      return "✓ Datos del empleador guardados.";
    });
  };

  const addParam = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.addPayrollParameter({ ...newParam, value: Number(newParam.value.replace(",", ".")) });
      setNewParam({ ...newParam, value: "", norm: "" });
      await loadParams(period);
      return "✓ Parámetro cargado.";
    });
  };

  const set = <K extends keyof PayrollEmployerSettings>(key: K, value: PayrollEmployerSettings[K]) =>
    setEmployer((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>⚙️ Configuración de sueldos</h1>
          <p className="muted">Datos del empleador y parámetros legales con su vigencia y su norma.</p>
        </div>
        <Link to="/rrhh/liquidaciones" className="btn ghost">💰 Liquidación de Sueldos</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {employer && (
        <form className="card pad stack" style={{ gap: 12 }} onSubmit={saveEmployer}>
          <h3 style={{ margin: 0 }}>Empleador</h3>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {company ? <>{company.legalName} · CUIT {company.documentNumber}</> : "Razón social y CUIT: Configuración → Empresa."}
          </div>
          <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={employer.isMiPyme} onChange={(e) => set("isMiPyme", e.target.checked)} />
              MiPyME con certificado vigente
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={employer.isCommerceOrServices} onChange={(e) => set("isCommerceOrServices", e.target.checked)} />
              Actividad principal de comercio o servicios
            </label>
          </div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Contribución patronal: {employer.isMiPyme || !employer.isCommerceOrServices ? "18 %" : "20,40 %"} (Ley 27.541) · Fondo de Asistencia
            Laboral desde 11/2026: {employer.isMiPyme ? "2,5 %" : "1 %"}.
          </div>
          <div className="grid-3">
            <label>Código de actividad (ARCA)<input type="number" min={0} max={999} value={employer.activityCode ?? ""}
              onChange={(e) => set("activityCode", e.target.value === "" ? null : Number(e.target.value))} /></label>
            <label>ART<input value={employer.artInsurer ?? ""} onChange={(e) => set("artInsurer", e.target.value || null)} /></label>
            <label>N° de contrato ART<input value={employer.artContractNumber ?? ""} onChange={(e) => set("artContractNumber", e.target.value || null)} /></label>
            <label>ART: alícuota variable (%)<input type="number" step="0.0001" min={0} max={30} value={employer.artVariablePercent}
              onChange={(e) => set("artVariablePercent", Number(e.target.value))} /></label>
            <label>ART: suma fija por trabajador ($)<input type="number" step="0.01" min={0} value={employer.artFixedAmount}
              onChange={(e) => set("artFixedAmount", Number(e.target.value))} /></label>
            <label>Seguro de vida obligatorio por trabajador ($)<input type="number" step="0.01" min={0} value={employer.lifeInsurancePremium}
              onChange={(e) => set("lifeInsurancePremium", Number(e.target.value))} /></label>
            <label>ID FAL (Simplificación Registral)<input value={employer.falId ?? ""} onChange={(e) => set("falId", e.target.value || null)} /></label>
          </div>
          <div><button type="submit" className="btn" disabled={busy}>Guardar empleador</button></div>
        </form>
      )}

      <div className="card pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Parámetros legales vigentes</h3>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            Mes<input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} style={{ maxWidth: 170 }} />
          </label>
        </div>
        {params && (
          <table style={{ fontSize: "0.82rem" }}>
            <thead><tr><th>Parámetro</th><th style={{ textAlign: "right" }}>Valor</th><th>Desde</th><th>Norma</th></tr></thead>
            <tbody>
              {params.resolved.map((p) => (
                <tr key={p.key}>
                  <td>{p.name}{p.warning && <div style={{ color: "#b45309", fontSize: "0.75rem" }}>⚠️ {p.warning}</div>}</td>
                  <td style={{ textAlign: "right" }}>{p.value == null ? "—" : number(p.value)}</td>
                  <td>{p.validFrom ? month(p.validFrom) : "—"}</td>
                  <td>{p.norm ?? "—"}{p.fromCompany && <span className="muted"> (cargado por la empresa)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form className="stack" style={{ gap: 8 }} onSubmit={addParam}>
          <strong style={{ fontSize: "0.9rem" }}>Cargar un valor nuevo</strong>
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            Por ejemplo, el tope de ANSES de un mes que el sistema todavía no trae. A igual mes, el valor de la empresa reemplaza al del sistema.
          </p>
          <div className="grid-3">
            <label>
              Parámetro
              <select value={newParam.key} onChange={(e) => setNewParam({ ...newParam, key: e.target.value })}>
                {params?.resolved.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </label>
            <label>Rige desde<input type="month" value={newParam.validFrom} onChange={(e) => setNewParam({ ...newParam, validFrom: e.target.value })} required /></label>
            <label>Valor<input inputMode="decimal" value={newParam.value} onChange={(e) => setNewParam({ ...newParam, value: e.target.value })} required /></label>
          </div>
          <label>Norma<input value={newParam.norm} placeholder="Ej. Res. ANSES 300/2026" onChange={(e) => setNewParam({ ...newParam, norm: e.target.value })} required /></label>
          <div><button type="submit" className="btn ghost" disabled={busy}>Cargar</button></div>
        </form>

        {params && params.history.some((h) => h.fromCompany) && (
          <>
            <strong style={{ fontSize: "0.9rem" }}>Valores cargados por la empresa</strong>
            <table style={{ fontSize: "0.8rem" }}>
              <tbody>
                {params.history.filter((h) => h.fromCompany).map((h) => (
                  <tr key={h.id}>
                    <td>{params.resolved.find((r) => r.key === h.key)?.name ?? h.key}</td>
                    <td>{month(h.validFrom)}</td>
                    <td style={{ textAlign: "right" }}>{number(h.value)}</td>
                    <td>{h.norm}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn ghost compact" disabled={busy} onClick={() => void run(async () => {
                        await api.deletePayrollParameter(h.id);
                        await loadParams(period);
                        return "✓ Valor borrado.";
                      })}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
