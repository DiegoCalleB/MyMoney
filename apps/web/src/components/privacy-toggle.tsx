"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { createShakeDetector } from "@/lib/shake";
import styles from "./privacy-toggle.module.css";

export const PRIVACY_COOKIE = "mm_privacy";

type MotionWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<string>;
};

/** Espera antes de ofrecer el botón de permiso: si el sensor funciona, llegan lecturas antes. */
const SENSOR_WAIT_MS = 1500;

function applyPrivacy(hidden: boolean) {
  document
    .getElementById("privacy-root")
    ?.setAttribute("data-privacy", hidden ? "hidden" : "visible");
  // Preferencia de interfaz sin datos personales: una cookie simple, sin `httpOnly`.
  document.cookie = `${PRIVACY_COOKIE}=${hidden ? "hidden" : "visible"}; path=/; max-age=31536000; samesite=lax${
    location.protocol === "https:" ? "; secure" : ""
  }`;
}

/**
 * Botón para ocultar los importes (se mantienen los porcentajes) y gesto de agitar el móvil.
 * El sensor se escucha siempre: en Android y en cuanto el navegador ya tiene permiso, el gesto
 * funciona solo. En iPhone el sistema exige un permiso que solo puede pedirse al tocar, así que,
 * si no llegan lecturas, se ofrece un botón «Activar agitar»; iOS recuerda la respuesta mientras
 * dure la sesión de Safari.
 */
export function PrivacyToggle({ initialHidden }: { readonly initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);
  const [sensor, setSensor] = useState<"waiting" | "active" | "needs_permission" | "unavailable">(
    "waiting",
  );
  const [message, setMessage] = useState("");
  const hiddenRef = useRef(hidden);

  const set = (next: boolean) => {
    hiddenRef.current = next;
    setHidden(next);
    applyPrivacy(next);
  };

  useEffect(() => {
    const Motion = window.DeviceMotionEvent as MotionWithPermission | undefined;
    if (!Motion) {
      setSensor("unavailable");
      return;
    }
    const detect = createShakeDetector();
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      setSensor("active");
      if (detect({ x: a.x, y: a.y, z: a.z }, Date.now())) {
        const next = !hiddenRef.current;
        set(next);
        setMessage(next ? t("privacy.shake_hidden") : t("privacy.shake_shown"));
      }
    };
    window.addEventListener("devicemotion", onMotion);
    // Sin lecturas tras un momento: en iOS falta el permiso; en un ordenador no hay sensor.
    const timer = window.setTimeout(() => {
      setSensor((current) => {
        if (current !== "waiting") return current;
        return typeof Motion.requestPermission === "function" ? "needs_permission" : "unavailable";
      });
    }, SENSOR_WAIT_MS);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.clearTimeout(timer);
    };
  }, []);

  const askPermission = async () => {
    const Motion = window.DeviceMotionEvent as MotionWithPermission | undefined;
    if (!Motion || typeof Motion.requestPermission !== "function") return;
    try {
      const answer = await Motion.requestPermission();
      if (answer === "granted") {
        setSensor("waiting");
        setMessage(t("privacy.shake_ready"));
      } else {
        setMessage(t("privacy.shake_denied"));
      }
    } catch {
      setMessage(t("privacy.shake_denied"));
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.button}
        aria-pressed={hidden}
        onClick={() => {
          set(!hiddenRef.current);
        }}
      >
        {hidden ? t("privacy.show") : t("privacy.hide")}
      </button>
      {sensor === "needs_permission" ? (
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            void askPermission();
          }}
        >
          {t("privacy.shake_enable")}
        </button>
      ) : null}
      <span className={styles.live} role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}
