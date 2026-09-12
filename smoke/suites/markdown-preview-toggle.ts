// Markdown preview toggle-in-place — tranquil-config intercepts
// markdown-preview:toggle (onWillDispatch + stopImmediatePropagation, before ANY
// selector-based listener for the event) and swaps the pane item in place instead of
// stock markdown-preview's split-pane/new-tab behavior. tranquil-automations' tab-bar
// button (markdown-preview-control.js, a sibling of tree-view-controls.js on the same
// pane-controls.js framework) drives the same command from both source and preview.
//
// Guards two real regressions hit while building this:
//  - Pane::removeItem(editor, true) (moved:true) skips telling the workspace-wide
//    ItemRegistry the item left; re-adding it with plain addItem() (no moved:true)
//    then throws "can only contain one instance of item" — which aborts the swap back
//    AFTER the old tab is already spliced back in, leaving both tabs on screen.
//  - The tab-bar button's matcher originally excluded the preview view by URI, so it
//    only ever appeared on the source side and did nothing when clicked from preview.
//
// Both directions are driven through the REAL rendered button (not a raw command
// dispatch) so a broken matcher fails this test the same way a broken swap would.

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

const TOGGLE_BUTTON =
  `document.querySelector('.tab-bar .tranquil-pane-controls-item[title="Toggle Markdown Preview"]')`;

type PaneState = { itemCount: number; activeConstructor: string | null };

const READ_STATE = `(() => {
  const pane = atom.workspace.getActivePane();
  const active = pane.getActiveItem();
  return {
    itemCount: pane.getItems().length,
    activeConstructor: active && active.constructor ? active.constructor.name : null,
  };
})()`;

export async function markdownPreviewToggle(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);

  await cdp.evalInAtom(
    `atom.workspace.open('${root}/fixtures/notes/welcome.md').then(() => true)`,
  );
  await cdp.waitFor(`!!atom.workspace.getActiveTextEditor()`);

  const initial = await cdp.evalInAtom<PaneState>(READ_STATE);
  assertEquals(initial.activeConstructor, "TextEditor");
  const startCount = initial.itemCount;

  const clickToggle = async () => {
    const clicked = await cdp.evalInAtom<boolean>(`(() => {
      const btn = ${TOGGLE_BUTTON};
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    assert(
      clicked,
      "Toggle Markdown Preview button should be present and clickable",
    );
  };

  await clickToggle();
  const afterToPreview = await cdp.waitFor<PaneState>(
    `(() => { const s = ${READ_STATE}; return s.activeConstructor === 'MarkdownPreviewView' ? s : null; })()`,
  );
  assertEquals(
    afterToPreview.itemCount,
    startCount,
    "toggling to preview must swap the tab in place, not open a second one",
  );

  await clickToggle();
  const afterToSource = await cdp.waitFor<PaneState>(
    `(() => { const s = ${READ_STATE}; return s.activeConstructor === 'TextEditor' ? s : null; })()`,
  );
  assertEquals(
    afterToSource.itemCount,
    startCount,
    "toggling back to source must swap in place too, not leave the preview tab behind",
  );

  // Clean up so later suites see a pristine center.
  await cdp.evalInAtom(`(() => {
    const pane = atom.workspace.getActivePane();
    const item = pane.getActiveItem();
    if (item) pane.destroyItem(item, true);
    return true;
  })()`);
}
