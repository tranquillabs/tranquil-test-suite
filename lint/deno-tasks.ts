// Deno flags in deno.json tasks, which the code lint can't see: every deno.json and deno.jsonc in
// an owned repo, nested ones included (tranquil-automations ui/deno.json). A permission flag with
// no list grants everything of its kind. One exception: a bare --allow-env in a command that runs
// under `env -i`, an emptied environment, where there is nothing to read. Vite under Deno
// enumerates the environment, which only the bare flag allows.
import { walk } from "jsr:@std/fs@^1/walk";

const UNSCOPED = /(^|\s)(--allow-(all|read|write|net|env|run|ffi|sys|import|scripts)|-A)(?=\s|$|\\)/g;

/** A task as deno.json writes it: a command, or an object holding one. */
type TaskEntry = string | { command?: string };

/** The tasks in a deno.json or deno.jsonc file, by name. */
export function tasksIn(text: string): Record<string, string> {
  let parsed: { tasks?: Record<string, TaskEntry> };
  try {
    parsed = JSON.parse(text) as { tasks?: Record<string, TaskEntry> }; // deno.json's own contract
  } catch {
    // deno.jsonc with comments: fall back to reading "name": "command" pairs in the tasks block.
    const block = /"tasks"\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(text)?.[1] ?? "";
    return Object.fromEntries([...block.matchAll(/"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]));
  }
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(parsed.tasks ?? {})) {
    const command = typeof entry === "string" ? entry : entry.command;
    if (command) out[name] = command;
  }
  return out;
}

/** What's wrong with one task's command, one message per unscoped flag. */
export function taskProblems(name: string, command: string): string[] {
  const out: string[] = [];
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const text = part.trim();
    for (const m of text.matchAll(UNSCOPED)) {
      if (m[3] === "env" && /^env\s+-i\s/.test(text)) continue; // the bare env flag, under env -i
      out.push(`task "${name}" uses "${m[2]}", which grants everything of its kind`);
    }
  }
  return out;
}

/** Findings for every deno.json and deno.jsonc under the given folders. */
export async function checkDenoTasks(dirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const dir of dirs) {
    for await (const e of walk(dir, { includeDirs: false, match: [/\/deno\.jsonc?$/], skip: [/\/node_modules\//, /\/\.git\//] })) {
      for (const [name, command] of Object.entries(tasksIn(await Deno.readTextFile(e.path)))) {
        for (const problem of taskProblems(name, command)) {
          out.push(`error[tranquil-security/no-unscoped-deno-permission]: ${problem}\n  --> ${e.path}\n`);
        }
      }
    }
  }
  return out;
}
