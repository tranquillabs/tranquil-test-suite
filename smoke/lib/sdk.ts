// Helpers for the SDK suites: open a fixture page, read its framework state, and run a fixture
// automation through the real runner (pre-approving its declared permissions, since a smoke run
// cannot click the consent prompt).
import type { Cdp } from "./cdp.ts";

export const mainModule = `(() => {
  const p = atom.packages.getActivePackage("tranquil-automations") ||
    atom.packages.getLoadedPackage("tranquil-automations");
  return p && p.mainModule;
})()`;

/** Evaluate an expression inside the guest page whose URL contains `marker`. */
export function guestEval(marker: string, expression: string): string {
  return `(() => {
    const item = atom.workspace.getPaneItems().find((i) =>
      typeof i.getURL === "function" && String(i.getURL()).includes(${JSON.stringify(marker)}));
    const wv = item && item.view && item.view.htmlv && item.view.htmlv[0];
    if (!wv) return null;
    try {
      if (wv.isLoading()) return null;
      return wv.executeJavaScript(${JSON.stringify(expression)}).catch(() => null);
    } catch { return null; }
  })()`;
}

export async function openFixture(cdp: Cdp, url: string, marker: string): Promise<void> {
  await cdp.evalInAtom(`atom.workspace.open(${JSON.stringify(url)}).then(() => true)`);
  await cdp.waitFor(guestEval(marker, "!!window.__fixture"), { timeout: 20000 });
}

/** The fixture page's own record of what happened to it, as JSON; `T` is the shape the suite reads. */
export async function fixtureState<T>(cdp: Cdp, marker: string): Promise<T> {
  return await cdp.evalInAtom<T>(guestEval(marker, "JSON.parse(JSON.stringify(window.__fixture.state()))"));
}

export type RunRecord = {
  state: string;
  output: string;
  actions?: { verb: string; target?: string; site?: string; outcome: string }[];
  result?: unknown;
};

/** Pre-approve a script's declared permissions (a smoke run cannot click the consent prompt). */
export async function approve(cdp: Cdp, scriptPath: string): Promise<void> {
  await cdp.evalInAtom(`(() => {
    const pkg = atom.packages.getLoadedPackage("tranquil-automations");
    const perms = require(pkg.path + "/lib/permissions.js");
    const src = require("fs").readFileSync(${JSON.stringify(scriptPath)}, "utf8");
    require(pkg.path + "/lib/consent.js").approve(${JSON.stringify(scriptPath)}, perms.parseHeader(src).grants);
    return true;
  })()`);
}

/** Run a fixture automation through the runner and return its final record. */
export async function runAutomation(cdp: Cdp, scriptPath: string, timeout = 90000, opts: { checkParts?: boolean } = {}): Promise<RunRecord> {
  await approve(cdp, scriptPath);
  const before = await cdp.evalInAtom<number>(`${mainModule}.runManager.runs.length`);
  await cdp.evalInAtom(`(${mainModule}.runManager.run({ scriptPath: ${JSON.stringify(scriptPath)}, trigger: "manual", checkParts: ${Boolean(opts.checkParts)} }), true)`);
  try {
    await cdp.waitFor(`(() => {
      const runs = ${mainModule}.runManager.runs;
      const r = runs.filter((x) => x.scriptPath === ${JSON.stringify(scriptPath)}).at(-1);
      return runs.length > ${before} && !!r && r.state !== "running" && r.state !== "paused" && r.state !== "starting";
    })()`, { timeout });
  } catch (e) {
    const partial = await cdp.evalInAtom<RunRecord | null>(`(() => {
      const r = ${mainModule}.runManager.runs.filter((x) => x.scriptPath === ${JSON.stringify(scriptPath)}).at(-1);
      return r ? { state: r.state, output: r.output } : null;
    })()`).catch(() => null);
    throw new Error(
      `${(e as Error).message.split("\n")[0]}\nRun state: ${partial?.state}\nOutput so far:\n${partial?.output.slice(-4000) ?? "(none)"}`,
    );
  }
  return await cdp.evalInAtom<RunRecord>(`(() => {
    const r = ${mainModule}.runManager.runs.filter((x) => x.scriptPath === ${JSON.stringify(scriptPath)}).at(-1);
    return { state: r.state, output: r.output, actions: r.actions, result: r.result };
  })()`);
}

/** One step a forms fixture reports: the value it returned, the FieldError it threw, or another error. */
export type Step =
  | { ok: unknown }
  | { code: string; message: string; candidates?: string[]; options?: string[] }
  | { thrown: string };

/** The value a step returned. Fails the test, with the step's own error, if it did not succeed. */
export function okOf<T = unknown>(step: Step | undefined): T {
  if (step && "ok" in step) return step.ok as T;
  throw new Error(`expected the step to succeed, got ${JSON.stringify(step)}`);
}

/** The FieldError a step threw. Fails the test if it did not throw one. */
export function failureOf(step: Step | undefined): Extract<Step, { code: string }> {
  if (step && "code" in step) return step;
  throw new Error(`expected a FieldError, got ${JSON.stringify(step)}`);
}

/** The JSON on a run's `RESULT ` line; `T` is the shape the fixture script reports. */
export function resultOf<T>(run: RunRecord): T {
  const line = run.output.split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`No RESULT line (state ${run.state}). Output:\n${run.output.slice(-3000)}`);
  return JSON.parse(line.slice("RESULT ".length)) as T;
}
