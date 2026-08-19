import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ProductCategory, ProductWrite } from "../api/types";

type TabType = "general" | "stock" | "fiscal" | "custom";

export const ProductFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>("general");

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [detailedDescription, setDetailedDescription] = useState("");
  const [type, setType] = useState<ProductWrite["type"]>("DirectSale");
  const handleTypeChange = (newType: ProductWrite["type"]) => {
    setType(newType);
    if (newType === "Service") {
      setTrackStock(false);
      setMinStock(0);
      setHasSerialNumber(false);
      setTrackLot(false);
    } else if (!trackStock) {
      setTrackStock(true);
    }
  };
  const [categoryId, setCategoryId] = useState<string>("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [showInCatalog, setShowInCatalog] = useState<boolean>(true);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen no debe superar los 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePath(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Prices & 3 Currencies
  const [saleCurrency, setSaleCurrency] = useState<ProductWrite["saleCurrency"]>("ARS");
  const [basePrice, setBasePrice] = useState<number>(0);
  const [purchaseCurrency, setPurchaseCurrency] = useState<ProductWrite["purchaseCurrency"]>("ARS");
  const [costPrice, setCostPrice] = useState<number>(0);

  // Stock & Traceability
  const [trackStock, setTrackStock] = useState(true);
  const [minStock, setMinStock] = useState<number>(0);
  const [baseUnit, setBaseUnit] = useState("UN");
  const [hasSerialNumber, setHasSerialNumber] = useState(false);
  const [trackLot, setTrackLot] = useState(false);

  // Accounting & Tax
  const [taxRate, setTaxRate] = useState<number>(21);
  const [salesAccountingCode, setSalesAccountingCode] = useState("");
  const [purchaseAccountingCode, setPurchaseAccountingCode] = useState("");

  // Custom attributes
  const [customAttributesList, setCustomAttributesList] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await api.listCategories();
        setCategories(cats);
      } catch (err: unknown) {
        console.error("Error al cargar categorías", err);
      }
    };

    loadCategories();

    if (isEditing && id) {
      const loadProduct = async () => {
        try {
          setLoading(true);
          const p = await api.getProduct(id);
          setCode(p.code);
          setName(p.name);
          setDescription(p.description ?? "");
          setDetailedDescription(p.detailedDescription ?? "");

          setType(p.type as ProductWrite["type"]);
          setCategoryId(p.categoryId ?? "");
          setImagePath(p.imagePath ?? null);

          setSaleCurrency(p.saleCurrency);
          setBasePrice(p.basePrice);
          setPurchaseCurrency(p.purchaseCurrency);
          setCostPrice(p.costPrice);

          setTrackStock(p.trackStock);
          setMinStock(p.minStock);
          setBaseUnit(p.baseUnit);
          setHasSerialNumber(p.hasSerialNumber);
          setTrackLot(p.trackLot);

          setTaxRate(p.taxRate);
          setSalesAccountingCode(p.salesAccountingCode ?? "");
          setPurchaseAccountingCode(p.purchaseAccountingCode ?? "");

          if (p.customAttributes) {
            setShowInCatalog(p.customAttributes.showInCatalog !== "false");
            setCustomAttributesList(
              Object.entries(p.customAttributes)
                .filter(([k]) => k !== "showInCatalog")
                .map(([k, v]) => ({ key: k, value: v }))
            );
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Error al cargar producto");
        } finally {
          setLoading(false);
        }
      };

      loadProduct();
    }
  }, [id, isEditing]);

  const handleAddCustomAttr = () => {
    setCustomAttributesList((prev) => [...prev, { key: "", value: "" }]);
  };

  const handleRemoveCustomAttr = (index: number) => {
    setCustomAttributesList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCustomAttrChange = (index: number, field: "key" | "value", val: string) => {
    setCustomAttributesList((prev) => {
      const copy = [...prev];
      copy[index][field] = val;
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("El código SKU y el nombre del producto son obligatorios.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Convert custom attributes array to record dictionary
      const customAttributesRecord: Record<string, string> = {
        showInCatalog: showInCatalog ? "true" : "false"
      };
      customAttributesList.forEach((attr) => {
        if (attr.key.trim() && attr.key.trim() !== "showInCatalog") {
          customAttributesRecord[attr.key.trim()] = attr.value.trim();
        }
      });

      const body: ProductWrite = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        detailedDescription: detailedDescription.trim() || null,
        type,
        categoryId: categoryId || null,
        imagePath: imagePath ? imagePath.trim() : null,
        saleCurrency,
        basePrice: Number(basePrice),
        purchaseCurrency,
        costPrice: Number(costPrice),
        taxRate: Number(taxRate),
        salesAccountingCode: salesAccountingCode.trim() || null,
        purchaseAccountingCode: purchaseAccountingCode.trim() || null,
        trackStock,
        minStock: Number(minStock),
        baseUnit: baseUnit.trim() || "UN",
        hasSerialNumber,
        trackLot,
        customAttributes: customAttributesRecord
      };

      if (isEditing && id) {
        await api.updateProduct(id, body);
      } else {
        await api.createProduct(body);
      }

      navigate("/productos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar producto");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card pad" style={{ textAlign: "center", padding: "48px" }}>
        <div className="muted">Cargando producto...</div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>{isEditing ? "Editar Producto / Servicio" : "Nuevo Producto / Servicio"}</h1>
          <p className="muted">
            Configuración comercial, precios en las 3 monedas nativas, alícuotas ARCA y trazabilidad
          </p>
        </div>
        <Link to="/productos" className="btn btn-outline">
          ← Volver al Listado
        </Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "16px", border: "1px solid #f87171" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Navigation Tabs */}
        <div className="tab-row" style={{ marginBottom: "20px" }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            🏷️ General & Precios 3-Monedas
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "stock" ? "active" : ""}`}
            onClick={() => setActiveTab("stock")}
          >
            📦 Stock & Trazabilidad
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "fiscal" ? "active" : ""}`}
            onClick={() => setActiveTab("fiscal")}
          >
            🧾 Contabilidad & Impuestos ARCA
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "custom" ? "active" : ""}`}
            onClick={() => setActiveTab("custom")}
          >
            ⚙️ Especificaciones Técnicas {customAttributesList.length > 0 && `(${customAttributesList.length})`}
          </button>
        </div>

        {/* Tab 1: General & Precios */}
        {activeTab === "general" && (
          <div className="card pad" style={{ display: "grid", gap: "20px" }}>
            {/* Top Product Header Card with Photo & Main SKU */}
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "20px", alignItems: "flex-start", paddingBottom: "16px", borderBottom: "1px solid var(--surface-border)" }}>
              {/* Photo Box */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 14,
                    border: "2px dashed var(--surface-border)",
                    background: "var(--surface-muted)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    position: "relative",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                  }}
                >
                  {imagePath ? (
                    <img
                      src={imagePath}
                      alt={name || "Foto"}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <div style={{ color: "var(--ink-soft)", fontSize: "0.78rem", padding: "8px", textAlign: "center" }}>
                      <span style={{ fontSize: "2.2rem", display: "block", marginBottom: 2 }}>📷</span>
                      Subir Foto
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label
                    htmlFor="productImageUpload"
                    className="btn btn-outline"
                    style={{ padding: "4px 8px", fontSize: "0.74rem", cursor: "pointer", display: "inline-block" }}
                  >
                    📁 {imagePath ? "Cambiar Foto" : "Cargar Foto"}
                  </label>
                  <input
                    id="productImageUpload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    style={{ display: "none" }}
                  />
                  {imagePath && (
                    <button
                      type="button"
                      onClick={() => setImagePath(null)}
                      style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.72rem", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Quitar Foto
                    </button>
                  )}
                </div>
              </div>

              {/* SKU, Name, Type, Category & Catalog Toggle */}
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Código / SKU *
                    </label>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Ej: BAL-IND-500"
                      style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontFamily: "monospace", fontWeight: "bold" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Nombre del Artículo / Servicio *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Balanza Industrial de Plataforma 500kg"
                      style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: 600 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Tipo de Artículo
                    </label>
                    <select
                      value={type}
                      onChange={(e) => handleTypeChange(e.target.value as ProductWrite["type"])}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                    >
                      <option value="DirectSale">📦 Venta Directa (Reventa)</option>
                      <option value="Service">🛠️ Servicio Intangible</option>
                      <option value="Kit">🧩 Producto Ensamblado</option>
                      <option value="Manufactured">🏭 Producto Fabricado</option>
                      <option value="SparePart">🔧 Repuesto Técnico</option>
                      <option value="RawMaterial">🧱 Materia Prima</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Categoría
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                    >
                      <option value="">(Sin Categoría Especial)</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Unidad de Medida
                    </label>
                    <select
                      value={baseUnit}
                      onChange={(e) => setBaseUnit(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                    >
                      <option value="UN">Unidad (UN)</option>
                      <option value="KG">Kilogramo (KG)</option>
                      <option value="MTS">Metros (MTS)</option>
                      <option value="LITRO">Litros (LITRO)</option>
                      <option value="HORA">Horas Técnico (HORA)</option>
                      <option value="GLOBAL">Global / Trabajo (GLOBAL)</option>
                    </select>
                  </div>
                </div>

                {/* B2B Catalog Checkbox Pill */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: showInCatalog ? "rgba(16, 185, 129, 0.1)" : "var(--surface-muted)",
                    border: `1px solid ${showInCatalog ? "rgba(16, 185, 129, 0.4)" : "var(--surface-border)"}`,
                    width: "fit-content"
                  }}
                >
                  <input
                    type="checkbox"
                    id="showInCatalogPill"
                    checked={showInCatalog}
                    onChange={(e) => setShowInCatalog(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <label htmlFor="showInCatalogPill" style={{ cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: showInCatalog ? "#047857" : "var(--ink)" }}>
                    🌐 Publicar en Catálogo Web / Carrito de Clientes (Portal B2B)
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "6px" }}>
                Descripción Breve (para presupuestos, pedidos y facturas)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Resumen comercial del producto o alcance del servicio..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "6px" }}>
                Descripción Técnica Detallada (Ficha técnica para Presupuestos y Ofertas Técnicas)
              </label>
              <textarea
                rows={3}
                value={detailedDescription}
                onChange={(e) => setDetailedDescription(e.target.value)}
                placeholder="Especificaciones técnicas completas, capacidad, dimensiones, tolerancias, certificaciones INTI..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>

            {/* Precios 3-Monedas */}
            <div style={{ background: "#f8fafc", padding: "18px", borderRadius: "12px", border: "1px solid var(--surface-border)" }}>
              <h3 style={{ marginTop: 0, marginBottom: "14px", fontSize: "1rem", color: "var(--brand-accent)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>💰 Estructura de Precios & 3 Monedas Nativas Leal Control</span>
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                {/* Sale Price Card */}
                <div style={{ background: "white", padding: "14px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: "bold", color: "#047857", textTransform: "uppercase", marginBottom: "10px" }}>
                    🟢 PRECIO DE VENTA AL PÚBLICO
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                        Moneda de Venta *
                      </label>
                      <select
                        value={saleCurrency}
                        onChange={(e) => setSaleCurrency(e.target.value as ProductWrite["saleCurrency"])}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      >
                        <option value="ARS">Pesos ARS ($)</option>
                        <option value="USD_BILLETE">USD Billete (BNA)</option>
                        <option value="USD_DIVISA">USD Divisa (BNA Mayorista)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                        Precio Base Venta *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={basePrice}
                        onChange={(e) => setBasePrice(Number(e.target.value))}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontFamily: "monospace", fontWeight: "bold", fontSize: "1rem", color: "#047857" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Purchase Cost Card */}
                <div style={{ background: "white", padding: "14px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: "bold", color: "#b45309", textTransform: "uppercase", marginBottom: "10px" }}>
                    🟠 COSTO DE REPOSICIÓN / COMPRA
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                        Moneda de Compra *
                      </label>
                      <select
                        value={purchaseCurrency}
                        onChange={(e) => setPurchaseCurrency(e.target.value as ProductWrite["purchaseCurrency"])}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      >
                        <option value="ARS">Pesos ARS ($)</option>
                        <option value="USD_BILLETE">USD Billete (BNA)</option>
                        <option value="USD_DIVISA">USD Divisa (BNA Mayorista)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                        Costo Base Reposición
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costPrice}
                        onChange={(e) => setCostPrice(Number(e.target.value))}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontFamily: "monospace", fontWeight: "bold", fontSize: "1rem", color: "#b45309" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Stock & Trazabilidad */}
        {activeTab === "stock" && (
          <div className="card pad" style={{ display: "grid", gap: "20px" }}>
            <h3 style={{ marginTop: 0, fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              Reglas de Control de Inventario & Trazabilidad
            </h3>

            {type === "Service" ? (
              <div
                style={{
                  padding: "16px 20px",
                  borderRadius: 14,
                  background: "var(--surface-muted)",
                  border: "1px solid var(--surface-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16
                }}
              >
                <span style={{ fontSize: "2rem" }}>🛠️</span>
                <div>
                  <strong style={{ display: "block", color: "var(--ink)", fontSize: "1rem" }}>
                    Artículo configurado como Servicio Intangible
                  </strong>
                  <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", fontSize: "0.88rem", lineHeight: 1.45 }}>
                    Los servicios, calibraciones y horas técnicas no controlan existencias físicas en depósitos ni generan movimientos en Kardex. Su disponibilidad para ventas y órdenes de trabajo es ilimitada.
                  </p>
                </div>
              </div>
            ) : (

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div
                style={{
                  border: "1px solid var(--surface-border)",
                  padding: "16px",
                  borderRadius: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: trackStock ? "rgba(16, 185, 129, 0.04)" : "white"
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>Control de Stock Físico</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>Llevar recuento de existencias y descontar con remitos</div>
                </div>
                <input
                  type="checkbox"
                  checked={trackStock}
                  onChange={(e) => setTrackStock(e.target.checked)}
                  style={{ width: "22px", height: "22px", cursor: "pointer" }}
                />
              </div>

              <div style={{ border: "1px solid var(--surface-border)", padding: "16px", borderRadius: "10px", background: "white" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Stock Mínimo de Alerta (Punto de Pedido)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(Number(e.target.value))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontWeight: "bold" }}
                />
              </div>

              <div
                style={{
                  border: "1px solid var(--surface-border)",
                  padding: "16px",
                  borderRadius: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: hasSerialNumber ? "rgba(37, 99, 235, 0.04)" : "white"
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>Número de Serie Obligatorio (S/N)</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>Exigir número de serie individual por equipo / celda</div>
                </div>
                <input
                  type="checkbox"
                  checked={hasSerialNumber}
                  onChange={(e) => setHasSerialNumber(e.target.checked)}
                  style={{ width: "22px", height: "22px", cursor: "pointer" }}
                />
              </div>

              <div
                style={{
                  border: "1px solid var(--surface-border)",
                  padding: "16px",
                  borderRadius: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: trackLot ? "rgba(245, 158, 11, 0.04)" : "white"
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>Trazabilidad por Lote / Partida</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>Control de fechas de vencimiento y lotes de fabricación</div>
                </div>
                <input
                  type="checkbox"
                  checked={trackLot}
                  onChange={(e) => setTrackLot(e.target.checked)}
                  style={{ width: "22px", height: "22px", cursor: "pointer" }}
                />
              </div>
            </div>
            )}
          </div>
        )}

        {/* Tab 3: Contabilidad & Impuestos ARCA */}
        {activeTab === "fiscal" && (
          <div className="card pad" style={{ display: "grid", gap: "20px" }}>
            <h3 style={{ marginTop: 0, fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              Configuración Impositiva ARCA & Matriz Contable ERP
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "6px" }}>
                  Alícuota IVA ARCA *
                </label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: "bold" }}
                >
                  <option value={21.00}>21.00% (Tasa General)</option>
                  <option value={10.50}>10.50% (Bienes de Capital / Reducida)</option>
                  <option value={0.00}>0.00% (Exento / No Gravado)</option>
                  <option value={27.00}>27.00% (Servicios Públicos / Especial)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "6px" }}>
                  Cuenta Contable de Ventas
                </label>
                <input
                  type="text"
                  value={salesAccountingCode}
                  onChange={(e) => setSalesAccountingCode(e.target.value)}
                  placeholder="Ej: 4.1.01.001"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "6px" }}>
                  Cuenta Contable de Compras
                </label>
                <input
                  type="text"
                  value={purchaseAccountingCode}
                  onChange={(e) => setPurchaseAccountingCode(e.target.value)}
                  placeholder="Ej: 5.1.02.004"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Especificaciones Técnicas */}
        {activeTab === "custom" && (
          <div className="card pad" style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--brand-accent)" }}>
                  Atributos y Especificaciones Personalizadas
                </h3>
                <p className="muted" style={{ margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                  Campos dinámicos guardados estructuralmente en formato JSONB
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCustomAttr}
                className="btn btn-outline"
                style={{ fontSize: "0.85rem" }}
              >
                + Agregar Atributo
              </button>
            </div>

            {customAttributesList.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px dashed var(--surface-border)" }}>
                <p className="muted" style={{ margin: "0 0 10px 0", fontSize: "0.88rem" }}>
                  No hay atributos personalizados cargados para este artículo.
                </p>
                <button
                  type="button"
                  onClick={handleAddCustomAttr}
                  className="btn btn-outline"
                  style={{ fontSize: "0.85rem" }}
                >
                  + Agregar Primer Atributo
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {customAttributesList.map((attr, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Nombre del Atributo (Ej: Capacidad Máxima, Voltaje)"
                      value={attr.key}
                      onChange={(e) => handleCustomAttrChange(idx, "key", e.target.value)}
                      style={{ width: "35%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontWeight: 600 }}
                    />
                    <input
                      type="text"
                      placeholder="Valor (Ej: 1000 kg, 220V 50Hz)"
                      value={attr.value}
                      onChange={(e) => handleCustomAttrChange(idx, "value", e.target.value)}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomAttr(idx)}
                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1.1rem", padding: "0 8px" }}
                      title="Eliminar atributo"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
          <Link to="/productos" className="btn btn-outline" style={{ padding: "10px 20px" }}>
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: "10px 28px", fontWeight: "bold" }}
          >
            {saving ? "💾 Guardando..." : isEditing ? "💾 Guardar Cambios" : "✨ Crear Producto"}
          </button>
        </div>
      </form>
    </div>
  );
};
