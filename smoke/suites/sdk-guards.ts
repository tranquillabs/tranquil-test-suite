// ADR-0026 guard rails, through the real runner: submitting needs `submit` (a submit button,
// Enter in a field and a Submit-named button are all refused without it, and the fixture's
// framework state shows nothing was sent) and a yes to ui.confirm (refused with the grant until
// the person says yes), `sites=` keeps a script on its sites, reading needs
// no page-js, ui.confirm with nobody answering is false, every action is logged, the result is
// handed back, and a parts check types nothing.
import { assert, assertEquals, assertMatch } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";
import { serveFixtures } from "../lib/fixture-server.ts";
import { fixtureState, openFixture, resultOf, runAutomation } from "../lib/sdk.ts";

/** What fixtures/forms/guards.html records. */
type GuardsState = { name: string; submitted: number };
/** What fixtures/automations/sdk-guards.ts reports: "ok", a step's value, or the error message. */
type GuardsResult = {
  status: string;
  href: string;
  fill: string;
  pressEnter: string;
  clickContinue: string;
  clickSubmitNamed: string;
  gotoElsewhere: string;
  confirm: boolean;
};

export async function sdkGuards(cdp: Cdp): Promise<void> {
  const server = serveFixtures();
  try {
    const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
    const page = `${server.page}/forms/guards.html`;
    await openFixture(cdp, page, "/forms/guards.html");

    // A parts check first, while the form is clean: the fill checks its target, nothing is typed.
    const check = await runAutomation(cdp, `${root}/fixtures/automations/sdk-guards-check.ts`, 60000, { checkParts: true });
    assertEquals(resultOf<{ reachedTheEnd: boolean }>(check).reachedTheEnd, true);
    assertMatch(check.output, /\[check\] would fill \{ label: "Name" \}/);
    assertEquals((await fixtureState<GuardsState>(cdp, "/forms/guards.html")).name, "", "a parts check types nothing");
    assertEquals(check.actions?.[0]?.outcome, "checked");

    const run = await runAutomation(cdp, `${root}/fixtures/automations/sdk-guards.ts`);
    const out = resultOf<GuardsResult>(run);
    assertEquals(out.status, "Ready to apply", "text() reads without page-js");
    assertEquals(out.href, "/forms/receipt.pdf");
    assertEquals(out.fill, "ok");
    assertMatch(out.pressEnter, /^not_permitted: press\("Enter"\) would have submitted the form/);
    assertMatch(out.clickContinue, /^not_permitted: click .*would have submitted the form/);
    assertMatch(out.clickSubmitNamed, /^not_permitted: .*looks like it sends the form/);
    assertMatch(out.gotoElsewhere, /^not_permitted: .*may act only on localhost/);
    assertEquals(out.confirm, false, "nobody answered, so no");
    assertEquals((await fixtureState<GuardsState>(cdp, "/forms/guards.html")).submitted, 0, "nothing was sent");
    assertEquals(run.result, out, "context.result reaches the run record");
    const verbs = (run.actions ?? []).map((a) => `${a.verb}:${a.outcome}`);
    assert(verbs.includes("fill:ok") && verbs.includes("click:not_permitted") && verbs.includes("goto:not_permitted"), verbs.join(" "));
    assert((run.actions ?? []).every((a) => !JSON.stringify(a).includes("Ada")), "the log holds no values");

    // With `submit`, the same click is refused until the person says yes; the test answers Allow.
    const asking = runAutomation(cdp, `${root}/fixtures/automations/sdk-guards-submit.ts`);
    const question = `atom.notifications.getNotifications().find((n) => n.getMessage() === "sdk-guards-submit.ts asks:" && !n.isDismissed())`;
    await cdp.waitFor(`!!(${question})`, { timeout: 30000 });
    await cdp.evalInAtom(`((n) => (n.getOptions().buttons.find((b) => b.text === "Allow").onDidClick(), true))(${question})`);
    const allowed = resultOf<{ beforeYes: string; yes: boolean; clicked: string }>(await asking);
    assertMatch(allowed.beforeYes, /^not_permitted: click .*would have submitted the form.*hasn't said yes/);
    assertEquals(allowed.yes, true);
    assertEquals(allowed.clicked, "ok");
    assertEquals((await fixtureState<GuardsState>(cdp, "/forms/guards.html")).submitted, 1, "with submit and a yes, the same click sends the form");
  } finally {
    await server.close();
  }
}
