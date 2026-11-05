// The deno.json task check (lint/deno-tasks.ts): unscoped flags in tasks fail, except a bare
// --allow-env under an emptied environment.
import { assertEquals } from "@std/assert";
import { checkDenoTasks, taskProblems, tasksIn } from "./deno-tasks.ts";

Deno.test("nested deno.json files are checked, and node_modules is not", async () => {
  const dir = await Deno.makeTempDir({ prefix: "deno-tasks-" });
  try {
    const bad = JSON.stringify({ tasks: { build: "deno run --allow-read x.ts" } });
    await Deno.mkdir(`${dir}/ui/node_modules/pkg`, { recursive: true });
    await Deno.writeTextFile(`${dir}/ui/deno.json`, bad);
    await Deno.writeTextFile(`${dir}/ui/node_modules/pkg/deno.json`, bad);
    const found = await checkDenoTasks([dir]);
    assertEquals(found.length, 1, found.join("\n"));
    assertEquals(found[0].includes(`${dir}/ui/deno.json`), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("an unscoped flag in a task is a problem; a scoped one isn't", () => {
  assertEquals(taskProblems("t", "deno run --allow-env x.ts").length, 1);
  assertEquals(taskProblems("t", "deno run -A x.ts").length, 1);
  assertEquals(taskProblems("t", "deno run --allow-read --allow-net x.ts").length, 2);
  assertEquals(taskProblems("t", "deno run --allow-env=HOME --allow-read=. x.ts"), []);
});

Deno.test("a bare --allow-env is allowed only in a command run under env -i", () => {
  assertEquals(taskProblems("t", `env -i PATH="$PATH" deno run --allow-env x.ts`), []);
  assertEquals(taskProblems("t", `env -i PATH="$PATH" deno run --allow-env --allow-read x.ts`).length, 1, "other flags still count");
  assertEquals(
    taskProblems("t", `env -i HOME="$HOME" deno run --allow-env a.ts && deno run --allow-env b.ts`).length,
    1,
    "the exception covers its own command only",
  );
  assertEquals(taskProblems("t", "env deno run --allow-env x.ts").length, 1, "env without -i keeps the environment");
});

Deno.test("tasks are read as JSON, including escaped quotes and the object form", () => {
  const text = JSON.stringify({
    tasks: {
      build: `env -i PATH="$PATH" deno run --allow-env x.ts && deno run --allow-read y.ts`,
      check: { command: "deno check x.ts", description: "types" },
    },
  });
  assertEquals(tasksIn(text), {
    build: `env -i PATH="$PATH" deno run --allow-env x.ts && deno run --allow-read y.ts`,
    check: "deno check x.ts",
  });
});
