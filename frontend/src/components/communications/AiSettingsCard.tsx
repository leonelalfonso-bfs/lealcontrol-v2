import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AiSettings } from "../../api/types";

/**
 * Inteligencia artificial: clave de la API (se guarda cifrada y no se vuelve a mostrar), tope de gasto mensual,
 * lectura de mails y apertura automática de oportunidades.
 */
export function AiSettingsCard() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [budget, setBudget] = useState("10");
  const [reading, setReading] = useState(false);
  const [autoOpportunities, setAutoOpportunities] = useState(true);
  const [webCuitLookup, setWebCuitLookup] = useState(true);
  const [supervisor, setSupervisor] = useState(false);
  const [business, setBusiness] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getAiSettings().then((s) => {
    setSettings(s);
    setBudget(String(s.monthlyBudgetUsd));
    setReading(s.mailReadingEnabled);
    setAutoOpportunities(s.autoOpportunities);
    setWebCuitLookup(s.webCuitLookupEnabled ?? true);
    setSupervisor(s.supervisorEnabled);
    setBusiness(s.businessDescription);
  }).catch((err) => setError(err instanceof Error ? err.message : "No se pudo leer la configuración."));
  useEffect(() => { void load(); }, []);

  const save = async (e: React.FormEvent, removeKey = false) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await api.saveAiSettings({
        apiKey: removeKey ? "" : apiKey.trim() || null,
        monthlyBudgetUsd: Number(budget.replace(",", ".")) || 0,
        mailReadingEnabled: removeKey ? false : reading,
        autoOpportunities,
        webCuitLookupEnabled: webCuitLookup,
        supervisorEnabled: removeKey ? false : supervisor,
        businessDescription: business,
      });
      setApiKey("");
      setMessage(removeKey ? "Clave borrada; la lectura quedó apagada." : "Configuración guardada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api.testAiSettings();
      if (result.ok) setMessage(result.detail); else setError(result.detail);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo probar.");
    } finally {
      setBusy(false);
    }
  };

  const runSupervisorNow = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api.runAiSupervisorNow();
      if (result.ok) setMessage(result.detail); else setError(result.detail);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el informe.");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return error ? <div className="alert">{error}</div> : null;
  const usedShare = settings.monthlyBudgetUsd > 0 ? Math.min(100, (settings.monthSpentUsd / settings.monthlyBudgetUsd) * 100) : 0;

  return (
    <form className="card pad" onSubmit={(e) => void save(e)} style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h2>Inteligencia artificial</h2>
          <p className="muted">
            Lee cada mail nuevo de un contacto: le pone categoría (pedido de cotización, consulta, reclamo, proveedor…), urgencia y
            un resumen de una línea. Vincula el cliente existente cuando hay certeza (CUIT, mail de empresa o contacto, dominio o
            nombre único), guarda contactos nuevos de personas reales con su puesto y abre oportunidades en los pedidos comerciales.
            Proveedor: {settings.provider}.
          </p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {message && <div className="success-banner">{message}</div>}
      {settings.lastError && !error && <div className="alert">Último error: {settings.lastError}</div>}

      <div className="grid-2">
        <label>Clave de la API
          <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasKey ? `Cargada (termina en ${settings.keyHint ?? "…"}); escribí otra para reemplazarla` : "sk-ant-…"} />
          <span className="muted t-small">Se crea en console.anthropic.com → API Keys. Se guarda cifrada y no se vuelve a mostrar.</span>
        </label>
        <label>Tope de gasto mensual (USD)
          <input type="number" min={0} step="0.5" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <span className="muted t-small">
            Este mes: {settings.monthSpentUsd.toLocaleString("es-AR", { maximumFractionDigits: 4 })} USD en {settings.monthCalls} consultas
            ({usedShare.toFixed(0)} % del tope). Al llegar al tope, se frena hasta el mes siguiente.
          </span>
        </label>
      </div>

      <label>Qué hace la empresa
        <textarea rows={2} value={business} onChange={(e) => setBusiness(e.target.value)}
          placeholder="Ej.: vendemos, instalamos y calibramos básculas para camiones y balanzas industriales; servicio técnico y verificación periódica." />
        <span className="muted t-small">Le da contexto a la IA para distinguir un pedido comercial de un proveedor o de publicidad.</span>
      </label>

      <label className="check-label">
        <input type="checkbox" checked={reading} onChange={(e) => setReading(e.target.checked)} disabled={!settings.hasKey && !apiKey.trim()} />
        Leer los mails nuevos con IA (cada 5 minutos; al activarla, también los de los últimos 2 días)
      </label>
      <label className="check-label">
        <input type="checkbox" checked={autoOpportunities} onChange={(e) => setAutoOpportunities(e.target.checked)} />
        Abrir la oportunidad automáticamente en los pedidos comerciales (etiqueta “IA”)
      </label>
      <label className="check-label">
        <input type="checkbox" checked={webCuitLookup} onChange={(e) => setWebCuitLookup(e.target.checked)} disabled={!autoOpportunities} />
        Buscar el CUIT en internet para empresas nuevas y validar en ARCA antes de crear el cliente (queda marcado “A revisar”; ~USD 0,01 por búsqueda)
      </label>

      <label className="check-label">
        <input type="checkbox" checked={supervisor} onChange={(e) => setSupervisor(e.target.checked)} disabled={!settings.hasKey && !apiKey.trim()} />
        Supervisor comercial: cada día hábil a las 6, las 3 a 5 prioridades del día, arriba de “Mis avisos” y del resumen diario
        (una consulta por día, con el modelo más capaz)
      </label>

      <div className="toolbar">
        <button className="btn" disabled={busy}>Guardar</button>
        <button type="button" className="btn ghost" disabled={busy || !settings.hasKey} onClick={() => void test()}>Probar la clave</button>
        {settings.hasKey && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void runSupervisorNow()}>
            Generar informe ahora
          </button>
        )}
        {settings.hasKey && (
          <button type="button" className="btn ghost danger" disabled={busy} onClick={(e) => void save(e as unknown as React.FormEvent, true)}>Borrar la clave</button>
        )}
      </div>
    </form>
  );
}
