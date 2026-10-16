// Scores the SDK page runtime's accessible-name computation (tranquil-automations
// deno/forms/runtime.ts) against the W3C conformance tests (testdata/wpt-accname, from
// web-platform-tests) and fails if the score drops below the floors
// below. Offline on deno-dom, which has no stylesheets: cases that need CSS cannot pass here.
// Raise the floors when the score improves; never lower them to make a change pass.
import { assert } from "jsr:@std/assert@^1";
import { DOMParser } from "https://raw.githubusercontent.com/tranquillabs/deno-dom/v0.1.56-tq.1/deno-dom-wasm.ts";
// SDK internals, by path: the runtime's names() is not part of the public API.
import type { Page } from "tranquil-automations/deno/page.ts";
import { createFormsRuntime } from "tranquil-automations/deno/forms/runtime.ts";

const FLOOR = { all: 415, formFields: 122 }; // of 470 and 122 (2026-10-05)

const dir = new URL("testdata/wpt-accname/", import.meta.url);
const loose = (s: string) => s.replace(/\s+/g, " ").trim().normalize("NFKC").toLowerCase();

Deno.test("accessible names: W3C accname conformance (offline)", () => {
  let all = 0, passed = 0, fields = 0, fieldsPassed = 0;
  const misses: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (!entry.name.endsWith(".html")) continue;
    const doc = new DOMParser().parseFromString(Deno.readTextFileSync(new URL(entry.name, dir)), "text/html")!;
    const cases = Array.from(doc.querySelectorAll("[data-expectedlabel]"));
    cases.forEach((el, i) => el.setAttribute("data-tq-i", String(i)));
    const page = {
      document: doc,
      getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
      requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(0), 0),
      setTimeout: (cb: () => void, ms?: number) => setTimeout(cb, ms),
    } as unknown as Page;
    const runtime = createFormsRuntime(page);
    cases.forEach((el, i) => {
      const r = runtime.names(`[data-tq-i="${i}"]`);
      const ok = r.ok && loose(r.accessibleName) === loose(el.getAttribute("data-expectedlabel") ?? "");
      all++;
      if (ok) passed++;
      else misses.push(`${entry.name}: ${el.getAttribute("data-testname")}`);
      if (r.ok && r.kind !== "other") {
        fields++;
        if (ok) fieldsPassed++;
      }
    });
  }
  console.log(`accname: ${passed}/${all} overall, ${fieldsPassed}/${fields} form fields`);
  assert(passed >= FLOOR.all, `accname score dropped to ${passed}/${all} (floor ${FLOOR.all}). Misses:\n${misses.join("\n")}`);
  assert(fieldsPassed >= FLOOR.formFields, `form-field names dropped to ${fieldsPassed}/${fields} (floor ${FLOOR.formFields})`);
});
