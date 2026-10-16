# tranquil-test-suite

Test fixtures and files for verifying [Tranquil](https://github.com/tranquillabs) (the
`tranquil-client` app) — **not** an app package, and not loaded by the app at runtime.

## Why this repo exists

Agent-driven and manual GUI verification needs a **project to open that is not the
`tranquil-client` source tree**. Opening the real repo as the verify project means the
running app (automations, drag-and-drop, `.url` bookmarks, file edits) can touch actual
source and dirty the working tree. This repo is the dedicated, isolated stand-in.

The [smoke tests](#smoke-tests) below drive an isolated Tranquil instance that opens **this**
repo as its project — a throwaway `ATOM_HOME`, its own `--user-data-dir`, and `TRANQUIL_VERIFY`
so `tranquil-client` is never opened as a project. All tooling in this repo is **Deno**; run it
with `deno task test`.

## Smoke tests

Deterministic GUI smoke tests (no LLM in the loop) live under `smoke/`. They launch a fully
isolated Tranquil instance, drive it over the Chromium DevTools Protocol, assert, and tear it
down. Run them from this repo:

```sh
deno task test
```

Requirements: **Deno** (installed at `~/.deno/bin/deno`) and a sibling `../tranquil-client`
checkout with `node_modules` installed. Electron is spawned directly — **no Node is invoked**.
The suite opens a real window, so it needs a display (fine locally on macOS; headless CI would
need a virtual framebuffer — not set up yet).

What it isolates: a throwaway `ATOM_HOME` (seeded from `smoke/atom-home/config.cson`, theme pinned
to `tranquil-business-dark`) and `--user-data-dir`, plus `TRANQUIL_VERIFY=1` so only this repo
opens as the project (never `tranquil-client`). It mirrors `tranquil-client`'s `scripts/verify.js`.

Add a check: write a `smoke/suites/<name>.ts` exporting `async (cdp) => void`, then register a
`t.step(...)` in `smoke/main_test.ts`.

Fixtures the app runs as automations use Tranquil's own config (`$ATOM_HOME/automations/deno.json`),
like every script: the runner never picks up this repo's `deno.json`.

## Layout

| Path | What it's for |
| --- | --- |
| `fixtures/` | Tracked sample files and folders that give the tree-view, tabs and file icons real content to render. The smoke suites open these. |
| `smoke/` | Deno smoke tests: `main_test.ts` and `sdk_test.ts` (runners), `lib/` (launch and CDP client), `suites/` (one file per feature), `atom-home/config.cson` (fixed config). |
| `conformance/` | WPT accessible-name conformance for the automation SDK, with its test data. |
| `lint/` | The security lint (`deno task lint:security`). |

## Conventions

- **Track** deliberate fixtures (representative files a test relies on).
- A suite that writes files makes its own temp folder and removes it; nothing is written into this
  repo.
- Keep fixtures small and representative; this repo is read while driving the UI, not built.
- Assert on **your** fixtures as subsets: the app opens some panes on its own, so don't assume an
  exact tab list.
