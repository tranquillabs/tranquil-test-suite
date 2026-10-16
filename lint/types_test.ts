// no-any flags every spelling of `any` and leaves the typed alternatives alone.
import { assertEquals } from "@std/assert";
import plugin from "./types.ts";

function ids(source: string): string[] {
  return Deno.lint.runPlugin(plugin, "probe.ts", source).map((d) => d.id);
}
const rule = "tranquil-types/no-any";

Deno.test("flags any, wherever it is written", () => {
  assertEquals(ids(`let x: any;`), [rule]);
  assertEquals(ids(`const y = z as any;`), [rule]);
  assertEquals(ids(`function f(): Promise<any> { return g(); }`), [rule]);
  assertEquals(ids(`type F = (...args: any[]) => void;`), [rule]);
  assertEquals(ids(`type R = Record<string, any>;`), [rule]);
  assertEquals(ids(`function h<T = any>() {}`), [rule]);
});

Deno.test("leaves the typed alternatives alone", () => {
  assertEquals(ids(`let x: unknown; const y = z as unknown as Shape;`), []);
  assertEquals(ids(`type F = (...args: never[]) => unknown; type R = Record<string, unknown>;`), []);
  assertEquals(ids(`const company = "anyone"; const anyEl = 1;`), [], "the word, not the type");
});
