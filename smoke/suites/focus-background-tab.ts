// Focus regression — cmd-click opens a background tab without stealing the
// active item / focus, grouped right after its opener, and key routing still
// works afterward.
//
// Guards the `open-link-in-new-tab` background open (utils.js), which opens with
// { activateItem: false, activatePane: false }. The old code activated the new
// tab then restored the source, stranding focus in the now-hidden new guest so
// forwarded keys (ctrl+tab, …) died after a cmd-click.
//
// The handler is an in-renderer ipcRenderer listener; ipcRenderer.emit() invokes
// it directly (we can't inject a keydown into the guest from the host target).

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

const CLEAR_CENTER = `(() => {
  for (const it of atom.workspace.getCenter().getPaneItems().slice()) {
    const p = atom.workspace.paneForItem(it); if (p) p.destroyItem(it, true);
  }
  return true;
})()`;

type After = { activeIsOpener: boolean; grouped: boolean; count: number };

export async function focusBackgroundTab(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
  const link = `file://${root}/fixtures/index.html`;

  // Clean center; open a blank browser tab as the opener and make it active.
  await cdp.evalInAtom(`(async () => {
    ${CLEAR_CENTER};
    await atom.workspace.open('tranquil-browser://blank');
    return true;
  })()`);
  await cdp.waitFor(`(() => {
    const it = atom.workspace.getCenter().getActivePaneItem();
    return it && it.getURL && it.getURL() === 'tranquil-browser://blank';
  })()`);

  const count = await cdp.evalInAtom<number>(
    `atom.workspace.getCenter().getActivePane().getItems().length`,
  );

  // Fire the cmd-click background-open path directly (unique id dodges the
  // handler's prevId de-dupe).
  await cdp.evalInAtom(`(() => {
    require('electron').ipcRenderer.emit(
      'open-link-in-new-tab', {}, { link: '${link}', id: 'smoke-' + Math.random() },
    );
    return true;
  })()`);

  // A new tab was added right after the opener, and the opener is STILL active
  // (true background open — no active/focus steal).
  const after = await cdp.waitFor<After>(`(() => {
    const pane = atom.workspace.getCenter().getActivePane();
    const items = pane.getItems();
    if (items.length !== ${count} + 1) return false;
    const active = pane.getActiveItem();
    const activeIsOpener = !!(active && active.getURL &&
      active.getURL() === 'tranquil-browser://blank');
    const newTab = items[pane.getActiveItemIndex() + 1];
    return {
      activeIsOpener,
      grouped: !!newTab && newTab !== active,
      count: items.length,
    };
  })()`);
  assert(
    after.activeIsOpener,
    "background open must leave the opener active (no steal)",
  );
  assert(after.grouped, "new tab should be inserted right after its opener");

  // Key routing survives: ctrl+tab still cycles the center after the background open.
  const idx = await cdp.evalInAtom<number>(
    `atom.workspace.getCenter().getActivePane().getActiveItemIndex()`,
  );
  await cdp.evalInAtom(
    `atom.commands.dispatch(atom.views.getView(atom.workspace), 'tranquil:show-next-item-in-center')`,
  );
  const cycled = await cdp.waitFor<boolean>(
    `atom.workspace.getCenter().getActivePane().getActiveItemIndex() !== ${idx}`,
  );
  assertEquals(
    cycled,
    true,
    "ctrl+tab should still cycle after a background-tab open",
  );

  await cdp.evalInAtom(CLEAR_CENTER);
}
