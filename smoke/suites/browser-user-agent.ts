// Configurable browser User-Agent (ADR-0019).
//
// Verifies, end to end, that browser tabs present a clean, configurable UA:
//   1. The `tranquil.browserUserAgent` default is a clean stock-Chrome string —
//      no Electron/Tranquil runtime tokens.
//   2. A real browser guest both REPORTS that UA (navigator.userAgent) and SENDS
//      it on the wire — read back from a local echo server, which proves the
//      `<webview useragent>` attribute AND the main-process onBeforeSendHeaders
//      rewrite (the actual request header a server sees).
//   3. Changing the setting propagates to a new tab's guest and onto the wire.
//   4. The editable combobox renders in the Tranquil settings tab with the four
//      presets, bound to the setting.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

// A UA still carrying the Electron runtime or the Tranquil app token.
const hasRuntimeTokens = (ua: string) => / (?:Electron|Tranquil)\//.test(ua);

export async function browserUserAgent(cdp: Cdp): Promise<void> {
  // Local echo server: every response body is the request's User-Agent header, so
  // a browser tab pointed at it reveals exactly what the guest put on the wire.
  const server = Deno.serve(
    { port: 0, onListen() {} },
    (req) =>
      new Response(req.headers.get("user-agent") ?? "", {
        headers: { "content-type": "text/plain" },
      }),
  );
  const port = (server.addr as Deno.NetAddr).port;

  const open = (url: string) =>
    cdp.evalInAtom(
      `atom.workspace.open(${JSON.stringify(url)}).then(() => true)`,
    );

  const closeTab = (url: string) =>
    cdp.evalInAtom(`(() => {
      const target = ${JSON.stringify(url)}.replace(/\\/$/, '');
      const item = atom.workspace.getPaneItems().find(
        (i) => i.getURL && i.getURL().replace(/\\/$/, '') === target);
      if (item) { const p = atom.workspace.paneForItem(item); if (p) p.destroyItem(item); }
      return true;
    })()`);

  // Open `url` as a browser tab and resolve once its guest reports the `expected`
  // UA on the wire. Returns the guest's navigator.userAgent + the echoed header.
  // If the header briefly predates the config→main sync, reload and re-read.
  const probe = (url: string, expected: string) =>
    cdp.waitFor<{ nav: string; wire: string }>(
      `(async () => {
        const target = ${JSON.stringify(url)}.replace(/\\/$/, '');
        const item = atom.workspace.getPaneItems().find(
          (i) => i.getURL && i.getURL().replace(/\\/$/, '') === target);
        const wv = item && item.view && item.view.htmlv && item.view.htmlv[0];
        if (!wv || typeof wv.executeJavaScript !== 'function') return null;
        let nav, wire;
        try {
          nav = await wv.executeJavaScript('navigator.userAgent');
          wire = await wv.executeJavaScript('document.body ? document.body.textContent.trim() : ""');
        } catch (e) { return null; }
        if (!nav || !wire) return null;
        if (wire !== ${JSON.stringify(expected)}) {
          try { wv.reload(); } catch (e) {}
          return null;
        }
        return { nav, wire };
      })()`,
      { timeout: 20000, interval: 400 },
    );

  try {
    // 1. The default UA is a clean stock-Chrome string.
    const def = await cdp.evalInAtom<string>(
      `atom.config.get('tranquil.browserUserAgent')`,
    );
    assertStringIncludes(
      def,
      "Chrome/",
      "default UA should be a Chrome string",
    );
    assertStringIncludes(
      def,
      "Safari/",
      "default UA should be a real browser UA",
    );
    assert(
      !hasRuntimeTokens(def),
      `default UA still carries Electron/Tranquil tokens: ${def}`,
    );

    // 2. A real guest reports AND sends that clean UA.
    const url1 = `http://localhost:${port}/default`;
    await open(url1);
    const p1 = await probe(url1, def);
    assert(
      !hasRuntimeTokens(p1.nav),
      `guest navigator.userAgent carries tokens: ${p1.nav}`,
    );
    assert(
      !hasRuntimeTokens(p1.wire),
      `wire User-Agent header carries tokens: ${p1.wire}`,
    );
    assertEquals(
      p1.nav,
      def,
      "guest navigator.userAgent should equal the default",
    );
    // p1.wire === def is guaranteed by probe(); asserted for the record.
    assertEquals(p1.wire, def, "wire User-Agent should equal the default");
    await closeTab(url1);

    // 3. A custom UA propagates to a new tab's guest AND onto the wire.
    const CUSTOM = "Mozilla/5.0 (SmokeTest) CustomUA/1.0";
    await cdp.evalInAtom(
      `atom.config.set('tranquil.browserUserAgent', ${JSON.stringify(CUSTOM)})`,
    );
    const url2 = `http://localhost:${port}/custom`;
    await open(url2);
    const p2 = await probe(url2, CUSTOM);
    assertEquals(
      p2.nav,
      CUSTOM,
      "custom UA should be the guest's navigator.userAgent",
    );
    assertEquals(p2.wire, CUSTOM, "custom UA should be sent on the wire");
    await closeTab(url2);

    // Restore the default before checking the UI.
    await cdp.evalInAtom(
      `atom.config.set('tranquil.browserUserAgent', ${JSON.stringify(def)})`,
    );

    // 4. The editable combobox renders in the Tranquil settings tab with the four
    //    presets, its input bound to the current setting.
    await cdp.evalInAtom(
      `atom.commands.dispatch(atom.views.getView(atom.workspace), 'settings-view:open')`,
    );
    await cdp.waitFor(
      `!!document.querySelector('.settings-view .tranquil-settings .tq-ua-combobox')`,
    );
    const combo = await cdp.evalInAtom<{ presets: string[]; value: string }>(
      `(() => {
        const box = document.querySelector('.settings-view .tranquil-settings .tq-ua-combobox');
        if (!box) return null;
        const presets = [...box.querySelectorAll('li[role="option"]')]
          .map((li) => (li.textContent || '').trim());
        const input = box.querySelector('input');
        return { presets, value: input ? input.value : '' };
      })()`,
    );
    assertEquals(
      combo.presets,
      ["Chrome", "Firefox", "Edge", "Safari"],
      "combobox should list the four presets",
    );
    assertStringIncludes(
      combo.value,
      "Chrome/",
      "combobox input should show the current (Chrome) UA",
    );
  } finally {
    await server.shutdown();
  }
}
