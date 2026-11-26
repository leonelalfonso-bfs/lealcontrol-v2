import React, { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { shrinkImage } from "../utils/shrinkImage";
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
      setCode(initialName ? initialName.substring(0, 8).toUpperCase().replace(/\s+/g, "-") : "");
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

    void shrinkImage(file, 1200).then(setImagePath).catch((err: Error) => setError(err.message));
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
    <div className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--lc-surface)",
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
            borderBottom: "1px solid var(--lc-line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(30, 41, 59, 0.04))"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="t-xl">📦</span>
            <div>
              <h2 style={{ margin: 0 }}>
                Alta Rápida de Producto / Servicio
              </h2>
              <span className="t-small muted">
                Se agregará al catálogo maestro y se insertará directamente en este documento.
              </span>
            </div>
          </div>
          <button className="muted"
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", padding: "4px 8px" }}
          >
            ✕
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "grid", gap: "16px" }}>
            {error && (
              <div className="alert t-small"
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
                borderBottom: "1px solid var(--lc-line)"
              }}
            >
              {/* Photo Box */}
              <div className="t-center">
                <div className="box"
                  style={{ width: 120, height: 120, display: "grid", placeItems: "center", overflow: "hidden", position: "relative" }}
                >
                  {imagePath ? (
                    <img
                      src={imagePath}
                      alt={name || "Foto"}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <div className="muted t-small t-center" style={{ padding: "6px" }}>
                      <span className="t-xl" style={{ display: "block", marginBottom: 2 }}>📷</span>
                      Subir Foto
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label
                    htmlFor="quickProductImageUpload"
                    className="btn btn-outline compact"
                    style={{ cursor: "pointer" }}
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
                    <button className="t-danger t-small"
                      type="button"
                      onClick={() => setImagePath(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
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
                    <label>
                      Código / SKU *
                    </label>
                    <input className="t-strong"
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="BAL-500"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label>
                      Nombre del Artículo / Servicio *
                    </label>
                    <input className="t-strong"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Balanza de Plataforma 500kg"
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label>
                      Tipo de Artículo
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as ProductWrite["type"])}
                      style={{ width: "100%" }}
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
                    <label>
                      Categoría
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      style={{ width: "100%" }}
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
                    <label>
                      Unidad
                    </label>
                    <select
                      value={baseUnit}
                      onChange={(e) => setBaseUnit(e.target.value)}
                      style={{ width: "100%" }}
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
                  <label htmlFor="quickShowInCatalog" style={{ cursor: "pointer", color: showInCatalog ? "var(--lc-ok)" : "var(--lc-ink-2)" }}>
                    🌐 Publicar en Catálogo Web & Carrito de Clientes (Portal B2B)
                  </label>
                </div>
              </div>
            </div>

            {/* Prices Matrix */}
            <div className="box">
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label>
                    🟢 Moneda de Venta *
                  </label>
                  <select
                    value={saleCurrency}
                    onChange={(e) => setSaleCurrency(e.target.value as ProductWrite["saleCurrency"])}
                    style={{ width: "100%" }}
                  >
                    <option value="ARS">ARS ($ Pesos)</option>
                    <option value="USD_BILLETE">USD (Dólar Billete)</option>
                    <option value="USD_DIVISA">USD (Dólar Divisa BNA)</option>
                  </select>
                </div>

                <div>
                  <label>
                    Precio de Venta Base *
                  </label>
                  <input className="t-strong"
                    type="number"
                    step="0.01"
                    min="0"
                    value={basePrice}
                    onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label>
                    Alícuota IVA
                  </label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 21)}
                    style={{ width: "100%" }}
                  >
                    <option value={21}>21.0% (General)</option>
                    <option value={10.5}>10.5% (Bienes de Capital)</option>
                    <option value={0}>0.0% (Exento)</option>
                    <option value={27}>27.0% (Servicios Especiales)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "12px", marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed var(--lc-line-2)" }}>
                <div>
                  <label>
                    Moneda de Costo
                  </label>
                  <select
                    value={purchaseCurrency}
                    onChange={(e) => setPurchaseCurrency(e.target.value as ProductWrite["purchaseCurrency"])}
                    style={{ width: "100%" }}
                  >
                    <option value="ARS">ARS ($)</option>
                    <option value="USD_BILLETE">USD (Billete)</option>
                    <option value="USD_DIVISA">USD (Divisa BNA)</option>
                  </select>
                </div>

                <div>
                  <label>
                    Costo de Compra / Reposición
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>

            {/* Descriptions */}
            <div>
              <label>
                Descripción Comercial Breve (para presupuestos y facturas)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Resumen del producto o servicio..."
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>
                Ficha Técnica / Especificaciones (para Ofertas Técnicas)
              </label>
              <textarea
                rows={2}
                value={detailedDescription}
                onChange={(e) => setDetailedDescription(e.target.value)}
                placeholder="Dimensiones, capacidad, tolerancias, certificaciones..."
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--lc-line)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              background: "var(--lc-surface-2)"
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
            >
              Cancelar
            </button>
            <button className="t-strong"
              type="submit"
              disabled={saving}
              style={{ padding: "9px 24px", borderRadius: "8px", background: "var(--lc-accent)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)" }}
            >
              {saving ? "Guardando..." : "💾 Guardar y Usar Producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
