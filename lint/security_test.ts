// Each security rule must flag its blanket grant and leave the scoped form alone.
import { assertEquals } from "@std/assert";
import plugin, { weakenedIn } from "./security.ts";

function ids(source: string): string[] {
  return Deno.lint.runPlugin(plugin, "probe.js", source).map((d) => d.id);
}

Deno.test("no-blanket-permission", () => {
  const rule = "tranquil-security/no-blanket-permission";
  assertEquals(ids(`wv.addEventListener("permissionrequest", (e) => e.request.allow());`), [rule]);
  assertEquals(ids(`ses.setPermissionRequestHandler((wc, p, callback) => { callback(true); });`), [rule]);
  assertEquals(ids(`ses.setPermissionCheckHandler(() => true);`), [rule]);
  assertEquals(ids(`ses.setPermissionRequestHandler((wc, p, cb) => cb(ALLOWED.has(p)));`), []);
  assertEquals(ids(`ses.setPermissionCheckHandler((wc, p) => { if (p === "clipboard-sanitized-write") return true; return false; });`), []);
});

Deno.test("no-generic-ipc-bridge", () => {
  const rule = "tranquil-security/no-generic-ipc-bridge";
  assertEquals(ids(`contextBridge.exposeInMainWorld("x", { send: (channel, d) => ipcRenderer.send(channel, d) });`), [rule]);
  assertEquals(ids(`contextBridge.exposeInMainWorld("x", { on: (c, f) => { ipcRenderer.on(c, f); } });`), [rule]);
  assertEquals(ids(`contextBridge.exposeInMainWorld("x", { send: (c, d) => { if (OK.has(c)) ipcRenderer.send(c, d); } });`), []);
  assertEquals(ids(`contextBridge.exposeInMainWorld("x", { tabFocus: () => ipcRenderer.send("tab-focus") });`), []);
  assertEquals(ids(`function relay(channel) { ipcRenderer.send(channel); }`), []); // not exposed to a page
});

Deno.test("no-unscoped-deno-permission", () => {
  const rule = "tranquil-security/no-unscoped-deno-permission";
  assertEquals(ids(`spawn("deno", ["run", "--allow-read", "x.ts"]);`), [rule]);
  assertEquals(ids("args.push(`-A`);"), [rule]);
  assertEquals(ids(`spawn("deno", ["run", "--allow-read=/a,/b", "--allow-net=" + hosts, "x.ts"]);`), []);
});

Deno.test("no-string-page-code", () => {
  const rule = "tranquil-security/no-string-page-code";
  assertEquals(ids(`wv.executeJavaScript("location.href = '" + url + "'");`), [rule]);
  assertEquals(ids("wv.executeJavaScript(`setTheme(${mode})`);"), [rule]);
  assertEquals(ids(`wv.executeJavaScript(bundleSource);`), []);
  assertEquals(ids("webFrame.executeJavaScript(`URL.canParse ||= () => false;`);"), []);
});

Deno.test("no-insecure-webpreferences", () => {
  const rule = "tranquil-security/no-insecure-webpreferences";
  assertEquals(ids(`attrs = { nodeIntegration: "on", contextIsolation: "on" };`), [rule]);
  assertEquals(ids(`new BrowserWindow({ webPreferences: { webSecurity: false, sandbox: false } });`), [rule, rule]);
  assertEquals(ids(`wv.setAttribute("disablewebsecurity", "");`), [rule]);
  assertEquals(ids(`wv.setAttribute("webpreferences", "contextIsolation=no");`), [rule]);
  assertEquals(ids(`new BrowserWindow({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });`), []);
  // Every setting, not just four: subframes, workers, insecure content, experimental features.
  assertEquals(ids(`o = { nodeIntegrationInSubFrames: true, allowRunningInsecureContent: true, experimentalFeatures: true };`), [rule, rule, rule]);
  // The webpreferences string read as Electron reads it: a name on its own is true, 1 and 0 count.
  assertEquals(ids(`wv.setAttribute("webpreferences", "nodeIntegration");`), [rule]);
  assertEquals(ids(`wv.setAttribute("webpreferences", "sandbox=0");`), [rule]);
  assertEquals(ids(`wv.setAttribute("webpreferences", "nodeintegrationinsubframes=1, sandbox=yes");`), [rule]);
  assertEquals(ids(`wv.setAttribute("webpreferences", "contextIsolation=yes, sandbox=1, nodeIntegration=no");`), []);
  // In an attributes object, as the browser's tab view builds its <webview>.
  assertEquals(ids(`webviewAttrs = { webpreferences: "contextIsolation=yes, sandbox=no" };`), [rule]);
  assertEquals(ids(`webviewAttrs = { webpreferences: "contextIsolation=yes, sandbox=yes" };`), []);
  assertEquals(ids(`webviewAttrs = { nodeintegration: "on", disablewebsecurity: "" };`), [rule, rule]);
  assertEquals(ids(`webviewAttrs = { nodeintegration: false };`), []);
  // A setting Electron no longer has isn't one.
  assertEquals(ids(`o = { enableRemoteModule: true };`), []);
});

Deno.test("weakenedIn reads a webpreferences string as Electron does", () => {
  assertEquals(weakenedIn("nodeIntegration, sandbox=no, webSecurity=0, contextIsolation=yes"), [
    "nodeIntegration",
    "sandbox",
    "webSecurity",
  ]);
  assertEquals(weakenedIn("NODEINTEGRATION=yes"), ["nodeIntegration"], "names in any case");
  assertEquals(weakenedIn("nodeIntegration=maybe"), ["nodeIntegration"], "a doubtful value counts as on");
  assertEquals(weakenedIn("javascript=no, sandbox, unknownThing=yes"), []);
});

Deno.test("UNSCOPED_DENO's list covers every Deno permission", () => {
  for (const name of ["read", "write", "net", "env", "run", "ffi", "sys", "import", "scripts", "all"]) {
    assertEquals(ids(`spawn("deno", ["run", "--allow-${name}", "x.ts"]);`), ["tranquil-security/no-unscoped-deno-permission"], name);
  }
});

Deno.test("no-markdown-html", () => {
  const rule = "tranquil-security/no-markdown-html";
  assertEquals(ids(`atom.ui.markdown.render(text);`), [rule]);
  assertEquals(ids(`atom.ui.markdown.render(text, { sanitize: true });`), [rule]);
  assertEquals(ids(`atom.ui.markdown.render(text, { html: true });`), [rule]);
  assertEquals(ids(`atom.ui.markdown.render(text, opts);`), [rule]); // not visible to the lint
  assertEquals(ids(`atom.ui.markdown.render(text, { html: false, sanitize: true });`), []);
  assertEquals(ids(`template.render(text);`), []); // some other render
});

Deno.test("no-unbound-server", () => {
  const rule = "tranquil-security/no-unbound-server";
  assertEquals(ids(`Deno.serve({ port: 0 }, () => new Response(""));`), [rule]);
  assertEquals(ids(`Deno.serve(() => new Response(""));`), [rule]);
  assertEquals(ids(`Deno.listen({ port: 8080 });`), [rule]);
  assertEquals(ids(`Deno.serve({ hostname: "127.0.0.1", port: 0 }, h);`), []);
  assertEquals(ids(`Deno.listen({ transport: "unix", path: "/tmp/x.sock" });`), []);
});
