// The llm-files check passes on a well-formed set of repos and flags each way of breaking it.
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { checkLlmFiles, CODE_REPOS, HEADERS, LLM_REPO } from "./llm-files.ts";

const AGENTS = `Read ../${LLM_REPO}/developers/index.md before changing anything.\n`;
const SETTINGS = JSON.stringify({ permissions: { additionalDirectories: [`../${LLM_REPO}`] } });

// Deno.symlink needs unscoped permissions; ln needs only --allow-run=ln.
async function link(target: string, path: string) {
  await new Deno.Command("ln", { args: ["-sfn", target, path] }).output();
}

async function fixture(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "llm-files-" });
  const llm = join(root, LLM_REPO);
  for (const dir of ["skills/docs", "repos"]) await Deno.mkdir(join(llm, "developers", dir), { recursive: true });
  await Deno.mkdir(join(llm, "users"), { recursive: true });
  await Deno.writeTextFile(join(llm, "README.md"), "# tranquil-llm\n");
  await Deno.writeTextFile(join(llm, "developers", "index.md"), `${HEADERS.developers}\n\n# Index\n`);
  await Deno.writeTextFile(join(llm, "developers", "skills", "docs", "SKILL.md"), `---\nname: docs\n---\n\n${HEADERS.developers}\n`);
  await Deno.writeTextFile(join(llm, "users", "guide.md"), `${HEADERS.users}\n\n# Guide\n`);
  for (const repo of CODE_REPOS) {
    await Deno.writeTextFile(join(llm, "developers", "repos", `${repo}.md`), `${HEADERS.developers}\n\n# ${repo}\n`);
    await Deno.mkdir(join(root, repo, ".claude"), { recursive: true });
    await link(`../${LLM_REPO}/developers/repos/${repo}.md`, join(root, repo, "CLAUDE.md"));
    await link(`../../${LLM_REPO}/developers/index.md`, join(root, repo, ".claude", "CLAUDE.md"));
    await Deno.writeTextFile(join(root, repo, ".claude", "settings.json"), SETTINGS);
    await Deno.writeTextFile(join(root, repo, "AGENTS.md"), AGENTS);
  }
  await Deno.mkdir(join(root, "www-tranquil", ".claude", "skills"));
  await link(join(llm, "developers", "skills", "docs"), join(root, "www-tranquil", ".claude", "skills", "docs"));
  await Deno.mkdir(join(root, "tranquil-examples"));
  return root;
}

async function findings(change: (root: string) => Promise<void>): Promise<string[]> {
  const root = await fixture();
  try {
    await change(root);
    return (await checkLlmFiles(root)).map((m) => m.split("\n")[0]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("a well-formed set of repos passes", async () => {
  assertEquals(await findings(async () => {}), []);
});

Deno.test("flags an AGENTS.md or CLAUDE.md inside tranquil-llm", async () => {
  const out = await findings((root) => Deno.writeTextFile(join(root, LLM_REPO, "users", "AGENTS.md"), `${HEADERS.users}\n`));
  assertEquals(out.length, 1);
});

Deno.test("flags a file without its audience's header line", async () => {
  const out = await findings((root) => Deno.writeTextFile(join(root, LLM_REPO, "developers", "rules.md"), "# Rules\n"));
  assertEquals(out.length, 1);
});

Deno.test("flags a code repo whose CLAUDE.md is a file or links elsewhere", async () => {
  const file = async (root: string) => {
    await Deno.remove(join(root, "tranquil-browser", "CLAUDE.md"));
    await Deno.writeTextFile(join(root, "tranquil-browser", "CLAUDE.md"), `@../${LLM_REPO}/developers/index.md\n`);
  };
  assertEquals((await findings(file)).length, 1);
  const wrong = (root: string) => link(`../${LLM_REPO}/developers/index.md`, join(root, "tranquil-config", "CLAUDE.md"));
  assertEquals((await findings(wrong)).length, 1);
  assertEquals((await findings((root) => Deno.remove(join(root, "tranquil-tips", ".claude", "CLAUDE.md")))).length, 1);
});

Deno.test("flags missing read access to tranquil-llm, and an AGENTS.md that holds rules", async () => {
  assertEquals((await findings((root) => Deno.remove(join(root, "tranquil-rpc", ".claude", "settings.json")))).length, 1);
  const rules = AGENTS + Array.from({ length: 10 }, (_, i) => `- rule ${i}`).join("\n");
  assertEquals((await findings((root) => Deno.writeTextFile(join(root, "tranquil-debug", "AGENTS.md"), rules))).length, 1);
});

Deno.test("flags an instruction file in a user-facing repo", async () => {
  const out = await findings((root) => Deno.writeTextFile(join(root, "tranquil-examples", "AGENTS.md"), AGENTS));
  assertEquals(out.length, 1);
});

Deno.test("flags a skill that is not a link into tranquil-llm", async () => {
  const out = await findings((root) => Deno.mkdir(join(root, "www-tranquil", ".claude", "skills", "local")));
  assertEquals(out.length, 1);
});
