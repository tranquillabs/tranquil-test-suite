// Focus/selection regression — activating a pathless center item (a browser
// tab) keeps the tree-view selection instead of wiping it; activating a real
// file entry still syncs the selection.
//
// Guards the tranquil-config `patchTreeViewKeepSelection` patch: upstream
// `selectActiveFile` deselects everything when the active item has no matching
// tree entry, so clicking a browser tab / vertical-tab row cleared the
// highlight. The patch keeps the selection unless the item maps to a tree entry.
//
// Selection is driven through the real sync path (tree-view.selectActiveFile,
// which fires on the center's active-item change) by opening files in the center
// — files are center-only, so this also keeps the center the active container so
// the browser tab opens there too.

import { assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

const SELECTED_PATH = `(() => {
  const tv = atom.packages.getActivePackage('tree-view')?.mainModule?.treeView;
  const sel = tv && tv.selectedPaths && tv.selectedPaths();
  return (sel && sel[0]) || null;
})()`;

const CLEAR_CENTER = `(() => {
  for (const it of atom.workspace.getCenter().getPaneItems().slice()) {
    const p = atom.workspace.paneForItem(it); if (p) p.destroyItem(it, true);
  }
  return true;
})()`;

export async function focusTreeviewKeepSelection(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
  const readme = `${root}/README.md`;
  const denoJson = `${root}/deno.json`;

  // Clean center; reveal the tree-view so its entries render.
  await cdp.evalInAtom(`(() => {
    ${CLEAR_CENTER};
    atom.workspace.getLeftDock().show();
    return true;
  })()`);

  // Open README.md in the center; selectActiveFile syncs the tree selection to it.
  await cdp.evalInAtom(`atom.workspace.open('${readme}').then(() => true)`);
  await cdp.waitFor(`(${SELECTED_PATH}) === '${readme}'`);

  // Activating a PATHLESS center item (a browser tab) must NOT wipe the selection.
  await cdp.evalInAtom(
    `atom.workspace.open('tranquil-browser://blank').then(() => true)`,
  );
  await cdp.waitFor(`(() => {
    const it = atom.workspace.getCenter().getActivePaneItem();
    return it && it.getURL && it.getURL() === 'tranquil-browser://blank';
  })()`);
  // selectActiveFile runs on the active-item change; it should KEEP README (the
  // browser has no tree entry), not deselect.
  const kept = await cdp.evalInAtom<string>(SELECTED_PATH);
  assertEquals(
    kept,
    readme,
    "activating a pathless browser tab must keep the tree-view selection",
  );

  // Contrast: activating a real file entry DOES sync the selection.
  await cdp.evalInAtom(`atom.workspace.open('${denoJson}').then(() => true)`);
  await cdp.waitFor(`(${SELECTED_PATH}) === '${denoJson}'`);

  await cdp.evalInAtom(CLEAR_CENTER);
}
