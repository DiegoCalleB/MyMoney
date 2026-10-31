import { expect, expectAccessible, test } from "./fixtures";

const PROTECTED = [
  "/hogares",
  "/seguridad/mfa",
  "/verificar-mfa",
  "/s/00000000-0000-4000-8000-000000000000/inicio",
  "/s/00000000-0000-4000-8000-000000000000/cuentas/nueva",
  "/s/00000000-0000-4000-8000-000000000000/asistente",
  "/s/00000000-0000-4000-8000-000000000000/mas",
];

for (const path of PROTECTED) {
  test(`sin sesión, ${path} lleva a entrar y no muestra datos`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  });
}

test("el registro tiene etiquetas, ayuda de la contraseña y es accesible", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/registro");
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("autocomplete", "email");
  const password = page.getByLabel("Contraseña", { exact: true });
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await expect(password).toHaveAccessibleDescription(/al menos 12 caracteres/i);
  await expectAccessible(page);
  expect(consoleErrors).toEqual([]);
});

test("entrar es accesible y permite pegar la contraseña", async ({ page, consoleErrors }) => {
  await page.goto("/entrar");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expectAccessible(page);
  expect(consoleErrors).toEqual([]);
});

test("un enlace de confirmación inválido muestra el error con rol de alerta", async ({ page }) => {
  await page.goto("/entrar?error=callback");
  // Next añade su propio anunciador de rutas con rol de alerta: se filtra por texto.
  await expect(page.getByRole("alert").filter({ hasText: "El enlace no es válido" })).toBeVisible();
});

test("la página de comprobar correo es accesible", async ({ page }) => {
  await page.goto("/verifica-correo");
  await expect(page.getByRole("heading", { level: 1, name: "Revisa tu correo" })).toBeVisible();
  await expectAccessible(page);
});

test("una página inexistente da un 404 amable y accesible", async ({ page }) => {
  const response = await page.goto("/no-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page);
});
