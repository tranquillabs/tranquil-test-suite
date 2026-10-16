// Runs the security lint (lint/security.ts) over every owned repo, cloned as siblings of this one.
// tranquil-client is a Pulsar fork, so only the files Tranquil added are checked: those with no
// counterpart in the Pulsar checkout at ../pulsar. Shell launchers (bin/*) and deno.json tasks
// are not JavaScript, so their Deno flags are checked as text. Exits non-zero on any finding, or when a repo is missing.
import { walk } from "jsr:@std/fs@^1/walk";
import minimatch from "npm:minimatch@3.1.2";
import { fromFileUrl, join, relative, resolve } from "jsr:@std/path@^1";
import { checkLlmFiles } from "./llm-files.ts";

const here = fromFileUrl(new URL(".", import.meta.url));
const repos = resolve(fromFileUrl(import.meta.resolve("tranquil-repos/"))); // the folder every repo is cloned into

// The owned repos, whole. Tests, fixtures and vendored or built files are left out (SKIP).
const OWNED = [
  "tranquil-automations",
  "tranquil-browser",
  "tranquil-config",
  "tranquil-debug",
  "tranquil-tips",
  "tranquil-rpc",
  "tranquil-window-color",
  "tranquil-drag-drop",
  "tranquil-theme-icons",
  "atom-pdf-view",
  "tranquil-test-suite", // the harness too: it launches the app and serves pages
  "tranquil-llm", // the LLM files; its own tests are skipped like any other
];
const FORK = { repo: "tranquil-client", upstream: "pulsar", dirs: ["src", "static"] };
const SKIP = [/\/node_modules\//, /\/\.git\//, /\/dist\//, /\/vendor\//, /\/testdata\//, /\/fixtures\//, /\/spec\//, /\/test\//, /_test\.ts$/, /\.min\.js$/, /\.d\.ts$/];
// The path rule (lint/paths.ts) also covers tests, where reaching into other repos is most common.
// The types rule (lint/types.ts) covers every repo's own TypeScript: tests and fixtures too, and
// the website and the user-facing script repos when they are cloned. Generated and vendored code is
// not ours to type.
const TYPED_ALSO = ["www-tranquil", "tranquil-examples", "tranquil-ops-demo"];
const TYPE_SKIP = [/\/node_modules\//, /\/\.git\//, /\/dist\//, /\/vendor\//, /\/testdata\//, /\/\.svelte-kit\//, /\/build\//, /\.d\.ts$/];
const PATH_SKIP = [/\/node_modules\//, /\/\.git\//, /\/dist\//, /\/vendor\//, /\/testdata\//, /\/fixtures\//, /\.min\.js$/, /\.d\.ts$/];
const UNSCOPED_IN_SHELL = /(^|\s)(--allow-(all|read|write|net|env|run|ffi|sys|import|scripts)|-A)(?=\s|$|\\)/m;

const exists = (p: string) => Deno.stat(p).then(() => true, () => false);

async function files(dir: string, skip = SKIP, exts = [".js", ".ts", ".mjs", ".cjs"]): Promise<string[]> {
  const out: string[] = [];
  for await (const e of walk(dir, { includeDirs: false, exts })) {
    if (!skip.some((re) => re.test(e.path))) out.push(e.path);
  }
  return out;
}

const targets: string[] = [];
const pathTargets: string[] = [];
const typeTargets: string[] = [];
const missing: string[] = [];
for (const d of OWNED) {
  const dir = join(repos, d);
  if (await exists(dir)) {
    targets.push(...await files(dir));
    pathTargets.push(...await files(dir, PATH_SKIP));
    typeTargets.push(...await files(dir, TYPE_SKIP, [".ts", ".mts"]));
  } else missing.push(d);
}
for (const d of TYPED_ALSO) {
  const dir = join(repos, d);
  if (await exists(dir)) typeTargets.push(...await files(dir, TYPE_SKIP, [".ts", ".mts"]));
}
const upstream = join(repos, FORK.upstream);
if (!(await exists(upstream))) {
  console.error(`lint:security needs the Pulsar checkout at ${upstream} to tell Tranquil's files apart.`);
  Deno.exit(2);
}
for (const d of FORK.dirs) {
  for (const f of await files(join(repos, FORK.repo, d))) {
    const rel = relative(join(repos, FORK.repo), f);
    if (!(await exists(join(upstream, rel)))) {
      targets.push(f);
      pathTargets.push(f);
    }
  }
}
if (missing.length) {
  console.error(`lint:security: missing owned folders (clone them first): ${missing.join(", ")}`);
  Deno.exit(2);
}

let failed = false;
// Shell launchers: any owned repo's bin/ folder.
for (const repo of OWNED) {
  const bin = join(repos, repo, "bin");
  if (!(await exists(bin))) continue;
  for await (const e of walk(bin, { includeDirs: false })) {
    const text = await Deno.readTextFile(e.path);
    const m = UNSCOPED_IN_SHELL.exec(text);
    if (m) {
      failed = true;
      const line = text.slice(0, m.index).split("\n").length;
      console.log(`error[tranquil-security/no-unscoped-deno-permission]: "${m[2]}" grants everything of its kind\n  --> ${e.path}:${line}\n`);
    }
  }
}

// deno.json / deno.jsonc tasks in every owned repo.
for (const repo of OWNED) {
  for (const name of ["deno.json", "deno.jsonc"]) {
    const file = join(repos, repo, name);
    const text = await Deno.readTextFile(file).catch(() => null);
    if (text === null) continue;
    const tasks = /"tasks"\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(text)?.[1] ?? "";
    for (const m of tasks.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)) {
      const flag = UNSCOPED_IN_SHELL.exec(m[2]);
      if (flag) {
        failed = true;
        console.log(`error[tranquil-security/no-unscoped-deno-permission]: task "${m[1]}" uses "${flag[2]}", which grants everything of its kind\n  --> ${file}\n`);
      }
    }
  }
}

// Owned packages ship their code, never their tests or test data. Every test file in every owned
// package (tranquil-client package.json `link:` dependencies) must be excluded by the app build's
// file patterns (script/electron-builder.js `files`), evaluated the way electron-builder does: in
// order, the last matching pattern wins, and an excluded folder excludes everything in it. A new
// owned package, or a new kind of test file, fails here until the patterns cover it.
const TEST_FILE = /(_test|-spec|\.spec)\.[a-z]+$|(^|\/)(spec|test|tests|__tests__|testdata|fixtures)(\/|$)/;
{
  const client = join(repos, FORK.repo);
  const pkg = JSON.parse(await Deno.readTextFile(join(client, "package.json")));
  const owned = Object.entries({ ...pkg.dependencies, ...pkg.packageDependencies })
    .filter(([, v]) => typeof v === "string" && v.startsWith("link:"))
    .map(([name, v]) => [name, join(client, (v as string).slice("link:".length))] as const);
  const builder = await Deno.readTextFile(join(client, "script", "electron-builder.js"));
  const block = /\n\s*files: \[([\s\S]*?)\n\s*\],/.exec(builder)?.[1];
  if (!block) {
    console.error("lint:security: could not find the files patterns in script/electron-builder.js");
    Deno.exit(2);
  }
  const patterns = block.split("\n").filter((l) => !/^\s*\/\//.test(l))
    .flatMap((l) => [...l.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const decide = (p: string): boolean | null => {
    let shipped: boolean | null = null;
    for (const pat of patterns) {
      const negated = pat.startsWith("!");
      if (minimatch(p, negated ? pat.slice(1) : pat, { dot: true })) shipped = !negated;
    }
    return shipped;
  };
  const ships = (p: string) => {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) if (decide(parts.slice(0, i).join("/")) === false) return false;
    return decide(p) === true;
  };
  for (const [name, dir] of owned) {
    for await (const e of walk(dir, { includeDirs: false, skip: [/\/node_modules\//, /\/\.git\//] })) {
      const rel = relative(dir, e.path);
      if (!TEST_FILE.test(rel)) continue;
      // Tests live in the package's top-level test/ folder, never beside source (forks of upstream
      // packages keep their upstream spec/ folders).
      const fork = name === "language-csv" || name === "pdf-view";
      if (!fork && !rel.startsWith("test/")) {
        failed = true;
        console.log(`error[tranquil-security/tests-in-test-folder]: ${name}/${rel} is a test outside test/\n  --> ${e.path}\n  Move it to test/${rel.replace(/^test\//, "")}, mirroring the source path.\n`);
      }
      const shipped = `node_modules/${name}/${rel}`;
      if (ships(shipped)) {
        failed = true;
        console.log(`error[tranquil-security/no-shipped-tests]: ${shipped} would ship in the app\n  --> ${e.path}\n  Exclude it in tranquil-client script/electron-builder.js (the owned-packages test exclusions).\n`);
      }
    }
  }
}

// Every file written for LLMs lives in tranquil-llm, by audience; repos only point to it
// (llm-files.ts, ADR-0029).
for (const finding of await checkLlmFiles(repos)) {
  failed = true;
  console.log(finding);
}

const lint = await new Deno.Command("deno", {
  args: ["lint", "--config", join(here, "security.jsonc"), ...targets],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!lint.success) failed = true;
const paths = await new Deno.Command("deno", {
  args: ["lint", "--config", join(here, "paths.jsonc"), ...pathTargets],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!paths.success) failed = true;

// No `any` in TypeScript, and no comment that switches the check off.
const types = await new Deno.Command("deno", {
  args: ["lint", "--config", join(here, "types.jsonc"), ...typeTargets],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!types.success) failed = true;
// Built from pieces so this file does not match itself.
const ANY = "any";
const SILENCED = new RegExp(String.raw`deno-lint-ignore(-file)?\b[^\n]*\b(no-explicit-${ANY}|tranquil-types\/no-${ANY})\b`);
for (const file of typeTargets) {
  const text = await Deno.readTextFile(file);
  const m = SILENCED.exec(text);
  if (m) {
    failed = true;
    const line = text.slice(0, m.index).split("\n").length;
    console.log(`error[tranquil-types/no-any]: "${m[0]}" switches the type check off; give the value its real type instead\n  --> ${file}:${line}\n`);
  }
}
console.log(`lint:security checked ${targets.length} files in ${OWNED.length + 1} repos, ${pathTargets.length} for paths, ${typeTargets.length} for types`);
Deno.exit(failed ? 1 : 0);
