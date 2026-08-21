import React, { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("Asset");
  const [level, setLevel] = useState(4);
  const [parentCode, setParentCode] = useState("");
  const [isDirectPosting, setIsDirectPosting] = useState(true);
  const [adjustsForInflation, setAdjustsForInflation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = () => {
    setLoading(true);
    api.listAccounts()
      .then((data) => setAccounts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = accounts.filter((a) => {
    const matchesSearch =
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === "ALL" || a.accountType === selectedType;
    return matchesSearch && matchesType;
  });

  const openNewModal = (parent?: any) => {
    setEditingId(null);
    if (parent) {
      setParentCode(parent.code);
      setAccountType(parent.accountType);
      setLevel(parent.level + 1);
      setCode(`${parent.code}.`);
    } else {
      setParentCode("");
      setAccountType("Asset");
      setLevel(4);
      setCode("");
    }
    setName("");
    setIsDirectPosting(true);
    setAdjustsForInflation(false);
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    try {
      setSaving(true);
      setError(null);
      if (editingId) {
        await api.updateAccount(editingId, {
          name: name.trim(),
          isDirectPosting,
          adjustsForInflation,
          isActive: true
        });
        setMsg(`✓ Cuenta ${code} actualizada con éxito.`);
      } else {
        await api.createAccount({
          code: code.trim(),
          name: name.trim(),
          accountType,
          level,
          parentCode: parentCode.trim() || undefined,
          isDirectPosting,
          adjustsForInflation
        });
        setMsg(`✓ Cuenta ${code} - ${name} creada con éxito.`);
      }
      setShowModal(false);
      loadAccounts();
    } catch (err: any) {
      setError(err?.message || "Error al guardar la cuenta contable.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🌳 Plan de Cuentas Jerárquico</h1>
          <p className="muted">Estructura clasificada de cuentas patrimoniales y de resultados</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={() => openNewModal()}>
            ➕ Nueva Cuenta Madre / Subcuenta
          </button>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row">
        <Link to="/contabilidad" className="tab-btn">
          📊 Tablero Ejecutivo & P&L
        </Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn active">
          🌳 Plan de Cuentas ({accounts.length})
        </Link>
        <Link to="/contabilidad/asientos" className="tab-btn">
          📖 Libro Diario
        </Link>
        <Link to="/contabilidad/mayor" className="tab-btn">
          🔍 Libro Mayor
        </Link>
        <Link to="/contabilidad/sumas-saldos" className="tab-btn">
          ⚖️ Sumas y Saldos
        </Link>
        <Link to="/contabilidad/conciliacion" className="tab-btn">
          🏦 Conciliación Bancaria
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      <div className="card pad">
        <div className="row" style={{ gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "220px" }}>
            <input
              type="text"
              placeholder="🔍 Buscar por código (ej. 1.1.01) o nombre de cuenta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ width: "200px" }}>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ width: "100%" }}>
              <option value="ALL">Todas las Categorías</option>
              <option value="Asset">1. Activo</option>
              <option value="Liability">2. Pasivo</option>
              <option value="Equity">3. Patrimonio Neto</option>
              <option value="Income">4. Ingresos / Ganancias</option>
              <option value="Expense">5. Egresos / Gastos</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }}>Cargando plan de cuentas...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "180px" }}>Código</th>
                  <th>Denominación de la Cuenta</th>
                  <th>Tipo / Naturaleza</th>
                  <th>Nivel</th>
                  <th>Imputable</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((a) => {
                  const paddingLeft = (a.level - 1) * 20;
                  const isTitle = !a.isDirectPosting;

                  return (
                    <tr
                      key={a.id}
                      style={{
                        background: a.level === 1 ? "rgba(37, 99, 235, 0.05)" : a.level === 2 ? "rgba(0,0,0,0.02)" : "transparent",
                        fontWeight: isTitle ? 700 : 400
                      }}
                    >
                      <td>
                        <code>{a.code}</code>
                      </td>
                      <td>
                        <div style={{ paddingLeft, display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{isTitle ? "📁" : "📄"}</span>
                          <span>{a.name}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            a.accountType === "Asset"
                              ? "ok"
                              : a.accountType === "Liability"
                              ? "warn"
                              : a.accountType === "Income"
                              ? "prio-high"
                              : a.accountType === "Expense"
                              ? "off"
                              : ""
                          }`}
                        >
                          {a.accountType === "Asset"
                            ? "Activo"
                            : a.accountType === "Liability"
                            ? "Pasivo"
                            : a.accountType === "Equity"
                            ? "Patrimonio Neto"
                            : a.accountType === "Income"
                            ? "Ingresos"
                            : "Gastos"}
                        </span>
                      </td>
                      <td>
                        <span className="badge">Nivel {a.level}</span>
                      </td>
                      <td>
                        {a.isDirectPosting ? (
                          <span className="badge ok" style={{ fontSize: "11px" }}>✓ Imputable</span>
                        ) : (
                          <span className="badge" style={{ fontSize: "11px", opacity: 0.6 }}>No Imputable (Rubro)</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {!a.isDirectPosting && (
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ fontSize: "12px", padding: "4px 8px" }}
                              title="Crear Subcuenta dentro de este rubro"
                              onClick={() => openNewModal(a)}
                            >
                              + Subcuenta
                            </button>
                          )}
                          <Link
                            to={`/contabilidad/mayor?accountCode=${a.code}`}
                            className="btn ghost"
                            style={{ fontSize: "12px", padding: "4px 8px" }}
                            title="Ver Libro Mayor de esta cuenta"
                          >
                            🔍 Mayor
                          </Link>
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

      {/* Modal Crear / Editar Cuenta */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: "550px", width: "100%" }}>
            <h3>{editingId ? `✏️ Editar Cuenta ${code}` : "➕ Nueva Cuenta Contable"}</h3>
            <form onSubmit={handleSave} className="stack" style={{ marginTop: 14, gap: 14 }}>
              <div className="grid-2" style={{ gap: 12 }}>
                <label>
                  Código Jerárquico *
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    placeholder="Ej. 1.1.01.007"
                  />
                </label>

                <label>
                  Nivel de Cuenta
                  <select value={level} onChange={(e) => setLevel(parseInt(e.target.value, 10))}>
                    <option value={1}>Nivel 1 (Capítulo)</option>
                    <option value={2}>Nivel 2 (Rubro Principal)</option>
                    <option value={3}>Nivel 3 (Sub-Rubro)</option>
                    <option value={4}>Nivel 4 (Cuenta Imputable)</option>
                    <option value={5}>Nivel 5 (Subcuenta Analítica)</option>
                  </select>
                </label>
              </div>

              <label>
                Denominación / Nombre de la Cuenta *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej. Banco Santander C/C"
                />
              </label>

              <div className="grid-2" style={{ gap: 12 }}>
                <label>
                  Naturaleza Contable
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="Asset">1. Activo</option>
                    <option value="Liability">2. Pasivo</option>
                    <option value="Equity">3. Patrimonio Neto</option>
                    <option value="Income">4. Ingresos / Ganancias</option>
                    <option value="Expense">5. Egresos / Gastos</option>
                  </select>
                </label>

                <label>
                  ¿Permite Imputación Directa?
                  <select
                    value={isDirectPosting ? "true" : "false"}
                    onChange={(e) => setIsDirectPosting(e.target.value === "true")}
                  >
                    <option value="true">Sí (Cuenta Imputable en Asientos)</option>
                    <option value="false">No (Rubro / Cuenta Totalizadora)</option>
                  </select>
                </label>
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={saving}>
                  {saving ? "Guardando…" : "💾 Guardar Cuenta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
