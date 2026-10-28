import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANOMALY_THRESHOLDS,
  calendarDate,
  detectAnomalies,
  money,
  type Movement,
} from "../../src";

const today = calendarDate("2026-10-28");
let n = 0;
const mv = (
  date: string,
  minor: bigint,
  description: string | null,
  over: Partial<Movement> = {},
): Movement => ({
  id: `m${String(++n).padStart(3, "0")}`,
  date: calendarDate(date),
  kind: "expense",
  description,
  categoryId: "cat",
  amount: money(minor, "EUR"),
  ...over,
});
const run = (ms: Movement[]) => detectAnomalies(ms, today, "EUR");
const rules = (ms: Movement[]) => run(ms).value.map((a) => a.ruleId);

const history = (minor: bigint, count = 5) =>
  Array.from({ length: count }, (_, i) =>
    mv(`2026-0${String(i + 1)}-10`, minor, `Tienda ${String(i)}`),
  );

describe("detectAnomalies", () => {
  it("no avisa sin movimientos ni con ingresos, reembolsos u otras monedas", () => {
    expect(run([]).value).toEqual([]);
    expect(
      rules([
        mv("2026-10-20", 9000n, "x", { kind: "income" }),
        mv("2026-10-21", -9000n, "x"),
        mv("2026-10-22", 9000n, "x", { amount: money(9000n, "USD") }),
      ]),
    ).toEqual([]);
  });

  it("detecta un posible duplicado y solo en el segundo cargo", () => {
    const a = mv("2026-10-20", 1299n, "Netflix 1234");
    const b = mv("2026-10-22", 1299n, "NETFLIX 9876");
    const out = run([a, b]).value;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      ruleId: "possible_duplicate",
      movementId: b.id,
      params: { amount: "1299", date: "2026-10-22", other: "2026-10-20" },
    });
  });

  it("el mismo día desempata por id y no marca los dos", () => {
    const out = run([mv("2026-10-20", 500n, "Café"), mv("2026-10-20", 500n, "Café")]).value;
    expect(out).toHaveLength(1);
  });

  it("no es duplicado con otro importe, otro texto, sin texto o muy separado", () => {
    expect(rules([mv("2026-10-20", 500n, "Café"), mv("2026-10-21", 600n, "Café")])).toEqual([]);
    expect(rules([mv("2026-10-20", 500n, "Café"), mv("2026-10-21", 500n, "Pan")])).toEqual([]);
    expect(rules([mv("2026-10-20", 500n, null), mv("2026-10-21", 500n, "")])).toEqual([]);
    expect(rules([mv("2026-10-10", 500n, "Café"), mv("2026-10-21", 500n, "Café")])).toEqual([]);
  });

  it("detecta una subida de un cargo recurrente, no una bajada ni una subida pequeña", () => {
    const base = [
      mv("2026-07-05", 1000n, "Gimnasio"),
      mv("2026-08-05", 1000n, "Gimnasio"),
      mv("2026-09-05", 1000n, "Gimnasio"),
    ];
    const up = mv("2026-10-05", 1500n, "Gimnasio");
    expect(run([...base, up]).value[0]).toMatchObject({
      ruleId: "recurring_change",
      params: { amount: "1500", usual: "1000" },
    });
    expect(rules([...base, mv("2026-10-05", 700n, "Gimnasio")])).toEqual([]);
    expect(rules([...base, mv("2026-10-05", 1100n, "Gimnasio")])).toEqual([]);
    expect(rules([...base, mv("2026-10-05", 1010n, "Gimnasio")])).toEqual([]);
  });

  it("un cargo recurrente conocido no cuenta como importe inusual", () => {
    const base = [
      mv("2026-07-05", 20000n, "Alquiler"),
      mv("2026-08-05", 20000n, "Alquiler"),
      mv("2026-09-05", 20000n, "Alquiler"),
      ...history(1000n),
    ];
    expect(rules([...base, mv("2026-10-05", 20000n, "Alquiler")])).toEqual([]);
  });

  it("necesita tres meses distintos para considerar un cargo recurrente", () => {
    const same = [
      mv("2026-09-01", 1000n, "Taxi"),
      mv("2026-09-08", 1000n, "Taxi"),
      mv("2026-09-15", 1000n, "Taxi"),
    ];
    expect(rules([...same, mv("2026-10-05", 5000n, "Taxi")])).toEqual([]);
  });

  it("detecta un importe muy por encima de lo habitual en su categoría", () => {
    const out = run([...history(2000n), mv("2026-10-20", 9100n, "Reforma")]).value;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      ruleId: "unusual_amount",
      params: { amount: "9100", usual: "2000", times: "4.5" },
    });
  });

  it("usa la mediana (par) y exige historial, importe mínimo y factor", () => {
    expect(rules([...history(2000n, 4), mv("2026-10-20", 9000n, "R")])).toEqual([]);
    expect(rules([...history(2000n), mv("2026-10-20", 5900n, "R")])).toEqual([]);
    expect(rules([...history(100n), mv("2026-10-20", 4900n, "R")])).toEqual([]);
    const even = [
      ...history(1000n, 3),
      mv("2026-04-10", 3000n, "a"),
      mv("2026-05-11", 3000n, "b"),
      mv("2026-06-12", 3000n, "c"),
    ];
    expect(rules([...even, mv("2026-10-20", 5900n, "R")])).toEqual([]);
    expect(rules([...even, mv("2026-10-20", 6000n, "R")])).toEqual(["unusual_amount"]);
  });

  it("compara por categoría, incluida la ausencia de categoría", () => {
    const other = history(2000n).map((m) => ({ ...m, categoryId: null }));
    expect(rules([...other, mv("2026-10-20", 9000n, "R")])).toEqual([]);
    expect(rules([...other, mv("2026-10-20", 9000n, "R", { categoryId: null })])).toEqual([
      "unusual_amount",
    ]);
  });

  it("solo revisa la ventana reciente y ordena del más reciente al más antiguo", () => {
    const old = mv("2026-08-01", 9000n, "R");
    const future = mv("2026-11-05", 9000n, "R");
    const a = mv("2026-10-10", 9000n, "Uno");
    const b = mv("2026-10-25", 9000n, "Dos");
    const out = run([...history(2000n), old, future, a, b]);
    expect(out.value.map((x) => x.movementId)).toEqual([b.id, a.id]);
    expect(out.explanation.reviewed).toBe(2);
  });

  it("desempata por id con la misma fecha y declara la calidad del dato", () => {
    const a = mv("2026-10-10", 9000n, "Uno");
    const b = mv("2026-10-10", 9100n, "Dos");
    const out = run([...history(2000n), b, a]);
    expect(out.value.map((x) => x.movementId)).toEqual([a.id, b.id]);
    expect(out.explanation).toMatchObject({
      method: "median_baseline_rules",
      dataQuality: "high",
    });
    expect(run([mv("2026-10-10", 100n, "x")]).explanation.dataQuality).toBe("low");
    expect(DEFAULT_ANOMALY_THRESHOLDS.windowDays).toBe(45);
  });
});
