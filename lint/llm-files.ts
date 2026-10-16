// The llm-files check (ADR-0029): every file Tranquil writes for LLMs lives in tranquil-llm, in a
// folder for its audience, and nowhere else.
//
// - tranquil-llm holds no AGENTS.md or CLAUDE.md (agents would load them as instructions for
//   working on that repo), and every file in developers/ and users/ opens with its audience's
//   header line.
// - Each code repo loads its rules from tranquil-llm without an import (Claude Code asks once per
//   repo before loading an import from outside it): CLAUDE.md is a link to the repo's own
//   developers/repos/<repo>.md, .claude/CLAUDE.md a link to developers/index.md, and
//   .claude/settings.json lists ../tranquil-llm in additionalDirectories so the linked files can be
//   read. AGENTS.md, for agents without links or imports, only points there in words.
// - User-facing repos, which users clone and open with their own agents, have neither file.
// - A skill a repo links into .claude/skills/ resolves into tranquil-llm/developers/skills/.
import { walk } from "jsr:@std/fs@^1/walk";
import { join, relative, resolve } from "jsr:@std/path@^1";

export const LLM_REPO = "tranquil-llm";
export const HEADERS: Record<string, string> = {
  developers: "<!-- For agents working on Tranquil's repos. Never shipped. -->",
  users:
    "<!-- User guide: shipped with Tranquil and published to ~/.tranquil/llm/ for users' LLMs. Not instructions for working on any repo. -->",
};
// Repos whose agents are developers' agents: each has pointer CLAUDE.md and AGENTS.md files.
export const CODE_REPOS = [
  "tranquil-client", "tranquil-automations", "tranquil-browser", "tranquil-config", "tranquil-debug",
  "tranquil-rpc", "tranquil-tips", "tranquil-drag-drop", "tranquil-window-color", "tranquil-theme-icons",
  "tranquil-business-dark", "tranquil-business-light", "atom-pdf-view", "atom-language-csv", "deno-dom",
  "tranquil-test-suite", "www-tranquil",
];
// Older repos checked only when cloned.
export const OPTIONAL_CODE_REPOS = ["tranquil-theme-dark", "tranquil-theme-light"];
// Repos users clone: an agent there is a user's agent, so no developer instruction files.
export const USER_REPOS = ["tranquil-examples", "tranquil-app-template", "tranquil-ops-demo"];
const POINTER_MAX_LINES = 8;

const exists = (p: string) => Deno.stat(p).then(() => true, () => false);

function headerOf(text: string): string {
  const body = text.startsWith("---\n") ? text.slice(text.indexOf("\n---\n", 4) + 5) : text;
  return body.replace(/^\n+/, "").split("\n")[0];
}

/** Returns one message per finding; empty when everything holds. */
export async function checkLlmFiles(repos: string): Promise<string[]> {
  const found: string[] = [];
  const say = (msg: string, file: string) => found.push(`error[tranquil-security/llm-files]: ${msg}\n  --> ${file}\n`);
  const llm = join(repos, LLM_REPO);
  if (!(await exists(llm))) return [`lint:security: missing ${LLM_REPO} (clone it next to the other repos)`];

  for await (const e of walk(llm, { includeDirs: false, exts: [".md"], skip: [/\/\.git\//, /\/node_modules\//] })) {
    const rel = relative(llm, e.path);
    if (/(^|\/)(AGENTS|CLAUDE)\.md$/i.test(rel)) {
      say(`${LLM_REPO} holds ${rel}; agents would load it as instructions for working on ${LLM_REPO}. Give it a topic name.`, e.path);
    }
    const header = HEADERS[rel.split("/")[0]];
    if (header && headerOf(await Deno.readTextFile(e.path)) !== header) {
      say(`${LLM_REPO}/${rel} does not open with its audience's header line:\n  ${header}`, e.path);
    }
  }

  const code = [...CODE_REPOS];
  for (const r of OPTIONAL_CODE_REPOS) if (await exists(join(repos, r))) code.push(r);
  for (const repo of code) {
    const links: [string, string][] = [
      ["CLAUDE.md", join(llm, "developers", "repos", `${repo}.md`)],
      [join(".claude", "CLAUDE.md"), join(llm, "developers", "index.md")],
    ];
    for (const [name, want] of links) {
      const file = join(repos, repo, name);
      const info = await Deno.lstat(file).catch(() => null);
      const real = await Deno.realPath(file).catch(() => null);
      const target = await Deno.realPath(want).catch(() => want);
      if (!info?.isSymlink || real !== target) {
        say(`${repo}/${name} must be a link to ${relative(repos, want)}, so rules stay in ${LLM_REPO} and load without an import`, file);
      }
    }
    const settingsFile = join(repos, repo, ".claude", "settings.json");
    const settings = await Deno.readTextFile(settingsFile).then(JSON.parse).catch(() => null);
    if (!settings?.permissions?.additionalDirectories?.includes(`../${LLM_REPO}`)) {
      say(`${repo}/.claude/settings.json must list "../${LLM_REPO}" in permissions.additionalDirectories, so agents can read the linked rules`, settingsFile);
    }
    const agentsFile = join(repos, repo, "AGENTS.md");
    const agents = await Deno.readTextFile(agentsFile).catch(() => null);
    if (agents === null) {
      say(`${repo} has no AGENTS.md pointing to ${LLM_REPO}/developers/index.md`, agentsFile);
    } else if (!agents.includes(`../${LLM_REPO}/developers/index.md`) || agents.split("\n").filter((l) => l.trim()).length > POINTER_MAX_LINES) {
      say(`${repo}/AGENTS.md must only point to ${LLM_REPO} (name ../${LLM_REPO}/developers/index.md, at most ${POINTER_MAX_LINES} lines). Rules go in ${LLM_REPO}/developers/.`, agentsFile);
    }
  }
  for (const repo of USER_REPOS) {
    for (const name of ["CLAUDE.md", "AGENTS.md"]) {
      const file = join(repos, repo, name);
      if (await exists(file)) {
        say(`${repo} is cloned by users; a ${name} there would instruct a user's agent. Developer facts go in ${LLM_REPO}/developers/repos/.`, file);
      }
    }
  }

  const skillsHome = await Deno.realPath(join(llm, "developers", "skills")).catch(() => resolve(llm, "developers", "skills"));
  for (const repo of [...code, ...USER_REPOS]) {
    const dir = join(repos, repo, ".claude", "skills");
    if (!(await exists(dir))) continue;
    for await (const e of Deno.readDir(dir)) {
      const path = join(dir, e.name);
      const real = await Deno.realPath(path).catch(() => null);
      if (!e.isSymlink || !real || !real.startsWith(skillsHome + "/")) {
        say(`${repo}/.claude/skills/${e.name} must be a link into ${LLM_REPO}/developers/skills/`, path);
      }
    }
  }
  return found;
}
