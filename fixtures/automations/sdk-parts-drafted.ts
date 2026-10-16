// sdk-custom-parts fixture (ADR-0026): fills the select page through whatever map ./parts.ts
// exports. The suite copies this script beside the map that SDK: Map Custom Parts drafted,
// saved as parts.ts, so the draft is used exactly as a person would use it. Prints one RESULT line.
// @permissions forms read=parts.ts sites=localhost
import { FieldError, tabs } from "tranquil/automation";
import { customParts } from "./parts.ts";

const out: Record<string, unknown> = {};
const attempt = async (name: string, fn: () => Promise<unknown>) => {
  try {
    out[name] = { ok: (await fn()) ?? true };
  } catch (e) {
    out[name] = e instanceof FieldError ? { code: e.code, message: e.message } : { thrown: String(e) };
  }
};

const tab = await tabs.find(/\/forms\/select\.html\?drafted$/);
tab.useCustomParts(customParts);
await attempt("sponsorship", () => tab.fill({ label: "Will you require sponsorship?" }, "Yes"));
await attempt("language", () => tab.fill({ label: "Favourite language" }, "Go"));
await attempt("skills", () => tab.fill({ label: "Other skills" }, ["Java", "Python"]));
await attempt("clearLanguage", () => tab.clear({ label: "Favourite language" }));
await attempt("fields", async () => (await tab.fields()).map((f) => [f.label, f.multiple, f.value]));
console.log("RESULT " + JSON.stringify(out));
