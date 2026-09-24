import type { MetrologyActivityMode, MetrologyAssayOption } from "../../api/types";

export const METROLOGY_ASSAYS: MetrologyAssayOption[] = [
  { code: "CAL", label: "Calibración" },
  { code: "VPE", label: "Verificación periódica" },
  { code: "VPR", label: "Verificación primitiva" },
  { code: "VPO", label: "Verificación posterior a la reparación" }
];

export function assaysForMode(mode: MetrologyActivityMode): MetrologyAssayOption[] {
  if (mode === "Laboratory") {
    return METROLOGY_ASSAYS.filter((a) => a.code === "VPE" || a.code === "VPR");
  }
  return METROLOGY_ASSAYS;
}

export function scopeTitle(mode: MetrologyActivityMode): string {
  return mode === "Laboratory" ? "Laboratorio de ensayos" : "Reparador";
}
