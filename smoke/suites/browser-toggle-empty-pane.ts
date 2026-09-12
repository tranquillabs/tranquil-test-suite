// Reported bug: with a browser tab already open, Cmd+N (new file) then Cmd+W
// (close it) then Cmd+T (tranquil-browser:open), typed fast, sometimes left a
// bogus extra tab behind instead of just the browser.
//
// Root cause (tranquil-browser/lib/tranquil-browser.js, the main URL opener):
// a same-URL-within-50ms debounce guard —
//   if (window.prevUrl === url && window.prevId && (Date.now()-window.prevId) < 50) return;
// — meant to swallow a duplicate DOUBLED EVENT for the same URL. Declining
// with a bare `return` (undefined) instead of `return false` (the idiom this
// same file already uses a few lines down for checkUrl() rejections) made
// atom.workspace.open() treat the URL as unclaimed and fall through to
// Pulsar's default "unrecognized URI -> open as a file path" behavior,
// creating a plain TextEditor named after the URL's last path segment
// ("blank"). Fixed by matching the existing `return false` idiom. Confirmed
// by reading window.prevUrl / window.prevId around the calls directly, not
// just guessing from the outcome shape.

import { assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

const readState = `(() => {
  const pane = atom.workspace.getCenter().getActivePane();
  const items = pane.getItems();
  return {
    itemCount: items.length,
    items: items.map(i => ({
      constructor: i.constructor && i.constructor.name,
      title: typeof i.getTitle === 'function' ? i.getTitle() : String(i),
    })),
  };
})()`;

const dispatch = (cmd: string) =>
  `(() => { atom.commands.dispatch(atom.views.getView(atom.workspace), '${cmd}'); return true; })()`;

const clearCenter = `(() => {
  for (const it of atom.workspace.getCenter().getPaneItems().slice()) {
    const p = atom.workspace.paneForItem(it);
    if (p) p.destroyItem(it, true);
  }
  return true;
})()`;

export async function browserToggleEmptyPane(cdp: Cdp): Promise<void> {
  await cdp.evalInAtom(clearCenter);
  await cdp.evalInAtom(dispatch("tranquil-browser:open"));
  await cdp.waitFor(
    `atom.workspace.getCenter().getActivePane().getItems().length === 1`,
  );

  // Fire Cmd+N, Cmd+W, Cmd+T back to back with no artificial delay, matching
  // fast real typing rather than letting each step's async work fully settle.
  const timeline = await cdp.evalInAtom<
    { prevUrlAtOpen: string | null; msSincePrevIdAtOpen: number | null }
  >(`(async () => {
    atom.commands.dispatch(atom.views.getView(atom.workspace), 'application:new-file');
    atom.commands.dispatch(atom.views.getView(atom.workspace), 'core:close');
    const before = { prevUrl: window.prevUrl, prevId: window.prevId };
    atom.commands.dispatch(atom.views.getView(atom.workspace), 'tranquil-browser:open');
    return {
      prevUrlAtOpen: before.prevUrl,
      msSincePrevIdAtOpen: before.prevId ? Date.now() - before.prevId : null,
    };
  })()`);
  console.log(
    "State just before the final Cmd+T fired:",
    JSON.stringify(timeline, null, 2),
  );

  await new Promise((r) => setTimeout(r, 500));
  const after = await cdp.evalInAtom<{ itemCount: number; items: unknown[] }>(
    readState,
  );
  console.log("Fast Cmd+N/Cmd+W/Cmd+T result:", JSON.stringify(after, null, 2));

  // The bug specifically: the debounce guard declining with bare `return` (not
  // `return false`) makes atom.workspace.open() fall through to Pulsar's
  // default "unclaimed URI -> open as a file path" behavior, naming the bogus
  // TextEditor after the URL's last path segment. Assert on that precisely —
  // an item count alone can also shift for reasons unrelated to this bug (e.g.
  // this test's own back-to-back dispatch racing core:close's async destroy).
  const bogus = (after.items as { constructor: string; title: string }[]).find(
    (i) => i.constructor === "TextEditor" && i.title === "blank",
  );
  assertEquals(
    bogus,
    undefined,
    `a bogus "blank" TextEditor appeared from the declined opener falling through ` +
      `to Pulsar's default file-open behavior: ${
        JSON.stringify(after.items)
      } ` +
      `(debounce state just before the final open: ${
        JSON.stringify(timeline)
      })`,
  );

  await cdp.evalInAtom(clearCenter);
}
