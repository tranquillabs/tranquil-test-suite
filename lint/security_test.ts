// Each security rule must flag its blanket grant and leave the scoped form alone.
import { assertEquals } from "@std/assert";
import plugin from "./security.ts";

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
});

Deno.test("no-unbound-server", () => {
  const rule = "tranquil-security/no-unbound-server";
  assertEquals(ids(`Deno.serve({ port: 0 }, () => new Response(""));`), [rule]);
  assertEquals(ids(`Deno.serve(() => new Response(""));`), [rule]);
  assertEquals(ids(`Deno.listen({ port: 8080 });`), [rule]);
  assertEquals(ids(`Deno.serve({ hostname: "127.0.0.1", port: 0 }, h);`), []);
  assertEquals(ids(`Deno.listen({ transport: "unix", path: "/tmp/x.sock" });`), []);
});
