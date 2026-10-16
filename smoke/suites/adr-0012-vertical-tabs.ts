// ADR-0012 — vertical tab panel in the right dock.
// Ports the live CDP checks: mirrors the center tabs, file octicons,
// click-to-activate, live update, toggle-reveal, close buttons.

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

type Row = { text: string; iconClass: string; hasClose: boolean };

const readRows = `(() => {
  const panel = document.querySelector('.tranquil-vertical-tabs');
  if (!panel) return [];
  return [...panel.querySelectorAll('li, .tranquil-vertical-tab')]
    .filter(r => (r.textContent || '').trim())
    .map(r => ({
      text: (r.textContent || '').trim(),
      iconClass: (r.querySelector('.tab-icon') || {}).className || '',
      hasClose: !!r.querySelector('[class*="close"]'),
    }));
})()`;

export async function adr0012(cdp: Cdp): Promise<void> {
  // 1. Open two fixtures into the center pane.
  await cdp.evalInAtom(`(async () => {
    const root = atom.project.getPaths()[0];
    await atom.workspace.open(root + '/fixtures/notes/welcome.md');
    await atom.workspace.open(root + '/fixtures/data/sample.json');
    return true;
  })()`);

  // 2. Release tranquil-config's startup dock guard first: it re-hides programmatic
  //    right/bottom-dock opens until the first user input (or a 5 s backstop), and a
  //    CDP-driven suite produces no real input. A synthetic keydown counts.
  await cdp.evalInAtom(
    `(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })), true)`,
  );

  //    Then force the panel on and wait for it to render.
  await cdp.evalInAtom(
    `atom.config.set('tranquil-automations.showVerticalTabs', true)`,
  );
  await cdp.waitFor(`!!document.querySelector('.tranquil-vertical-tabs')`);

  // 3. Panel lives in the right dock.
  const inRightDock = await cdp.evalInAtom<boolean>(
    `atom.workspace.getRightDock().getPaneItems()
       .some(i => i.getURI && i.getURI() === 'tranquil-automations://vertical-tabs')`,
  );
  assert(inRightDock, "vertical-tabs pane item should be in the right dock");

  // 4. Rows mirror the fixtures with correct octicons + close buttons.
  //    The panel can appear a frame before its rows, so wait for both fixtures' rows.
  await cdp.waitFor(`(() => {
    const rows = ${readRows};
    return rows.some((r) => r.text.includes("welcome.md")) && rows.some((r) => r.text.includes("sample.json"));
  })()`);
  const rows = await cdp.evalInAtom<Row[]>(readRows);
  const welcome = rows.find((r) => r.text.includes("welcome.md"));
  const sample = rows.find((r) => r.text.includes("sample.json"));
  assert(welcome, "panel should have a row for welcome.md");
  assert(sample, "panel should have a row for sample.json");
  assert(
    welcome!.iconClass.includes("icon-markdown"),
    `welcome.md row should use icon-markdown (got "${welcome!.iconClass}")`,
  );
  assert(
    sample!.iconClass.includes("icon-code"),
    `sample.json row should use icon-code (got "${sample!.iconClass}")`,
  );
  assert(
    welcome!.hasClose && sample!.hasClose,
    "rows should have close buttons",
  );

  // 5. Clicking a row activates that item in the center.
  await cdp.evalInAtom(`(() => {
    const panel = document.querySelector('.tranquil-vertical-tabs');
    const row = [...panel.querySelectorAll('li, .tranquil-vertical-tab')]
      .find(r => (r.textContent || '').includes('welcome.md'));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  })()`);
  await cdp.waitFor(`(() => {
    const a = atom.workspace.getCenter().getActivePaneItem();
    return a && a.getTitle && a.getTitle() === 'welcome.md';
  })()`);

  // 6. Opening another file updates the list live.
  await cdp.evalInAtom(`(async () => {
    await atom.workspace.open(atom.project.getPaths()[0] + '/fixtures/index.html');
    return true;
  })()`);
  await cdp.waitFor(
    `[...document.querySelectorAll('.tranquil-vertical-tabs li, .tranquil-vertical-tabs .tranquil-vertical-tab')]
       .some(r => (r.textContent || '').includes('index.html'))`,
  );

  // 7. Toggle off removes the panel; toggle on restores it and reveals the dock.
  const toggle =
    `atom.commands.dispatch(atom.views.getView(atom.workspace), 'tranquil-automations:toggle-vertical-tabs')`;
  await cdp.evalInAtom(toggle);
  await cdp.waitFor(
    `atom.config.get('tranquil-automations.showVerticalTabs') === false
       && !document.querySelector('.tranquil-vertical-tabs')`,
  );
  await cdp.evalInAtom(toggle);
  const revealed = await cdp.waitFor<boolean>(
    `atom.config.get('tranquil-automations.showVerticalTabs') === true
       && !!document.querySelector('.tranquil-vertical-tabs')
       && atom.workspace.getRightDock().isVisible()`,
  );
  assertEquals(revealed, true, "toggle on should restore + reveal the panel");
}
