// sdk-permissions fixture: granted only `tabs`. Reading fields works; filling needs `forms`.
// @permissions tabs
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
console.log("RESULT " + JSON.stringify(out));
