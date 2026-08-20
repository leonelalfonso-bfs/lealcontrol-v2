import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  currencyMeta,
  productTypeLabels,
  productTypeMeta,
  type ExchangeRates,
  type Product,
  type ProductCategory
} from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "inCatalog" | "internal">("all");

  const filteredProducts = products.filter((item) => {
    if (catalogFilter === "inCatalog") return item.customAttributes?.showInCatalog !== "false";
    if (catalogFilter === "internal") return item.customAttributes?.showInCatalog === "false";
    return true;
  });

  // Category Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const [prodsData, catsData, ratesData] = await Promise.all([
        api.listProducts(search, selectedType, selectedCategory),
        api.listCategories(),
        api.getExchangeRates().catch(() => null)
      ]);
      setProducts(prodsData);
      setCategories(catsData);
      if (ratesData) setRates(ratesData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar el catálogo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [search, selectedType, selectedCategory]);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`¿Está seguro de dar de baja el producto "${name}"?`)) return;
    try {
      await api.deleteProduct(id);
      fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al eliminar producto");
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setSavingCategory(true);
      await api.createCategory({ name: newCatName, description: newCatDesc });
      setNewCatName("");
      setNewCatDesc("");
      setShowCategoryModal(false);
      fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al crear categoría");
    } finally {
      setSavingCategory(false);
    }
  };

  // Import Status Feedback Modal
  const [importStatus, setImportStatus] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImportProducts = async (rawRows: Record<string, unknown>[]) => {
    setError(null);
    setImporting(true);
    let successCount = 0;
    const errors: string[] = [];
    const currentCategories = [...categories];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;

      // Extract Code
      const code = String(
        row.code ?? row.Code ?? row["Código"] ?? row["Codigo"] ?? row["CÓDIGO"] ?? row.SKU ?? row.sku ?? ""
      ).trim();

      // Extract Name
      const name = String(
        row.name ?? row.Name ?? row["Nombre"] ?? row["NOMBRE"] ?? row["Descripción"] ?? row["Descripcion"] ?? row["DESCRIPCION"] ?? row.description ?? ""
      ).trim();

      if (!code || !name) {
        errors.push(`Fila ${rowNum}: El Código y Nombre son obligatorios.`);
        continue;
      }

      // Extract Category / Rubro
      const rawCategory = String(
        row.category ?? row.Category ?? row["Categoría"] ?? row["Categoria"] ?? row["CATEGORÍA"] ?? row["Rubro"] ?? row["RUBRO"] ?? row["Familia"] ?? ""
      ).trim();

      // Extract Raw Type
      const rawType = String(
        row.type ?? row.Type ?? row["Tipo"] ?? row["TIPO"] ?? row["Tipo de Producto"] ?? ""
      ).trim();

      let finalType = "Product";
      let finalCategoryName = rawCategory;

      const lowerType = rawType.toLowerCase();
      if (lowerType === "service" || lowerType === "servicio" || lowerType === "servicios") {
        finalType = "Service";
      } else if (lowerType === "manufactured" || lowerType === "fabricado" || lowerType === "elaborado") {
        finalType = "Manufactured";
      } else if (lowerType === "rawmaterial" || lowerType === "materia prima" || lowerType === "insumo" || lowerType === "insumos") {
        finalType = "RawMaterial";
      } else if (lowerType === "sparepart" || lowerType === "repuesto" || lowerType === "repuestos") {
        finalType = "SparePart";
      } else if (lowerType === "kit" || lowerType === "combo") {
        finalType = "Kit";
      } else if (lowerType === "product" || lowerType === "producto" || lowerType === "directsale" || lowerType === "venta directa") {
        finalType = "Product";
      } else if (rawType) {
        // If type contains a category name (e.g. "DORMITORIO", "BAÑO", "COCINA"), use as category
        if (!finalCategoryName) {
          finalCategoryName = rawType;
        }
        finalType = "Product";
      }

      // Resolve or auto-create Category
      let categoryId: string | undefined = undefined;
      if (finalCategoryName) {
        const found = currentCategories.find(
          (c) => c.name.toLowerCase() === finalCategoryName.toLowerCase()
        );
        if (found) {
          categoryId = found.id;
        } else {
          try {
            const newCat = await api.createCategory({ name: finalCategoryName, description: `Categoría ${finalCategoryName}` });
            currentCategories.push(newCat);
            setCategories([...currentCategories]);
            categoryId = newCat.id;
          } catch {
            // Category creation optional
          }
        }
      }

      // Unit
      const baseUnit = String(
        row.baseUnit ?? row.BaseUnit ?? row["Unidad"] ?? row["UNIDAD"] ?? row["Unidad de Medida"] ?? row.unit ?? "UN"
      ).trim() || "UN";

      // Currency
      const saleCurrency = String(
        row.saleCurrency ?? row.SaleCurrency ?? row["Moneda Venta"] ?? row["Moneda"] ?? row.currency ?? "ARS"
      ).trim().toUpperCase() === "USD" ? "USD" : "ARS";

      const purchaseCurrency = String(
        row.purchaseCurrency ?? row.PurchaseCurrency ?? row["Moneda Compra"] ?? "ARS"
      ).trim().toUpperCase() === "USD" ? "USD" : "ARS";

      // Number parsing
      const parseNumber = (val: unknown): number => {
        if (typeof val === "number") return isNaN(val) ? 0 : val;
        if (!val) return 0;
        const cleaned = String(val).replace(/[$]/g, "").replace(/\s/g, "").replace(",", ".");
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      };

      const basePrice = parseNumber(
        row.basePrice ?? row.BasePrice ?? row["Precio venta"] ?? row["Precio Venta"] ?? row["Precio"] ?? row.price
      );

      const costPrice = parseNumber(
        row.costPrice ?? row.CostPrice ?? row["Costo"] ?? row["Precio Costo"] ?? row.cost
      );

      const taxRate = parseNumber(
        row.taxRate ?? row.TaxRate ?? row["IVA"] ?? row["Alícuota"] ?? row["Alicuota"] ?? 21
      ) || 21;

      const minStock = parseNumber(
        row.minStock ?? row.MinStock ?? row["Stock Mínimo"] ?? row["Stock Minimo"] ?? 0
      );

      try {
        await api.createProduct({
          code,
          name,
          description: String(row.description ?? row["Descripción"] ?? row["Descripcion"] ?? "") || undefined,
          type: finalType,
          categoryId,
          saleCurrency,
          basePrice,
          purchaseCurrency,
          costPrice,
          taxRate,
          trackStock: finalType !== "Service",
          minStock,
          baseUnit,
          hasSerialNumber: false,
          trackLot: false
        });
        successCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error al registrar producto";
        errors.push(`Fila ${rowNum} (${code} - ${name}): ${msg}`);
      }
    }

    setImporting(false);
    setImportStatus({ success: successCount, failed: errors.length, errors });
    fetchProducts();
  };

  // KPIs
  const totalCount = products.length;
  const productCount = products.filter((p) => p.type === "Product").length;
  const serviceCount = products.filter((p) => p.type === "Service").length;

  return (
    <>
      {/* Header clean per user directive */}
      <div className="page-head">
        <div>
          <h1>Catálogo de Productos y Servicios</h1>
          <div className="muted">
            Gestión centralizada de artículos, servicios, precios multi-moneda y cotizaciones en tiempo real
          </div>
        </div>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => setShowCategoryModal(true)}
            className="btn ghost"
          >
            + Nueva Categoría
          </button>
          <ExcelToolbar
            fileName="productos"
            rows={products}
            columns={[
              { key: "code", header: "Código" },
              { key: "name", header: "Nombre" },
              { key: "type", header: "Tipo" },
              { key: "baseUnit", header: "Unidad" },
              { key: "basePrice", header: "Precio venta" },
              { key: "costPrice", header: "Costo" }
            ]}
            templateColumns={["Código", "Nombre", "Rubro", "Tipo", "Unidad", "Precio Venta", "Costo", "IVA", "Stock Mínimo"]}
            onImport={handleImportProducts}
          />
          <Link to="/productos/nuevo" className="btn">
            + Nuevo Producto / Servicio
          </Link>
        </div>
      </div>

      {/* Live Exchange Rate Bar from DolarApi (BNA Vendedor & BNA Mayorista Vendedor) */}
      <div className="card pad" style={{ marginBottom: "16px", background: "rgba(10, 122, 106, 0.08)", border: "1px solid rgba(10, 122, 106, 0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.1rem" }}>🟢</span>
            <div>
              <strong>Cotización Live DolarApi (Banco Nación)</strong>
              <div className="muted" style={{ fontSize: "0.78rem" }}>
                Utilizado para la conversión de precios y presupuestos en ARS
              </div>
            </div>
          </div>

          {rates ? (
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <div className="badge ok" style={{ fontSize: "0.82rem", padding: "6px 14px", display: "flex", gap: "6px" }}>
                <span>u$s Billete (BNA Venta):</span>
                <strong>${rates.usdBillete.venta.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="badge warn" style={{ fontSize: "0.82rem", padding: "6px 14px", display: "flex", gap: "6px" }}>
                <span>u$s Divisa (BNA Mayorista Venta):</span>
                <strong>${rates.usdDivisa.venta.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: "0.8rem" }}>Cargando cotización en vivo...</div>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="kpi kpi-4">
        <div className="card">
          <div className="muted">Total Catálogo</div>
          <strong>{totalCount}</strong>
        </div>
        <div className="card">
          <div className="muted">Productos Físicos</div>
          <strong>{productCount}</strong>
        </div>
        <div className="card">
          <div className="muted">Servicios Técnicos</div>
          <strong>{serviceCount}</strong>
        </div>
        <div className="card">
          <div className="muted">Cotización BNA Billete</div>
          <strong>{rates ? `$${rates.usdBillete.venta.toLocaleString("es-AR")}` : "—"}</strong>
        </div>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="card pad filters" style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Buscar por código, nombre o descripción..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: "340px" }}
        />

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          style={{ maxWidth: "230px" }}
        >
          <option value="">Todos los Tipos</option>
          <option value="DirectSale">🛍️ Venta Directa</option>
          <option value="Service">🛠️ Servicios Intangibles</option>
          <option value="Kit">🧩 Productos Ensamblados</option>
          <option value="Manufactured">🏭 Productos Fabricados</option>
          <option value="SparePart">🔧 Repuestos Técnicos</option>
          <option value="RawMaterial">🧱 Materias Primas</option>
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ maxWidth: "200px" }}
        >
          <option value="">Todas las Categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={catalogFilter}
          onChange={(e) => setCatalogFilter(e.target.value as "all" | "inCatalog" | "internal")}
          style={{ maxWidth: "200px" }}
        >
          <option value="all">🌐 Todos los Productos</option>
          <option value="inCatalog">✅ Publicados en Catálogo</option>
          <option value="internal">🔒 Solo Uso Interno</option>
        </select>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Main Content Table */}
      <section className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: "32px", textAlign: "center" }}>
            Cargando catálogo de productos...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50, textAlign: "center" }}>Foto</th>
                  <th>Código / SKU</th>
                  <th>Descripción del Artículo</th>
                  <th>Tipo</th>
                  <th>Portal B2B</th>
                  <th>Categoría</th>
                  <th>Moneda</th>
                  <th style={{ textAlign: "right" }}>Precio Base</th>
                  <th style={{ textAlign: "right" }}>Equiv. ARS</th>
                  <th style={{ textAlign: "center" }}>Stock / Trazabilidad</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item) => {
                  const curr = currencyMeta[item.saleCurrency] ?? { label: item.saleCurrency, detail: "", symbol: "$" };
                  const typeLabel = productTypeLabels[item.type] ?? item.type;
                  const isPublic = item.customAttributes?.showInCatalog !== "false";

                  // Live exchange rate conversion to ARS
                  let priceInArs = item.basePrice;
                  if (item.saleCurrency === "USD_BILLETE" && rates) {
                    priceInArs = item.basePrice * rates.usdBillete.venta;
                  } else if (item.saleCurrency === "USD_DIVISA" && rates) {
                    priceInArs = item.basePrice * rates.usdDivisa.venta;
                  }

                  return (
                    <tr key={item.id} onClick={() => navigate(`/productos/${item.id}/editar`)}>
                      <td style={{ textAlign: "center" }}>
                        {item.imagePath ? (
                          <img
                            src={item.imagePath}
                            alt={item.name}
                            style={{
                              width: 40,
                              height: 40,
                              objectFit: "contain",
                              borderRadius: 8,
                              border: "1px solid var(--surface-border)",
                              background: "var(--surface)"
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              background: "var(--surface-muted)",
                              display: "grid",
                              placeItems: "center",
                              fontSize: "1.1rem",
                              border: "1px solid var(--surface-border)"
                            }}
                          >
                            {productTypeMeta[item.type]?.icon ?? "📦"}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{item.code}</strong>
                      </td>
                      <td>
                        <div><strong>{item.name}</strong></div>
                        {item.description && (
                          <div className="muted" style={{ fontSize: "0.8rem" }}>{item.description}</div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${productTypeMeta[item.type]?.badgeClass ?? "off"}`}>
                          {productTypeMeta[item.type]?.icon ?? "📦"} {productTypeLabels[item.type] ?? item.type}
                        </span>
                      </td>
                      <td>
                        {isPublic ? (
                          <span className="badge ok" style={{ fontSize: "0.74rem" }}>🌐 Catálogo</span>
                        ) : (
                          <span className="badge off" style={{ fontSize: "0.74rem" }}>🔒 Interno</span>
                        )}
                      </td>
                      <td className="muted">
                        {item.categoryName || "—"}
                      </td>
                      <td>
                        <span className={`badge ${item.saleCurrency !== "ARS" ? "warn" : ""}`} title={curr.detail}>
                          {curr.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                        {curr.symbol} {item.basePrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--primary)", fontWeight: "700" }}>
                        $ {priceInArs.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                          {item.type === "Service" || !item.trackStock ? (
                            <span className="badge off" style={{ fontSize: "0.72rem" }}>
                              🛠️ Sin stock
                            </span>
                          ) : (
                            <span className="badge ok" style={{ fontSize: "0.76rem" }}>
                              {item.stock} {item.baseUnit}
                            </span>
                          )}
                          {item.hasSerialNumber && <span className="tag">Serie</span>}
                          {item.trackLot && <span className="tag">Lote</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/productos/${item.id}/editar`);
                            }}
                            className="btn ghost"
                            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, item.id, item.name)}
                            className="btn danger"
                            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center", padding: "32px" }}>
                      No se encontraron artículos con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Nueva Categoría */}
      {showCategoryModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
        }}>
          <div className="card pad" style={{ maxWidth: "460px", width: "100%", background: "#fff", borderRadius: "16px" }}>
            <h3>Nueva Categoría de Catálogo</h3>
            <form onSubmit={handleCreateCategory} className="stack" style={{ marginTop: "16px" }}>
              <label>
                Nombre de la Categoría *
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ej: Instrumentación Técnica, Repuestos"
                />
              </label>

              <label>
                Descripción
                <textarea
                  rows={2}
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Descripción opcional de la categoría..."
                />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="btn ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="btn"
                >
                  {savingCategory ? "Guardando..." : "Guardar Categoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Resumen de Importación de Productos */}
      {importStatus && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
        }}>
          <div className="card pad" style={{ maxWidth: "560px", width: "100%", background: "#fff", borderRadius: "16px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <span style={{ fontSize: "1.6rem" }}>{importStatus.failed === 0 ? "🎉" : "📋"}</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>
                  Resultado de la Importación
                </h3>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Procesamiento de catálogo desde archivo Excel
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <div style={{ flex: 1, padding: "12px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#059669" }}>{importStatus.success}</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#065f46" }}>Productos Importados</div>
              </div>
              {importStatus.failed > 0 && (
                <div style={{ flex: 1, padding: "12px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", textAlign: "center" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#dc2626" }}>{importStatus.failed}</div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#991b1b" }}>Filas con Observación</div>
                </div>
              )}
            </div>

            {importStatus.errors.length > 0 && (
              <div style={{ maxHeight: "180px", overflowY: "auto", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px" }}>
                <div style={{ fontWeight: 800, fontSize: "0.8rem", color: "#64748b", marginBottom: "6px" }}>DETALLE DE OBSERVACIONES:</div>
                <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "0.82rem", color: "#dc2626" }}>
                  {importStatus.errors.map((err, idx) => (
                    <li key={idx} style={{ marginBottom: "4px" }}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="toolbar" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setImportStatus(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
