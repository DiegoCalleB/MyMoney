import { expect, expectAccessible, test } from "./fixtures";

test("la portada carga con CSP con nonce, cabeceras de seguridad y sin errores", async ({
  page,
  consoleErrors,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["x-powered-by"]).toBeUndefined();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear cuenta" })).toBeVisible();
  await expectAccessible(page);
  expect(consoleErrors).toEqual([]);
});

test("cada respuesta lleva un nonce distinto", async ({ request }) => {
  const a = (await request.get("/")).headers()["content-security-policy"];
  const b = (await request.get("/")).headers()["content-security-policy"];
  expect(a).not.toBe(b);
});

test("el enlace para saltar al contenido es el primer foco", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
});

test("una ruta protegida sin sesión no muestra datos", async ({ page }) => {
  const response = await page.goto("/s/00000000-0000-0000-0000-000000000000/inicio");
  expect(page.url()).not.toContain("/s/");
  expect(response?.status()).toBeLessThan(500);
});

test("la comprobación de salud responde sin cookies ni datos", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toBe("no-store");
});
