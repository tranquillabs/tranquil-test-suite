// Fixture automation for the sdk-forms-text suite: drives fixtures/forms/text.html through the
// form API and prints one RESULT line. The suite asserts the form library's own state, not this
// script's report.
// @permissions browser
import { FieldError, tabs } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/text\.html/);
const out: Record<string, unknown> = {};
const attempt = async (name: string, fn: () => Promise<unknown>) => {
  try {
    out[name] = { ok: await fn() };
  } catch (e) {
    out[name] = e instanceof FieldError
      ? { code: e.code, message: e.message, candidates: e.candidates }
      : { thrown: String(e) };
  }
};

await attempt("fields", async () => (await tab.fields()).map((f) => ({ label: f.label, kind: f.kind, required: f.required })));
await attempt("first", () => tab.fill({ label: "First name" }, "Ada"));
await attempt("emailBad", () => tab.fill({ label: "Email" }, "nope"));
await attempt("emailGood", () => tab.fill({ label: "Email" }, "ada@example.com"));
await attempt("phone", () => tab.fill({ label: "Phone" }, "+1 202 555 0100", { sensitive: true }));
await attempt("bioTooLong", () => tab.fill({ label: "About you" }, "This is far longer than twenty"));
await attempt("readonly", () => tab.fill({ label: "Account ID" }, "X"));
await attempt("question", () => tab.fill({ label: "Where are you located?" }, "Lisbon"));
await attempt("missing", () => tab.fill({ label: "E-mail address" }, "x", { timeout: 500 }));
await attempt("clearFirst", () => tab.fill({ label: "First name" }, ""));

console.log("RESULT " + JSON.stringify(out));
