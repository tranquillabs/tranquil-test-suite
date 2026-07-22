// Deterministic GUI smoke tests for Tranquil.
//
// Launches a fully isolated Tranquil instance (throwaway ATOM_HOME +
// user-data-dir, opens only this repo as the project via TRANQUIL_VERIFY),
// drives it over CDP, and tears it down. Run:  deno task test
//
// Requires the sibling tranquil-client checkout (../tranquil-client) with
// node_modules installed. No node is invoked — Electron is spawned directly.

import { connectAtom } from "./lib/cdp.ts";
import { launch } from "./lib/launch.ts";
import { adr0012 } from "./suites/adr-0012-vertical-tabs.ts";
import { adr0013 } from "./suites/adr-0013-ui-variables.ts";
import { settingsTab } from "./suites/settings-default-tab.ts";

Deno.test("Tranquil UI smoke", async (t) => {
  const app = await launch();
  try {
    const cdp = await connectAtom();
    try {
      await t.step("ADR-0012 vertical tab panel", () => adr0012(cdp));
      await t.step("ADR-0013 ui-variables", () => adr0013(cdp));
      await t.step("Settings default tab", () => settingsTab(cdp));
    } finally {
      cdp.close();
    }
  } finally {
    await app.teardown();
  }
});
