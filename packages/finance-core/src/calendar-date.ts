/**
 * Fecha de calendario sin hora ni zona ("2026-10-26"). Las fechas contables siempre son de
 * este tipo; pasar de un instante a una fecha se hace fuera de la librería, con la zona del
 * espacio (ver `calendarDateInZone` en la web).
 */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function utcMillis(d: CalendarDate): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

export function isCalendarDate(value: string): value is CalendarDate {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function calendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) throw new RangeError(`Fecha de calendario no válida: ${value}`);
  return value;
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((utcMillis(to) - utcMillis(from)) / MS_PER_DAY);
}

export function addDays(d: CalendarDate, days: number): CalendarDate {
  return new Date(utcMillis(d) + days * MS_PER_DAY).toISOString().slice(0, 10) as CalendarDate;
}

/** Las fechas ISO se ordenan igual como texto que como fechas. */
export function compareDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}
