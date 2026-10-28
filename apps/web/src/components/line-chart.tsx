import styles from "./line-chart.module.css";

export interface ChartPoint {
  /** Fecha como AAAA-MM-DD. */
  readonly date: string;
  readonly y: number;
}

export interface ChartSeries {
  readonly key: string;
  readonly label: string;
  readonly points: readonly ChartPoint[];
  /** Línea escalonada (para el aportado, que cambia de golpe). */
  readonly step?: boolean;
  readonly tone: "main" | "muted";
}

const W = 640;
const H = 280;
const M = { l: 56, r: 26, t: 14, b: 30 };

/** Hueco (en días) a partir del cual no se une un punto con el anterior: no hay datos entre ambos. */
const MAX_GAP_DAYS = 90;

const day = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** Paso «redondo» (1, 2, 5 × 10ⁿ) para tener entre 4 y 6 marcas en el eje. */
function niceStep(span: number): number {
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

const monthYear = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const fullDate = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" });

/**
 * Gráfica de líneas en SVG, sin JavaScript en el cliente. Las líneas se distinguen por forma
 * (continua frente a discontinua) además de por color, y el resumen del SVG da la primera y la
 * última lectura para lectores de pantalla.
 */
export function LineChart({
  series,
  format,
  label,
}: {
  readonly series: readonly ChartSeries[];
  /** Da formato a un valor del eje Y (porcentaje o importe). */
  readonly format: (y: number) => string;
  readonly label: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const xs = all.map((p) => day(p.date));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const ys = all.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep(hi - lo);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const sx = (x: number) => M.l + (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * (W - M.l - M.r));
  const sy = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) yTicks.push(Number(v.toFixed(10)));
  const xTicks = [0, 1, 2, 3, 4].map((i) => x0 + ((x1 - x0) * i) / 4);

  const gapBefore = (s: ChartSeries, i: number) => {
    const prev = s.points[i - 1];
    const cur = s.points[i];
    return !s.step && prev && cur ? day(cur.date) - day(prev.date) > MAX_GAP_DAYS : false;
  };
  const path = (s: ChartSeries) =>
    s.points
      .map((p, i) => {
        const x = sx(day(p.date)).toFixed(1);
        const y = sy(p.y).toFixed(1);
        if (i === 0 || gapBefore(s, i)) return `M${x} ${y}`;
        if (s.step) return `H${x} V${y}`;
        return `L${x} ${y}`;
      })
      .join(" ");
  // Un punto aislado (con hueco a ambos lados) no se vería como línea: se marca con un punto.
  const isolated = (s: ChartSeries) =>
    s.step
      ? []
      : s.points.filter((_, i) => {
          const before = i === 0 || gapBefore(s, i);
          const after = i === s.points.length - 1 || gapBefore(s, i + 1);
          return before && after;
        });

  const summary = `${label}: ${series
    .map((s) => {
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      return first && last
        ? `${s.label}, de ${format(first.y)} el ${fullDate.format(new Date(day(first.date) * 86_400_000))} a ${format(last.y)} el ${fullDate.format(new Date(day(last.date) * 86_400_000))}`
        : s.label;
    })
    .join("; ")}`;

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className={styles.svg}
        role="img"
        aria-label={summary}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={sy(v)}
              y2={sy(v)}
              className={v === 0 ? styles.zero : styles.grid}
            />
            <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className={styles.tick}>
              {format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={H - 8} textAnchor="middle" className={styles.tick}>
            {monthYear.format(new Date(x * 86_400_000))}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={path(s)}
              className={s.tone === "main" ? styles.main : styles.muted}
              fill="none"
            />
            {isolated(s).map((p) => (
              <circle key={p.date} cx={sx(day(p.date))} cy={sy(p.y)} r={3} className={styles.dot} />
            ))}
          </g>
        ))}
      </svg>
      {series.length > 1 ? (
        <figcaption className={styles.legend}>
          {series.map((s) => (
            <span key={s.key}>
              <svg width="28" height="8" aria-hidden="true">
                <line
                  x1="0"
                  x2="28"
                  y1="4"
                  y2="4"
                  className={s.tone === "main" ? styles.main : styles.muted}
                />
              </svg>{" "}
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
