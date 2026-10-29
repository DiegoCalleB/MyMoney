"use client";

import { useState } from "react";
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
  /** Para campos controlados desde fuera (p. ej. para reenviar su valor en otro formulario). */
  readonly onValueChange?: (value: string) => void;
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
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const {
    name,
    autoComplete,
    inputMode,
    maxLength,
    defaultValue,
    pattern,
    placeholder,
    onValueChange,
  } = rest;
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
      <div className={styles.inputWrap}>
        <input
          className={[styles.input, isPassword ? styles.inputWithToggle : null]
            .filter(Boolean)
            .join(" ")}
          id={id}
          name={name}
          type={isPassword && revealed ? "text" : type}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          {...(autoComplete ? { autoComplete } : {})}
          {...(inputMode ? { inputMode } : {})}
          {...(maxLength ? { maxLength } : {})}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(pattern ? { pattern } : {})}
          {...(placeholder ? { placeholder } : {})}
          {...(onValueChange
            ? {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  onValueChange(event.target.value);
                },
              }
            : {})}
        />
        {isPassword ? (
          <button
            type="button"
            className={styles.toggle}
            aria-label={t("auth.password.show")}
            aria-pressed={revealed}
            onClick={() => {
              setRevealed((value) => !value);
            }}
          >
            <EyeIcon crossed={revealed} />
          </button>
        ) : null}
      </div>
      {error ? (
        <p className={styles.error} id={errorId}>
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

/** Ojo para mostrar u ocultar la contraseña; tachado cuando se está viendo. */
function EyeIcon({ crossed }: { readonly crossed: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
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
