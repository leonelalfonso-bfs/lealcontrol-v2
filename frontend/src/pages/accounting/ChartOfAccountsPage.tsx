import React, { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Account Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("Asset");
  const [level, setLevel] = useState(4);
  const [parentCode, setParentCode] = useState("");
  const [isDirectPosting, setIsDirectPosting] = useState(true);
  const [adjustsForInflation, setAdjustsForInflation] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [currency, setCurrency] = useState("ARS");
  const [saving, setSaving] = useState(false);

  // Mapping Modal State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mapping, setMapping] = useState<any>(null);
  const [savingMapping, setSavingMapping] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = () => {
    setLoading(true);
    api.listAccounts()
      .then((data) => setAccounts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadMapping = () => {
    api.getAccountingMapping()
      .then((data) => setMapping(data))
      .catch((err) => console.warn("Could not load mapping:", err));
  };

  useEffect(() => {
    loadAccounts();
    loadMapping();
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
    setIsActive(true);
    setCurrency("ARS");
    setShowModal(true);
  };

  const openEditModal = (acc: any) => {
    setEditingId(acc.id);
    setCode(acc.code);
    setName(acc.name);
    setAccountType(acc.accountType);
    setLevel(acc.level || 4);
    setParentCode(acc.parentCode || "");
    setIsDirectPosting(acc.isDirectPosting !== false);
    setAdjustsForInflation(Boolean(acc.adjustsForInflation));
    setIsActive(acc.isActive !== false);
    setCurrency(acc.currency || "ARS");
    setShowModal(true);
  };

  const handleDelete = async (acc: any) => {
    if (!window.confirm(`¿Estás seguro de eliminar la cuenta ${acc.code} - ${acc.name}?`)) return;

    try {
      setError(null);
      await api.deleteAccount(acc.id);
      setMsg(`✓ Cuenta ${acc.code} eliminada con éxito.`);
      loadAccounts();
    } catch (err: any) {
      setError(err?.message || "Error al eliminar la cuenta.");
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    try {
      setSaving(true);
      setError(null);
      if (editingId) {
        await api.updateAccount(editingId, {
          code: code.trim(),
          name: name.trim(),
          accountType,
          level,
          parentCode: parentCode.trim() || undefined,
          isDirectPosting,
          currency,
          adjustsForInflation,
          isActive
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
          currency,
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

  const handleSaveMapping = async (e: FormEvent) => {
    e.preventDefault();
    if (!mapping) return;

    try {
      setSavingMapping(true);
      setError(null);
      await api.updateAccountingMapping(mapping);
      setMsg("✓ Mapeo contable del sistema actualizado con éxito.");
      setShowMappingModal(false);
    } catch (err: any) {
      setError(err?.message || "Error al guardar el mapeo contable.");
    } finally {
      setSavingMapping(false);
    }
  };

  const imputableAccounts = accounts.filter((a) => a.isDirectPosting !== false);

  return (
    <div className="pad stack">
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <Link to="/contabilidad" className="btn ghost" style={{ padding: "4px 8px" }}>← Tablero</Link>
            <h2>Plan de Cuentas Contable</h2>
          </div>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Estructura jerárquica de 5 niveles para imputación formal en Libro Diario, Mayor y Sumas y Saldos.
          </span>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" onClick={() => { setShowMappingModal(true); loadMapping(); }} style={{ borderColor: "#cbd5e1" }}>
            ⚙️ Mapeo del Sistema
          </button>
          <button className="btn primary" onClick={() => openNewModal()}>
            + Nueva Cuenta
          </button>
        </div>
      </div>

      {msg && <div className="badge ok" style={{ padding: "10px 14px", fontSize: "0.85rem" }}>{msg}</div>}
      {error && <div className="badge error" style={{ padding: "10px 14px", fontSize: "0.85rem" }}>⚠️ {error}</div>}

      {/* Filter Controls */}
      <div className="card pad row" style={{ justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 10, flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Buscar por código o nombre de cuenta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {[
            { id: "ALL", label: "Todas" },
            { id: "Asset", label: "1. Activo" },
            { id: "Liability", label: "2. Pasivo" },
            { id: "Equity", label: "3. Pat. Neto" },
            { id: "Income", label: "4. Ingresos" },
            { id: "Expense", label: "5. Egresos" }
          ].map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${selectedType === t.id ? "active" : ""}`}
              onClick={() => setSelectedType(t.id)}
              style={{ fontSize: "0.8rem", padding: "6px 12px" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Tree Table */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Código</th>
              <th>Nombre de la Cuenta</th>
              <th style={{ width: 100 }}>Tipo</th>
              <th style={{ width: 90, textAlign: "center" }}>Nivel</th>
              <th style={{ width: 110, textAlign: "center" }}>Imputable</th>
              <th style={{ width: 80, textAlign: "center" }}>Moneda</th>
              <th style={{ width: 80, textAlign: "center" }}>Estado</th>
              <th style={{ width: 140, textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 30 }} className="muted">
                  Cargando Plan de Cuentas...
                </td>
              </tr>
            ) : filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 30 }} className="muted">
                  No se encontraron cuentas contables.
                </td>
              </tr>
            ) : (
              filteredAccounts.map((acc) => {
                const indent = (acc.level - 1) * 20;
                const isGroup = !acc.isDirectPosting;

                return (
                  <tr key={acc.id} style={{ background: isGroup ? "rgba(241, 245, 249, 0.4)" : "transparent" }}>
                    <td style={{ fontFamily: "monospace", fontWeight: isGroup ? 700 : 500 }}>
                      {acc.code}
                    </td>
                    <td>
                      <div style={{ paddingLeft: indent, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{isGroup ? "📁" : "📄"}</span>
                        <span style={{ fontWeight: isGroup ? 700 : 500, color: isGroup ? "#0f172a" : "#334155" }}>
                          {acc.name}
                        </span>
                        {acc.adjustsForInflation && (
                          <span style={{ fontSize: "0.65rem", padding: "1px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4 }}>
                            AxI (RT6)
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${acc.accountType === "Asset" ? "ok" : acc.accountType === "Liability" ? "error" : "primary"}`} style={{ fontSize: "0.7rem" }}>
                        {acc.accountType === "Asset" ? "Activo" : acc.accountType === "Liability" ? "Pasivo" : acc.accountType === "Equity" ? "P. Neto" : acc.accountType === "Income" ? "Ingreso" : "Egreso"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>Nivel {acc.level}</td>
                    <td style={{ textAlign: "center" }}>
                      {acc.isDirectPosting ? (
                        <span className="badge ok" style={{ fontSize: "0.7rem" }}>Imputable</span>
                      ) : (
                        <span className="badge ghost" style={{ fontSize: "0.7rem" }}>Agrupadora</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{acc.currency || "ARS"}</td>
                    <td style={{ textAlign: "center" }}>
                      {acc.isActive !== false ? (
                        <span className="badge ok" style={{ fontSize: "0.65rem" }}>Activa</span>
                      ) : (
                        <span className="badge error" style={{ fontSize: "0.65rem" }}>Inactiva</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {isGroup && (
                          <button
                            className="btn ghost"
                            title="Agregar subcuenta dependiente"
                            onClick={() => openNewModal(acc)}
                            style={{ padding: "3px 7px", fontSize: "0.75rem" }}
                          >
                            + Sub
                          </button>
                        )}
                        <button
                          className="btn ghost"
                          title="Editar cuenta"
                          onClick={() => openEditModal(acc)}
                          style={{ padding: "3px 7px", fontSize: "0.75rem" }}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn ghost"
                          title="Eliminar cuenta"
                          onClick={() => handleDelete(acc)}
                          style={{ padding: "3px 7px", fontSize: "0.75rem", color: "#ef4444" }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Crear / Editar Cuenta */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <h3>{editingId ? `✏️ Editar Cuenta ${code}` : "➕ Nueva Cuenta Contable"}</h3>
              <button className="btn ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSave} className="stack" style={{ gap: 14 }}>
              <div className="grid-2" style={{ gap: 12 }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Código de Cuenta *
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    placeholder="Ej. 1.1.01.007"
                  />
                </label>

                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Tipo de Cuenta *
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="Asset">1. Activo</option>
                    <option value="Liability">2. Pasivo</option>
                    <option value="Equity">3. Patrimonio Neto</option>
                    <option value="Income">4. Ingresos y Ganancias</option>
                    <option value="Expense">5. Egresos, Costos y Gastos</option>
                  </select>
                </label>
              </div>

              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Nombre / Denominación de la Cuenta *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej. Banco Santander C/C"
                />
              </label>

              <div className="grid-3" style={{ gap: 12 }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Nivel Jerárquico
                  <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    <option value={1}>1 (Rubro Mayor)</option>
                    <option value={2}>2 (Capítulo)</option>
                    <option value={3}>3 (Grupo)</option>
                    <option value={4}>4 (Subcuenta)</option>
                    <option value={5}>5 (Analítica)</option>
                  </select>
                </label>

                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Cuenta Padre (Código)
                  <input
                    value={parentCode}
                    onChange={(e) => setParentCode(e.target.value)}
                    placeholder="Ej. 1.1.01"
                  />
                </label>

                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Moneda
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="ARS">ARS ($)</option>
                    <option value="USD">USD (U$S)</option>
                  </select>
                </label>
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer", background: "#f8fafc", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <input
                    type="checkbox"
                    checked={isDirectPosting}
                    onChange={(e) => setIsDirectPosting(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>¿Es Imputable en Asientos?</span>
                </label>

                <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer", background: "#f8fafc", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <input
                    type="checkbox"
                    checked={adjustsForInflation}
                    onChange={(e) => setAdjustsForInflation(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Ajuste Inflación (RT 6)</span>
                </label>
              </div>

              {editingId && (
                <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Cuenta Activa</span>
                </label>
              )}

              <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Guardando..." : "💾 Guardar Cuenta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Matriz de Mapeo Contable del Sistema */}
      {showMappingModal && mapping && (
        <div className="modal-backdrop" onClick={() => setShowMappingModal(false)}>
          <div className="modal-card" style={{ maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3>⚙️ Matriz de Mapeo Contable del Sistema</h3>
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  Configurá a qué cuentas de tu plan apuntan los eventos automáticos del ERP (Ventas, Compras, Tesorería, Sueldos y Cierres).
                </span>
              </div>
              <button className="btn ghost" onClick={() => setShowMappingModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveMapping} className="stack" style={{ gap: 16 }}>
              {/* Sección 1: Ventas & Clientes */}
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "0.95rem", color: "#1e3a8a", marginBottom: 10 }}>📊 Circuito de Ventas</h4>
                <div className="grid-3" style={{ gap: 10 }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Ventas Netas
                    <select
                      value={mapping.salesRevenueAccountCode}
                      onChange={(e) => setMapping({ ...mapping, salesRevenueAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    IVA Débito Fiscal
                    <select
                      value={mapping.salesVatDebitAccountCode}
                      onChange={(e) => setMapping({ ...mapping, salesVatDebitAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Deudores por Ventas
                    <select
                      value={mapping.accountsReceivableAccountCode}
                      onChange={(e) => setMapping({ ...mapping, accountsReceivableAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Sección 2: Compras & Proveedores */}
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "0.95rem", color: "#831843", marginBottom: 10 }}>🛒 Circuito de Compras</h4>
                <div className="grid-3" style={{ gap: 10 }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Gasto / Compra Mercaderías
                    <select
                      value={mapping.purchaseExpenseAccountCode}
                      onChange={(e) => setMapping({ ...mapping, purchaseExpenseAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    IVA Crédito Fiscal
                    <select
                      value={mapping.purchaseVatCreditAccountCode}
                      onChange={(e) => setMapping({ ...mapping, purchaseVatCreditAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Proveedores Comerciales
                    <select
                      value={mapping.accountsPayableAccountCode}
                      onChange={(e) => setMapping({ ...mapping, accountsPayableAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Sección 3: Tesorería & Medios de Cobro */}
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "0.95rem", color: "#065f46", marginBottom: 10 }}>💳 Tesorería & Cobranzas</h4>
                <div className="grid-3" style={{ gap: 10 }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Caja Efectivo
                    <select
                      value={mapping.cashAccountCode}
                      onChange={(e) => setMapping({ ...mapping, cashAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Bancos Cuentas Corrientes
                    <select
                      value={mapping.bankAccountCode}
                      onChange={(e) => setMapping({ ...mapping, bankAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    eCheqs & Cheques Físicos
                    <select
                      value={mapping.checksInHandAccountCode}
                      onChange={(e) => setMapping({ ...mapping, checksInHandAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Sección 4: Sueldos & Cargas Sociales */}
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "0.95rem", color: "#0f766e", marginBottom: 10 }}>👥 Liquidación de Sueldos (F.931)</h4>
                <div className="grid-2" style={{ gap: 10 }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Sueldos y Jornales (Gasto)
                    <select
                      value={mapping.salariesExpenseAccountCode}
                      onChange={(e) => setMapping({ ...mapping, salariesExpenseAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Sueldos a Pagar (Pasivo)
                    <select
                      value={mapping.salariesPayableAccountCode}
                      onChange={(e) => setMapping({ ...mapping, salariesPayableAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Sección 5: Cierres y Resultados */}
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "0.95rem", color: "#581c87", marginBottom: 10 }}>🏛️ Resultados & Cierres de Ejercicio</h4>
                <div className="grid-2" style={{ gap: 10 }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Resultado del Ejercicio (Patrimonio Neto)
                    <select
                      value={mapping.retainedEarningsAccountCode}
                      onChange={(e) => setMapping({ ...mapping, retainedEarningsAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Diferencia de Cambio Negativa (Pérdida)
                    <select
                      value={mapping.exchangeDifferenceLossAccountCode}
                      onChange={(e) => setMapping({ ...mapping, exchangeDifferenceLossAccountCode: e.target.value })}
                    >
                      {imputableAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button type="button" className="btn ghost" onClick={() => setShowMappingModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={savingMapping}>
                  {savingMapping ? "Guardando..." : "💾 Guardar Mapeo del Sistema"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
