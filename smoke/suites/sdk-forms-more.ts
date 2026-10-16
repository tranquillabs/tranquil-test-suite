// ADR-0026 checkpoint 3: the rest of the form verbs against a real form library,
// a third-party dropdown widget (sync, async, multi) and job-application-style widgets. Asserts each page's framework
// state, plus the error codes the lifecycle page is built to produce.
import { assert, assertEquals, assertMatch } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";
import { serveFixtures } from "../lib/fixture-server.ts";
import { failureOf, fixtureState, guestEval, okOf, openFixture, resultOf, runAutomation, type Step } from "../lib/sdk.ts";

/** What each fixture page records about its fields. */
type Values<V> = { values: Record<string, V> };

export async function sdkFormsMore(cdp: Cdp): Promise<void> {
  const server = serveFixtures();
  try {
    const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
    for (const page of ["select", "choice", "upload", "lifecycle"]) {
      await openFixture(cdp, `${server.page}/forms/${page}.html`, `/forms/${page}.html`);
    }
    await openFixture(
      cdp,
      `${server.page}/forms/embed.html?frame=${encodeURIComponent(`${server.frame}/forms/text.html`)}`,
      "/forms/embed.html",
    );

    const run = await runAutomation(cdp, `${root}/fixtures/automations/sdk-forms-more.ts`, 150000);
    const out = resultOf<Record<string, Step>>(run);
    if (Deno.env.get("SMOKE_DEBUG_SDK")) console.log(JSON.stringify(out, null, 1));

    // Selects and comboboxes.
    const sel = (await fixtureState<Values<string | string[] | undefined>>(cdp, "/forms/select.html")).values;
    assertEquals(failureOf(out.countryAmbiguous).code, "ambiguous");
    assertEquals(sel.country, "United States");
    assertEquals(sel.sponsorship, "No", "non-searchable dropdown widget");
    assertEquals(okOf<{ value: unknown }>(out.language).value, "TypeScript", "prefix match on a searchable dropdown widget");
    assertEquals(failureOf(out.languageMissing).code, "no_option");
    assert(failureOf(out.languageMissing).options?.includes("TypeScript"), "no_option lists what there is");
    assertEquals(sel.language ?? null, null, "clear() emptied it");
    assertEquals(okOf<{ value: unknown }>(out.skills).value, ["Go", "Rust"], "multi-select");
    assertEquals(sel.skills, ["Python"], "a second fill replaces the multi-select's set");

    // Idempotence: filling again with the same answer succeeds and leaves the value alone.
    for (const step of ["againSponsorship", "againSkills", "againCity", "againWorkStyle", "againAuthorized"]) {
      okOf(out[step]); // fails, with the step's error, if it did not succeed
    }
    assertEquals(sel.city, "Lisbon, Somewhere", "async autocomplete");

    // Checkboxes, radios and Yes/No buttons.
    const ch = (await fixtureState<Values<string | string[] | boolean>>(cdp, "/forms/choice.html")).values;
    assertEquals(ch.workStyle, "Hybrid");
    assertEquals([ch.experience, ch.notice], ["3-5", "One month"], "shared-name radios grouped by question");
    assertEquals(ch.channels, ["LinkedIn", "Website"], "opacity:0 checkboxes pressed through labels");
    assertEquals([ch.authorized, ch.relocate], ["Yes", "No"], "Yes/No button groups");
    assert(ch.consent, "the real checkbox, not its hidden twin");
    const kinds = Object.fromEntries(okOf<[string, string][]>(out.choiceFields));
    assertEquals(kinds["Are you authorized to work in the US?"], "buttons");

    // Uploads.
    const up = (await fixtureState<Values<string[]>>(cdp, "/forms/upload.html")).values;
    assertEquals(up.autofill, [], "the decoy input stays empty");
    assertMatch(up.resume[0], /^resume\.pdf:\d+$/);
    assertMatch(up.cover[0], /^cover\.txt:\d+$/, "found through the styled Upload button");
    assertEquals(failureOf(out.outsideGrant).code, "not_found", "a path outside read= is refused before any upload");

    // Cross-origin frame (state reported to the embedding page by postMessage).
    assertEquals(okOf(out.frameFound), true);
    assertEquals(okOf(out.noFrame), true);
    const frameState = await cdp.evalInAtom<{ values: Record<string, string>; touched: string[] }>(
      guestEval("/forms/embed.html", "JSON.parse(JSON.stringify(window.__frameState || null))"),
    );
    assertEquals(frameState?.values.first, "Grace");
    assertEquals(frameState?.values.email, "grace@example.com");
    assert(frameState?.touched.includes("email"));

    // Lifecycle error codes.
    assertEquals(failureOf(out.covered).code, "covered");
    assertMatch(failureOf(out.covered).message, /banner/);
    assertEquals(okOf(out.accept), true);
    const life = (await fixtureState<Values<string>>(cdp, "/forms/lifecycle.html")).values;
    assertEquals(life.later, "Clicked", "the click landed once the banner was gone");
    assertEquals(life.covered, "now visible");
    assertEquals(failureOf(out.stale).code, "stale_ref");
    assertEquals(run.state, "succeeded");
  } finally {
    await server.close();
  }
}
