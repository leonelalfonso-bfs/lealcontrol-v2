import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { provinces, type CustomerWrite } from "../api/types";

const empty: CustomerWrite = {
  legalName: "",
  tradeName: "",
  documentType: "Cuit",
  documentNumber: "",
  taxCondition: "ResponsableInscripto",
  iibbRegime: "ConvenioMultilateral",
  isCustomer: true,
  isSupplier: false,
  email: "",
  phone: "",
  whatsApp: "",
  fiscalStreet: "",
  fiscalCity: "",
  fiscalProvince: "SantaFe",
  fiscalPostalCode: "",
  notes: ""
};

export function CustomerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [model, setModel] = useState<CustomerWrite>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getCustomer(id).then((c) => setModel({
      legalName: c.legalName,
      tradeName: c.tradeName ?? "",
      documentType: c.documentType,
      documentNumber: c.documentNumber,
      taxCondition: c.taxCondition,
      iibbRegime: c.iibbRegime,
      isCustomer: c.isCustomer,
      isSupplier: c.isSupplier,
      email: c.email ?? "",
      phone: c.phone ?? "",
      whatsApp: c.whatsApp ?? "",
      fiscalStreet: c.fiscalAddress?.street ?? "",
      fiscalCity: c.fiscalAddress?.city ?? "",
      fiscalProvince: c.fiscalAddress?.province ?? "SantaFe",
      fiscalPostalCode: c.fiscalAddress?.postalCode ?? "",
      creditLimit: c.creditLimit ?? undefined,
      paymentTermsDays: c.paymentTermsDays ?? undefined,
      notes: c.notes ?? ""
    })).catch((e: Error) => setError(e.message));
  }, [id]);

  const set = (key: keyof CustomerWrite, value: string | number | boolean) =>
    setModel((m) => ({ ...m, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: CustomerWrite = {
        ...model,
        tradeName: model.tradeName || undefined,
        email: model.email || undefined,
        phone: model.phone || undefined,
        whatsApp: model.whatsApp || undefined,
        fiscalStreet: model.fiscalStreet || undefined,
        fiscalCity: model.fiscalCity || undefined,
        fiscalPostalCode: model.fiscalPostalCode || undefined,
        notes: model.notes || undefined
      };
      const saved = id
        ? await api.updateCustomer(id, payload)
        : await api.createCustomer(payload);
      navigate(`/clientes/${saved.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <div>
          <h1>{id ? "Editar cliente" : "Nuevo cliente"}</h1>
          <div className="muted">CUIT validado. IVA y domicilio fiscal separados de las plantas.</div>
        </div>
        <div className="row">
          <Link className="btn ghost" to={id ? `/clientes/${id}` : "/clientes"}>Cancelar</Link>
          <button className="btn" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card pad" style={{ display: "grid", gap: 16 }}>
        <div className="grid-2">
          <label>Razón social<input required value={model.legalName} onChange={(e) => set("legalName", e.target.value)} /></label>
          <label>Nombre de fantasía<input value={model.tradeName} onChange={(e) => set("tradeName", e.target.value)} /></label>
        </div>
        <div className="grid-3">
          <label>Tipo
            <select value={model.documentType} onChange={(e) => set("documentType", e.target.value)}>
              <option>Cuit</option><option>Dni</option><option>Passport</option><option>Foreign</option>
            </select>
          </label>
          <label>Número<input required value={model.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} /></label>
          <label>Condición IVA
            <select value={model.taxCondition} onChange={(e) => set("taxCondition", e.target.value)}>
              <option value="ResponsableInscripto">Responsable Inscripto</option>
              <option value="Monotributo">Monotributo</option>
              <option value="Exento">Exento</option>
              <option value="ConsumidorFinal">Consumidor Final</option>
            </select>
          </label>
        </div>
        <div className="grid-3">
          <label>IIBB
            <select value={model.iibbRegime} onChange={(e) => set("iibbRegime", e.target.value)}>
              <option value="ConvenioMultilateral">Convenio multilateral</option>
              <option value="Local">Local</option>
              <option value="NoInscripto">No inscripto</option>
              <option value="Exento">Exento</option>
            </select>
          </label>
          <label>Email<input type="email" value={model.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label>Teléfono<input value={model.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        </div>
        <div className="grid-2">
          <label>WhatsApp<input value={model.whatsApp} onChange={(e) => set("whatsApp", e.target.value)} /></label>
          <label>Calle fiscal<input value={model.fiscalStreet} onChange={(e) => set("fiscalStreet", e.target.value)} /></label>
        </div>
        <div className="grid-3">
          <label>Ciudad<input value={model.fiscalCity} onChange={(e) => set("fiscalCity", e.target.value)} /></label>
          <label>Provincia
            <select value={model.fiscalProvince} onChange={(e) => set("fiscalProvince", e.target.value)}>
              {provinces.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>CP<input value={model.fiscalPostalCode} onChange={(e) => set("fiscalPostalCode", e.target.value)} /></label>
        </div>
        <div className="grid-3">
          <label>Límite de crédito<input type="number" value={model.creditLimit ?? ""} onChange={(e) => set("creditLimit", Number(e.target.value))} /></label>
          <label>Plazo (días)<input type="number" value={model.paymentTermsDays ?? ""} onChange={(e) => set("paymentTermsDays", Number(e.target.value))} /></label>
          <label>Roles
            <div className="row" style={{ height: 40 }}>
              <label style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={model.isCustomer} onChange={(e) => set("isCustomer", e.target.checked)} /> Cliente</label>
              <label style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={model.isSupplier} onChange={(e) => set("isSupplier", e.target.checked)} /> Proveedor</label>
            </div>
          </label>
        </div>
        <label>Notas<textarea rows={3} value={model.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
    </form>
  );
}
