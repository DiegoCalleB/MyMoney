#!/usr/bin/env node
// Replica .agents/skills (fuente única) a las rutas propias de las herramientas que no leen
// .agents/skills. Uso: `node scripts/sync-agent-files.mjs` (escribe) o `--check` (CI: falla si
// hay diferencias). Sin dependencias.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, ".agents", "skills");
// Claude Code, GitHub Copilot y Antigravity (ruta de workspace en singular, según su codelab).
const targets = [".claude/skills", ".github/skills", ".agent/skills"];
const check = process.argv.includes("--check");

/** Lista relativa de archivos de un directorio (recursiva, ordenada). */
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? listFiles(full, base) : [relative(base, full)];
    });
}

function validateSkills() {
  const problems = [];
  for (const name of readdirSync(source)) {
    const file = join(source, name, "SKILL.md");
    if (!existsSync(file)) {
      problems.push(`${name}: falta SKILL.md`);
      continue;
    }
    const head = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, "utf8"))?.[1] ?? "";
    const fm = Object.fromEntries(
      head
        .split("\n")
        .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
    );
    if (fm.name !== name)
      problems.push(`${name}: 'name' debe coincidir con el directorio (${fm.name ?? "vacío"})`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
      problems.push(`${name}: nombre no válido`);
    if (!fm.description) problems.push(`${name}: falta 'description'`);
    else if (fm.description.length > 1024)
      problems.push(`${name}: 'description' supera 1024 caracteres`);
  }
  return problems;
}

const problems = validateSkills();
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}

let drift = 0;
for (const target of targets) {
  const dest = join(root, target);
  const want = listFiles(source);
  const have = listFiles(dest);
  const same =
    want.length === have.length &&
    want.every(
      (f, i) => f === have[i] && readFileSync(join(source, f)).equals(readFileSync(join(dest, f))),
    );
  if (check) {
    if (!same) {
      drift++;
      console.error(`✗ ${target} no coincide con .agents/skills (ejecuta: pnpm agents:sync)`);
    }
  } else if (!same) {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(source, dest, { recursive: true });
    console.log(`✓ ${target} sincronizado`);
  }
}
if (check) {
  if (drift) process.exit(1);
  console.log("✓ réplicas de skills sincronizadas");
}
