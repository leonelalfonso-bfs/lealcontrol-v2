import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { ExcelToolbar } from "../components/ExcelTools";
import { type StockItem, type Warehouse, type StockTransfer, type StockMovement } from "../api/types";

type TabMode = "stock" | "transfers" | "kardex" | "warehouses";

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabMode>("stock");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Stock Matrix State
  const [items, setItems] = useState<StockItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  // Warehouses State
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Transfers State
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [transferFilter, setTransferFilter] = useState("All");

  // Kardex State
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [kardexProductFilter, setKardexProductFilter] = useState<string>("");
  const [kardexTypeFilter, setKardexTypeFilter] = useState<string>("");

  // Reorder State
  const [reordering, setReordering] = useState(false);

  // Modal: Physical Count Adjustment
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  const [newPhysicalStock, setNewPhysicalStock] = useState(0);
  const [minimumStock, setMinimumStock] = useState(0);
  const [location, setLocation] = useState("");
  const [operatorName, setOperatorName] = useState("Operador Almacén");
  const [serialNumbers, setSerialNumbers] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [reasonNotes, setReasonNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Modal: Create Transfer
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [originWarehouseId, setOriginWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [transferOperator, setTransferOperator] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferLines, setTransferLines] = useState<
    Array<{ productId: string; productCode: string; productName: string; quantity: number; serialNumbers: string; lotNumber: string }>
  >([]);
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Modal: Create / Edit Warehouse
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whType, setWhType] = useState<"MainWarehouse" | "Workshop" | "MobileUnit" | "Scrap">("MainWarehouse");
  const [whAddress, setWhAddress] = useState("");
  const [whTechnician, setWhTechnician] = useState("");
  const [whIsActive, setWhIsActive] = useState(true);
  const [savingWh, setSavingWh] = useState(false);

  const loadWarehouses = async () => {
    try {
      const whs = await api.listWarehouses();
      setWarehouses(whs);
      return whs;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const loadStock = async () => {
    setLoading(true);
    try {
      const data = await api.listInventory(search, statusFilter, selectedWarehouseId);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const loadTransfers = async () => {
    setLoading(true);
    try {
      const data = await api.listStockTransfers(transferFilter === "All" ? "" : transferFilter);
      setTransfers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  };

  const loadKardex = async () => {
    setLoading(true);
    try {
      const data = await api.listKardex({
        productId: kardexProductFilter || undefined,
        warehouseId: selectedWarehouseId || undefined,
        movementType: kardexTypeFilter || undefined,
        limit: 100
      });
      setMovements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar kardex");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (activeTab === "stock") {
      loadStock();
    } else if (activeTab === "transfers") {
      loadTransfers();
    } else if (activeTab === "kardex") {
      loadKardex();
    } else if (activeTab === "warehouses") {
      loadWarehouses();
    }
  }, [activeTab, search, statusFilter, selectedWarehouseId, transferFilter, kardexProductFilter, kardexTypeFilter]);

  // Adjust Handlers
  const handleOpenAdjust = (item: StockItem) => {
    setSelectedStock(item);
    setAdjustWarehouseId(item.warehouseId || (warehouses[0]?.id ?? ""));
    setNewPhysicalStock(item.physicalStock);
    setMinimumStock(item.minimumStock);
    setLocation(item.warehouseLocation || "Estantería Principal");
    setOperatorName("Operador Almacén");
    setSerialNumbers("");
    setLotNumber("");
    setReasonNotes("");
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStock) return;
    try {
      setAdjusting(true);
      setError(null);
      const wh = warehouses.find((w) => w.id === adjustWarehouseId);
      await api.adjustStock({
        productId: selectedStock.productId,
        newPhysicalStock,
        minimumStock,
        warehouseId: adjustWarehouseId || undefined,
        warehouseName: wh?.name || selectedStock.warehouseName,
        warehouseLocation: location,
        reasonNotes,
        operatorName,
        serialNumbers: serialNumbers.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined
      });
      setShowAdjustModal(false);
      setSuccessMsg("¡Ajuste de inventario físico y movimiento Kardex registrado exitosamente!");
      setTimeout(() => setSuccessMsg(null), 4000);
      loadStock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al ajustar inventario");
    } finally {
      setAdjusting(false);
    }
  };

  // Reorder Trigger
  const handleAutoReorder = async () => {
    const criticalCount = items.filter((i) => i.status !== "StockOK").length;
    if (criticalCount === 0) {
      alert("No hay artículos con stock por debajo del mínimo de seguridad actualmente.");
      return;
    }
    if (!confirm(`¿Desea generar automáticamente una Solicitud de Compra (Requisición) para los ${criticalCount} artículos con stock crítico?`)) {
      return;
    }
    try {
      setReordering(true);
      setError(null);
      const res = await api.generatePurchaseRequestFromStock("Reabastecimiento automático generado desde el Módulo de Inventario.");
      setSuccessMsg(`¡Solicitud de Compra generada con éxito! ID: ${res.purchaseRequestId}. Puede verla y cotizarla en el módulo de Compras.`);
      setTimeout(() => setSuccessMsg(null), 6000);
      loadStock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar solicitud de compra");
    } finally {
      setReordering(false);
    }
  };

  // Transfer Handlers
  const handleOpenNewTransfer = () => {
    if (warehouses.length < 2) {
      alert("Se requieren al menos 2 depósitos para realizar una transferencia interna.");
      return;
    }
    setOriginWarehouseId(warehouses[0]?.id ?? "");
    setDestWarehouseId(warehouses[1]?.id ?? "");
    setTransferOperator("Logística / Chofer");
    setTransferNotes("");
    setTransferLines([
      {
        productId: items[0]?.productId ?? "",
        productCode: items[0]?.productCode ?? "",
        productName: items[0]?.productName ?? "",
        quantity: 1,
        serialNumbers: "",
        lotNumber: ""
      }
    ]);
    setShowTransferModal(true);
  };

  const handleAddTransferLine = () => {
    const p = items[0];
    setTransferLines((prev) => [
      ...prev,
      {
        productId: p?.productId ?? "",
        productCode: p?.productCode ?? "",
        productName: p?.productName ?? "",
        quantity: 1,
        serialNumbers: "",
        lotNumber: ""
      }
    ]);
  };

  const handleUpdateTransferLine = (index: number, field: string, value: any) => {
    setTransferLines((prev) => {
      const copy = [...prev];
      if (field === "productId") {
        const prod = items.find((i) => i.productId === value);
        copy[index] = {
          ...copy[index],
          productId: value,
          productCode: prod?.productCode ?? "",
          productName: prod?.productName ?? ""
        };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
  };

  const handleRemoveTransferLine = (index: number) => {
    setTransferLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateTransferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (originWarehouseId === destWarehouseId) {
      alert("El depósito de origen y el depósito de destino no pueden ser el mismo.");
      return;
    }
    if (transferLines.length === 0) {
      alert("Debe agregar al menos un artículo a la transferencia.");
      return;
    }
    try {
      setSavingTransfer(true);
      setError(null);
      await api.createStockTransfer({
        originWarehouseId,
        destinationWarehouseId: destWarehouseId,
        operatorName: transferOperator,
        notes: transferNotes,
        items: transferLines.map((l) => ({
          productId: l.productId,
          productCode: l.productCode,
          productName: l.productName,
          quantity: Number(l.quantity),
          serialNumbers: l.serialNumbers.trim() || undefined,
          lotNumber: l.lotNumber.trim() || undefined
        }))
      });
      setShowTransferModal(false);
      setSuccessMsg("¡Transferencia despachada y en tránsito exitosamente!");
      setTimeout(() => setSuccessMsg(null), 4000);
      loadTransfers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear transferencia");
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleReceiveTransfer = async (id: string) => {
    const op = prompt("Ingrese el nombre del operador que recibe en destino:", "Operador Destino");
    if (!op) return;
    try {
      setError(null);
      await api.receiveStockTransfer(id, op);
      setSuccessMsg("¡Transferencia recibida e ingresada al depósito de destino!");
      setTimeout(() => setSuccessMsg(null), 4000);
      loadTransfers();
      loadStock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al recibir transferencia");
    }
  };

  // Warehouse Handlers
  const handleOpenNewWarehouse = () => {
    setEditingWarehouseId(null);
    setWhCode(`DEP-0${warehouses.length + 1}`);
    setWhName("");
    setWhType("MainWarehouse");
    setWhAddress("");
    setWhTechnician("");
    setWhIsActive(true);
    setShowWarehouseModal(true);
  };

  const handleOpenEditWarehouse = (wh: Warehouse) => {
    setEditingWarehouseId(wh.id);
    setWhCode(wh.code);
    setWhName(wh.name);
    setWhType(wh.type);
    setWhAddress(wh.address || "");
    setWhTechnician(wh.assignedTechnicianName || "");
    setWhIsActive(wh.isActive);
    setShowWarehouseModal(true);
  };

  const handleWarehouseSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSavingWh(true);
      setError(null);
      if (editingWarehouseId) {
        await api.updateWarehouse(editingWarehouseId, {
          code: whCode,
          name: whName,
          type: whType,
          address: whAddress || undefined,
          assignedTechnicianName: whTechnician || undefined,
          isActive: whIsActive
        });
        setSuccessMsg("¡Depósito actualizado exitosamente!");
      } else {
        await api.createWarehouse({
          code: whCode,
          name: whName,
          type: whType,
          address: whAddress || undefined,
          assignedTechnicianName: whTechnician || undefined
        });
        setSuccessMsg("¡Nuevo depósito creado exitosamente!");
      }
      setShowWarehouseModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadWarehouses();
      loadStock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar depósito");
    } finally {
      setSavingWh(false);
    }
  };

  // Calculations for KPIs
  const totalPhysical = items.reduce((sum, i) => sum + i.physicalStock, 0);
  const totalReserved = items.reduce((sum, i) => sum + i.reservedStock, 0);
  const totalIncoming = items.reduce((sum, i) => sum + i.incomingStock, 0);
  const totalAvailable = items.reduce((sum, i) => sum + i.availableStock, 0);
  const totalValuationArs = items.reduce((sum, i) => sum + i.physicalStock * i.unitCostArs, 0);
  const totalValuationUsd = items.reduce((sum, i) => sum + i.physicalStock * i.unitCostUsd, 0);
  const criticalCount = items.filter((i) => i.status !== "StockOK").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📦 Control de Stock & Depósitos</h1>
          <p className="muted">
            Gestión multi-depósito (Central, Taller, Furgones Sprinter), trazabilidad 4D (Físico, Reservado, Disponible, Entrante), Kardex y Remitos de Transferencia
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}><ExcelToolbar fileName="stock" rows={items} columns={[{ key: "productCode", header: "Código" }, { key: "productName", header: "Producto" }, { key: "warehouseName", header: "Depósito" }, { key: "physicalStock", header: "Stock físico" }, { key: "availableStock", header: "Disponible" }, { key: "status", header: "Estado" }]} />
          {activeTab === "stock" && (
            <button
              type="button"
              className="btn ghost"
              onClick={handleAutoReorder}
              disabled={reordering || criticalCount === 0}
              style={{
                borderColor: criticalCount > 0 ? "var(--color-primary)" : undefined,
                color: criticalCount > 0 ? "var(--color-primary)" : undefined,
                fontWeight: 600
              }}
            >
              ⚡ Reabastecimiento Automático ({criticalCount})
            </button>
          )}
          {activeTab === "transfers" && (
            <button type="button" className="btn" onClick={handleOpenNewTransfer}>
              ➕ Nueva Transferencia Interna
            </button>
          )}
          {activeTab === "warehouses" && (
            <button type="button" className="btn" onClick={handleOpenNewWarehouse}>
              ➕ Nuevo Depósito / Móvil
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {successMsg && (
        <div className="alert ok" style={{ background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46" }}>
          {successMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tab-row" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === "stock" ? "active" : ""}`}
          onClick={() => setActiveTab("stock")}
        >
          📊 Matriz de Stock en Vivo (4D)
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "transfers" ? "active" : ""}`}
          onClick={() => setActiveTab("transfers")}
        >
          🚚 Transferencias Internas ({transfers.filter((t) => t.status === "InTransit").length} en tránsito)
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "kardex" ? "active" : ""}`}
          onClick={() => setActiveTab("kardex")}
        >
          📜 Kardex & Trazabilidad
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "warehouses" ? "active" : ""}`}
          onClick={() => setActiveTab("warehouses")}
        >
          🏢 Depósitos & Móviles Técnicos ({warehouses.length})
        </button>
      </div>

      {/* TAB 1: STOCK MATRIX */}
      {activeTab === "stock" && (
        <>
          <div className="kpi kpi-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
            <div className="card">
              <span className="muted">Stock Físico Real</span>
              <strong style={{ fontSize: "1.5rem" }}>{totalPhysical.toLocaleString("es-AR")} u.</strong>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>En estanterías y depósitos</div>
            </div>
            <div className="card">
              <span className="muted">Stock Reservado</span>
              <strong style={{ fontSize: "1.5rem", color: totalReserved > 0 ? "#d97706" : "inherit" }}>
                {totalReserved.toLocaleString("es-AR")} u.
              </strong>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>Comprometido en Ventas</div>
            </div>
            <div className="card">
              <span className="muted">Disponible para Venta</span>
              <strong style={{ fontSize: "1.5rem", color: totalAvailable > 0 ? "#059669" : "#dc2626" }}>
                {totalAvailable.toLocaleString("es-AR")} u.
              </strong>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>Físico Neto - Reservas</div>
            </div>
            <div className="card">
              <span className="muted">Stock Entrante (Compras)</span>
              <strong style={{ fontSize: "1.5rem", color: "#2563eb" }}>{totalIncoming.toLocaleString("es-AR")} u.</strong>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>En Recepción de Proveedores</div>
            </div>
            <div className="card">
              <span className="muted">Valorización Stock</span>
              <strong style={{ fontSize: "1.25rem" }}>
                {totalValuationUsd > 0 && `USD $${totalValuationUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                {totalValuationUsd > 0 && totalValuationArs > 0 && " + "}
                {totalValuationArs > 0 && `$${totalValuationArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                {totalValuationUsd === 0 && totalValuationArs === 0 && "$0,00"}
              </strong>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>Costo reposición total</div>
            </div>
            <div className="card" style={{ borderColor: criticalCount > 0 ? "#fca5a5" : undefined }}>
              <span className="muted">Alertas de Reposición</span>
              <strong style={{ fontSize: "1.5rem", color: criticalCount > 0 ? "#dc2626" : "#059669" }}>
                {criticalCount} artículos
              </strong>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>Bajo el stock de seguridad</div>
            </div>
          </div>

          <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <input
                type="search"
                placeholder="Buscar por código, descripción..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 280 }}
              />

              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                style={{ width: 240 }}
              >
                <option value="">🏢 Todos los Depósitos</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.type === "MainWarehouse" ? "🏭" : w.type === "Workshop" ? "🔬" : w.type === "MobileUnit" ? "🚚" : "🗑️"} {w.code} - {w.name}
                  </option>
                ))}
              </select>

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 200 }}>
                <option value="All">Todos los Estados</option>
                <option value="StockOK">🟢 Stock Normal / OK</option>
                <option value="LowStock">🟡 Reposición Mínima</option>
                <option value="OutStock">🔴 Quiebre / Sin Stock</option>
              </select>
            </div>
          </div>

          <div className="card">
            {loading ? (
              <p className="pad muted">Cargando matriz de inventario en tiempo real…</p>
            ) : items.length === 0 ? (
              <p className="pad muted" style={{ textAlign: "center" }}>No hay artículos registrados en este depósito o filtro.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Artículo / Código</th>
                      <th>Depósito & Ubicación</th>
                      <th style={{ textAlign: "right" }}>Stock Físico</th>
                      <th style={{ textAlign: "right" }}>Reservado</th>
                      <th style={{ textAlign: "right" }}>Disponible</th>
                      <th style={{ textAlign: "right" }}>Entrante</th>
                      <th style={{ textAlign: "right" }}>Proyectado</th>
                      <th style={{ textAlign: "right" }}>Mínimo</th>
                      <th>Estado</th>
                      <th style={{ textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>📦 {item.productCode}</strong>
                          <div className="muted" style={{ fontSize: "0.85rem" }}>{item.productName}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>🏢 {item.warehouseName}</div>
                          <div className="muted" style={{ fontSize: "0.78rem" }}>📍 {item.warehouseLocation || "Estantería Principal"}</div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong>{item.physicalStock.toLocaleString("es-AR")} u.</strong>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {item.reservedStock > 0 ? (
                            <span className="badge warn" style={{ fontSize: "0.78rem" }}>
                              🔒 {item.reservedStock.toLocaleString("es-AR")}
                            </span>
                          ) : (
                            <span className="muted">0</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong
                            style={{
                              color: item.availableStock > 0 ? "#059669" : "#dc2626",
                              fontSize: "0.95rem"
                            }}
                          >
                            {item.availableStock.toLocaleString("es-AR")} u.
                          </strong>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {item.incomingStock > 0 ? (
                            <span style={{ color: "#2563eb", fontWeight: 600 }}>
                              📥 +{item.incomingStock.toLocaleString("es-AR")}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="muted">{item.forecastedStock.toLocaleString("es-AR")} u.</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="muted">{item.minimumStock.toLocaleString("es-AR")} u.</span>
                        </td>
                        <td>
                          {item.status === "StockOK" && <span className="badge ok">🟢 Óptimo</span>}
                          {item.status === "LowStock" && <span className="badge warn">🟡 Reposición</span>}
                          {item.status === "OutStock" && <span className="badge prio-high">🔴 Sin Stock</span>}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                              title="Ajuste de Conteo Físico"
                              onClick={() => handleOpenAdjust(item)}
                            >
                              ⚖️ Recuento
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                              title="Ver Kardex"
                              onClick={() => {
                                setKardexProductFilter(item.productId);
                                setActiveTab("kardex");
                              }}
                            >
                              📜 Kardex
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: TRANSFERS */}
      {activeTab === "transfers" && (
        <>
          <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 12 }}>
              <select value={transferFilter} onChange={(e) => setTransferFilter(e.target.value)} style={{ width: 220 }}>
                <option value="All">Todas las Transferencias</option>
                <option value="InTransit">🚚 En Tránsito / Despachadas</option>
                <option value="Received">✅ Recibidas en Destino</option>
                <option value="Draft">📝 Borradores</option>
              </select>
            </div>
            <button type="button" className="btn" onClick={handleOpenNewTransfer}>
              ➕ Nueva Transferencia
            </button>
          </div>

          <div className="card">
            {loading ? (
              <p className="pad muted">Cargando transferencias internas…</p>
            ) : transfers.length === 0 ? (
              <p className="pad muted" style={{ textAlign: "center" }}>No hay transferencias de stock registradas.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N° Remito Interno</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Artículos / Detalle</th>
                      <th>Operador / Chofer</th>
                      <th>Despachado / Recibido</th>
                      <th>Estado</th>
                      <th style={{ textAlign: "right" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>🚚 {t.transferNumber}</strong>
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {new Date(t.createdAtUtc).toLocaleDateString("es-AR")}
                          </div>
                        </td>
                        <td>🏢 {t.originWarehouseName}</td>
                        <td>🎯 {t.destinationWarehouseName}</td>
                        <td>
                          <div style={{ fontSize: "0.85rem" }}>
                            {t.items?.map((it, idx) => (
                              <div key={idx}>
                                • <strong>{it.quantity} u.</strong> - {it.productCode} ({it.productName})
                                {it.serialNumbers && <span className="muted"> [S/N: {it.serialNumbers}]</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>👤 {t.operatorName || "Logística"}</td>
                        <td>
                          <div style={{ fontSize: "0.8rem" }}>
                            {t.dispatchedAtUtc && <div>Desp: {new Date(t.dispatchedAtUtc).toLocaleString("es-AR")}</div>}
                            {t.receivedAtUtc && <div style={{ color: "#059669" }}>Recib: {new Date(t.receivedAtUtc).toLocaleString("es-AR")}</div>}
                          </div>
                        </td>
                        <td>
                          {t.status === "InTransit" && <span className="badge warn">🚚 En Tránsito</span>}
                          {t.status === "Received" && <span className="badge ok">✅ Recibido</span>}
                          {t.status === "Draft" && <span className="badge">📝 Borrador</span>}
                          {t.status === "Cancelled" && <span className="badge prio-high">❌ Cancelado</span>}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {t.status === "InTransit" && (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: "5px 12px", fontSize: "0.82rem" }}
                              onClick={() => handleReceiveTransfer(t.id)}
                            >
                              📥 Recibir en Destino
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 3: KARDEX */}
      {activeTab === "kardex" && (
        <>
          <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <select
                value={kardexProductFilter}
                onChange={(e) => setKardexProductFilter(e.target.value)}
                style={{ width: 280 }}
              >
                <option value="">📦 Todos los Artículos</option>
                {items.map((it) => (
                  <option key={it.productId} value={it.productId}>
                    {it.productCode} - {it.productName}
                  </option>
                ))}
              </select>

              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                style={{ width: 220 }}
              >
                <option value="">🏢 Todos los Depósitos</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>

              <select
                value={kardexTypeFilter}
                onChange={(e) => setKardexTypeFilter(e.target.value)}
                style={{ width: 220 }}
              >
                <option value="">🔄 Todas las Operaciones</option>
                <option value="PhysicalCountAdjustment">⚖️ Ajuste Conteo Físico</option>
                <option value="PurchaseReception">📥 Recepción Proveedor</option>
                <option value="TransferOut">📤 Transferencia Salida</option>
                <option value="TransferIn">📥 Transferencia Entrada</option>
                <option value="SaleDelivery">📦 Remito de Venta</option>
              </select>
            </div>
          </div>

          <div className="card">
            {loading ? (
              <p className="pad muted">Cargando libro Kardex y movimientos…</p>
            ) : movements.length === 0 ? (
              <p className="pad muted" style={{ textAlign: "center" }}>No hay movimientos registrados para el filtro seleccionado.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha & Hora</th>
                      <th>Artículo</th>
                      <th>Depósito</th>
                      <th>Operación</th>
                      <th>Operador</th>
                      <th style={{ textAlign: "right" }}>Cantidad</th>
                      <th style={{ textAlign: "right" }}>Saldo Resultante</th>
                      <th>N° Serie / Lote</th>
                      <th>Referencia & Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m.id}>
                          <td>{new Date(m.createdAtUtc).toLocaleString("es-AR")}</td>
                          <td>
                            <strong>📦 {m.productCode}</strong>
                            <div className="muted" style={{ fontSize: "0.78rem" }}>{m.productName}</div>
                          </td>
                          <td>🏢 {m.warehouseName}</td>
                          <td>
                            <span className="badge" style={{ fontSize: "0.78rem" }}>
                              {m.movementType === "PhysicalCountAdjustment"
                                ? "⚖️ Ajuste Conteo"
                                : m.movementType === "PurchaseReception"
                                ? "📥 Recepción Compra"
                                : m.movementType === "TransferOut"
                                ? "📤 Salida Transferencia"
                                : m.movementType === "TransferIn"
                                ? "📥 Entrada Transferencia"
                                : m.movementType}
                            </span>
                          </td>
                          <td>👤 {m.operatorName || "Sistema"}</td>
                          <td style={{ textAlign: "right" }}>
                            <strong style={{ color: isPositive ? "#059669" : "#dc2626" }}>
                              {isPositive ? `+${m.quantity}` : m.quantity} u.
                            </strong>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <strong>{m.newPhysicalStock} u.</strong>
                          </td>
                          <td>
                            {m.serialNumbers && <div>S/N: {m.serialNumbers}</div>}
                            {m.lotNumber && <div>Lote: {m.lotNumber}</div>}
                            {!m.serialNumbers && !m.lotNumber && <span className="muted">—</span>}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{m.referenceNumber || m.referenceType}</div>
                            <div className="muted" style={{ fontSize: "0.8rem" }}>{m.notes}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 4: WAREHOUSES & MOBILE UNITS */}
      {activeTab === "warehouses" && (
        <>
          <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={handleOpenNewWarehouse}>
              ➕ Nuevo Depósito / Móvil
            </button>
          </div>

          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {warehouses.map((wh) => (
              <div key={wh.id} className="card pad stack" style={{ gap: 12, justifyContent: "space-between" }}>
                <div>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="badge ok" style={{ fontSize: "0.78rem" }}>
                      {wh.type === "MainWarehouse"
                        ? "🏭 Almacén Principal"
                        : wh.type === "Workshop"
                        ? "🔬 Taller / Laboratorio"
                        : wh.type === "MobileUnit"
                        ? "🚚 Móvil Técnico"
                        : "🗑️ Scrap / Desecho"}
                    </span>
                    <strong className="muted">{wh.code}</strong>
                  </div>

                  <h3 style={{ marginTop: 10, marginBottom: 4 }}>{wh.name}</h3>

                  <div className="stack" style={{ gap: 4, fontSize: "0.85rem", color: "var(--color-muted)" }}>
                    {wh.address && <div>📍 {wh.address}</div>}
                    {wh.assignedTechnicianName && <div>👤 Técnico: <strong>{wh.assignedTechnicianName}</strong></div>}
                  </div>
                </div>

                <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                    onClick={() => handleOpenEditWarehouse(wh)}
                  >
                    ✏️ Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MODAL: PHYSICAL COUNT ADJUSTMENT */}
      {showAdjustModal && selectedStock && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 540 }}>
            <h3>⚖️ Ajuste de Conteo Físico & Inventario</h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 16px 0" }}>
              {selectedStock.productCode} — {selectedStock.productName}
            </p>

            <form onSubmit={handleAdjustSubmit} className="stack" style={{ gap: 14 }}>
              <label>
                Depósito / Almacén *
                <select
                  value={adjustWarehouseId}
                  onChange={(e) => setAdjustWarehouseId(e.target.value)}
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} - {w.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid-2">
                <label>
                  Stock Físico Real Contado *
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPhysicalStock}
                    onChange={(e) => setNewPhysicalStock(Number(e.target.value))}
                    required
                  />
                  <small className="muted">Anterior: {selectedStock.physicalStock} u.</small>
                </label>

                <label>
                  Stock Mínimo de Alerta *
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={minimumStock}
                    onChange={(e) => setMinimumStock(Number(e.target.value))}
                    required
                  />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Ubicación Física
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Estante A3, Fila 2..."
                  />
                </label>

                <label>
                  Operador Responsable
                  <input
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="Nombre del operador"
                  />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Números de Serie (Opcional)
                  <input
                    value={serialNumbers}
                    onChange={(e) => setSerialNumbers(e.target.value)}
                    placeholder="SN-1002, SN-1003..."
                  />
                </label>

                <label>
                  Lote / Batch (Opcional)
                  <input
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="LOTE-2026-A..."
                  />
                </label>
              </div>

              <label>
                Justificación / Motivo del Ajuste *
                <input
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  placeholder="Recuento físico mensual, rotura, merma, calibración..."
                  required
                />
              </label>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowAdjustModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={adjusting}>
                  {adjusting ? "Guardando..." : "Confirmar Ajuste y Kardex"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE INTERNAL TRANSFER */}
      {showTransferModal && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 650 }}>
            <h3>🚚 Nueva Transferencia Interna de Mercadería</h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 16px 0" }}>
              Genera un remito interno de traslado entre depósitos o hacia móviles técnicos.
            </p>

            <form onSubmit={handleCreateTransferSubmit} className="stack" style={{ gap: 14 }}>
              <div className="grid-2">
                <label>
                  Depósito Origen *
                  <select
                    value={originWarehouseId}
                    onChange={(e) => setOriginWarehouseId(e.target.value)}
                    required
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Depósito Destino *
                  <select
                    value={destWarehouseId}
                    onChange={(e) => setDestWarehouseId(e.target.value)}
                    required
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Conductor / Operador de Traslado
                  <input
                    value={transferOperator}
                    onChange={(e) => setTransferOperator(e.target.value)}
                    placeholder="Ej. Técnico Chofer Móvil 1"
                  />
                </label>

                <label>
                  Observaciones / Motivo
                  <input
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Reposición de repuestos para servicio en campo..."
                  />
                </label>
              </div>

              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Ítems a Transferir</strong>
                  <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: "0.8rem" }} onClick={handleAddTransferLine}>
                    ➕ Agregar Artículo
                  </button>
                </div>

                {transferLines.map((line, idx) => (
                  <div key={idx} className="card pad row" style={{ gap: 10, alignItems: "flex-end" }}>
                    <div style={{ flex: 3 }}>
                      <label style={{ fontSize: "0.8rem" }}>Artículo</label>
                      <select
                        value={line.productId}
                        onChange={(e) => handleUpdateTransferLine(idx, "productId", e.target.value)}
                        required
                      >
                        {items.map((it) => (
                          <option key={it.productId} value={it.productId}>
                            {it.productCode} - {it.productName} (Disp: {it.availableStock} u.)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "0.8rem" }}>Cantidad</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => handleUpdateTransferLine(idx, "quantity", e.target.value)}
                        required
                      />
                    </div>

                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: "0.8rem" }}>S/N / Lote (Opcional)</label>
                      <input
                        value={line.serialNumbers}
                        onChange={(e) => handleUpdateTransferLine(idx, "serialNumbers", e.target.value)}
                        placeholder="Números de serie"
                      />
                    </div>

                    {transferLines.length > 1 && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ color: "#dc2626", padding: "6px 8px" }}
                        onClick={() => handleRemoveTransferLine(idx)}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowTransferModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={savingTransfer}>
                  {savingTransfer ? "Despachando..." : "Despachar Transferencia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT WAREHOUSE */}
      {showWarehouseModal && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 480 }}>
            <h3>{editingWarehouseId ? "✏️ Editar Depósito" : "🏢 Nuevo Depósito / Móvil Técnico"}</h3>

            <form onSubmit={handleWarehouseSubmit} className="stack" style={{ gap: 14, marginTop: 12 }}>
              <div className="grid-2">
                <label>
                  Código *
                  <input
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                    placeholder="DEP-01, MOV-01..."
                    required
                  />
                </label>

                <label>
                  Tipo de Depósito *
                  <select
                    value={whType}
                    onChange={(e) => setWhType(e.target.value as any)}
                    required
                  >
                    <option value="MainWarehouse">🏭 Almacén Principal</option>
                    <option value="Workshop">🔬 Taller & Laboratorio</option>
                    <option value="MobileUnit">🚚 Móvil Técnico (Vehículo)</option>
                    <option value="Scrap">🗑️ Cuarentena / Scrap</option>
                  </select>
                </label>
              </div>

              <label>
                Nombre del Depósito / Móvil *
                <input
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  placeholder="Ej. Depósito Central, Sprinter Móvil 1, Laboratorio..."
                  required
                />
              </label>

              <label>
                Dirección / Ubicación Física / Patente
                <input
                  value={whAddress}
                  onChange={(e) => setWhAddress(e.target.value)}
                  placeholder="Ej. Calle San Martín 1234 o Patente AF-123-JK"
                />
              </label>

              <label>
                Técnico o Responsable Asignado
                <input
                  value={whTechnician}
                  onChange={(e) => setWhTechnician(e.target.value)}
                  placeholder="Nombre del técnico a cargo"
                />
              </label>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowWarehouseModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={savingWh}>
                  {savingWh ? "Guardando..." : "Guardar Depósito"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
