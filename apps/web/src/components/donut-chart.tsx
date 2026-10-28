import { Amount } from "@/components/amount";
import type { Slice } from "@/server/chart-model";
import styles from "./donut-chart.module.css";

const RADIUS = 15.9155; // circunferencia = 100 para trabajar en porcentajes
const GAP = 0.6;

function percent(bps: number): string {
  return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 }).format(
    bps / 10000,
  );
}

/**
 * Gráfico de anillo en SVG, sin JavaScript en el cliente. La información no depende del color:
 * cada trozo aparece en la leyenda con su nombre, importe y porcentaje, y el SVG lleva un
 * resumen textual para lectores de pantalla.
 */
export function DonutChart({ slices, label }: { slices: readonly Slice[]; label: string }) {
  let offset = 0;
  const summary = `${label}: ${slices.map((s) => `${s.label} ${percent(s.shareBps)}`).join(", ")}`;
  return (
    <figure className={styles.figure}>
      <svg viewBox="0 0 42 42" className={styles.svg} role="img" aria-label={summary}>
        <circle cx="21" cy="21" r={RADIUS} className={styles.track} />
        {slices.map((s, i) => {
          const length = s.shareBps / 100;
          const start = offset;
          offset += length;
          return (
            <circle
              key={s.key}
              cx="21"
              cy="21"
              r={RADIUS}
              className={styles[`c${String(i % 8)}`]}
              strokeDasharray={`${String(Math.max(length - GAP, 0.1))} ${String(100 - Math.max(length - GAP, 0.1))}`}
              strokeDashoffset={String(25 - start)}
            />
          );
        })}
      </svg>
      <figcaption className={styles.legend}>
        <ul>
          {slices.map((s, i) => (
            <li key={s.key}>
              <span
                className={[styles.swatch, styles[`s${String(i % 8)}`]].join(" ")}
                aria-hidden="true"
              />
              <span className={styles.name}>{s.label}</span>
              <span className={styles.amount}>
                <Amount value={s.value} /> · {percent(s.shareBps)}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
