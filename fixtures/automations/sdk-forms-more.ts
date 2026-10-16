// Fixture automation for the sdk-forms-more suite (ADR-0026 checkpoint 3): selects and
// comboboxes, checkboxes/radios/Yes-No buttons, uploads, a cross-origin frame, and the
// lifecycle error codes. Prints one RESULT line; the suite asserts each page's own state.
// The select page's dropdowns aren't built to web standards, so the script gives the tab the
// page's custom parts map, from the author's own module (./parts.ts).
// @permissions browser read=../forms/files,parts.ts
import { FieldError, tabs } from "tranquil/automation";
import { customParts } from "./parts.ts";

const out: Record<string, unknown> = {};
const attempt = async (name: string, fn: () => Promise<unknown>) => {
  console.log(`step ${name}`);
  const t0 = Date.now();
  try {
    out[name] = { ok: (await fn()) ?? true };
    console.log(`  done ${name} ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`  fail ${name} ${Date.now() - t0}ms ${String(e).slice(0, 300)}`);
    out[name] = e instanceof FieldError
      ? { code: e.code, message: e.message, candidates: e.candidates, options: e.options }
      : { thrown: String(e) };
  }
};

// ---- selects and comboboxes ----
const select = await tabs.find(/\/forms\/select\.html$/);
select.useCustomParts(customParts);
await attempt("countryAmbiguous", () => select.fill({ label: "Country of residence" }, "United"));
await attempt("country", () => select.fill({ label: "Country of residence" }, "United States"));
await attempt("sponsorship", () => select.fill({ label: "Will you require sponsorship?" }, "No"));
await attempt("language", () => select.fill({ label: "Favourite language" }, "type"));
await attempt("languageMissing", () => select.fill({ label: "Favourite language" }, "Cobol", { timeout: 1500 }));
await attempt("languageClear", () => select.clear({ label: "Favourite language" }));
await attempt("skills", () => select.fill({ label: "Other skills" }, ["Go", "Rust"]));
await attempt("city", () => select.fill({ label: "Where are you located?" }, "Lis"));

// ---- checkboxes, radios, Yes/No buttons ----
const choice = await tabs.find(/\/forms\/choice\.html/);
await attempt("choiceFields", async () => (await choice.fields()).map((f) => [f.label, f.kind, f.options ?? null]));
await attempt("workStyle", () => choice.fill({ label: "Preferred work style" }, "Hybrid"));
await attempt("experience", () => choice.fill({ label: "Years of experience" }, "3-5"));
await attempt("notice", () => choice.fill({ label: "Notice period" }, "One month"));
await attempt("channels", () => choice.fill({ label: "How did you hear about us?" }, ["LinkedIn", "Website"]));
await attempt("authorized", () => choice.fill({ label: "Are you authorized to work in the US?" }, true));
await attempt("relocate", () => choice.fill({ label: "Willing to relocate?" }, "No"));
await attempt("consent", () => choice.fill({ label: "I agree to the privacy policy" }, true));

// ---- idempotence: filling again with the same answers succeeds and changes nothing ----
await attempt("againSponsorship", () => select.fill({ label: "Will you require sponsorship?" }, "No"));
await attempt("againSkills", () => select.fill({ label: "Other skills" }, ["Go", "Rust"]));
await attempt("againCity", () => select.fill({ label: "Where are you located?" }, "Lis"));
await attempt("changeSkills", () => select.fill({ label: "Other skills" }, ["Python"]));
await attempt("againWorkStyle", () => choice.fill({ label: "Preferred work style" }, "Hybrid"));
await attempt("againAuthorized", () => choice.fill({ label: "Are you authorized to work in the US?" }, true));

// ---- uploads ----
const upload = await tabs.find(/\/forms\/upload\.html/);
await attempt("resume", () => upload.upload({ label: "Resume" }, "../forms/files/resume.pdf"));
await attempt("cover", () => upload.upload({ role: "button", name: "Upload file" }, "../forms/files/cover.txt"));
await attempt("outsideGrant", () => upload.upload({ label: "Resume" }, "/etc/hosts"));

// ---- cross-origin frame ----
const embed = await tabs.find(/\/forms\/embed\.html/);
const frame = await embed.frame(/127\.0\.0\.1.*\/forms\/text\.html/, { timeout: 5000 });
await attempt("frameFound", async () => frame !== null);
if (frame) {
  await attempt("frameFirst", () => frame.fill({ label: "First name" }, "Grace"));
  await attempt("frameEmail", () => frame.fill({ label: "Email" }, "grace@example.com"));
}
await attempt("noFrame", async () => (await embed.frame(/nothing-like-this/)) === null);

// ---- lifecycle ----
const life = await tabs.find(/\/forms\/lifecycle\.html/);
// Typing focuses without a click, so only clicks are refused when something covers the target.
await attempt("covered", () => life.click({ role: "button", name: "Not yet clicked" }, { timeout: 600 }));
await attempt("accept", () => life.click({ role: "button", name: "Accept" }));
await attempt("afterAccept", () => life.click({ role: "button", name: "Not yet clicked" }));
await attempt("underBanner", () => life.fill({ label: "Under the banner" }, "now visible"));
const swap = (await life.fields()).find((f) => f.label === "Re-rendered field")!;
await life.evaluate("window.__swap()");
await attempt("stale", () => life.fill(swap.ref, "x"));

console.log("RESULT " + JSON.stringify(out));
