// sdk-guards fixture (ADR-0026): granted `forms` on localhost only, no `submit`. Reading works;
// submitting (a submit button, Enter in a field, a Submit-named button) and leaving the declared
// sites are refused; ui.confirm with nobody answering is false. Hands its findings back with
// context.result as well as on the RESULT line.
// @permissions forms sites=localhost
import { context, tabs, ui } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/guards\.html/);
const out: Record<string, unknown> = {};
const attempt = async (name: string, fn: () => Promise<unknown>) => {
  try {
    const value = await fn();
    out[name] = value === undefined ? "ok" : value;
  } catch (e) {
    out[name] = (e as Error).message; // a FieldError message starts with its code
  }
};
await attempt("status", () => tab.text({ role: "status" }));
await attempt("href", () => tab.attr({ role: "link", name: "Download receipt" }, "href"));
await attempt("fill", async () => void (await tab.fill({ label: "Name" }, "Ada")));
await attempt("focusName", () => tab.click({ label: "Name" })); // Enter only submits from inside a field
await attempt("pressEnter", () => tab.press("Enter"));
await attempt("clickContinue", () => tab.click({ role: "button", name: "Continue" }));
await attempt("clickSubmitNamed", () => tab.click({ role: "button", name: "Submit application" }));
await attempt("gotoElsewhere", () => tab.goto("https://example.com/"));
await attempt("confirm", () => ui.confirm("Fixture question nobody answers", { timeout: 1500 }));
await context.result(out);
console.log("RESULT " + JSON.stringify(out));
