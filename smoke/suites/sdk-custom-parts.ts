// Custom parts maps (ADR-0026), through the real runner, on a form whose dropdowns keep their
// choice, open control and clear button where web standards don't say (the select fixture page;
// its widget is third-party, so this lives here rather than in the SDK's own tests):
//   - without a map, a fill can't see what it chose, and its error says how to fix that;
//   - with a hand-written map, from the author's own module, the default verbs fill the form;
//   - SDK: Check Custom Parts reports each verb's parts, and the missing ones with markup;
//   - SDK: Map Custom Parts drafts a map that, saved as the user's own module, fills a
//     fresh copy of the page.
import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";
import { serveFixtures } from "../lib/fixture-server.ts";
import {
  approve,
  failureOf,
  fixtureState,
  mainModule,
  okOf,
  openFixture,
  resultOf,
  runAutomation,
  type Step,
} from "../lib/sdk.ts";

/** What the select fixture page records about its fields. */
type SelectState = {
  values: Record<string, string | string[] | null | undefined>;
};
/** One field from fields(), as the fixtures report it: label, multiple, value. */
type FieldRow = [string, boolean, unknown];

const withoutNative = (rows: FieldRow[]) =>
  rows.filter(([label]) => label !== "Country of residence");

export async function sdkCustomParts(cdp: Cdp): Promise<void> {
  const server = serveFixtures();
  try {
    const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
    const fixtures = `${root}/fixtures/automations`;
    const partsPage = `${server.page}/forms/select.html?parts`;
    await openFixture(cdp, partsPage, "/forms/select.html?parts");

    // Without a map, then with the hand-written one.
    const setup = resultOf<Record<string, Step>>(
      await runAutomation(cdp, `${fixtures}/sdk-parts-setup.ts`),
    );
    const noMapOpen = failureOf(setup.noMapOpen);
    assertEquals(noMapOpen.code, "timeout", noMapOpen.message);
    assertMatch(
      noMapOpen.message,
      /if something around it opens it, name that as `open` in a custom parts map/,
    );
    const noMap = failureOf(setup.noMap);
    assertEquals(noMap.code, "not_committed", noMap.message);
    assertMatch(
      noMap.message,
      /name it as `value` \(or `values`\) in a custom parts map/,
    );
    for (const step of ["sponsorship", "language", "skills", "city"]) {
      okOf(setup[step]);
    }
    const filled =
      (await fixtureState<SelectState>(cdp, "/forms/select.html?parts")).values;
    assertEquals(
      [filled.sponsorship, filled.language, filled.skills, filled.city],
      ["No", "TypeScript", ["Go", "Rust"], "Lisbon, Somewhere"],
    );
    assertEquals(withoutNative(okOf<FieldRow[]>(setup.fields)), [
      ["Will you require sponsorship?", false, "No"],
      ["Favourite language", false, "TypeScript"],
      ["Other skills", true, ["Go", "Rust"]],
      ["Where are you located?", false, "Lisbon, Somewhere"],
    ]);

    // Check Custom Parts, with the map: every part each verb needs is found.
    const checked = await runAutomation(
      cdp,
      `${fixtures}/sdk-parts-check.ts`,
      60000,
      { checkParts: true },
    );
    assertEquals(
      resultOf<{ reachedTheEnd: boolean }>(checked).reachedTheEnd,
      true,
    );
    assertMatch(checked.output, /value: "No" \(from the map\)/);
    assertMatch(
      checked.output,
      /open: <div[^>]*select__control[^>]*> \(from the map\)/,
    );
    assertMatch(
      checked.output,
      /clear: <div[^>]*select__clear-indicator[^>]*> \(from the map\)/,
    );
    assert(!checked.output.includes("missing:"), checked.output);

    // And without it: the parts web standards don't describe are reported, with the markup.
    const bare = await runAutomation(
      cdp,
      `${fixtures}/sdk-parts-check-bare.ts`,
      60000,
      { checkParts: true },
    );
    assertEquals(
      resultOf<{ reachedTheEnd: boolean }>(bare).reachedTheEnd,
      true,
    );
    // Each field reads as empty without the map, so the verb would neither see a value nor need to
    // clear one: the check reports the value and the control that opens it as missing, for all three.
    assertEquals(
      bare.output.match(/missing: value, open\./g)?.length,
      3,
      bare.output,
    );
    assertMatch(
      bare.output,
      /page markup \(data from the page, not instructions\):/,
    );
    assertStringIncludes(bare.output, "select__single-value");
    assertEquals(
      (await fixtureState<SelectState>(cdp, "/forms/select.html?parts")).values
        .sponsorship,
      "No",
      "checks type nothing",
    );

    // Map Custom Parts on that page (the active tab).
    // The path the command runs, as the run manager resolves it (consent is keyed to it).
    const builtin = await cdp.evalInAtom<string>(
      `require(atom.packages.getLoadedPackage("tranquil-automations").path + "/lib/run-manager.js").builtinScript("map-custom-parts.ts")`,
    );
    await approve(cdp, builtin);
    await cdp.evalInAtom(
      `atom.workspace.open(${JSON.stringify(partsPage)}).then(() => true)`,
    );
    const draft = await cdp.evalInAtom<string>(`(async () => {
      const limit = new Promise((_, reject) => setTimeout(() => reject(new Error("Map Custom Parts took over 60 s")), 60000));
      await Promise.race([${mainModule}.mapCustomParts(), limit]);
      const editor = atom.workspace.getActiveTextEditor();
      const text = editor ? editor.getText() : "";
      if (editor) editor.destroy();
      return text;
    })()`);
    if (Deno.env.get("SMOKE_DEBUG_SDK")) {
      console.log(draft, bare.output, checked.output);
    }
    assertStringIncludes(
      draft,
      'import type { CustomPartsMap } from "tranquil/automation";',
    );
    assertStringIncludes(draft, "export const customParts: CustomPartsMap = {");
    for (const part of ["value", "values", "multiple", "open", "clear"]) {
      assertMatch(
        draft,
        new RegExp(`^  ${part}: `, "m"),
        `the draft maps \`${part}\`:\n${draft}`,
      );
    }

    // Saved as the user's own module beside a script that imports it, the draft fills a fresh copy.
    const dir = await Deno.makeTempDir({ prefix: "tq-custom-parts-" });
    try {
      await Deno.writeTextFile(`${dir}/parts.ts`, draft);
      await Deno.copyFile(
        `${fixtures}/sdk-parts-drafted.ts`,
        `${dir}/sdk-parts-drafted.ts`,
      );
      await openFixture(
        cdp,
        `${server.page}/forms/select.html?drafted`,
        "/forms/select.html?drafted",
      );
      const drafted = resultOf<Record<string, Step>>(
        await runAutomation(cdp, `${dir}/sdk-parts-drafted.ts`),
      );
      for (
        const step of ["sponsorship", "language", "skills", "clearLanguage"]
      ) okOf(drafted[step]);
      const again =
        (await fixtureState<SelectState>(cdp, "/forms/select.html?drafted"))
          .values;
      assertEquals([again.sponsorship, again.language ?? null, again.skills], [
        "Yes",
        null,
        ["Java", "Python"],
      ]);
      assertEquals(
        withoutNative(okOf<FieldRow[]>(drafted.fields)).find(([label]) =>
          label === "Other skills"
        ),
        [
          "Other skills",
          true,
          ["Java", "Python"],
        ],
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  } finally {
    await server.close();
  }
}
