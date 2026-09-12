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
import { browserUserAgent } from "./suites/browser-user-agent.ts";
import { urlBookmarkSave } from "./suites/url-bookmark-save.ts";
import { focusCtrlTabCenter } from "./suites/focus-ctrl-tab-center.ts";
import { focusTreeviewKeepSelection } from "./suites/focus-treeview-keep-selection.ts";
import { focusBackgroundTab } from "./suites/focus-background-tab.ts";
import { rpcWebviewInjection } from "./suites/rpc-webview-injection.ts";
import { debuggerBreakpoints } from "./suites/debugger-breakpoints.ts";
import { mainThreadPerf } from "./suites/main-thread-perf.ts";
import { markdownPreviewToggle } from "./suites/markdown-preview-toggle.ts";
import { treeViewEmptyProjectControls } from "./suites/tree-view-empty-project-controls.ts";
import { browserToggleEmptyPane } from "./suites/browser-toggle-empty-pane.ts";

Deno.test("Tranquil UI smoke", async (t) => {
  const app = await launch();
  try {
    const cdp = await connectAtom();
    try {
      await t.step("ADR-0012 vertical tab panel", () => adr0012(cdp));
      await t.step("ADR-0013 ui-variables", () => adr0013(cdp));
      await t.step("Settings default tab", () => settingsTab(cdp));
      await t.step(
        "Configurable browser User-Agent (ADR-0019)",
        () => browserUserAgent(cdp),
      );
      await t.step(
        "Save browser tab as .url bookmark",
        () => urlBookmarkSave(cdp),
      );
      await t.step(
        "Ctrl+Tab cycles the center from a focused dock",
        () => focusCtrlTabCenter(cdp),
      );
      await t.step(
        "Tree-view keeps selection on pathless tabs",
        () => focusTreeviewKeepSelection(cdp),
      );
      await t.step(
        "Background tab open doesn't steal focus",
        () => focusBackgroundTab(cdp),
      );
      await t.step(
        "tranquil-rpc injects trusted webviews only",
        () => rpcWebviewInjection(cdp),
      );
      await t.step(
        "Badges measure-then-place; Runs panel coalesces and streams intact",
        () => mainThreadPerf(cdp),
      );
      await t.step(
        "Markdown preview toggles in place, both directions",
        () => markdownPreviewToggle(cdp),
      );
      await t.step(
        "Tree-view tab-bar buttons hide with no project open",
        () => treeViewEmptyProjectControls(cdp),
      );
      await t.step(
        "BUG REPRO: browser toggle with a browser tab already open",
        () => browserToggleEmptyPane(cdp),
      );
      // Last on purpose: this one PAUSES the app at a breakpoint and waits up to 45s for it.
      // A paused Electron window is indistinguishable from a hung one, so anything that needs
      // to report should already have reported by the time this step starts.
      await t.step(
        "Breakpoints bind to the right TypeScript line (ADR-0025)",
        () => debuggerBreakpoints(cdp),
      );
    } finally {
      cdp.close();
    }
  } finally {
    await app.teardown();
  }
});
