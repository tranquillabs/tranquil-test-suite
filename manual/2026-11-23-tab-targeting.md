# Manual tests: tab targeting (`03a-book/tab-targeting`)

What to try by hand before branch 3a is committed. `tabs.active()` now acts on the page the
person meant, decided when the run starts: the browser tab with focus, else the one web page
showing in a pane. No web page showing, or two, fails with a message; it no longer falls back to
whichever tab was in front last. Triggers (what started a run) are built and read in one module.
Plan: `~/Documents/Tranquil/Plans/2026-11-23-workbooks-step-3.md`, branch 3a.

Everything here is in **Tranquil Studio**, started with `yarn start` in tranquil-client.

## Setup

- [ ] **Window: Reload** (⌃⌥⌘L), so the changed package code loads.
- [ ] **File > Open…**
  `~/Documents/Tranquil/Repos/tranquil-examples/count-elements/count-elements.ts`. It notifies
  "This page has N paragraph(s)." for the page it acts on.
- [ ] **Open the Runs panel:** palette, **SDK: Toggle Runs Panel**.

## 1. The page beside the script

- [ ] Press **⌘T** for a new browser tab and go to `https://example.com`.
- [ ] With that tab active, palette **Pane: Split Right And Move Active Item**: example.com moves
  to a pane on the right, and `count-elements.ts` shows on the left.
- [ ] Click into `count-elements.ts` and press **⌘⇧R**. Approve the permissions prompt if one
  appears.
- [ ] A notification says **This page has 2 paragraph(s).** (example.com's).

## 2. No page showing

- [ ] Drag the example.com tab onto `count-elements.ts`'s tab bar, so both are in one pane, then
  click the `count-elements.ts` tab: the page is hidden behind it.
- [ ] Press **⌘⇧R**.
- [ ] No notification. In the Runs panel the run **failed**, and its output says
  `tabs.active(): no web page was showing when the run started.` and names `tabs.find(url)` and
  `tabs.open(url)`. Before this branch it acted on example.com anyway, because that tab had been in
  front last.

## 3. Two pages showing

- [ ] Put example.com back on the right: click its tab, palette **Pane: Split Right And Move
  Active Item**.
- [ ] Click into example.com's pane, press **⌘T** and go to `https://www.iana.org/`, then palette
  **Pane: Split Right And Move Active Item** again: three panes, the script, example.com and
  iana.org.
- [ ] Click into `count-elements.ts` and press **⌘⇧R**.
- [ ] The run **failed**, and its output says `tabs.active(): 2 web pages were showing when the run
  started, so it isn't clear which one.`

## 4. A focused page wins

- [ ] With `count-elements.ts` active, palette **SDK: Register Current File**: a notice says
  **Registered: Automation: Count Elements**.
- [ ] Click inside the iana.org page, then palette **Automation: Count Elements**.
- [ ] The notification counts **iana.org**'s paragraphs (more than 2), not example.com's: the
  focused page wins over the other one showing.
- [ ] In the Runs panel, that run's trigger reads **Count Elements**; the earlier ⌘⇧R runs read
  **manual**.
- [ ] Unregister it: with `count-elements.ts` active, palette **SDK: Unregister Current File**.

## 5. Map Custom Parts on the focused page

- [ ] In a terminal, `cd ~/Documents/Tranquil/Repos/tranquil-test-suite && deno task
  serve:fixtures`, and leave it running.
- [ ] In the iana.org tab, go to `http://localhost:8710/forms/select.html?parts`, and click inside
  the page.
- [ ] Palette **SDK: Map Custom Parts**: it drafts a custom parts map for that page's form and opens
  it in a new editor, as before this branch.
- [ ] Stop the fixture server with ⌃C. If `deno.lock` shows as changed, discard it.

## 6. A debug run's label

- [ ] Click into `count-elements.ts` (example.com showing beside it, after closing the third pane
  if it's still open) and palette **Debug: Debug Automation**.
- [ ] It runs as before, and its Runs panel trigger reads **debug**.

## Cleanup

- [ ] Close the extra browser tabs and panes.
