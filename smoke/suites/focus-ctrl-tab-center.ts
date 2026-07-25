// Focus/keyboard regression — Ctrl+Tab cycles the CENTER's tabs and lands focus
// there, even when a dock (tree-view) holds focus.
//
// Guards the "ctrl+tab looks dead when the tree-view is focused" bug: core
// `pane:show-next-item` acts on the active pane *container*, so a focused dock
// made it cycle the dock's single item. `tranquil:show-next/previous-item-in-
// center` (tranquil-config) targets the center and moves DOM focus back into it,
// so subsequent center-scoped keys (cmd-t/cmd-w) act on the center.
//
// Automatable slice: command behavior + host-level focus outcome. The keymap
// binding (ctrl-tab -> command) and the guest-forwarded path are manual.

import { assert } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

const CLEAR_CENTER = `(() => {
  for (const it of atom.workspace.getCenter().getPaneItems().slice()) {
    const p = atom.workspace.paneForItem(it); if (p) p.destroyItem(it, true);
  }
  return true;
})()`;

// True when DOM focus is the center's active pane element or a descendant of it.
const CENTER_HAS_FOCUS = `(() => {
  const pane = atom.workspace.getCenter().getActivePane();
  const el = atom.views.getView(pane);
  return el === document.activeElement || el.contains(document.activeElement);
})()`;

// A stable identity for the center's active item (blank browser has no URI).
const ACTIVE_CENTER_ID = `(() => {
  const it = atom.workspace.getCenter().getActivePaneItem();
  if (!it) return null;
  return (it.getURI && it.getURI()) || (it.getTitle && it.getTitle()) || null;
})()`;

// Dispatch and return a primitive: some command handlers (e.g.
// tranquil-browser:open) return atom.workspace.open()'s promise, which resolves
// to the browser model — returnByValue can't serialize that live object.
const dispatch = (cmd: string) =>
  `(() => { atom.commands.dispatch(atom.views.getView(atom.workspace), '${cmd}'); return true; })()`;

export async function focusCtrlTabCenter(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);

  // Clean slate, then open a blank browser tab then a file — two items in one
  // center pane, so ctrl+tab from the file wraps onto the browser guest.
  await cdp.evalInAtom(`(async () => {
    ${CLEAR_CENTER};
    await atom.workspace.open('tranquil-browser://blank');
    await atom.workspace.open('${root}/fixtures/notes/welcome.md');
    return true;
  })()`);
  await cdp.waitFor(`atom.workspace.getCenter().getPaneItems().length >= 2`);

  // Move focus OUT of the center: reveal + focus the tree-view (left dock).
  await cdp.evalInAtom(`(() => {
    atom.workspace.getLeftDock().show();
    const tv = atom.packages.getActivePackage('tree-view')?.mainModule?.treeView;
    if (tv && tv.focus) tv.focus();
    return true;
  })()`);
  await cdp.waitFor(`!(${CENTER_HAS_FOCUS})`); // precondition: focus left the center

  const before = await cdp.evalInAtom<string>(ACTIVE_CENTER_ID);

  // Ctrl+Tab must cycle the CENTER (not the focused dock) and pull focus back in.
  await cdp.evalInAtom(dispatch("tranquil:show-next-item-in-center"));

  const focusBack = await cdp.waitFor<boolean>(CENTER_HAS_FOCUS);
  assert(focusBack, "ctrl+tab should move DOM focus into the center pane");

  const after = await cdp.evalInAtom<string>(ACTIVE_CENTER_ID);
  assert(
    after !== null && after !== before,
    `ctrl+tab should change the center's active item (before=${before}, after=${after})`,
  );

  // Focus is now in the center, so center-scoped commands act on the center:
  // cmd-t (tranquil-browser:open) adds a tab there…
  const count = await cdp.evalInAtom<number>(
    `atom.workspace.getCenter().getPaneItems().length`,
  );
  await cdp.evalInAtom(dispatch("tranquil-browser:open"));
  await cdp.waitFor(
    `atom.workspace.getCenter().getPaneItems().length === ${count + 1}`,
  );

  // …and core:close (cmd-w) closes the active center tab again.
  await cdp.evalInAtom(dispatch("core:close"));
  await cdp.waitFor(
    `atom.workspace.getCenter().getPaneItems().length === ${count}`,
  );

  await cdp.evalInAtom(CLEAR_CENTER);
}
