import type { ReactNode } from "react";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, error, hint, children }: FormFieldProps) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block" }}>
      <strong>{label}</strong>
      <div style={{ marginTop: 4 }}>{children}</div>
      {hint && !error ? <small className="muted" style={{ display: "block", marginTop: 4 }}>{hint}</small> : null}
      {error ? <small style={{ display: "block", marginTop: 4, color: "var(--danger, #c23b3b)" }}>{error}</small> : null}
    </label>
  );
}
