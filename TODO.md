# Testing TODO

Notes for a future testing pass, collected during the 2026-10-11 code review. Nothing here is
started. Security items come first, following the rule that nothing may get past the Deno sandbox
or hold a permission it was not explicitly given.

## Organization

- **Move the lint's tests out of `lint/`.** `lint/security_test.ts` and
  `lint/preload_channels_test.ts` sit beside the lint's source (`lint/security.ts`,
  `lint/run-security.ts`). Move them to `test/lint/`, mirroring the source path, and point the
  `lint:security` task at `test/lint/`. `smoke/` and `conformance/` are all test code and stay as
  they are.
- **Leave deno-dom's layout alone.** It is a fork; its upstream `test/` folder and root
  `*.test.ts` files keep merges easy, like the `spec/` folders in `language-csv` and `pdf-view`.

## Coverage gaps: security (do first)

- **Page permissions are deny-by-default** (`tranquil-client/src/main-process/page-permissions.js`).
  Smoke test: a page that asks for geolocation, notifications, camera and microphone is refused;
  `fullscreen` and a copy button (`clipboard-sanitized-write`) still work.
- **The page bridge exposes only what it should** (`tranquil-browser/resources/bp-client.js`).
  Smoke test, in a browser tab on an ordinary website:
  - `window.electron` has only `sendToHost` and `receive`; no `send`, `invoke` or `sendSync`;
  - `sendToHost` with any channel but `tranquil:rpc` does nothing;
  - `tabFocus` and `suggest` exist only on the start page, and history updates are accepted only
    from the history page;
  - the preload has no Node.js (`require`, `process` unavailable).
- **Window sessions** (`tranquil-client/src/main-process/window-session-cleanup.js`):
  - quit with two windows open, relaunch: both come back signed in, partitions intact;
  - close one window while the app runs: its session data is cleared;
  - at startup, partition folders of windows not in `storage/application.json` are deleted, and
    an unreadable `application.json` deletes nothing.
- **Per-script state isolation** (`tranquil-automations/lib/runner-capabilities.js` `ConfigCap`):
  script A's `config.set` is invisible to script B's `config.get`, and keys cannot climb out of
  the script's own section (`..`, leading or trailing dots).
- **tranquil-rpc trust** (`tranquil-rpc/lib/trust.js`, marked SECURITY CRITICAL, no tests today):
  default-deny for everything but `file://` under a registered root; path traversal (`..`,
  symlinks, encoded separators) cannot reach outside a root; an untrusted page gets no
  capabilities.
- **The debugging port (ADR-0028).** Until the host owns the debugger, a script with any browser
  grant can reach Tranquil's own windows through the port. Once ADR-0028 lands, add a test that a
  `tabs`-only script cannot list targets or run code in a host window, and that `sites=`,
  `submit` and `forms` (without `page-js`) hold even for a script that speaks CDP itself.
- **Packaged builds.** Before the first Studio binary: a smoke run against a real packaged build.
  The build currently drops every `.ts` and `.md` file (an inherited Pulsar pattern), so the SDK
  and the user guides (tranquil-llm `users/`) would be missing. `lint:security` already checks that owned packages ship no
  tests; add the reverse check, that the files the SDK needs at run time do ship.

## Coverage gaps: other

- **tranquil-client's own main-process files** have no tests of their own: `cz-init.js` (IPC
  handlers, the relay loop, suggestions, copy link), `har.js`, `stall-watchdog.js`,
  `tb-color-scheme.js`.
- **Browser IPC channels** (`tranquil-browser/lib/ipc.js`): a smoke test per relayed channel
  (open link in new tab, in new window, in the default browser, add to tree view, key events),
  driven from a page's context menu and clicks.
- **The consent flow** (`tranquil-automations/lib/consent.js`): a changed permission header
  re-prompts; a declined prompt does not run.
- **Settings keys.** Every owned package's `lib/settings.js` throws on an undeclared key; a quick
  test that loads each package and resolves every key it uses would catch a typo before a user
  does.

## Ideas to explore

- **A pre-push hook.** There is no CI. The fast checks (`deno task lint:security`,
  `deno task test:conformance`, tranquil-automations `deno task test`) run in a few seconds and
  could run before every push; the smoke suite stays on demand.
- **Order-independent smoke suites.** Two failures this week came from one suite seeing state an
  earlier suite left behind (a terminal in the bottom dock shrinking the editor). Ideas: reset
  docks and close editors between suites, or run each suite in a fresh window; and a periodic run
  in reverse or random order to flush out hidden dependencies.
- **Read the screen only when it is complete.** A `waitFor` that returns on the first thing drawn
  races the rest of the render. Wait for the full condition the test asserts, and remember the
  editor only draws the rows in view: scroll a row into view before asserting on it.
- **An automated agent-authoring check.** Give an agent the rules at
  `~/.tranquil/llm/writing-automations.md`, a fixture page and a one-sentence task, and record whether
  the script it writes works without hand edits. Only ever run by hand so far; recorded runs against
  the fixture forms would show whether the rules and the error messages are enough.
- **Saved real forms as offline fixtures.** Pages saved before any input (so no personal data) from public application forms make good `fieldsOf`/`checkTargets` cases for the
  form resolver.
- **Raise the accname floors** in `conformance/accname_test.ts` whenever the score improves; never
  lower them to make a change pass.
- **Coverage reports, not targets.** `deno test --coverage` on tranquil-automations shows which
  branches only the in-app suites reach; record it in delivery notes rather than chasing numbers.
