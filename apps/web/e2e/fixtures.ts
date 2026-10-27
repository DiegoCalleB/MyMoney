import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

/** Falla si la CSP bloquea algo o hay errores en la consola. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      // Los fallos de red se registran abajo con su URL, que es más útil que este texto.
      if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
        errors.push(msg.text());
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && !res.request().isNavigationRequest()) {
        errors.push(`${String(res.status())} ${new URL(res.url()).pathname}`);
      }
    });
    page.on("pageerror", (err) => errors.push(err.message));
    await use(errors);
    expect(errors, "errores en consola (¿CSP?)").toEqual([]);
  },
});

export { expect };

/** Accesibilidad: cero violaciones serias o críticas (plan §8). */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
