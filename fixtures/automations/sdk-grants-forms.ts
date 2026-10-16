// sdk-permissions fixture: granted only `forms` (which implies `tabs`). Filling works; running
// page code needs `page-js` and is refused before it reaches the page.
// @permissions forms
import { tabs } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/text\.html/);
const out: Record<string, unknown> = {};
const attempt = async (name: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    out[name] = "ok";
  } catch (e) {
    out[name] = String((e as Error).message);
  }
};
await attempt("fields", () => tab.fields());
await attempt("fill", () => tab.fill({ label: "Phone" }, "555 0100"));
await attempt("evaluate", () => tab.evaluate((page) => page.document.title));
console.log("RESULT " + JSON.stringify(out));
