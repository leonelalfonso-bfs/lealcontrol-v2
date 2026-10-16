/** Causas de egreso de la liquidación final (nota 68, S6). */
export const TERMINATION_CAUSES: Record<string, string> = {
  DismissalWithoutCause: "Despido sin causa (art. 245)",
  Resignation: "Renuncia (art. 240)",
  DismissalWithCause: "Despido con justa causa (art. 242)",
  MutualAgreement: "Mutuo acuerdo (art. 241)",
  TrialPeriod: "Fin del período de prueba (art. 92 bis)",
  FixedTermEnd: "Vencimiento del plazo fijo (art. 250)",
  Retirement: "Jubilación (art. 252)",
  Death: "Fallecimiento (art. 248)"
};
