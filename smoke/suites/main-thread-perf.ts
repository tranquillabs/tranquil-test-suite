// Main-thread performance — the renderer changes from the 2026-09-07 pass.
//
// Two things are checked, both of which look identical to a screenshot and can only be caught by
// asserting behaviour:
//
//  A. Tree-view folder-count badges are positioned by a measure-then-apply pass rather than a
//     read/write loop. The split is invisible unless the geometry it produces is checked, and the
//     geometry is easy to get subtly wrong — the badge's vertical centring comes from a THEME
//     transform (`translateY(calc(-50% + 1px))`), which the JS deliberately never touches.
//
//  B. The Runs panel coalesces renders to one per frame instead of rebuilding per stdout chunk,
//     and grows its <pre> by appending the delta instead of rewriting the whole buffer. The
//     append is the part with real correctness risk: once the ring buffer truncates from the
//     front, the old text stops being a prefix and the code must fall back to a full replace. If
//     that branch is wrong the panel silently shows duplicated or truncated output, which still
//     *looks* like a working panel.

import { assert } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

const RUNS_URI = "tranquil-automations://runs";

const mainModule = `(() => {
  const p = atom.packages.getActivePackage("tranquil-automations") ||
    atom.packages.getLoadedPackage("tranquil-automations");
  return p && p.mainModule;
})()`;

const runsView = `(() => atom.workspace.getPaneItems()
  .find((i) => i.getURI && i.getURI() === ${JSON.stringify(RUNS_URI)}))()`;

// Badge geometry, read fresh. `visibility: hidden` badges are the deliberate
// scrolled-out-of-view / clipped-by-the-dock-mask cases, so they count as placed.
const badgeGeometry = `(() => {
  const tv = document.querySelector('.tree-view');
  if (!tv) return { tree: false };
  const tvRect = tv.getBoundingClientRect();
  const badges = [...tv.querySelectorAll('.tranquil-folder-count')];
  let aligned = 0, insideRightEdge = 0, fixed = 0, shown = 0;
  for (const b of badges) {
    if (getComputedStyle(b).position === 'fixed') fixed++;
    if (getComputedStyle(b).visibility === 'hidden') continue;
    shown++;
    const header = b.closest('.header');
    if (!header) continue;
    const hr = header.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    // plan.top is the row's centre; the theme transform pulls the badge up by half its
    // own height (+1px), so the two centres should land within a pixel or so.
    if (Math.abs((br.top + br.height / 2) - (hr.top + hr.height / 2)) <= 3) aligned++;
    if (br.right <= tvRect.right + 1) insideRightEdge++;
  }
  return {
    tree: true,
    total: badges.length,
    shown,
    fixed,
    aligned,
    insideRightEdge,
    scrollable: tv.scrollHeight > tv.clientHeight + 4,
  };
})()`;

type Geometry = {
  tree: boolean;
  total?: number;
  shown?: number;
  fixed?: number;
  aligned?: number;
  insideRightEdge?: number;
  scrollable?: boolean;
};

type RunStats = {
  renders: number;
  updates: number;
  outputNodeChanges: number;
  state: string;
  outputLen: number;
  domLen: number;
  matches: boolean;
  truncated: boolean;
};

export async function mainThreadPerf(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);

  // --- A. folder-count badges ------------------------------------------------

  await cdp.waitFor(`!!document.querySelector('.tree-view')`);
  // Badges are injected by a MutationObserver pass, so wait for the first one rather than
  // racing it.
  const appeared = await cdp.waitFor<boolean>(
    `document.querySelectorAll('.tree-view .tranquil-folder-count').length > 0`,
    { timeout: 10000 },
  );
  assert(appeared, "folder-count badges should be injected into the tree-view");

  const before = await cdp.evalInAtom<Geometry>(badgeGeometry);
  assert(before.tree, "tree-view should be present");
  assert(
    before.shown! > 0,
    `at least one badge should be visible (total ${before.total})`,
  );
  assert(
    before.fixed === before.total,
    `every badge should be position:fixed (${before.fixed}/${before.total})`,
  );
  assert(
    before.aligned === before.shown,
    `every visible badge should sit on its row's centre line (${before.aligned}/${before.shown}) — ` +
      `a mismatch means the measure/apply split lost the theme's centring transform`,
  );
  assert(
    before.insideRightEdge === before.shown,
    `every visible badge should sit inside the tree-view's right edge ` +
      `(${before.insideRightEdge}/${before.shown})`,
  );

  // Scrolling is what exercises the coalesced reposition: the handler is capture-phase on
  // `document`, so it fires for this scroll and re-measures every badge in one pass.
  if (before.scrollable) {
    await cdp.evalInAtom(
      `(() => { const tv = document.querySelector('.tree-view'); tv.scrollTop = tv.scrollTop + 60; return true; })()`,
    );
    const stillAligned = await cdp.waitFor<boolean>(
      `(() => {
        const tv = document.querySelector('.tree-view');
        const badges = [...tv.querySelectorAll('.tranquil-folder-count')]
          .filter((b) => getComputedStyle(b).visibility !== 'hidden');
        if (!badges.length) return false;
        return badges.every((b) => {
          const h = b.closest('.header');
          if (!h) return false;
          const hr = h.getBoundingClientRect(), br = b.getBoundingClientRect();
          return Math.abs((br.top + br.height / 2) - (hr.top + hr.height / 2)) <= 3;
        });
      })()`,
      { timeout: 5000 },
    );
    assert(
      stillAligned,
      "badges should still track their rows after the tree-view scrolls",
    );
  }

  // --- B. Runs panel ---------------------------------------------------------

  // Release tranquil-config's startup dock guard (it re-hides programmatic dock opens until the
  // first real input, which a CDP-driven suite never produces), then open the panel.
  await cdp.evalInAtom(
    `(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })), true)`,
  );
  await cdp.evalInAtom(
    `atom.workspace.open(${JSON.stringify(RUNS_URI)}).then(() => true)`,
  );
  await cdp.waitFor(`!!${runsView}`);

  const fixture = `${root}/fixtures/automations/chatty.ts`;

  // Instrument the live view: count render() calls, count did-update emissions, and notice
  // whenever the <pre> is replaced rather than appended to.
  const instrumented = await cdp.evalInAtom<boolean>(`(() => {
    const view = ${runsView};
    const m = ${mainModule};
    if (!view || !m || !m.runManager) return false;
    const origRender = Object.getPrototypeOf(view).render;
    globalThis.__tqPerf = {
      renders: 0, updates: 0, outputNodeChanges: 0, lastOutput: null, origRender,
    };
    view.render = function () {
      globalThis.__tqPerf.renders++;
      const out = origRender.apply(this, arguments);
      if (this.outputEl !== globalThis.__tqPerf.lastOutput) {
        globalThis.__tqPerf.outputNodeChanges++;
        globalThis.__tqPerf.lastOutput = this.outputEl;
      }
      return out;
    };
    globalThis.__tqPerfSub = m.runManager.onDidUpdate(() => {
      globalThis.__tqPerf.updates++;
    });
    return true;
  })()`);
  assert(instrumented, "should be able to instrument the Runs panel view");

  await cdp.evalInAtom(
    `(${mainModule}.runManager.run({ scriptPath: ${
      JSON.stringify(fixture)
    }, trigger: "manual" }), true)`,
  );

  // Deno cold-starts and then prints 2400 lines; allow for both.
  await cdp.waitFor(
    `(() => {
      const r = ${mainModule}.runManager.runs.find((x) => x.scriptPath === ${
      JSON.stringify(fixture)
    });
      return !!r && r.state !== 'running' && r.state !== 'paused';
    })()`,
    { timeout: 90000 },
  );

  // The last render is coalesced onto a frame, so wait for the DOM to catch up to the buffer
  // rather than sampling the instant the process exits.
  await cdp.waitFor(
    `(() => {
      const view = ${runsView};
      const r = ${mainModule}.runManager.runs.find((x) => x.scriptPath === ${
      JSON.stringify(fixture)
    });
      return !!view && !!view.outputEl && !!r && view.outputEl.textContent === r.output;
    })()`,
    { timeout: 10000 },
  );

  const stats = await cdp.evalInAtom<RunStats>(`(() => {
    const view = ${runsView};
    const r = ${mainModule}.runManager.runs.find((x) => x.scriptPath === ${
    JSON.stringify(fixture)
  });
    const p = globalThis.__tqPerf;
    return {
      renders: p.renders,
      updates: p.updates,
      outputNodeChanges: p.outputNodeChanges,
      state: r.state,
      outputLen: r.output.length,
      domLen: view.outputEl ? view.outputEl.textContent.length : -1,
      matches: !!view.outputEl && view.outputEl.textContent === r.output,
      truncated: r.output.indexOf('…[truncated]') === 0,
    };
  })()`);

  // Restore, so a later suite sees an uninstrumented panel.
  await cdp.evalInAtom(`(() => {
    const view = ${runsView};
    if (globalThis.__tqPerfSub) globalThis.__tqPerfSub.dispose();
    if (view && globalThis.__tqPerf) delete view.render;
    delete globalThis.__tqPerf;
    delete globalThis.__tqPerfSub;
    return true;
  })()`);

  assert(
    stats.state === "succeeded",
    `the fixture run should succeed (got "${stats.state}")`,
  );

  // The burst has to be real, or the coalescing assertion below proves nothing.
  assert(
    stats.updates > 30,
    `expected a burst of did-update events, got ${stats.updates} — ` +
      `the fixture is not producing enough chunks to test coalescing`,
  );

  // The actual claim: renders are bounded by frames, not by chunks.
  assert(
    stats.renders < stats.updates / 2,
    `renders (${stats.renders}) should be well below did-update events (${stats.updates}) — ` +
      `if they track each other, the panel is still rendering per chunk`,
  );

  // The <pre> is kept and appended to; it should not be recreated per chunk.
  assert(
    stats.outputNodeChanges <= 2,
    `the output <pre> should be reused, not rebuilt (${stats.outputNodeChanges} replacements ` +
      `across ${stats.renders} renders)`,
  );

  // The correctness half: whatever route the text took, the DOM must equal the buffer exactly.
  assert(
    stats.matches,
    `panel text (${stats.domLen} chars) should equal the run's output buffer ` +
      `(${stats.outputLen} chars) — the appended delta has drifted from the source`,
  );

  // And the fixture must actually have overflowed the ring buffer, so the full-replace fallback
  // was exercised rather than only the happy append path.
  assert(
    stats.truncated,
    "the fixture should overflow the 64 KB ring buffer so the truncation fallback is covered",
  );
}
