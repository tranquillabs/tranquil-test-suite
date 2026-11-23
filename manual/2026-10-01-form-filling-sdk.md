# Manual tests: the form-filling SDK (ADR-0026)

What to try by hand for the form API (`fields`, `fill`, `clear`, `upload`, `click`, frames and the
error codes), against the fixture pages and then, read-only, a live form. Moved from the plan
`~/Documents/Tranquil/Plans/2026-10-01-form-filling-sdk.md` (its "Manual testing" section and
verification items 7 and 8). The expected values are the ones `deno task test:sdk` checks
(`smoke/suites/sdk-*.ts`).

Everything here is in **Tranquil Studio**, started with `yarn start` in tranquil-client.

## Setup

- [ ] **Tranquil Studio is running.**
- [ ] **Serve the fixture pages,** in a terminal, and leave it running: pages on `localhost:8710`,
  and the same pages on `127.0.0.1:8711` for cross-site frames. Nothing is downloaded.

  ```sh
  cd ~/Documents/Tranquil/Repos/tranquil-test-suite && deno task serve:fixtures
  ```

- [ ] **Open the Runs panel:** palette, **SDK: Toggle Runs Panel**.
- [ ] To open a page: **⌘T** for a new browser tab, type the address in its address bar, press
  Enter. Each fixture page has a grey **state panel** at the bottom: the form library's own
  record of values, touched fields, errors and events, refreshed every 0.3 s.
- [ ] To run a script: **File > Open…** it, keep that editor focused, press **⌘⇧R**. Approve the
  permissions prompt the first time.

## 1. The negative control

Proves the state panel can tell a real fill from a fake one. If this fails, the other results
mean nothing.

- [ ] Open `http://localhost:8710/forms/text.html?control`.
- [ ] With the page focused, press **F12** for the page's DevTools, and in its Console run
  `__fixture.naiveWrite("#first", "Zed")`.
- [ ] The **First name** box shows Zed, but the state panel's `values` → `first` does **not**
  become `"Zed"`.
- [ ] Close the DevTools (**F12**) and the tab.

## 2. Text fields

- [ ] Open `http://localhost:8710/forms/text.html`.
- [ ] Run [`fixtures/automations/sdk-forms-text.ts`](../fixtures/automations/sdk-forms-text.ts).
- [ ] The run is **ok** in the Runs panel.
- [ ] The state panel shows `values`:
  - [ ] `email` `"ada@example.com"`, `phone` `"+1 202 555 0100"`, `location` `"Lisbon"`;
  - [ ] `account` `"A-1001"` (read-only, untouched);
  - [ ] `bio` `"This is far longer t"` (cut at its 20-character limit);
  - [ ] `first` `""`, with `errors` → `first` `"Required"` (cleared at the end).
- [ ] Every entry under `events` has `"trusted": true`.
- [ ] The run's `RESULT` line has `readonly` failing with `not_editable`, `bioTooLong` with
  `not_committed`, and `missing` with `not_found` and the candidate `{ label: "Email" }`.
- [ ] The run's output never shows `555 0100` (the phone is filled as sensitive).
- [ ] **Fill again:** run it a second time; it is **ok** again with the same values.

## 3. Grants

On the same text page:

- [ ] Run [`fixtures/automations/sdk-grants-forms.ts`](../fixtures/automations/sdk-grants-forms.ts):
  its `RESULT` has `fields` and `fill` `"ok"`, and `evaluate` containing
  `needs "// @permissions page-js"`.
- [ ] Run [`fixtures/automations/sdk-grants-tabs.ts`](../fixtures/automations/sdk-grants-tabs.ts):
  its `RESULT` has `fields` `"ok"`, and `fill` containing `needs "// @permissions forms"`.

## 4. Selects, choices, uploads, frames and the lifecycle errors

- [ ] Open five tabs:
  - `http://localhost:8710/forms/select.html`
  - `http://localhost:8710/forms/choice.html`
  - `http://localhost:8710/forms/upload.html`
  - `http://localhost:8710/forms/lifecycle.html`
  - `http://localhost:8710/forms/embed.html?frame=http%3A%2F%2F127.0.0.1%3A8711%2Fforms%2Ftext.html`
    (the text page inside a cross-site frame)
- [ ] Run [`fixtures/automations/sdk-forms-more.ts`](../fixtures/automations/sdk-forms-more.ts). It
  can take a minute or two. The run is **ok**.
- [ ] **select.html** panel: `country` `"United States"`, `sponsorship` `"No"`, `language` empty
  (filled, then cleared), `skills` `["Python"]` (a second fill replaced the set), `city`
  `"Lisbon, Somewhere"`.
- [ ] **choice.html** panel: `workStyle` `"Hybrid"`, `experience` `"3-5"`, `notice` `"One month"`,
  `channels` `["LinkedIn", "Website"]`, `authorized` `"Yes"`, `relocate` `"No"`, `consent` `true`.
- [ ] **upload.html** panel: `autofill` `[]` (the decoy stays empty), `resume` `resume.pdf:<size>`,
  `cover` `cover.txt:<size>`.
- [ ] **embed.html**: the framed text page's panel shows `first` `"Grace"` and `email`
  `"grace@example.com"`.
- [ ] **lifecycle.html** panel: `later` `"Clicked"` and `covered` `"now visible"`.
- [ ] The run's `RESULT` has `countryAmbiguous` failing with `ambiguous`, `languageMissing` with
  `no_option`, `outsideGrant` with `not_found`, `covered` with `covered`, and `stale` with
  `stale_ref`.

## 5. A live form, read-only

Never fill and never submit a live form here.

- [ ] Save this as `~/Desktop/list-fields.ts`, outside the repos:

  ```ts
  // Tranquil automation. Rules for writing and changing it: ~/.tranquil/llm/writing-automations.md
  // Lists the form fields of the web page showing beside it, without changing anything.
  // @permissions tabs
  import { tabs } from "tranquil/automation";

  const tab = await tabs.active();
  console.log(JSON.stringify(await tab.fields(), null, 1));
  ```

- [ ] Open `~/Desktop/list-fields.ts`, and a public job posting with an application form in a
  browser tab beside it (split the pane, so both show).
- [ ] With `list-fields.ts` focused, press **⌘⇧R**.
- [ ] The run's output lists one entry per field on the form, with the labels and required marks
  shown on screen, and nothing on the page changes.
- [ ] Repeat with a posting from a different job board. If the output is `[]`, the form sits in a
  frame, which `fields()` on the page doesn't read: open the frame's own address in a tab and run
  it there.
- [ ] Delete `~/Desktop/list-fields.ts`.

## Cleanup

- [ ] Stop the fixture server with ⌃C.
- [ ] If `deno.lock` shows as changed, discard it (Deno adds a `links` entry).
