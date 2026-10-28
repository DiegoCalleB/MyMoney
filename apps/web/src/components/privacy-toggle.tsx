"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import styles from "./privacy-toggle.module.css";

export const PRIVACY_COOKIE = "mm_privacy";
const SHAKE_THRESHOLD = 30; // cambio de aceleración (m/s²) entre dos lecturas
const SHAKE_WINDOW_MS = 700;
const SHAKE_COOLDOWN_MS = 1200;

type MotionWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<string>;
};

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
 * Botón para ocultar los importes (se mantienen los porcentajes). Además, al agitar el móvil
 * se alterna: en Android funciona al cargar la página; en iPhone el sistema exige un permiso
 * que solo se puede pedir al pulsar, así que se pide la primera vez que se usa el botón.
 */
export function PrivacyToggle({ initialHidden }: { readonly initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);
  const [shake, setShake] = useState(false);
  const hiddenRef = useRef(hidden);

  const set = (next: boolean) => {
    hiddenRef.current = next;
    setHidden(next);
    applyPrivacy(next);
  };

  useEffect(() => {
    const Motion = window.DeviceMotionEvent as MotionWithPermission | undefined;
    if (Motion && typeof Motion.requestPermission !== "function") setShake(true);
  }, []);

  useEffect(() => {
    if (!shake) return;
    let last: { x: number; y: number; z: number } | null = null;
    let firstAt = 0;
    let lockedUntil = 0;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      const now = Date.now();
      if (last && now >= lockedUntil) {
        const delta = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
        if (delta > SHAKE_THRESHOLD) {
          if (now - firstAt > SHAKE_WINDOW_MS) firstAt = now;
          else {
            lockedUntil = now + SHAKE_COOLDOWN_MS;
            firstAt = 0;
            set(!hiddenRef.current);
          }
        }
      }
      last = { x: a.x, y: a.y, z: a.z };
    };
    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [shake]);

  const onClick = async () => {
    set(!hiddenRef.current);
    const Motion = window.DeviceMotionEvent as MotionWithPermission | undefined;
    if (!shake && Motion && typeof Motion.requestPermission === "function") {
      try {
        if ((await Motion.requestPermission()) === "granted") setShake(true);
      } catch {
        // Sin permiso solo se pierde el gesto de agitar; el botón sigue funcionando.
      }
    }
  };

  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={hidden}
      onClick={() => {
        void onClick();
      }}
    >
      {hidden ? t("privacy.show") : t("privacy.hide")}
    </button>
  );
}
