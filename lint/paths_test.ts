// no-path-climbing flags paths that count ../ out of a file's folder, and leaves named paths, one
// level inside a package, and plain data strings alone.
import { assertEquals } from "@std/assert";
import plugin from "./paths.ts";

function ids(source: string): string[] {
  return Deno.lint.runPlugin(plugin, "probe.ts", source).map((d) => d.id);
}
const rule = "tranquil-paths/no-path-climbing";

Deno.test("flags climbing two or more levels", () => {
  assertEquals(ids(`import { x } from "../../deno/x.ts";`), [rule]);
  assertEquals(ids(`export * from "../../../lib/y.js";`), [rule]);
  assertEquals(ids(`await import("../../z.ts");`), [rule]);
  assertEquals(ids(`new URL("../../users/guide.md", import.meta.url);`), [rule]);
  assertEquals(ids(`resolve(here, "..", "..");`), [rule]);
  assertEquals(ids(`path.join(__dirname, "..", "..", "spec");`), [rule]);
  assertEquals(ids("const p = `${__dirname}/../../resources`;"), [rule]);
  assertEquals(ids(`require("../../lib/a.js");`), [rule]);
});

Deno.test("flags reaching a sibling repo", () => {
  assertEquals(ids(`import { y } from "../tranquil-automations/deno/mod.ts";`), [rule]);
  assertEquals(ids(`resolve(root, "..", "tranquil-client");`), [rule]);
  assertEquals(ids(`new URL("../www-tranquil/x", import.meta.url);`), [rule]);
});

Deno.test("leaves named paths, one level in a package, and data alone", () => {
  assertEquals(ids(`import { x } from "tranquil-automations/deno/x.ts";`), []);
  assertEquals(ids(`import.meta.resolve("tranquil-client/");`), []);
  assertEquals(ids(`import { t } from "./forms/types.ts"; import { l } from "../log.ts";`), []);
  assertEquals(ids(`path.join(__dirname, "..", "resources", "icons");`), []);
  assertEquals(ids("const p = `${__dirname}/../resources/`;"), []);
  assertEquals(ids(`const target = "../../tranquil-llm/developers/index.md"; ln(target);`), []);
  assertEquals(ids(`join(dir, "a", "..");`), []);
});
