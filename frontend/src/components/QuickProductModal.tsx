import React, { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { api } from "../api/client";
import { type Product, type ProductCategory, type ProductWrite } from "../api/types";

interface QuickProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (product: Product) => void;
  initialName?: string;
  categories?: ProductCategory[];
}

export const QuickProductModal: React.FC<QuickProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialName = "",
  categories: initialCategories
}) => {
  const [categories, setCategories] = useState<ProductCategory[]>(initialCategories || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<ProductWrite["type"]>("DirectSale");
  const [categoryId, setCategoryId] = useState("");
  const [baseUnit, setBaseUnit] = useState("UN");
  const [description, setDescription] = useState("");
  const [detailedDescription, setDetailedDescription] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [showInCatalog, setShowInCatalog] = useState(true);

  // Prices & Taxes
  const [saleCurrency, setSaleCurrency] = useState<ProductWrite["saleCurrency"]>("ARS");
  const [basePrice, setBasePrice] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(21);
  const [purchaseCurrency, setPurchaseCurrency] = useState<ProductWrite["purchaseCurrency"]>("ARS");
  const [costPrice, setCostPrice] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setCode(initialName ? initialName.substring(0, 8).toUpperCase().replace(/\s+/g, "-") : `ART-${Math.floor(1000 + Math.random() * 9000)}`);
      setError(null);

      if (!initialCategories || initialCategories.length === 0) {
        api.listCategories().then(setCategories).catch(() => {});
      }
    }
  }, [isOpen, initialName, initialCategories]);

  if (!isOpen) return null;

  const handleImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no debe superar los 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePath(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("El Código SKU y el Nombre son obligatorios.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: ProductWrite = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        detailedDescription: detailedDescription.trim(),
        type,
        categoryId: categoryId ? categoryId : null,
        baseUnit,
        imagePath,
        saleCurrency,
        basePrice: Number(basePrice) || 0,
        purchaseCurrency,
        costPrice: Number(costPrice) || 0,
        taxRate: Number(taxRate) || 21,
        trackStock: type !== "Service",
        minStock: 0,
        hasSerialNumber: false,
        trackLot: false,
        customAttributes: {
          showInCatalog: showInCatalog ? "true" : "false"
        }
      };

      const created = await api.createProduct(payload);
      onSuccess(created);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(30, 41, 59, 0.04))"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.6rem" }}>📦</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>
                Alta Rápida de Producto / Servicio
              </h2>
              <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                Se agregará al catálogo maestro y se insertará directamente en este documento.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.4rem",
              color: "#64748b",
              cursor: "pointer",
              padding: "4px 8px"
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "grid", gap: "16px" }}>
            {error && (
              <div
                style={{
                  background: "#fee2e2",
                  border: "1px solid #ef4444",
                  color: "#991b1b",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "0.85rem"
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Top Product Header Card with Photo & Main SKU */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "130px 1fr",
                gap: "18px",
                alignItems: "flex-start",
                paddingBottom: "14px",
                borderBottom: "1px solid #e2e8f0"
              }}
            >
              {/* Photo Box */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 12,
                    border: "2px dashed #cbd5e1",
                    background: "#f8fafc",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    position: "relative"
                  }}
                >
                  {imagePath ? (
                    <img
                      src={imagePath}
                      alt={name || "Foto"}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <div style={{ color: "#94a3b8", fontSize: "0.75rem", padding: "6px", textAlign: "center" }}>
                      <span style={{ fontSize: "2rem", display: "block", marginBottom: 2 }}>📷</span>
                      Subir Foto
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label
                    htmlFor="quickProductImageUpload"
                    className="btn btn-outline"
                    style={{ padding: "4px 8px", fontSize: "0.72rem", cursor: "pointer", display: "inline-block" }}
                  >
                    📁 {imagePath ? "Cambiar" : "Cargar"}
                  </label>
                  <input
                    id="quickProductImageUpload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    style={{ display: "none" }}
                  />
                  {imagePath && (
                    <button
                      type="button"
                      onClick={() => setImagePath(null)}
                      style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.7rem", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              {/* SKU, Name, Type, Category */}
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                      Código / SKU *
                    </label>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="BAL-500"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontFamily: "monospace", fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                      Nombre del Artículo / Servicio *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Balanza de Plataforma 500kg"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontWeight: 600 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                      Tipo de Artículo
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as ProductWrite["type"])}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="DirectSale">📦 Venta Directa (Reventa)</option>
                      <option value="Service">🛠️ Servicio Intangible</option>
                      <option value="Kit">🧩 Producto Ensamblado</option>
                      <option value="Manufactured">🏭 Fabricado (BOM)</option>
                      <option value="SparePart">🔧 Repuesto Técnico</option>
                      <option value="RawMaterial">🧱 Materia Prima</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                      Categoría
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="">(Sin Categoría)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                      Unidad
                    </label>
                    <select
                      value={baseUnit}
                      onChange={(e) => setBaseUnit(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="UN">Unidad (UN)</option>
                      <option value="KG">Kilogramo (KG)</option>
                      <option value="MTS">Metros (MTS)</option>
                      <option value="LITRO">Litros (LITRO)</option>
                      <option value="HORA">Horas (HORA)</option>
                      <option value="GLOBAL">Global (GLOBAL)</option>
                    </select>
                  </div>
                </div>

                {/* Catalog Pill */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: showInCatalog ? "rgba(16, 185, 129, 0.1)" : "#f1f5f9",
                    border: `1px solid ${showInCatalog ? "rgba(16, 185, 129, 0.4)" : "#cbd5e1"}`,
                    width: "fit-content"
                  }}
                >
                  <input
                    type="checkbox"
                    id="quickShowInCatalog"
                    checked={showInCatalog}
                    onChange={(e) => setShowInCatalog(e.target.checked)}
                    style={{ width: 15, height: 15, cursor: "pointer" }}
                  />
                  <label htmlFor="quickShowInCatalog" style={{ cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: showInCatalog ? "#047857" : "#475569" }}>
                    🌐 Publicar en Catálogo Web & Carrito de Clientes (Portal B2B)
                  </label>
                </div>
              </div>
            </div>

            {/* Prices Matrix */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "3px", color: "#047857" }}>
                    🟢 Moneda de Venta *
                  </label>
                  <select
                    value={saleCurrency}
                    onChange={(e) => setSaleCurrency(e.target.value as ProductWrite["saleCurrency"])}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  >
                    <option value="ARS">ARS ($ Pesos)</option>
                    <option value="USD_BILLETE">USD (Dólar Billete)</option>
                    <option value="USD_DIVISA">USD (Dólar Divisa BNA)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "3px", color: "#047857" }}>
                    Precio de Venta Base *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={basePrice}
                    onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: "monospace", fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "3px" }}>
                    Alícuota IVA
                  </label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 21)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  >
                    <option value={21}>21.0% (General)</option>
                    <option value={10.5}>10.5% (Bienes de Capital)</option>
                    <option value={0}>0.0% (Exento)</option>
                    <option value={27}>27.0% (Servicios Especiales)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "12px", marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed #cbd5e1" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "3px", color: "#64748b" }}>
                    Moneda de Costo
                  </label>
                  <select
                    value={purchaseCurrency}
                    onChange={(e) => setPurchaseCurrency(e.target.value as ProductWrite["purchaseCurrency"])}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                  >
                    <option value="ARS">ARS ($)</option>
                    <option value="USD_BILLETE">USD (Billete)</option>
                    <option value="USD_DIVISA">USD (Divisa BNA)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "3px", color: "#64748b" }}>
                    Costo de Compra / Reposición
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", fontFamily: "monospace" }}
                  />
                </div>
              </div>
            </div>

            {/* Descriptions */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                Descripción Comercial Breve (para presupuestos y facturas)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Resumen del producto o servicio..."
                style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "3px" }}>
                Ficha Técnica / Especificaciones (para Ofertas Técnicas)
              </label>
              <textarea
                rows={2}
                value={detailedDescription}
                onChange={(e) => setDetailedDescription(e.target.value)}
                placeholder="Dimensiones, capacidad, tolerancias, certificaciones..."
                style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              background: "#f8fafc"
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ padding: "9px 18px", borderRadius: "8px" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "9px 24px",
                borderRadius: "8px",
                background: "#0d9488",
                color: "#ffffff",
                border: "none",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)"
              }}
            >
              {saving ? "Guardando..." : "💾 Guardar y Usar Producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
