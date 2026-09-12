// tree-view's tab-bar buttons (New File/New Folder/Refresh/Collapse All, injected by
// tranquil-automations' pane-controls.js + tree-view-controls.js) must hide when the
// project has no folders open — none of the four commands mean anything against an
// empty project, which is also when tree-view itself swaps to its own "Your project is
// currently empty" placeholder (add-projects-view.js).
//
// Guards pane-controls.js's `visible` gate (a function, re-evaluated per render like
// icon/title/className already were) and its atom.project.onDidChangePaths re-render
// trigger — none of the OTHER existing re-render triggers (active-item/add-item/
// remove-item change) fire when a project folder is added or removed, so without that
// trigger the cluster would only catch up whenever some unrelated pane event happened to
// fire next.

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

type ClusterState = { exists: boolean; hidden: boolean; buttonCount: number };

const READ_CLUSTER = `(() => {
  const treeView = atom.packages.getActivePackage('tree-view')?.mainModule?.treeView;
  const pane = treeView && atom.workspace.paneForItem(treeView);
  const cluster = pane?.getElement()?.querySelector('.tab-bar .tranquil-pane-controls');
  return {
    exists: !!cluster,
    hidden: !cluster || getComputedStyle(cluster).display === 'none',
    buttonCount: cluster ? cluster.querySelectorAll('.tranquil-pane-controls-item').length : 0,
  };
})()`;

export async function treeViewEmptyProjectControls(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);

  const withProject = await cdp.evalInAtom<ClusterState>(READ_CLUSTER);
  assert(withProject.exists, "tree-view's control cluster should be injected");
  assert(!withProject.hidden, "cluster should be visible with a project open");
  assertEquals(withProject.buttonCount, 4);

  try {
    await cdp.evalInAtom(
      `(() => { atom.project.removePath('${root}'); return true; })()`,
    );
    const empty = await cdp.waitFor<ClusterState>(
      `(() => { const s = ${READ_CLUSTER}; return s.hidden ? s : null; })()`,
    );
    assertEquals(
      empty.buttonCount,
      0,
      "no buttons should render for an empty project",
    );
  } finally {
    // Restore the project regardless of assertion outcome — later suites assume it.
    await cdp.evalInAtom(
      `(() => { atom.project.addPath('${root}'); return true; })()`,
    );
  }

  const restored = await cdp.waitFor<ClusterState>(
    `(() => { const s = ${READ_CLUSTER}; return !s.hidden ? s : null; })()`,
  );
  assertEquals(
    restored.buttonCount,
    4,
    "buttons should reappear once the project is restored",
  );
}
