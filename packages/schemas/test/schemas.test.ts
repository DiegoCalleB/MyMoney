import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KINDS,
  addAccountInput,
  addMovementInput,
  updateValuesInput,
  defaultLiquidity,
  createSpaceInput,
  isLiabilityKind,
  signInInput,
  signUpInput,
  totpCodeInput,
} from "../src";

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;

describe("signUpInput", () => {
  it("normaliza el correo y exige 12 caracteres", () => {
    const ok = signUpInput.parse({ email: "  Ana@Ejemplo.ES ", password: "una frase larga" });
    expect(ok.email).toBe("ana@ejemplo.es");
    expect(firstError(signUpInput.safeParse({ email: "a@b.es", password: "corta" }))).toBe(
      "validation.password_too_short",
    );
    expect(firstError(signUpInput.safeParse({ email: "a@b.es", password: "x".repeat(129) }))).toBe(
      "validation.password_too_long",
    );
    expect(
      firstError(signUpInput.safeParse({ email: "no-es-correo", password: "x".repeat(12) })),
    ).toBe("validation.email_invalid");
  });
});

describe("signInInput", () => {
  it("usa un mensaje neutro para cualquier fallo de contraseña", () => {
    expect(firstError(signInInput.safeParse({ email: "a@b.es", password: "" }))).toBe(
      "auth.invalid_credentials",
    );
    expect(firstError(signInInput.safeParse({ email: "a@b.es", password: "x".repeat(129) }))).toBe(
      "auth.invalid_credentials",
    );
    expect(signInInput.safeParse({ email: "a@b.es", password: "cualquiera" }).success).toBe(true);
  });
});

describe("totpCodeInput", () => {
  it("acepta solo seis dígitos", () => {
    expect(totpCodeInput.parse({ factorId: "f1", code: " 123456 " }).code).toBe("123456");
    expect(firstError(totpCodeInput.safeParse({ factorId: "f1", code: "12345a" }))).toBe(
      "validation.totp_invalid",
    );
  });
});

describe("createSpaceInput", () => {
  it("recorta el nombre y usa EUR por defecto", () => {
    expect(createSpaceInput.parse({ name: "  Casa  " })).toEqual({
      name: "Casa",
      baseCurrency: "EUR",
    });
    expect(createSpaceInput.parse({ name: "Casa", baseCurrency: "usd" }).baseCurrency).toBe("USD");
    expect(firstError(createSpaceInput.safeParse({ name: "   " }))).toBe(
      "validation.name_required",
    );
    expect(firstError(createSpaceInput.safeParse({ name: "x".repeat(81) }))).toBe(
      "validation.name_too_long",
    );
    expect(firstError(createSpaceInput.safeParse({ name: "Casa", baseCurrency: "EURO" }))).toBe(
      "validation.currency_invalid",
    );
  });
});

describe("addAccountInput", () => {
  const valid = {
    spaceId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    name: "Cuenta nómina",
    kind: "current",
    currency: "EUR",
    currentValue: "1.234,56",
  };

  it("acepta el alta rápida y deja el importe como texto", () => {
    expect(addAccountInput.parse(valid).currentValue).toBe("1.234,56");
  });

  it("rechaza tipos, identificadores e importes inválidos con claves estables", () => {
    expect(firstError(addAccountInput.safeParse({ ...valid, kind: "bitcoin" }))).toBe(
      "validation.account_kind_invalid",
    );
    expect(firstError(addAccountInput.safeParse({ ...valid, spaceId: "1" }))).toBe(
      "validation.invalid_id",
    );
    expect(firstError(addAccountInput.safeParse({ ...valid, currentValue: "" }))).toBe(
      "validation.amount_required",
    );
    expect(firstError(addAccountInput.safeParse({ ...valid, currentValue: "12e3" }))).toBe(
      "validation.amount_invalid",
    );
  });

  it("identifica las deudas", () => {
    expect(isLiabilityKind("mortgage")).toBe(true);
    expect(isLiabilityKind("savings")).toBe(false);
  });
});

describe("defaultLiquidity", () => {
  it("da una liquidez razonable a cada tipo de cuenta", () => {
    expect(defaultLiquidity("real_estate")).toBe("illiquid");
    expect(defaultLiquidity("pension_plan")).toBe("illiquid");
    expect(defaultLiquidity("deposit")).toBe("months");
    expect(defaultLiquidity("brokerage")).toBe("days");
    expect(defaultLiquidity("current")).toBe("immediate");
    expect(defaultLiquidity("mortgage")).toBe("immediate");
    for (const kind of ACCOUNT_KINDS) {
      expect(["immediate", "days", "months", "illiquid"]).toContain(defaultLiquidity(kind));
    }
  });
});

describe("addMovementInput", () => {
  const id = "0ecffd10-756b-4ef2-a197-1773972b8e6b";
  const other = "1ecffd10-756b-4ef2-a197-1773972b8e6b";
  const base = {
    spaceId: id,
    kind: "expense",
    accountId: id,
    amount: "12,50",
    occurredOn: "2026-10-27",
  };

  it("acepta un gasto y recorta la descripción", () => {
    const ok = addMovementInput.parse({ ...base, description: "  Compra  " });
    expect(ok.description).toBe("Compra");
  });

  it("un traspaso necesita un destino distinto del origen", () => {
    expect(firstError(addMovementInput.safeParse({ ...base, kind: "transfer" }))).toBe(
      "movement.to_account_required",
    );
    expect(
      firstError(addMovementInput.safeParse({ ...base, kind: "transfer", toAccountId: "" })),
    ).toBe("movement.to_account_required");
    expect(
      firstError(addMovementInput.safeParse({ ...base, kind: "transfer", toAccountId: id })),
    ).toBe("movement.same_account");
    expect(
      addMovementInput.safeParse({ ...base, kind: "transfer", toAccountId: other }).success,
    ).toBe(true);
  });

  it("rechaza tipo, fecha y descripción no válidos", () => {
    expect(firstError(addMovementInput.safeParse({ ...base, kind: "otro" }))).toBe(
      "movement.kind_invalid",
    );
    expect(firstError(addMovementInput.safeParse({ ...base, occurredOn: "27/10/2026" }))).toBe(
      "validation.date_invalid",
    );
    expect(firstError(addMovementInput.safeParse({ ...base, description: "x".repeat(201) }))).toBe(
      "movement.description_too_long",
    );
  });
});

describe("updateValuesInput", () => {
  it("exige hogar y fecha en formato ISO", () => {
    const spaceId = "0ecffd10-756b-4ef2-a197-1773972b8e6b";
    expect(updateValuesInput.safeParse({ spaceId, asOf: "2026-10-27" }).success).toBe(true);
    expect(firstError(updateValuesInput.safeParse({ spaceId, asOf: "hoy" }))).toBe(
      "validation.date_invalid",
    );
  });
});
