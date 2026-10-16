// The browser's page preload (tranquil-browser/resources/bp-client.js) runs sandboxed and cannot
// require lib/ipc.js, so it spells out the channel names it uses. Each must match ipc.js exactly,
// or a message goes to a channel nobody listens on.
import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, resolve } from "@std/path";

const browser = resolve(fromFileUrl(import.meta.resolve("tranquil-browser/")));

function entries(source: string, block: RegExp): Map<string, string> {
  const body = block.exec(source)?.[1];
  assert(body, `found the CHANNELS block (${block})`);
  return new Map([...body.matchAll(/^\s*(\w+):\s*["']([^"']+)["']/gm)].map((m) => [m[1], m[2]]));
}

Deno.test("the preload's channel names match lib/ipc.js", async () => {
  const ipc = entries(await Deno.readTextFile(`${browser}/lib/ipc.js`), /const CHANNELS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const preload = entries(await Deno.readTextFile(`${browser}/resources/bp-client.js`), /const CHANNELS = \{([\s\S]*?)\n\};/);
  assert(preload.size > 0);
  for (const [key, name] of preload) assertEquals(name, ipc.get(key), `CHANNELS.${key}`);
});

Deno.test("the preload requires nothing but electron (it runs sandboxed)", async () => {
  const source = await Deno.readTextFile(`${browser}/resources/bp-client.js`);
  const required = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  assertEquals(required, ["electron"]);
});
