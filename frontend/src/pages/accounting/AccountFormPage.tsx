import { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

export function AccountFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const parentQuery = searchParams.get("parent");
  const navigate = useNavigate();
  const isEditing = Boolean(id && id !== "nuevo");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("Asset");
  const [level, setLevel] = useState(4);
  const [parentCode, setParentCode] = useState("");
  const [isDirectPosting, setIsDirectPosting] = useState(true);
  const [adjustsForInflation, setAdjustsForInflation] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [currency, setCurrency] = useState("ARS");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const list = await api.listAccounts().catch(() => []);
        setAccounts(list || []);

        if (isEditing && id) {
          const acc = list.find((a: any) => a.id === id);
          if (acc) {
            setCode(acc.code);
            setName(acc.name);
            setAccountType(acc.accountType ?? "Asset");
            setLevel(acc.level || 4);
            setParentCode(acc.parentCode || "");
            setIsDirectPosting(acc.isDirectPosting !== false);
            setAdjustsForInflation(Boolean(acc.adjustsForInflation));
            setIsActive(acc.isActive !== false);
            setCurrency(acc.currency || "ARS");
          }
        } else if (parentQuery) {
          const parent = list.find((a: any) => a.code === parentQuery);
          if (parent) {
            setParentCode(parent.code);
            setAccountType(parent.accountType ?? "Asset");
            setLevel(parent.level + 1);
            setCode(`${parent.code}.`);
          }
        }
      } catch (err: any) {
        console.error("Error al cargar cuentas:", err);
        setError("No se pudo cargar la información del plan de cuentas.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditing, parentQuery]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      setError("Código y denominación de la cuenta contable son obligatorios.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      code: code.trim(),
      name: name.trim(),
      accountType,
      level: Number(level),
      parentCode: parentCode.trim() || undefined,
      isDirectPosting,
      adjustsForInflation,
      isActive,
      currency
    };

    try {
      if (isEditing && id) {
        await api.updateAccount(id, payload);
      } else {
        await api.createAccount(payload);
      }
      navigate("/contabilidad/plan-cuentas");
    } catch (err: any) {
      setError(err?.message || "Error al guardar la cuenta contable.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide t-center" style={{ padding: 40 }}>
        <div className="muted">Cargando árbol de cuentas contables...</div>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Breadcrumb & Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="t-small muted" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Link to="/contabilidad" style={{ color: "inherit", textDecoration: "none" }}>Contabilidad</Link>
          <span>›</span>
          <Link to="/contabilidad/plan-cuentas" style={{ color: "inherit", textDecoration: "none" }}>Plan de Cuentas</Link>
          <span>›</span>
          <span className="t-accent t-strong">{isEditing ? `Editar [${code}]` : "Nueva Cuenta"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: "0 0 4px" }}>
              {isEditing ? `🏛️ Cuenta: ${code} - ${name}` : "➕ Nueva Cuenta Contable"}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Configuración de jerarquía, tipo de saldo, moneda e imputación contable.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/contabilidad/plan-cuentas" className="btn ghost">
              ← Cancelar y Volver
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn"
              style={{ minWidth: 160 }}
            >
              {saving ? "Guardando..." : "💾 Guardar Cuenta"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card pad" style={{ marginBottom: 24, borderLeft: "5px solid var(--lc-accent)" }}>
          <div className="t-strong t-accent" style={{ marginBottom: 14 }}>
            1. CLASIFICACIÓN JERÁRQUICA & DENOMINACIÓN
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label>Código Contable Jerárquico *</label>
              <input className="t-strong"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ej. 1.1.02.001"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label>Denominación / Nombre de la Cuenta *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Banco Galicia Cta Cte $ ARS"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>Capítulo / Tipo de Cuenta *</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="Asset">1. ACTIVO (Bienes y Derechos)</option>
                <option value="Liability">2. PASIVO (Obligaciones y Deudas)</option>
                <option value="Equity">3. PATRIMONIO NETO (Capital y Reservas)</option>
                <option value="Revenue">4. INGRESOS / VENTAS (Ganancias)</option>
                <option value="Expense">5. EGRESOS / COSTOS & GASTOS (Pérdidas)</option>
              </select>
            </div>

            <div>
              <label>Cuenta Padre (Rubro Superior)</label>
              <select
                value={parentCode}
                onChange={(e) => {
                  setParentCode(e.target.value);
                  const p = accounts.find((a) => a.code === e.target.value);
                  if (p) {
                    setAccountType(p.accountType);
                    setLevel(p.level + 1);
                  }
                }}
                style={{ width: "100%" }}
              >
                <option value="">-- Cuenta Raíz / Capítulo Principal --</option>
                {accounts
                  .filter((a) => !a.isDirectPosting)
                  .map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label>Nivel de Jerarquía</label>
              <input
                type="number"
                step="1"
                min="1"
                max="8"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value) || 1)}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: ATRIBUTOS OPERATIVOS */}
        <div className="card pad" style={{ marginBottom: 30, borderLeft: "5px solid var(--lc-info)" }}>
          <div className="t-strong t-info" style={{ marginBottom: 14 }}>
            2. ATRIBUTOS OPERATIVOS & FISCALES
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
            <div>
              <label>Moneda de la Cuenta</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="ARS">ARS - Pesos Argentinos ($)</option>
                <option value="USD">USD - Dólares Estadounidenses (U$S)</option>
                <option value="EUR">EUR - Euros (€)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
              <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isDirectPosting}
                  onChange={(e) => setIsDirectPosting(e.target.checked)}
                  style={{ transform: "scale(1.2)" }}
                />
                <span>Cuenta Imputable (Recibe Asientos Directos)</span>
              </label>

              <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={adjustsForInflation}
                  onChange={(e) => setAdjustsForInflation(e.target.checked)}
                  style={{ transform: "scale(1.2)" }}
                />
                <span>Ajusta por Inflación (Partida No Monetaria - RT 6)</span>
              </label>

              <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ transform: "scale(1.2)" }}
                />
                <span>Cuenta Activa / Habilitada</span>
              </label>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="box"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <Link to="/contabilidad/plan-cuentas" className="btn ghost">
            ← Cancelar y Volver
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn"
            style={{ minWidth: 200 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Cuenta Contable"}
          </button>
        </div>
      </form>
    </div>
  );
}
