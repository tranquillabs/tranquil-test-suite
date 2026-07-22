# tranquil-test-suite

Test fixtures and files for verifying [Tranquil](https://github.com/tranquillabs) (the
`tranquil-client` app) — **not** an app package, and not loaded by the app at runtime.

## Why this repo exists

Agent-driven and manual GUI verification needs a **project to open that is not the
`tranquil-client` source tree**. Opening the real repo as the verify project means the
running app (automations, drag-and-drop, `.url` bookmarks, file edits) can touch actual
source and dirty the working tree. This repo is the dedicated, isolated stand-in.

It pairs with the isolated dev-launch workflow (see `tranquil-client` →
`scripts/dev.js`, and the **Agent Debugging** dev doc):

```sh
# from tranquil-client, launch an isolated instance against THIS repo:
yarn start --user-data-dir="$TMPDIR/tranquil-verify" \
  /Users/<you>/Documents/Tranquil/Repos/tranquil-test-suite
```

- `--user-data-dir=<tmp>` → isolated window-state + single-instance lock (own session).
- this path as the project → the app operates here, never on `tranquil-client`.

## Layout

| Path | What it's for |
| --- | --- |
| `fixtures/` | Tracked sample files/folders that give tree-view, tabs, and file-icons real content to render. Grow as tests need. |
| `scratch/` | Ephemeral agent output — **git-ignored**. Anything the app writes during a verify run goes here so it never shows as a diff. |

## Conventions

- **Track** deliberate fixtures (representative files a test relies on).
- **Never** commit `scratch/` — it's for throwaway run artifacts.
- Keep fixtures small and representative; this repo is read while driving the UI, not built.
