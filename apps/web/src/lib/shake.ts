export interface MotionSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShakeOptions {
  /** Cuánto debe superar (o quedarse por debajo de) la gravedad una lectura para ser un sacudón (m/s²). */
  readonly spike: number;
  /** Sacudones necesarios dentro de la ventana. */
  readonly spikes: number;
  readonly windowMs: number;
  /** Separación mínima entre dos sacudones: varias lecturas seguidas son el mismo. */
  readonly minGapMs: number;
  /** Pausa tras detectar una agitada, para no alternar dos veces con un solo gesto. */
  readonly cooldownMs: number;
}

export const DEFAULT_SHAKE: ShakeOptions = {
  spike: 11,
  spikes: 3,
  windowMs: 1000,
  minGapMs: 100,
  cooldownMs: 1500,
};

const GRAVITY = 9.81;

/**
 * Detector de agitado independiente de cómo se sujete el móvil: mide el módulo de la aceleración
 * (con gravedad) y cuenta los picos que se alejan de 1 g. Caminar o llevarlo en el bolsillo
 * da picos más suaves y espaciados; una agitada seguida da tres o más en un segundo.
 */
export function createShakeDetector(
  options: ShakeOptions = DEFAULT_SHAKE,
): (sample: MotionSample, now: number) => boolean {
  let spikes: number[] = [];
  let lockedUntil = 0;
  return (sample, now) => {
    if (now < lockedUntil) return false;
    const magnitude = Math.hypot(sample.x, sample.y, sample.z);
    if (Math.abs(magnitude - GRAVITY) < options.spike) return false;
    spikes = spikes.filter((t) => now - t <= options.windowMs);
    const last = spikes[spikes.length - 1];
    if (last === undefined || now - last >= options.minGapMs) spikes.push(now);
    if (spikes.length < options.spikes) return false;
    spikes = [];
    lockedUntil = now + options.cooldownMs;
    return true;
  };
}
