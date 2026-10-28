import { describe, expect, it } from "vitest";
import {
  BINANCE,
  ENTITY_TEMPLATES,
  TRADE_REPUBLIC,
  analyzeStatement,
  commitPayload,
  matchTemplate,
  previewPayload,
  toHex,
  type EntityTemplate,
} from "../src";

const bytes = (text: string) => new TextEncoder().encode(text);
const input = (text: string, currency: "EUR" | "USD" = "EUR") => ({
  bytes: bytes(text),
  accountId: "acc-1",
  currency,
});
const run = (text: string, templates: readonly EntityTemplate[] = ENTITY_TEMPLATES) => {
  const result = analyzeStatement(input(text), templates);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

// Archivos inventados con la forma descrita por cada plantilla.
const TR = [
  "datetime,date,type,name,description,amount,currency,transaction_id",
  "2026-10-01T09:00:00Z,2026-10-01,CUSTOMER_INBOUND,Ejemplo,Ingreso,1000.00,EUR,tx-1",
  "2026-10-02T09:00:00Z,2026-10-02,CUSTOMER_OUTBOUND,Ejemplo,Retirada,-200.50,EUR,tx-2",
  "2026-10-03T09:00:00Z,2026-10-03,DIVIDEND,Empresa Ficticia,Dividendo,12.34,EUR,tx-3",
  "2026-10-04T09:00:00Z,2026-10-04,INTEREST_PAYMENT,,Intereses,5.67,EUR,tx-4",
  "2026-10-05T09:00:00Z,2026-10-05,BUY,Fondo Ficticio,Compra,-300.00,EUR,tx-5",
  "2026-10-06T09:00:00Z,2026-10-06,CARD_TRANSACTION,Tienda,Pago,-9.99,EUR,tx-6",
  "2026-10-07T09:00:00Z,2026-10-07,DIVIDEND,Empresa USD,Dividendo,3.00,USD,tx-7",
  "2026-10-08T09:00:00Z,2026-13-45,CUSTOMER_INBOUND,Ejemplo,Fecha mala,10.00,EUR,tx-8",
  "2026-10-09T09:00:00Z,2026-10-09,CUSTOMER_INBOUND,Ejemplo,Sin importe,,EUR,tx-9",
  "2026-10-10T09:00:00Z,2026-10-10,CUSTOMER_INBOUND,Ejemplo,Importe malo,abc,EUR,tx-10",
  "2026-10-11T09:00:00Z,2026-10-11,CUSTOMER_INBOUND,Ejemplo,Cero,0.00,EUR,tx-11",
  "2026-10-12T09:00:00Z,2026-10-12,CUSTOMER_INBOUND,Ejemplo,Enorme,99999999999999999.00,EUR,tx-12",
].join("\n");

describe("matchTemplate", () => {
  it("reconoce la cabecera sin tildes ni mayúsculas", () => {
    const header = "Datetime,DATE,Type,Name,Amount,Currency,Transaction_ID".split(",");
    expect(matchTemplate(header, ENTITY_TEMPLATES)?.id).toBe("trade_republic");
  });

  it("no reconoce una cabecera a la que le falta una columna", () => {
    expect(matchTemplate(["date", "type", "amount"], ENTITY_TEMPLATES)).toBeNull();
  });

  it("la primera columna repetida gana", () => {
    const a = run(TR.replace("datetime,date,", "datetime,date,date,"));
    expect(a.template?.id).toBe("trade_republic");
  });
});

describe("plantilla de Trade Republic", () => {
  const a = run(TR);

  it("crea aportación, retirada, dividendo e interés con el signo del tipo", () => {
    const sample = a.rows.map((r) => [r.kind, r.amount.minor]);
    expect(sample).toEqual([
      ["contribution", 100000n],
      ["withdrawal", -20050n],
      ["dividend", 1234n],
      ["interest", 567n],
    ]);
  });

  it("omite compras y filas de otra moneda, y lo cuenta", () => {
    expect(a.skipped).toBe(2);
  });

  it("marca como error lo que no entiende, sin descartarlo en silencio", () => {
    expect(a.errors).toEqual([
      { index: 6, code: "row.kind_unknown" },
      { index: 8, code: "row.date_invalid" },
      { index: 9, code: "row.amount_missing" },
      { index: 10, code: "row.amount_invalid" },
      { index: 11, code: "row.amount_zero" },
      { index: 12, code: "row.amount_too_large" },
    ]);
  });

  it("informa de que la plantilla no está verificada", () => {
    expect(a.template).toEqual({ id: "trade_republic", label: "Trade Republic", verified: false });
  });

  it("usa el identificador de la entidad como huella: reordenar no cambia nada", () => {
    const lines = TR.split("\n");
    const reordered = [lines[0], ...lines.slice(1).reverse()].join("\n");
    const b = run(reordered);
    const byId = (x: typeof a) => new Set(x.rows.map((r) => toHex(r.fingerprint)));
    expect(byId(b)).toEqual(byId(a));
  });

  it("dos filas con el mismo identificador se detectan como duplicadas", () => {
    const dup = [TR.split("\n")[0], TR.split("\n")[1], TR.split("\n")[1]].join("\n");
    const c = run(dup);
    expect(toHex(c.rows[0]?.fingerprint ?? new Uint8Array())).toBe(
      toHex(c.rows[1]?.fingerprint ?? new Uint8Array()),
    );
  });

  it("sin identificador en una fila cae a la huella por tupla", () => {
    const noId = TR.split("\n").slice(0, 2).join("\n").replace("tx-1", "");
    const c = run(noId);
    expect(toHex(c.rows[0]?.fingerprint ?? new Uint8Array())).toHaveLength(64);
  });

  it("alimenta la vista previa y la confirmación con los tipos de la plantilla", () => {
    const preview = previewPayload(a, "acc-1");
    expect(preview).toHaveLength(10);
    const txs = commitPayload(a, "acc-1", new Set([1, 2, 3, 4]), true);
    expect(txs.map((t) => t.kind)).toEqual(["contribution", "withdrawal", "dividend", "interest"]);
    expect(txs[1]?.legs.map((l) => l.amount_minor)).toEqual(["-20050", "20050"]);
    expect(txs[0]?.description).toBe("Ejemplo · Ingreso");
  });
});

describe("plantilla de Binance", () => {
  const BN = [
    "User_ID,UTC_Time,Account,Operation,Coin,Change,Remark",
    "1,2026-10-01 10:00:00,Spot,Deposit,EUR,500.00,",
    "1,2026-10-02 10:00:00,Spot,Withdraw,EUR,-100.00,Retirada",
    "1,2026-10-03 10:00:00,Spot,Deposit,BTC,0.01,",
    "1,2026-10-04 10:00:00,Spot,Transaction Buy,EUR,-50.00,",
    "1,2026-10-05 10:00:00,Spot,Fee,BNB,-0.0001,",
  ].join("\n");

  it("solo cuenta depósitos y retiradas en la moneda de la cuenta", () => {
    const a = run(BN);
    expect(a.rows.map((r) => [r.kind, r.amount.minor])).toEqual([
      ["contribution", 50000n],
      ["withdrawal", -10000n],
    ]);
    expect(a.errors).toEqual([]);
    expect(a.skipped).toBe(3);
    expect(a.template?.id).toBe("binance");
  });

  it("una cuenta en otra moneda omite las filas en euros", () => {
    const result = analyzeStatement(input(BN, "USD"), ENTITY_TEMPLATES);
    expect(result.ok && result.value.rows).toEqual([]);
  });
});

describe("analyzeStatement", () => {
  it("sin plantilla aplicable usa el detector genérico", () => {
    const generic = ["Fecha;Concepto;Importe", "27/10/2026;Café;-3,00"].join("\n");
    const a = run(generic);
    expect(a.template).toBeNull();
    expect(a.skipped).toBe(0);
    expect(a.rows).toHaveLength(1);
  });

  it("con un mapeo elegido a mano no aplica plantillas", () => {
    const result = analyzeStatement(
      {
        ...input(TR),
        mapping: {
          dateColumn: 1,
          dateFormat: "ymd",
          descriptionColumn: 3,
          amount: { kind: "single", column: 5 },
          balanceColumn: null,
          numberFormat: "en",
        },
      },
      ENTITY_TEMPLATES,
    );
    expect(result.ok && result.value.template).toBeNull();
  });

  it("rechaza un archivo demasiado grande y un CSV mal formado", () => {
    const big = analyzeStatement(
      { bytes: new Uint8Array(5 * 1024 * 1024 + 1), accountId: "a", currency: "EUR" },
      ENTITY_TEMPLATES,
    );
    expect(!big.ok && big.error.code).toBe("import.file_too_large");
    const broken = analyzeStatement(input('a,b\n"x'), ENTITY_TEMPLATES);
    expect(!broken.ok && broken.error.code).toBe("csv.unterminated_quote");
  });

  it("una plantilla reconocida sin filas de datos da import.no_data", () => {
    const result = analyzeStatement(
      input("datetime,date,type,name,description,amount,currency,transaction_id"),
      [TRADE_REPUBLIC],
    );
    expect(!result.ok && result.error.code).toBe("import.no_data");
  });

  it("si ninguna fila es válida, el resumen no tiene fechas", () => {
    const a = run("date,type,amount,currency,transaction_id\n2026-10-05,BUY,-1,EUR,x");
    expect(a.summary).toMatchObject({ validRows: 0, from: null, to: null, hasBalance: false });
  });

  it("tolera filas con menos columnas que la cabecera", () => {
    const a = run("date,type,amount,currency,transaction_id\n2026-10-05");
    expect(a.errors).toEqual([{ index: 1, code: "row.kind_unknown" }]);
  });

  it("una plantilla sin columna de moneda no filtra por moneda", () => {
    const noCurrency: EntityTemplate = { ...BINANCE, id: "sin_moneda", currencyColumn: null };
    const a = run("UTC_Time,Operation,Coin,Change\n2026-10-01 10:00:00,Deposit,BTC,5.00", [
      noCurrency,
    ]);
    expect(a.rows).toHaveLength(1);
  });

  it("Binance usa la plantilla sin identificador ni descripción", () => {
    expect(BINANCE.idColumn).toBeNull();
    const a = run("UTC_Time,Operation,Coin,Change\n2026-10-01 10:00:00,Deposit,EUR,5.00", [
      BINANCE,
    ]);
    expect(a.rows[0]?.description).toBe("");
  });
});
