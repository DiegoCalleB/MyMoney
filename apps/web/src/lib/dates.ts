import { calendarDate, type CalendarDate } from "@mymoney/finance-core";

/**
 * "Hoy" en la zona horaria del espacio (regla 15). Se obtiene una vez por petición y se pasa
 * como parámetro: `finance-core` no llama al reloj.
 */
export function calendarDateInZone(instant: Date, timeZone: string): CalendarDate {
  // "en-CA" formatea como AAAA-MM-DD sin depender de la configuración regional de la persona.
  return calendarDate(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant),
  );
}
