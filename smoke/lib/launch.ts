// Launch a fully isolated Tranquil instance for smoke testing — Deno-native,
// no node involved. Mirrors tranquil-client/scripts/verify.js's isolation and
// depends on the committed TRANQUIL_VERIFY filter in
// tranquil-client/src/main-process/atom-application.js (opens only this repo as
// the project, never tranquil-client). Keep the two in sync.

import { fromFileUrl, join, resolve } from "@std/path";
import { CDP_PORT, cdpAlive } from "./cdp.ts";

export const REPO_ROOT = resolve(fromFileUrl(import.meta.resolve("tranquil-test-suite/")));
const TRANQUIL_CLIENT = resolve(fromFileUrl(import.meta.resolve("tranquil-client/")));
const REAL_ATOM_HOME = join(
  Deno.env.get("HOME") ?? "",
  ".tranquil",
);

function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// What the app needs from the environment it is launched from: a home, a PATH (the runner finds
// Deno and the terminal its shell through it), the user, a temp folder and a locale.
export const PASSED_ENV = ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL"];

function electronBinary(): string {
  const electronDir = join(TRANQUIL_CLIENT, "node_modules", "electron");
  const rel = Deno.readTextFileSync(join(electronDir, "path.txt")).trim();
  return join(electronDir, "dist", rel);
}

// Seed a throwaway ATOM_HOME: the FIXED fixture config (theme pinned) plus
// best-effort dev/packages symlinks so owned packages load as dev on a dev
// machine (falls back to bundled loading when ~/.tranquil is absent).
function seedAtomHome(): string {
  const home = Deno.makeTempDirSync({ prefix: "tranquil-smoke-home-" });
  Deno.copyFileSync(
    join(REPO_ROOT, "smoke", "atom-home", "config.cson"),
    join(home, "config.cson"),
  );
  for (const name of ["dev", "packages"]) {
    const target = join(REAL_ATOM_HOME, name);
    // `ln`, not Deno.symlinkSync: Deno grants symlinks only with unrestricted write access
    // (a link can point anywhere), and this harness runs with write access to the temp folder
    // only. `ln` is named in the task's --allow-run instead.
    if (exists(target)) {
      const ln = new Deno.Command("ln", { args: ["-s", target, join(home, name)] }).outputSync();
      if (!ln.success) throw new Error(`could not link ${target}: ${new TextDecoder().decode(ln.stderr)}`);
    }
  }
  return home;
}

export type IsolatedApp = {
  teardown: () => Promise<void>;
};

export async function launch(): Promise<IsolatedApp> {
  if (await cdpAlive()) {
    throw new Error(
      `Something is already answering on the test CDP port :${CDP_PORT} — ` +
        "stop it (or override TRANQUIL_TEST_CDP_PORT); the smoke tests need " +
        "an exclusive port. A regular dev instance on :9222 is fine.",
    );
  }

  const atomHome = seedAtomHome();
  const userDataDir = Deno.makeTempDirSync({ prefix: "tranquil-smoke-udd-" });
  const io = Deno.env.get("SMOKE_DEBUG") ? "inherit" : "null";

  // A named list of variables from this environment, plus our isolation vars. clearEnv makes
  // `env` the whole environment, so ELECTRON_RUN_AS_NODE (which would make Electron run as node)
  // and anything else unlisted stays out, and the harness needs env access only to these names
  // (the task's --allow-env).
  const env: Record<string, string> = {};
  for (const name of PASSED_ENV) {
    const value = Deno.env.get(name);
    if (value !== undefined) env[name] = value;
  }
  env.ATOM_HOME = atomHome;
  env.ATOM_RESOURCE_PATH = TRANQUIL_CLIENT;
  env.NODE_PATH = join(TRANQUIL_CLIENT, "node_modules");
  env.TRANQUIL_VERIFY = "1";
  // Own CDP port (start.js honors TRANQUIL_CDP_PORT) so the smoke instance never contends
  // with a running dev instance on :9222.
  env.TRANQUIL_CDP_PORT = String(CDP_PORT);

  const child = new Deno.Command(electronBinary(), {
    args: [
      "--no-sandbox",
      "--enable-logging",
      `--user-data-dir=${userDataDir}`,
      ".", // Electron app dir (tranquil-client, via cwd) — must be first positional
      REPO_ROOT, // project to open — Atom opens this; TRANQUIL_VERIFY drops the app-dir root
      "-f",
    ],
    cwd: TRANQUIL_CLIENT,
    clearEnv: true,
    env,
    stdout: io,
    stderr: io,
  }).spawn();

  let exited = false;
  child.status.then(() => (exited = true));

  const teardown = async () => {
    if (!exited) {
      try {
        child.kill("SIGTERM");
      } catch { /* already gone */ }
      // SIGKILL fallback if it doesn't exit promptly.
      const killed = await Promise.race([
        child.status.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
      ]);
      if (!killed) {
        try {
          child.kill("SIGKILL");
        } catch { /* ignore */ }
        await child.status;
      }
    }
    await Deno.remove(atomHome, { recursive: true }).catch(() => {});
    await Deno.remove(userDataDir, { recursive: true }).catch(() => {});
  };

  return { teardown };
}
