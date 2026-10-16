// sdk-custom-parts fixture (ADR-0026): the select page's dropdowns show their choice beside the
// input, where web standards don't say. Without a custom parts map a fill can't see what it
// chose; with the hand-written map from the author's own module (./parts.ts) it fills as usual.
// Prints one RESULT line.
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

const tab = await tabs.find(/\/forms\/select\.html\?parts$/);
// Without a map: the dropdown that can't be typed into has nothing to press, and the one that
// can opens and takes the click but can't see what it chose.
await attempt("noMapOpen", () => tab.fill({ label: "Will you require sponsorship?" }, "Yes", { timeout: 3000 }));
await attempt("noMap", () => tab.fill({ label: "Favourite language" }, "TypeScript", { timeout: 3000 }));
tab.useCustomParts(customParts);
await attempt("sponsorship", () => tab.fill({ label: "Will you require sponsorship?" }, "No"));
await attempt("language", () => tab.fill({ label: "Favourite language" }, "TypeScript"));
await attempt("skills", () => tab.fill({ label: "Other skills" }, ["Go", "Rust"]));
await attempt("city", () => tab.fill({ label: "Where are you located?" }, "Lis"));
await attempt("fields", async () => (await tab.fields()).map((f) => [f.label, f.multiple, f.value]));
console.log("RESULT " + JSON.stringify(out));
