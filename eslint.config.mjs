// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/test-results/**",
      // Código de Deno (Supabase Edge Functions): otro runtime y sin tsconfig de Node.
      "supabase/functions/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // CLAUDE.md regla 4: nunca HTML sin escapar.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "Prohibido: riesgo de XSS.",
        },
      ],
    },
  },
  {
    // ADR-0007: el dominio no lee el reloj ni usa coma flotante para dinero.
    files: ["packages/finance-core/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Pasa la fecha como parámetro.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Pasa la fecha como parámetro.",
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: "Usa dec() o parseAmount().",
        },
      ],
    },
  },
  {
    // Scripts de Node (sin dependencias): globales de Node declarados explícitamente.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
  {
    files: ["**/*.mjs", "**/*.config.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
);
