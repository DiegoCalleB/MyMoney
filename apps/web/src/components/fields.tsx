"use client";

import { useFormStatus } from "react-dom";
import { t } from "@/lib/i18n";
import styles from "./fields.module.css";

interface FieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly autoComplete?: string;
  readonly inputMode?: "text" | "numeric" | "decimal" | "email";
  readonly maxLength?: number;
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly pattern?: string;
  readonly placeholder?: string;
  readonly type?: "text" | "email" | "password" | "date";
}

/** Campo con etiqueta visible, ayuda y error asociados (WCAG 2.2: 1.3.1, 3.3.1, 3.3.2). */
export function Field({
  id,
  label,
  hint,
  error,
  type = "text",
  required = true,
  ...rest
}: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  const { name, autoComplete, inputMode, maxLength, defaultValue, pattern, placeholder } = rest;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        className={styles.input}
        id={id}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
        {...(autoComplete ? { autoComplete } : {})}
        {...(inputMode ? { inputMode } : {})}
        {...(maxLength ? { maxLength } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        {...(pattern ? { pattern } : {})}
        {...(placeholder ? { placeholder } : {})}
      />
      {error ? (
        <p className={styles.error} id={errorId}>
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ children }: { readonly children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.submit} type="submit" disabled={pending} aria-disabled={pending}>
      {children}
    </button>
  );
}

/** Error general del formulario; se anuncia a los lectores de pantalla al aparecer. */
export function FormAlert({ error }: { readonly error?: string | undefined }) {
  if (!error) return null;
  return (
    <p className={styles.alert} role="alert">
      {t(error)}
    </p>
  );
}
