// ADR-0026 checkpoint 2: `fields()` and text `fill()` against a real form library
// that validates on blur. Asserts the form library's own state (values, touched fields, errors) and the
// isTrusted flag of each event, never the SDK's own report.
import { assert, assertEquals, assertMatch } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";
import { serveFixtures } from "../lib/fixture-server.ts";
import { failureOf, fixtureState, guestEval, okOf, openFixture, resultOf, runAutomation, type Step } from "../lib/sdk.ts";

/** What fixtures/forms/text.html records about itself. */
type TextState = {
  values: Record<string, string>;
  touched: string[];
  errors: Record<string, string | undefined>;
  events: { type: string; trusted: boolean }[];
};
/** What fill() reports for a field. */
type Reported = { invalid: boolean; error?: string; value: unknown };

const MARKER = "/forms/text.html";

export async function sdkFormsText(cdp: Cdp): Promise<void> {
  const server = serveFixtures();
  try {
    const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);

    // Negative control first, on its own load: a naive synthetic write must not register.
    await openFixture(cdp, `${server.page}/forms/text.html?control`, MARKER);
    await cdp.evalInAtom(guestEval(MARKER, `window.__fixture.naiveWrite("#first", "Zed")`));
    await new Promise((r) => setTimeout(r, 200));
    const control = await fixtureState<TextState>(cdp, MARKER);
    assert(control.values.first !== "Zed", "fixture is lying: a naive write registered in the form library");
    await cdp.evalInAtom(`(() => { const it = atom.workspace.getPaneItems().find((i) => i.getURL && String(i.getURL()).includes("?control")); atom.workspace.paneForItem(it).destroyItem(it, true); return true; })()`);

    await openFixture(cdp, `${server.page}/forms/text.html`, MARKER);
    const run = await runAutomation(cdp, `${root}/fixtures/automations/sdk-forms-text.ts`);
    const out = resultOf<Record<string, Step>>(run);
    const state = await fixtureState<TextState>(cdp, MARKER);
    if (Deno.env.get("SMOKE_DEBUG_SDK")) console.log(JSON.stringify({ out, state, runState: run.state }, null, 1));

    // fields(): labels resolved, required marker stripped, question text used.
    assertEquals(okOf<{ label: string }[]>(out.fields).map((f) => f.label), [
      "First name", "Email", "Phone", "About you", "Account ID", "Where are you located?",
    ]);

    // Values landed in the form library's state.
    assertEquals(state.values.email, "ada@example.com");
    assertEquals(state.values.phone, "+1 202 555 0100");
    assertEquals(state.values.location, "Lisbon");
    assertEquals(state.values.account, "A-1001", "read-only field untouched");
    assertEquals(state.values.bio, "This is far longer t", "maxlength truncated the input");
    assertEquals(state.values.first, "", "the final fill('') cleared it");

    // Real blurs marked the fields touched, so onTouched validation ran.
    for (const name of ["first", "email", "phone", "bio", "location"]) {
      assert(state.touched.includes(name), `${name} should be touched; touched = ${state.touched}`);
    }
    assertEquals(state.errors.first, "Required", "clearing a required field shows its error");
    assertEquals(state.errors.email, undefined, "the valid email cleared the earlier error");

    // Every input and blur on the filled fields was trusted.
    const untrusted = state.events.filter((e) =>
      ["input", "focusout"].includes(e.type) && !e.trusted
    );
    assertEquals(untrusted, [], "all input/focusout events should be trusted");

    // The SDK's reports and errors.
    assertEquals(okOf<Reported>(out.emailBad).invalid, true);
    assertEquals(okOf<Reported>(out.emailBad).error, "Not an email");
    assertEquals(okOf<Reported>(out.emailGood).invalid, false);
    assertEquals(okOf<Reported>(out.phone).value, null, "sensitive value is not reported");
    assert(!run.output.includes("555 0100"), "sensitive value must not reach the run output");
    assertEquals(failureOf(out.readonly).code, "not_editable");
    assertEquals(failureOf(out.bioTooLong).code, "not_committed");
    assertMatch(failureOf(out.bioTooLong).message, /truncated to 20/);
    assertEquals(failureOf(out.missing).code, "not_found");
    assertEquals(failureOf(out.missing).candidates?.[0], '{ label: "Email" }');
    assertEquals(run.state, "succeeded");
  } finally {
    await server.close();
  }
}
