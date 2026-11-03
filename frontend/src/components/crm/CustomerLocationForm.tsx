import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { provinceLabel, provinces, type CustomerDetail, type Location } from "../../api/types";

/** Alta o edición de una planta / sucursal del cliente: la misma desde la ficha del cliente y desde el presupuesto. */
export function CustomerLocationForm({
  customerId,
  initialData,
  onCancel,
  onSaved,
  alwaysCancelable = false
}: {
  customerId: string;
  initialData: Location | null;
  onCancel: () => void;
  /** Recibe el cliente actualizado y la planta guardada. */
  onSaved: (customer: CustomerDetail, location: Location | undefined) => void;
  /** En un modal siempre se puede cancelar; en la ficha, solo al editar. */
  alwaysCancelable?: boolean;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [street, setStreet] = useState(initialData?.address.street ?? "");
  const [city, setCity] = useState(initialData?.address.city ?? "San Lorenzo");
  const [province, setProvince] = useState(initialData?.address.province ?? "SantaFe");
  const [postalCode, setPostalCode] = useState(initialData?.address.postalCode ?? "2200");
  const [phone, setPhone] = useState(initialData?.phone ?? "");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setStreet(initialData.address.street);
      setCity(initialData.address.city);
      setProvince(initialData.address.province);
      setPostalCode(initialData.address.postalCode);
      setPhone(initialData.phone ?? "");
    } else {
      setName("");
      setStreet("");
      setCity("San Lorenzo");
      setProvince("SantaFe");
      setPostalCode("2200");
      setPhone("");
    }
  }, [initialData]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name, street, city, province, postalCode, phone: phone || undefined };
    const customer = initialData
      ? await api.updateLocation(customerId, initialData.id, body)
      : await api.addLocation(customerId, body);
    const saved = initialData
      ? customer.locations.find((l) => l.id === initialData.id)
      : customer.locations.find((l) => l.name === name.trim()) ?? customer.locations[customer.locations.length - 1];
    onSaved(customer, saved);
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <h4 style={{ margin: 0 }}>{initialData ? "✏️ Editar Planta / Sucursal" : "+ Registrar Nueva Planta / Sucursal"}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>Nombre de la Planta / Depósito *<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej. Planta San Lorenzo" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Calle y Número *<input value={street} onChange={(e) => setStreet(e.target.value)} required placeholder="Av. Interurbana 4500" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Ciudad *<input value={city} onChange={(e) => setCity(e.target.value)} required style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Provincia *
          <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
            {provinces.map((p) => <option key={p} value={p}>{provinceLabel(p)}</option>)}
          </select>
        </label>
        <label>Código Postal *<input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>
      <label>Teléfono Directo de Planta<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3414123456" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {(initialData || alwaysCancelable) && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>}
        <button className="btn btn-primary">{initialData ? "Guardar Cambios" : "Agregar Planta"}</button>
      </div>
    </form>
  );
}
