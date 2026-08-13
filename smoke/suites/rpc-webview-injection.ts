// tranquil-rpc webview injection — the guest runtime reaches TRUSTED file:// pages only.
//
// Registers fixtures/rpc as a trusted root, opens the fixture, and asserts the injected
// window.tranquilHost responds to ping() ("pong"). Then opens a file:// page OUTSIDE the
// root and asserts it gets no runtime at all (default-deny). Guards the Phase 1 gate:
// the audience-tagging change to the capability registry must not regress webview RPC.

import { assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

export async function rpcWebviewInjection(cdp: Cdp): Promise<void> {
  // Register the trusted root BEFORE the page loads (injection happens on dom-ready).
  const root = await cdp.evalInAtom<string>(`(() => {
    const pkg = atom.packages.getActivePackage("tranquil-rpc") ||
      atom.packages.getLoadedPackage("tranquil-rpc");
    const rpc = pkg && pkg.mainModule;
    if (!rpc || typeof rpc.addTrustedRoot !== "function") return null;
    return rpc.addTrustedRoot(atom.project.getPaths()[0] + "/fixtures/rpc");
  })()`);
  if (!root) throw new Error("tranquil-rpc module not reachable for addTrustedRoot");

  const guestEval = (marker: string, expression: string) =>
    `(() => {
      const item = atom.workspace.getPaneItems().find((i) =>
        typeof i.getURL === "function" && String(i.getURL()).includes(${JSON.stringify(marker)})
      );
      const wv = item && item.view && item.view.htmlv && item.view.htmlv[0];
      if (!wv) return null;
      try {
        if (wv.isLoading()) return null;
        return wv.executeJavaScript(${JSON.stringify(expression)}).catch(() => null);
      } catch { return null; }
    })()`;

  // Trusted page: runtime injected, ping round-trips. (.then(true): open() resolves to the
  // pane item, which CDP's returnByValue cannot serialize — "reference chain is too long".)
  await cdp.evalInAtom(
    `atom.workspace.open("file://" + atom.project.getPaths()[0] + "/fixtures/rpc/index.html").then(() => true)`,
  );
  await cdp.waitFor(guestEval("/fixtures/rpc/", "!!window.tranquilHost"), {
    timeout: 15000,
  });
  // Promise.resolve + String: ping() returns capnweb's thenable RpcPromise, which
  // executeJavaScript cannot await/serialize on its own — wrap it into a native promise
  // resolving to a plain string.
  const pong = await cdp.waitFor<string>(
    guestEval(
      "/fixtures/rpc/",
      "window.tranquilHost ? Promise.resolve(window.tranquilHost.ping()).then((v) => String(v)) : null",
    ),
    { timeout: 10000 },
  );
  assertEquals(pong, "pong", "trusted guest ping() should round-trip");

  // Untrusted page (file:// OUTSIDE the trusted root): zero RPC surface.
  await cdp.evalInAtom(
    `atom.workspace.open("file://" + atom.project.getPaths()[0] + "/fixtures/index.html").then(() => true)`,
  );
  // Wait until the page is loaded and answering evals, then confirm no runtime.
  await cdp.waitFor(
    guestEval("/fixtures/index.html", "document.readyState === 'complete' ? 'ready' : null"),
    { timeout: 15000 },
  );
  const untrusted = await cdp.evalInAtom<boolean | null>(
    guestEval("/fixtures/index.html", "!!window.tranquilHost"),
  );
  assertEquals(
    untrusted,
    false,
    "untrusted file:// page must get no tranquilHost runtime",
  );
}
