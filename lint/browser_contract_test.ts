// tranquil-browser's lib/pages.js says what every browser page is held to. The copies that can't
// require it are held to it here: the security lint's page settings (a lint plugin can't reach
// another repo), and the SDK's web-page check (the SDK ships as loose files). Every Electron name
// the lint looks for must also be one Electron declares, in tranquil-client's electron.d.ts, so a
// typo, or a name a later Electron drops, fails here rather than leaving the lint blind.
import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { createRequire } from "node:module";
import { webURL } from "tranquil-automations/deno/guard.ts";
import type { BrowserPagesModule } from "tranquil-test-suite/lint/types/browser-pages.ts";
import {
  IPC_METHOD_NAMES,
  PAGE_PREFERENCES,
  PERMISSION_SETTER_NAMES,
  UNSAFE_WEBVIEW_ATTRS,
  weakenedIn,
} from "tranquil-test-suite/lint/security.ts";

const require = createRequire(import.meta.url);
const pages: BrowserPagesModule = require(fromFileUrl(import.meta.resolve("tranquil-browser/lib/pages.js")));
const electron = await Deno.readTextFile(
  fromFileUrl(import.meta.resolve("tranquil-client/node_modules/electron/electron.d.ts")),
);

/** The member names of one top-level declaration in electron.d.ts, such as `interface WebPreferences`. */
function members(header: string): Set<string> {
  const start = electron.indexOf(`\n  ${header} `);
  assert(start >= 0, `electron.d.ts declares ${header}`);
  const body = electron.slice(start, electron.indexOf("\n  }\n", start));
  return new Set([...body.matchAll(/^ {4}(\w+)\??[(:<]/gm)].map((m) => m[1]));
}

Deno.test("the lint's page settings are tranquil-browser's", () => {
  assertEquals({ ...PAGE_PREFERENCES }, { ...pages.PAGE_PREFERENCES });
});

Deno.test("the tab view's webpreferences attribute weakens nothing", () => {
  assertEquals(weakenedIn(pages.webpreferencesAttribute()), []);
});

Deno.test("every Electron name the lint looks for is one Electron declares", () => {
  const checks: [string, readonly string[]][] = [
    ["interface WebPreferences", Object.keys(PAGE_PREFERENCES)],
    ["class Session", PERMISSION_SETTER_NAMES],
    ["interface IpcRenderer", IPC_METHOD_NAMES],
    ["interface WebviewTag", UNSAFE_WEBVIEW_ATTRS],
  ];
  for (const [header, names] of checks) {
    const declared = members(header);
    for (const name of names) assert(declared.has(name), `${header} has no ${name}`);
  }
});

Deno.test("the SDK's web-page check agrees with tranquil-browser's", () => {
  const urls = [
    "https://example.com/",
    "HTTPS://EXAMPLE.COM/",
    "http://localhost:3000/new-customer.html",
    "https:example.com",
    "file:///etc/hosts",
    "data:text/html,hi",
    "about:blank",
    "tranquil-browser://blank",
    "javascript:alert(1)",
    "",
    "not a url",
  ];
  for (const url of urls) assertEquals(webURL(url) !== null, pages.isWebURL(url), url);
});
