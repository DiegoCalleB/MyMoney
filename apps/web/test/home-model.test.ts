import { calendarDate, money, netWorth } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import {
  accountRow,
  balanceRow,
  buildHomeModel,
  foreignCurrencies,
  fxRow,
  movementsAfterRow,
  noticeParams,
  noticeRow,
  valuationRow,
  type HomeRows,
} from "@/server/home-model";

const today = calendarDate("2026-10-27");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const space = { id: ID(1), name: "Casa", base_currency: "EUR", timezone: "Europe/Madrid" } as const;

const account = (n: number, over: Record<string, unknown> = {}) =>
  accountRow.parse({
    id: ID(n),
    name: `Cuenta ${String(n)}`,
    kind: "current",
    is_liability: false,
    currency: "EUR",
    scope: "household",
    closed_on: null,
    ...over,
  });

const rows = (over: Partial<HomeRows> = {}): HomeRows => ({
  space: { ...space, base_currency: "EUR" },
  accounts: [],
  balances: [],
  valuations: [],
  fxRates: [],
  allocations: [],
  ...over,
});

describe("filas de la base de datos", () => {
  it("convierte bigint desde texto o entero seguro y rechaza lo demás", () => {
    expect(
      balanceRow.parse({ account_id: ID(2), currency: "EUR", balance_minor: "-1234" })
        .balance_minor,
    ).toBe(-1234n);
    expect(
      balanceRow.parse({ account_id: ID(2), currency: "EUR", balance_minor: 1234 }).balance_minor,
    ).toBe(1234n);
    expect(() =>
      balanceRow.parse({ account_id: ID(2), currency: "EUR", balance_minor: 1e21 }),
    ).toThrow();
    expect(() =>
      balanceRow.parse({ account_id: ID(2), currency: "EUR", balance_minor: "12.5" }),
    ).toThrow();
  });

  it("rechaza monedas, fechas y tipos de cuenta desconocidos", () => {
    expect(() => accountRow.parse({ ...account(2), currency: "XXX" })).toThrow();
    expect(() => accountRow.parse({ ...account(2), kind: "otra" })).toThrow();
    expect(() =>
      valuationRow.parse({
        account_id: ID(2),
        as_of: "2026-02-30",
        value_minor: "1",
        currency: "EUR",
      }),
    ).toThrow();
  });

  it("lee los tipos de cambio como decimales exactos", () => {
    expect(
      fxRow.parse({
        base: "EUR",
        quote: "USD",
        as_of: "2026-10-26",
        rate: "1.1600000000",
        source: "BCE",
      }).rate,
    ).toBe("1.1600000000");
    expect(
      fxRow.parse({ base: "EUR", quote: "USD", as_of: "2026-10-26", rate: 1.16, source: "BCE" })
        .rate,
    ).toBe("1.16");
    expect(() =>
      fxRow.parse({ base: "EUR", quote: "USD", as_of: "2026-10-26", rate: "-1", source: "BCE" }),
    ).toThrow();
  });
});

describe("buildHomeModel", () => {
  it("usa la última valoración de cada cuenta hasta hoy e ignora las futuras", () => {
    const model = buildHomeModel(
      rows({
        accounts: [account(2)],
        valuations: [
          valuationRow.parse({
            account_id: ID(2),
            as_of: "2026-10-01",
            value_minor: "100000",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(2),
            as_of: "2026-10-20",
            value_minor: "250000",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(2),
            as_of: "2026-11-05",
            value_minor: "999999",
            currency: "EUR",
          }),
        ],
      }),
      today,
    );
    const { value } = netWorth(model.input);
    expect(value.total).toEqual(money(250000n, "EUR"));
  });

  it("usa el saldo de movimientos si no hay valoración y suma solo en la moneda de la cuenta", () => {
    const model = buildHomeModel(
      rows({
        accounts: [account(2)],
        balances: [
          balanceRow.parse({ account_id: ID(2), currency: "EUR", balance_minor: "5000" }),
          balanceRow.parse({ account_id: ID(2), currency: "USD", balance_minor: "9999" }),
        ],
      }),
      today,
    );
    expect(netWorth(model.input).value.total).toEqual(money(5000n, "EUR"));
  });

  it("excluye cuentas externas, cerradas y las sin valor; las deudas restan", () => {
    const model = buildHomeModel(
      rows({
        accounts: [
          account(2),
          account(3, { scope: "external" }),
          account(4, { closed_on: "2026-01-01" }),
          account(5, { closed_on: "2027-01-01" }),
          account(6, { kind: "mortgage", is_liability: true }),
          account(7),
        ],
        valuations: [
          valuationRow.parse({
            account_id: ID(2),
            as_of: "2026-10-20",
            value_minor: "100000",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(3),
            as_of: "2026-10-20",
            value_minor: "777777",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(4),
            as_of: "2026-10-20",
            value_minor: "888888",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(5),
            as_of: "2026-10-20",
            value_minor: "10000",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(6),
            as_of: "2026-10-20",
            value_minor: "30000",
            currency: "EUR",
          }),
        ],
      }),
      today,
    );
    const result = netWorth(model.input);
    expect(result.value.total).toEqual(money(80000n, "EUR"));
    expect(result.explanation.quality.excluded).toEqual([
      { accountId: ID(7), code: "net_worth.no_value" },
    ]);
    expect([...model.accounts.keys()]).toEqual([ID(2), ID(5), ID(6), ID(7)]);
  });

  it("reparte por bolsillos solo las cuentas que cuentan y convierte monedas", () => {
    const model = buildHomeModel(
      rows({
        accounts: [account(2), account(3, { currency: "USD" })],
        valuations: [
          valuationRow.parse({
            account_id: ID(2),
            as_of: "2026-10-20",
            value_minor: "100000",
            currency: "EUR",
          }),
          valuationRow.parse({
            account_id: ID(3),
            as_of: "2026-10-26",
            value_minor: "12500",
            currency: "USD",
          }),
        ],
        fxRates: [
          fxRow.parse({
            base: "EUR",
            quote: "USD",
            as_of: "2026-10-26",
            rate: "1.25",
            source: "BCE",
          }),
        ],
        allocations: [
          { pocket_id: ID(9), account_id: ID(2), asset_id: null, weight_bps: 5000 },
          { pocket_id: ID(9), account_id: ID(99), asset_id: null, weight_bps: 10000 },
        ],
      }),
      today,
    );
    const { value } = netWorth(model.input);
    expect(value.total).toEqual(money(110000n, "EUR"));
    expect(value.byPocket).toEqual([{ pocketId: ID(9), value: money(50000n, "EUR") }]);
    expect(value.unassigned).toEqual(money(60000n, "EUR"));
  });
});

describe("foreignCurrencies", () => {
  it("lista las monedas distintas de la base", () => {
    const list = foreignCurrencies({
      space: { ...space, base_currency: "EUR" },
      accounts: [account(2), account(3, { currency: "USD" })],
      valuations: [
        valuationRow.parse({
          account_id: ID(3),
          as_of: "2026-10-20",
          value_minor: "1",
          currency: "GBP",
        }),
      ],
    });
    expect(list.sort()).toEqual(["GBP", "USD"]);
  });
});

describe("noticeParams", () => {
  it("solo deja cadenas cortas", () => {
    const row = noticeRow.parse({
      id: ID(2),
      message_key: "reco.x",
      severity: "info",
      message_params: { ok: "texto", numero: 5, largo: "x".repeat(81), anidado: { a: 1 } },
    });
    expect(noticeParams(row)).toEqual({ ok: "texto" });
  });
});

describe("movimientos posteriores a la valoración", () => {
  const valuation = valuationRow.parse({
    account_id: ID(2),
    as_of: "2026-10-01",
    value_minor: "100000",
    currency: "EUR",
  });
  const after = (over: Record<string, unknown> = {}) =>
    movementsAfterRow.parse({
      account_id: ID(2),
      currency: "EUR",
      delta_minor: -2500,
      last_on: "2026-10-20",
      ...over,
    });
  const total = (movementsAfter: HomeRows["movementsAfter"]) =>
    netWorth(
      buildHomeModel(
        rows({ accounts: [account(2)], valuations: [valuation], movementsAfter }),
        today,
      ).input,
    ).value.total;

  it("se suman a la valoración de su cuenta", () => {
    expect(total([after()])).toEqual(money(97500n, "EUR"));
  });

  it("sin movimientos, o en otra moneda, se usa solo la valoración", () => {
    expect(total(undefined)).toEqual(money(100000n, "EUR"));
    expect(total([after({ currency: "USD" })])).toEqual(money(100000n, "EUR"));
    expect(total([after({ account_id: ID(3) })])).toEqual(money(100000n, "EUR"));
  });

  it("no se aplican a una cuenta sin valoración", () => {
    const model = buildHomeModel(
      rows({ accounts: [account(2)], movementsAfter: [after()] }),
      today,
    );
    expect(model.input.accounts[0]).not.toHaveProperty("movementsAfterValuation");
  });
});
