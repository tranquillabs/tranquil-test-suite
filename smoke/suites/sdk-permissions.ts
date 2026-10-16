// ADR-0026: the tabs / forms / page-js split, enforced by the SDK through the real runner.
import { assertEquals, assertMatch } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";
import { serveFixtures } from "../lib/fixture-server.ts";
import { openFixture, resultOf, runAutomation } from "../lib/sdk.ts";

export async function sdkPermissions(cdp: Cdp): Promise<void> {
  const server = serveFixtures();
  try {
    const root = await cdp.evalInAtom<string>(`atom.project.getPaths()[0]`);
    await openFixture(cdp, `${server.page}/forms/text.html`, "/forms/text.html");

    const forms = resultOf<{ fields: string; fill: string; evaluate: string }>(await runAutomation(cdp, `${root}/fixtures/automations/sdk-grants-forms.ts`));
    assertEquals(forms.fields, "ok", "forms implies tabs");
    assertEquals(forms.fill, "ok");
    assertMatch(forms.evaluate, /needs "\/\/ @permissions page-js"/);

    const tabsOnly = resultOf<{ fields: string; fill: string }>(await runAutomation(cdp, `${root}/fixtures/automations/sdk-grants-tabs.ts`));
    assertEquals(tabsOnly.fields, "ok");
    assertMatch(tabsOnly.fill, /needs "\/\/ @permissions forms"/);
  } finally {
    await server.close();
  }
}
