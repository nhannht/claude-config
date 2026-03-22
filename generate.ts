#!/usr/bin/env bun
/**
 * Template system for ~/.claude config files.
 *
 * Pipeline:
 *   load config (yml layers) → find *.tmpl files → replace {{PLACEHOLDERS}} → write output
 *
 * Modes:
 *   (default)   — generate with real values (local use)
 *   --publish   — generate with secrets REDACTED (for commit)
 *   --check     — verify generated files are fresh (exit 1 if stale)
 *   --init      — reverse-engineer existing files into templates (one-time migration)
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";

const ROOT = path.resolve(import.meta.dir);

// ─── CLI Args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE: "local" | "publish" = args.includes("--publish") ? "publish" : "local";
const CHECK = args.includes("--check");
const INIT = args.includes("--init");

// ─── Config Loading ──────────────────────────────────────────

interface Config {
  values: Record<string, string>;
  secrets: Set<string>;
}

const SECRET_PATTERNS = /SECRET|PASSWORD|TOKEN|API_KEY|CREDENTIAL/i;

function loadYamlFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  return parseYaml(content) || {};
}

function loadConfig(): Config {
  const base = loadYamlFile(path.join(ROOT, "config.yml"));
  const local = loadYamlFile(path.join(ROOT, "config.local.yml"));
  const secretsFile = loadYamlFile(path.join(ROOT, "config.secrets.yml"));

  // Extract _secrets list before merging
  const explicitSecrets: string[] = Array.isArray(base._secrets) ? base._secrets : [];
  delete base._secrets;
  delete local._secrets;
  delete secretsFile._secrets;

  // Merge: base → local → secrets (later overrides earlier)
  const merged: Record<string, string> = {};
  for (const layer of [base, local, secretsFile]) {
    for (const [key, value] of Object.entries(layer)) {
      if (typeof value === "string") {
        merged[key] = value;
      } else if (value !== null && value !== undefined) {
        merged[key] = String(value);
      }
    }
  }

  // Determine which keys are secrets
  const secrets = new Set<string>();
  for (const key of Object.keys(merged)) {
    if (SECRET_PATTERNS.test(key) || explicitSecrets.includes(key)) {
      secrets.add(key);
    }
  }
  // All keys from config.secrets.yml are secrets
  for (const key of Object.keys(secretsFile)) {
    secrets.add(key);
  }

  return { values: merged, secrets };
}

// ─── Template Discovery ──────────────────────────────────────

function findTemplates(): string[] {
  const templates: string[] = [];

  function scanDir(dir: string, depth: number = 0) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".env.tmpl" && entry.name !== ".mcp.json.tmpl") continue;
      if (entry.name === "node_modules" || entry.name === "gstack") continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".tmpl")) {
        templates.push(fullPath);
      } else if (entry.isDirectory() && depth < 3) {
        scanDir(fullPath, depth + 1);
      }
    }
  }

  scanDir(ROOT);
  return templates;
}

// ─── Format Detection & Headers ──────────────────────────────

type FileFormat = "json" | "markdown" | "python" | "env" | "yaml" | "other";

function detectFormat(tmplPath: string): FileFormat {
  const outputName = path.basename(tmplPath).replace(/\.tmpl$/, "");
  if (outputName.endsWith(".json")) return "json";
  if (outputName.endsWith(".md")) return "markdown";
  if (outputName.endsWith(".py")) return "python";
  if (outputName.endsWith(".env") || outputName === ".env") return "env";
  if (outputName.endsWith(".yml") || outputName.endsWith(".yaml")) return "yaml";
  return "other";
}

function addHeader(content: string, format: FileFormat, sourceName: string): string {
  const tag = `AUTO-GENERATED from ${sourceName} — do not edit directly`;
  const regen = `Regenerate: bun run generate.ts`;

  switch (format) {
    case "json":
      // JSON can't have comments — skip header
      return content;
    case "markdown":
      return `<!-- ${tag} -->\n<!-- ${regen} -->\n${content}`;
    case "python": {
      const lines = content.split("\n");
      if (lines[0]?.startsWith("#!")) {
        return `${lines[0]}\n# ${tag}\n# ${regen}\n${lines.slice(1).join("\n")}`;
      }
      return `# ${tag}\n# ${regen}\n${content}`;
    }
    case "env":
      return `# ${tag}\n# ${regen}\n${content}`;
    case "yaml":
      return `# ${tag}\n# ${regen}\n${content}`;
    default:
      return content;
  }
}

// ─── Template Processing ─────────────────────────────────────

function processTemplate(
  tmplPath: string,
  config: Config,
  mode: "local" | "publish"
): { outputPath: string; content: string } {
  const tmplContent = fs.readFileSync(tmplPath, "utf-8");
  const outputPath = tmplPath.replace(/\.tmpl$/, "");
  const format = detectFormat(tmplPath);
  const sourceName = path.basename(tmplPath);
  const relPath = path.relative(ROOT, tmplPath);

  // Replace {{PLACEHOLDER}} with config values
  let content = tmplContent.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!(key in config.values)) {
      throw new Error(
        `Unresolved placeholder {{${key}}} in ${relPath}. ` +
          `Add it to config.yml, config.local.yml, or config.secrets.yml`
      );
    }

    if (mode === "publish" && config.secrets.has(key)) {
      return "REDACTED";
    }

    return config.values[key];
  });

  // Check for remaining unresolved placeholders
  const remaining = content.match(/\{\{(\w+)\}\}/g);
  if (remaining) {
    throw new Error(`Unresolved placeholders in ${relPath}: ${remaining.join(", ")}`);
  }

  // Add generated header
  content = addHeader(content, format, sourceName);

  // Validate JSON output
  if (format === "json") {
    try {
      JSON.parse(content);
    } catch (e) {
      throw new Error(`Generated ${path.relative(ROOT, outputPath)} is not valid JSON: ${e}`);
    }
  }

  return { outputPath, content };
}

// ─── Unused Config Detection ─────────────────────────────────

function checkUnused(config: Config, templates: string[]): string[] {
  const allContent = templates.map((t) => fs.readFileSync(t, "utf-8")).join("\n");

  const warnings: string[] = [];
  for (const key of Object.keys(config.values)) {
    if (!allContent.includes(`{{${key}}}`)) {
      warnings.push(`WARNING: config key "${key}" is not used in any template`);
    }
  }
  return warnings;
}

// ─── --init: Migration ───────────────────────────────────────

interface ReplacementRule {
  pattern: string;
  placeholder: string;
}

function initTemplates(): void {
  const config = loadConfig();

  // Build replacement rules from config values (longest first to avoid partial matches)
  const rules: ReplacementRule[] = Object.entries(config.values)
    .filter(([_, value]) => value.length >= 4) // skip very short values
    .map(([key, value]) => ({ pattern: value, placeholder: key }))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  // Files to templatize
  const filesToTemplate = [
    ".env",
    ".mcp.json",
    "CLAUDE.md",
    "settings.json",
    "hooks/enforce-locate.py",
    "hooks/enforce-docker-ports.py",
    "hooks/enforce-secure-passwords.py",
    "skills/burpsuite-control/SKILL.md",
    "skills/codeforce-control/SKILL.md",
    "skills/youtrack/SKILL.md",
  ];

  let created = 0;
  for (const relPath of filesToTemplate) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      console.log(`SKIP: ${relPath} (not found)`);
      continue;
    }

    let content = fs.readFileSync(absPath, "utf-8");

    // Remove any existing generated header
    content = content.replace(/^<!-- AUTO-GENERATED.*-->\n<!-- Regenerate.*-->\n/m, "");
    content = content.replace(/^# AUTO-GENERATED.*\n# Regenerate.*\n/m, "");

    for (const rule of rules) {
      if (content.includes(rule.pattern)) {
        content = content.replaceAll(rule.pattern, `{{${rule.placeholder}}}`);
      }
    }

    const tmplPath = absPath + ".tmpl";
    fs.writeFileSync(tmplPath, content);
    console.log(`CREATED: ${relPath}.tmpl`);
    created++;
  }

  console.log(`\nMigration complete: ${created} templates created.`);
  console.log("Review each .tmpl file, then run: bun run generate.ts");
}

// ─── Main ────────────────────────────────────────────────────

if (INIT) {
  initTemplates();
  process.exit(0);
}

const config = loadConfig();
const templates = findTemplates();

if (templates.length === 0) {
  console.error("No .tmpl files found. Run: bun run generate.ts --init");
  process.exit(1);
}

// Check for unused config keys
const unusedWarnings = checkUnused(config, templates);
for (const w of unusedWarnings) {
  console.warn(w);
}

// Process all templates
let hasChanges = false;
let processed = 0;
let errors = 0;

for (const tmplPath of templates) {
  const relTmpl = path.relative(ROOT, tmplPath);
  try {
    const { outputPath, content } = processTemplate(tmplPath, config, MODE);
    const relOutput = path.relative(ROOT, outputPath);

    if (CHECK) {
      // --check mode: compare with existing file
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf-8") : "";
      if (existing !== content) {
        console.error(`STALE: ${relOutput} (regenerate with: bun run generate.ts)`);
        hasChanges = true;
      } else {
        console.log(`OK: ${relOutput}`);
      }
    } else {
      // Write mode
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, content);
      console.log(`GENERATED: ${relOutput} (from ${relTmpl})`);
    }
    processed++;
  } catch (e) {
    console.error(`ERROR: ${relTmpl}: ${e instanceof Error ? e.message : e}`);
    errors++;
  }
}

console.log(`\n${processed} files ${CHECK ? "checked" : "generated"}, ${errors} errors.`);
if (MODE === "publish") {
  console.log("Mode: publish (secrets REDACTED)");
}

if (CHECK && hasChanges) {
  process.exit(1);
}
if (errors > 0) {
  process.exit(1);
}
