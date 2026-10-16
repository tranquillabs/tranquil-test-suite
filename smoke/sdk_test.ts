// The automation SDK suites alone, in one isolated app launch: `deno task test:sdk`.
// smoke/main_test.ts runs the same suites as part of the full smoke run.
import { connectAtom } from "./lib/cdp.ts";
import { launch } from "./lib/launch.ts";
import { sdkFormsText } from "./suites/sdk-forms-text.ts";
import { sdkFormsMore } from "./suites/sdk-forms-more.ts";
import { sdkPermissions } from "./suites/sdk-permissions.ts";
import { sdkGuards } from "./suites/sdk-guards.ts";
import { sdkCustomParts } from "./suites/sdk-custom-parts.ts";

Deno.test("Automation SDK", async (t) => {
  const app = await launch();
  try {
    const cdp = await connectAtom();
    try {
      await t.step("Forms: fields() and text fill() on a form-library page", () => sdkFormsText(cdp));
      await t.step("Forms: selects, choices, uploads, frames, lifecycle", () => sdkFormsMore(cdp));
      await t.step("Permissions: tabs / forms / page-js are enforced", () => sdkPermissions(cdp));
      await t.step("Guard rails: submit, sites, reading, confirm, action log, parts check", () => sdkGuards(cdp));
      await t.step("Custom parts: maps, Check Custom Parts, Map Custom Parts", () => sdkCustomParts(cdp));
    } finally {
      cdp.close();
    }
  } finally {
    await app.teardown();
  }
});
