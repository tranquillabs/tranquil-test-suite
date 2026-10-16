// Browser zoom rides on Pulsar's font-size commands (cmd-=, cmd--, cmd-0 and the View menu).
//
// A font-size command dispatched inside a browser tab zooms that page, whether it starts on the page
// itself (the <webview>, where the menu accelerator lands when the page has focus) or on the tab's
// own UI (the URL bar), and the editor font size stays put. The same command dispatched in a text
// editor changes the font size and zooms nothing. No OS-wide shortcut is involved, so this is the
// whole path.

import { assert, assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

export async function browserZoom(cdp: Cdp): Promise<void> {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} }, // this machine only
    () => new Response("<!doctype html><title>zoom</title><p>zoom probe</p>", { headers: { "content-type": "text/html" } }),
  );
  const url = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/`;
  const view = `(() => {
    const item = atom.workspace.getPaneItems().find((i) => i.getURL && i.getURL().replace(/\\/$/, '') === ${JSON.stringify(url)}.replace(/\\/$/, ''));
    return item && item.view;
  })()`;
  const zoom = () => cdp.evalInAtom<number>(`Math.round(${view}.htmlv[0].getZoomFactor() * 100) / 100`);
  const fontSize = () => cdp.evalInAtom<number>(`atom.config.get('editor.fontSize')`);
  const dispatch = (target: string, command: string) =>
    cdp.evalInAtom(`(atom.commands.dispatch(${target}, ${JSON.stringify(command)}), true)`);
  const webview = `${view}.htmlv[0]`;
  const urlBar = `${view}.element.querySelector('#url')`;

  const fontBefore = await fontSize();
  try {
    await cdp.evalInAtom(`atom.workspace.open(${JSON.stringify(url)}).then(() => true)`);
    await cdp.waitFor(`(() => { try { return ${webview}.getZoomFactor() === 1; } catch { return false; } })()`);

    // From the page (menu accelerator path): zooms, font size unchanged.
    await dispatch(webview, "window:increase-font-size");
    assertEquals(await zoom(), 1.1, "increase on the page zooms it in");
    assertEquals(await fontSize(), fontBefore, "the editor font size is untouched");

    // From the tab's own UI (keymap path).
    assert(await cdp.evalInAtom<boolean>(`!!${urlBar}`), "found the URL bar");
    await dispatch(urlBar, "window:decrease-font-size");
    assertEquals(await zoom(), 1, "decrease from the URL bar zooms out");
    await dispatch(webview, "window:increase-font-size");
    await dispatch(webview, "window:increase-font-size");
    await dispatch(webview, "window:reset-font-size");
    assertEquals(await zoom(), 1, "reset returns to 100%");
    assertEquals(await fontSize(), fontBefore, "the editor font size is still untouched");

    // In a text editor: font size changes, the page does not zoom.
    await cdp.evalInAtom(`atom.workspace.open().then(() => true)`);
    await dispatch(`atom.views.getView(atom.workspace.getActiveTextEditor())`, "window:increase-font-size");
    assertEquals(await fontSize(), fontBefore + 1, "increase in an editor changes the font size");
    assertEquals(await zoom(), 1, "and zooms no page");
  } finally {
    await cdp.evalInAtom(`(() => {
      atom.config.set('editor.fontSize', ${fontBefore});
      const editor = atom.workspace.getActiveTextEditor();
      if (editor && !editor.getPath()) { editor.setText(''); atom.workspace.paneForItem(editor)?.destroyItem(editor, true); }
      const v = ${view};
      if (v) atom.workspace.paneForItem(v.model)?.destroyItem(v.model);
      return true;
    })()`);
    await server.shutdown();
  }
}
