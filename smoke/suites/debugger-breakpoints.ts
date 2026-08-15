// tranquil-debug — breakpoints bind to the right TypeScript line, and stopping reaps the child.
//
// The reason this suite exists: Deno transpiles TypeScript by re-printing from the AST, so the
// generated line for a given source line almost never matches (measured: only 21.7% of mapping
// segments keep their line, drift up to 127). Breakpoints are therefore placed through the
// script's inline source map. If that decoding regresses, the debugger silently stops on the
// WRONG statement — which looks like a working debugger until you trust it. The fixture is built
// out of exactly the constructs that move lines, so a regression fails here instead.

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

// Find a marker comment's 0-based row, so the suite survives edits to the fixture.
function rowOfMarker(source: string, marker: string): number {
  const rows = source.split("\n");
  const idx = rows.findIndex((line) => line.includes(marker));
  if (idx < 0) throw new Error(`marker ${marker} not found in fixture`);
  return idx;
}

const pkg = `(() => {
  const p = atom.packages.getActivePackage("tranquil-debug") ||
    atom.packages.getLoadedPackage("tranquil-debug");
  return p && p.mainModule;
})()`;

export async function debuggerBreakpoints(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
  const fixture = `${root}/fixtures/debug/breakpoint-drift.ts`;
  const source = await Deno.readTextFile(fixture);
  const insideRow = rowOfMarker(source, "BREAK_INSIDE");
  const unreachableRow = rowOfMarker(source, "BREAK_UNREACHABLE");

  const reachable = await cdp.evalInAtom<boolean>(`!!${pkg}`);
  assert(reachable, "tranquil-debug main module not reachable");

  // --- breakpoints round-trip through the store -----------------------------
  await cdp.evalInAtom(`(() => {
    const m = ${pkg};
    m.store.breakpoints.length = 0;
    m.store.toggle(${JSON.stringify(fixture)}, ${insideRow});
    m.store.toggle(${JSON.stringify(fixture)}, ${unreachableRow});
    return true;
  })()`);
  const count = await cdp.evalInAtom<number>(
    `${pkg}.store.forPath(${JSON.stringify(fixture)}).length`,
  );
  assertEquals(
    count,
    2,
    "two breakpoints should be registered for the fixture",
  );

  // Before any session exists a breakpoint reads as verified — it should look real the moment it
  // is set; grey means "a debugger looked at this and said no".
  const verifiedBeforeRun = await cdp.evalInAtom<boolean>(
    `${pkg}.store.forPath(${JSON.stringify(fixture)}).every((b) => b.verified)`,
  );
  assert(
    verifiedBeforeRun,
    "breakpoints should be verified before a session exists",
  );

  // --- the dots are actually ON SCREEN --------------------------------------
  // Store state alone is not evidence of anything. Three separate defects shipped a working store
  // with an invisible gutter: a custom line-number gutter that never rendered, a decorated gutter
  // whose `class:` option core drops, and setProperties wiping the decoration's type/gutterName.
  // Every one of them left the model perfect and the screen blank, so assert the DOM.
  await cdp.evalInAtom(
    `atom.workspace.open(${JSON.stringify(fixture)}).then(() => true)`,
  );
  const painted = await cdp.waitFor<
    { dots: number; width: number; visible: boolean }
  >(
    `(() => {
      const node = document.querySelector('[gutter-name="tranquil-breakpoints"]');
      if (!node) return null;
      const dots = node.querySelectorAll(".decoration.tranquil-bp");
      if (!dots.length) return null;
      const cs = getComputedStyle(dots[0], "::before");
      return {
        dots: dots.length,
        width: Math.round(node.getBoundingClientRect().width),
        // A transparent dot is the exact failure mode this guards: present in the DOM, unpaintable.
        visible: cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderTopWidth !== "0px",
      };
    })()`,
    { timeout: 10000 },
  );
  assert(
    painted.width > 0,
    "the breakpoint gutter should occupy width on screen",
  );
  assertEquals(
    painted.dots,
    2,
    "both breakpoints should render as gutter decorations",
  );
  assert(
    painted.visible,
    "the breakpoint dot must be painted, not just present in the DOM",
  );

  // --- start a debug session and stop on the right line ---------------------
  await cdp.evalInAtom(`${pkg}.startDebug(${JSON.stringify(fixture)}) && true`);

  await cdp.waitFor(`${pkg}.session.state === "stopped"`, { timeout: 45000 });

  const top = await cdp.evalInAtom<
    { row: number; mapped: boolean; file: string }
  >(`(() => {
    const f = ${pkg}.session.callFrames[0];
    return { row: f.row, mapped: f.mapped, file: f.filePath };
  })()`);

  assert(top.mapped, "the paused frame should map back through the source map");
  assertEquals(
    top.row,
    insideRow,
    `paused on TS row ${top.row}, expected ${insideRow} (source-map mapping is wrong)`,
  );

  // The executed breakpoint bound; the one in dead code never did and must still say so.
  const states = await cdp.evalInAtom<Record<string, boolean>>(`(() => {
    const bps = ${pkg}.store.forPath(${JSON.stringify(fixture)});
    const inside = bps.find((b) => b.requestedRow === ${insideRow});
    const dead = bps.find((b) => b.requestedRow === ${unreachableRow});
    return { insideVerified: !!inside.verified, deadVerified: !!dead.verified };
  })()`);
  assert(states.insideVerified, "the reachable breakpoint should be bound");
  assert(
    !states.deadVerified,
    "a breakpoint in never-executed code must stay unbound",
  );

  // --- stopping a PAUSED session must actually reap the child ---------------
  // The graceful CANCEL frame is handled on the JS event loop, which a paused V8 is not pumping,
  // so this path has to go straight to signals. It is also the path most likely to leak processes.
  await cdp.evalInAtom(`${pkg}.session.stop() && true`);
  await cdp.waitFor(`${pkg}.session.state === "inactive"`, { timeout: 15000 });

  // Session data is cleared on teardown, so the dots go back to solid.
  const verifiedAfter = await cdp.evalInAtom<boolean>(
    `${pkg}.store.forPath(${
      JSON.stringify(fixture)
    }).every((b) => b.sessionData === null)`,
  );
  assert(verifiedAfter, "session data should be cleared when the session ends");

  const orphans = await new Deno.Command("pgrep", {
    args: ["-f", "inspect-brk"],
  })
    .output()
    .then((o) => new TextDecoder().decode(o.stdout).trim())
    .catch(() => "");
  assertEquals(
    orphans,
    "",
    `a suspended deno child was left behind: ${orphans}`,
  );

  // Leave no state behind for the next suite.
  await cdp.evalInAtom(
    `(() => { ${pkg}.store.breakpoints.length = 0; ${pkg}.store.save(); return true; })()`,
  );
}
