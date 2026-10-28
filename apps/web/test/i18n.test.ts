import { describe, expect, it } from "vitest";
import {
  addAccountInput,
  createSpaceInput,
  signInInput,
  signUpInput,
  totpCodeInput,
} from "@mymoney/schemas";
import { isMessageKey, t } from "@/lib/i18n";

describe("t", () => {
  it("interpola parámetros y deja intactos los que faltan", () => {
    expect(t("error.reference", { digest: "abc" })).toBe("Referencia para soporte: abc");
    expect(t("error.reference")).toBe("Referencia para soporte: {digest}");
  });

  it("una clave desconocida da un mensaje genérico, nunca la clave", () => {
    expect(t("no.existe")).toBe(t("error.body"));
  });
});

describe("catálogo frente a esquemas", () => {
  it("todos los mensajes de error de los esquemas tienen texto", () => {
    const samples = [
      signUpInput.safeParse({ email: "x", password: "" }),
      signUpInput.safeParse({ email: "a@b.es", password: "x".repeat(200) }),
      signInInput.safeParse({ email: "a@b.es", password: "" }),
      totpCodeInput.safeParse({ factorId: "", code: "1" }),
      createSpaceInput.safeParse({ name: "", baseCurrency: "x" }),
      createSpaceInput.safeParse({ name: "x".repeat(81) }),
      addAccountInput.safeParse({
        spaceId: "1",
        name: "",
        kind: "x",
        currency: "x",
        currentValue: "",
      }),
      addAccountInput.safeParse({
        spaceId: "1",
        name: "a",
        kind: "x",
        currency: "EUR",
        currentValue: "1e3",
      }),
    ];
    const keys = samples.flatMap((r) => r.error?.issues.map((i) => i.message) ?? []);
    expect(keys.length).toBeGreaterThan(8);
    expect(keys.filter((k) => !isMessageKey(k))).toEqual([]);
  });
});
