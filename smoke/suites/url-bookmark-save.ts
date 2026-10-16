// Saving a browser tab as a `.url` bookmark (tranquil-browser).
//
// The toolbar save button writes `<page title>.url` into the tree-view's
// selected folder — named after the tab's FULL display title (the same value the
// Tabs pane shows, read live off the <webview>), sanitized filesystem-safe, with
// NO numbered prefix. Regression cover for two past bugs: the name coming from the
// model's destructive 20-char getTitle() truncation, and an unwanted `001-` prefix.

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

// <title> of fixtures/index.html. 21 chars — one past the model getTitle()'s
// 20-char cap — so a correct save proves the full webview title was used, not the
// truncated model title ("Tranquil test fixtur...").
const FIXTURE_TITLE = "Tranquil test fixture";

export async function urlBookmarkSave(cdp: Cdp): Promise<void> {
  const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
  const fixtureUrl = `file://${root}/fixtures/index.html`;
  // A fresh temp folder, made by the app (which writes the bookmarks) and removed at the end, so the
  // suite needs no folder in the repo and leaves nothing behind.
  const scratchDir = await cdp.evalInAtom<string>(
    `require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'tranquil-bookmark-'))`,
  );
  const expected = `${scratchDir}/${FIXTURE_TITLE}.url`;
  const messyExpected = `${scratchDir}/A- B - C - D.url`;

  // Clear any prior artifacts so assertions are meaningful on rerun.
  await cdp.evalInAtom(`(() => {
    const fs = require('fs');
    for (const p of [${JSON.stringify(expected)}, ${
    JSON.stringify(messyExpected)
  }]) {
      try { fs.unlinkSync(p); } catch (e) { /* absent */ }
    }
    return true;
  })()`);

  // 1. Open the fixture as a browser tab; wait for the webview's live <title>.
  //    (.then(()=>true) so the eval returns a primitive, never the browser model
  //    — returnByValue can't serialize that live object.)
  await cdp.evalInAtom(
    `atom.workspace.open(${JSON.stringify(fixtureUrl)}).then(() => true)`,
  );
  await cdp.waitFor(`(() => {
    const item = atom.workspace.getCenter().getActivePaneItem();
    const wv = item && item.view && item.view.htmlv && item.view.htmlv[0];
    return !!wv && typeof wv.getTitle === 'function'
      && wv.getTitle().trim() === ${JSON.stringify(FIXTURE_TITLE)};
  })()`);

  // 2. Aim the tree-view save target at the temp folder, then click the REAL toolbar save button.
  await cdp.evalInAtom(`(() => {
    const tb = atom.packages.getActivePackage('tranquil-browser').mainModule;
    tb.__origTreeView = tb.treeView;
    tb.treeView = { selectedPaths: () => [${JSON.stringify(scratchDir)}] };
    const item = atom.workspace.getCenter().getActivePaneItem();
    item.view.save[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  })()`);

  // 3. A bookmark named after the FULL title (no truncation, no `001-` prefix)
  //    exists and points at the fixture URL.
  const saved = await cdp.waitFor<
    { content: string; siblings: string[] }
  >(`(() => {
    const fs = require('fs');
    if (!fs.existsSync(${JSON.stringify(expected)})) return false;
    return {
      content: fs.readFileSync(${JSON.stringify(expected)}, 'utf8'),
      siblings: fs.readdirSync(${
    JSON.stringify(scratchDir)
  }).filter(n => n.endsWith('.url')),
    };
  })()`);

  assert(
    saved.content.includes("index.html"),
    "bookmark content should point at the fixture URL",
  );
  assert(
    saved.siblings.includes(`${FIXTURE_TITLE}.url`),
    `file should be named "${FIXTURE_TITLE}.url" (full title), got ${
      JSON.stringify(saved.siblings)
    }`,
  );
  assert(
    !saved.siblings.some((n) => /^\d{3}-/.test(n)),
    `save button must not add a numbered prefix, got ${
      JSON.stringify(saved.siblings)
    }`,
  );

  // 3b. The cmd-s COMMAND path (tranquil-browser:save-url) writes the same
  //     bookmark — not only the toolbar button. Delete the artifact, make the
  //     fixture browser tab active, dispatch the command, expect it recreated.
  await cdp.evalInAtom(`(() => {
    try { require('fs').unlinkSync(${
    JSON.stringify(expected)
  }); } catch (e) { /* absent */ }
    const item = atom.workspace.getPaneItems().find(
      (i) => i.getURL && i.getURL() === ${JSON.stringify(fixtureUrl)},
    );
    if (item) { const p = atom.workspace.paneForItem(item); if (p) p.activateItem(item); }
    atom.commands.dispatch(atom.views.getView(atom.workspace), 'tranquil-browser:save-url');
    return true;
  })()`);
  const savedByCommand = await cdp.waitFor<boolean>(
    `require('fs').existsSync(${JSON.stringify(expected)})`,
  );
  assertEquals(
    savedByCommand,
    true,
    "the tranquil-browser:save-url command should write the .url bookmark",
  );

  // 4. Reserved characters in a title are sanitized to a filesystem-safe name.
  await cdp.evalInAtom(`(() => {
    const tb = atom.packages.getActivePackage('tranquil-browser').mainModule;
    tb.saveLinkToTree(${JSON.stringify(fixtureUrl)}, 'A: B / C | D?');
    return true;
  })()`);
  const messyOk = await cdp.waitFor<boolean>(
    `require('fs').existsSync(${JSON.stringify(messyExpected)})`,
  );
  assertEquals(
    messyOk,
    true,
    'a title like "A: B / C | D?" should sanitize to "A- B - C - D.url"',
  );

  // Cleanup: restore the tree-view, remove artifacts, close the browser tab.
  await cdp.evalInAtom(`(() => {
    const fs = require('fs');
    const tb = atom.packages.getActivePackage('tranquil-browser').mainModule;
    if (tb.__origTreeView !== undefined) { tb.treeView = tb.__origTreeView; delete tb.__origTreeView; }
    fs.rmSync(${JSON.stringify(scratchDir)}, { recursive: true, force: true });
    const item = atom.workspace.getPaneItems().find(
      (i) => i.getURL && i.getURL() === ${JSON.stringify(fixtureUrl)},
    );
    if (item) { const pane = atom.workspace.paneForItem(item); if (pane) pane.destroyItem(item); }
    return true;
  })()`);
}
