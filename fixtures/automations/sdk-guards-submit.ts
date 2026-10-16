// sdk-guards fixture (ADR-0026): granted `submit` on localhost. The same Continue click that
// sdk-guards.ts is refused now submits the form.
// @permissions submit sites=localhost
import { tabs } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/guards\.html/);
await tab.click({ role: "button", name: "Continue" });
console.log("RESULT " + JSON.stringify({ clicked: "ok" }));
