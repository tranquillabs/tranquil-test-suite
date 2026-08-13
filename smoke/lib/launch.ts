// Launch a fully isolated Tranquil instance for smoke testing — Deno-native,
// no node involved. Mirrors tranquil-client/scripts/verify.js's isolation and
// depends on the committed TRANQUIL_VERIFY filter in
// tranquil-client/src/main-process/atom-application.js (opens only this repo as
// the project, never tranquil-client). Keep the two in sync.

import { fromFileUrl, join, resolve } from "@std/path";
import { CDP_PORT, cdpAlive } from "./cdp.ts";

const HERE = fromFileUrl(new URL(".", import.meta.url)); // smoke/lib/
export const REPO_ROOT = resolve(HERE, "..", ".."); // tranquil-test-suite/
const TRANQUIL_CLIENT = resolve(REPO_ROOT, "..", "tranquil-client");
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
    if (exists(target)) Deno.symlinkSync(target, join(home, name));
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

  // Full env minus ELECTRON_RUN_AS_NODE (which would make Electron run as node),
  // plus our isolation vars. clearEnv makes `env` authoritative so the delete sticks.
  const env = { ...Deno.env.toObject() };
  delete env.ELECTRON_RUN_AS_NODE;
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
