// sdk-guards fixture (ADR-0026): granted `submit` on localhost. The same Continue click that
// sdk-guards.ts is refused is refused here too until the person says yes to ui.confirm, and then
// submits the form.
// @permissions submit sites=localhost
import { tabs, ui } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/guards\.html/);
let beforeYes = "ok";
try {
  await tab.click({ role: "button", name: "Continue" });
} catch (e) {
  beforeYes = (e as Error).message; // a FieldError message starts with its code
}
const yes = await ui.confirm("Submit the guards fixture form?", { timeout: 30_000 });
await tab.click({ role: "button", name: "Continue" });
console.log("RESULT " + JSON.stringify({ beforeYes, yes, clicked: "ok" }));
