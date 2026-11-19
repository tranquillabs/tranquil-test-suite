# Manual tests: the run contract (`fix/run-contract`)

What to try by hand before branch 2 is committed: the run's environment (`deno/run-env.ts`), the
config folder taken from Pulsar, and the typed run states. Delivery note: www-tranquil
`drafts/notes/page-isolation-notes`.

Everything here is in **Tranquil Studio**, started with `yarn start` in tranquil-client.

## Setup

- [ ] **Restart Tranquil Studio** (two main-process files changed): press **⌘Q** in it, then start
  it again

  ```sh
  cd ~/Documents/Tranquil/Repos/tranquil-client && source ~/.nvm/nvm.sh && nvm use && yarn start
  ```

- [ ] **Serve the test suite's form pages** on `localhost:8710`, in a second terminal, and leave it
  running. Everything it needs is already in Deno's cache, so nothing is downloaded.

  ```sh
  cd ~/Documents/Tranquil/Repos/tranquil-test-suite && deno task serve:fixtures
  ```

- [ ] **Open the form page:** in Tranquil Studio press **⌘T** for a new browser tab, type
  `http://localhost:8710/forms/guards.html` in its address bar and press Enter. It shows a **Name**
  field, **Continue** and **Submit application** buttons, and "Ready to **apply**".
- [ ] **Open the Runs panel:** palette, **SDK: Toggle Runs Panel**.

## 1. Sites and grants

Covers `sites=`, the grants, the CDP port and the RPC address, all now read through `runEnv`.

- [ ] **File > Open…** [`fixtures/automations/sdk-guards.ts`](../fixtures/automations/sdk-guards.ts).
- [ ] With that editor focused, press **⌘⇧R**. Approve the permissions prompt if one appears.
- [ ] The Name field on the page now reads **Ada**.
- [ ] A question notification appears and goes away by itself after about 1.5 seconds.
- [ ] In the Runs panel the run is **ok**, and its output ends with a `RESULT {…}` line containing:
  - [ ] `"status":"Ready to apply"`
  - [ ] `pressEnter` starting `not_permitted: press("Enter") would have submitted the form`
  - [ ] `clickSubmitNamed` containing `looks like it sends the form`
  - [ ] `gotoElsewhere` containing `may act only on localhost` (this one is `sites=` being read)
  - [ ] `"confirm":false`

## 2. The parts check, on and off

Covers `TRANQUIL_CHECK_PARTS`, which used to read as "not a check" when it went missing.

- [ ] Reload the form page to clear Name: the tab's refresh button.
- [ ] **File > Open…**
  [`fixtures/automations/sdk-guards-check.ts`](../fixtures/automations/sdk-guards-check.ts).
- [ ] With that editor focused, run **SDK: Check Custom Parts** from the palette:
  - [ ] the Name field **stays empty**;
  - [ ] the run's output ends with `RESULT {"reachedTheEnd":true}`;
  - [ ] its action log shows the fill as **checked**.
- [ ] In the same editor press **⌘⇧R** for a normal run: the Name field now reads
  **Checked, not typed**.

## 3. Workbook labels and colors

Covers the typed run states: the labels, the tones, and the state read back from the file.

- [ ] **File > Open…**
  [`fixtures/workbooks/sample.workbook.md`](../fixtures/workbooks/sample.workbook.md). It opens as a
  rendered workbook.
- [ ] **Run** on step 1, "A step that needs no permissions": its output shows **ok** in green and
  `hello from a workbook step`.
- [ ] **Run** on step 4, "A step that fails": its output shows **failed** in red and
  `This step fails on purpose`.
- [ ] Afterwards, discard the outputs this wrote into `sample.workbook.md` (Source Control).

## 4. Breakpoints stay put

Covers tranquil-debug's breakpoints file, now in the config folder Pulsar names.

- [ ] **File > Open…**
  [`fixtures/workbooks/scripts/hello.ts`](../fixtures/workbooks/scripts/hello.ts).
- [ ] Put the cursor on line 4 (`console.log(…)`) and press **F9**: a breakpoint dot appears in the
  gutter.
- [ ] **Window: Reload** (⌃⌥⌘L): the dot is still on line 4.
- [ ] In a terminal, `cat ~/.tranquil/debug/breakpoints.json` lists `hello.ts` with `"row": 3`
  (rows count from 0).
- [ ] With `hello.ts` focused, palette **Debug: Debug Automation**: the run stops on line 4. Press
  **F5** (Continue) and it finishes **ok**.
- [ ] Press **F9** on line 4 again to remove the breakpoint.

## 5. User guides copied on start

Covers `ATOM_HOME` read in the main process with no fallback. The app writes a guide only when
the copy differs from the app's, so an unchanged copy keeps its old time: remove it first.

- [ ] Quit Tranquil Studio: **⌘Q**.
- [ ] In a terminal, `rm ~/.tranquil/llm/writing-automations.md`.
- [ ] Start Tranquil Studio again:

  ```sh
  cd ~/Documents/Tranquil/Repos/tranquil-client && source ~/.nvm/nvm.sh && nvm use && yarn start
  ```

- [ ] `ls -l ~/.tranquil/llm/` lists `writing-automations.md` again, with the time you started it.
- [ ] The `yarn start` terminal has no `[user-guides] could not publish the user guides` line.

## Cleanup

- [ ] Stop the fixture server with ⌃C.
- [ ] If `deno.lock` shows as changed, discard it (Deno adds a `links` entry).
