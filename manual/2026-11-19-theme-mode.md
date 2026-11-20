# Manual tests: theme mode (`fix/theme-mode`)

What to try by hand before branch 3 is committed. Whether the theme is light or dark is now one
rule, `themeMode()` in tranquil-browser `lib/theme-mode.js`: light when the active **UI** theme's
name contains "light"; syntax themes never count. Three things follow it, and before this branch
each decided on its own:

- **the window color** (tranquil-window-color), which took its light shade whenever any theme's
  name, syntax themes included, contained "light";
- **the browser's start page** (tranquil-browser);
- **the workbook view** (tranquil-automations), which went by the background's brightness.

Everything here is in **Tranquil Studio**, started with `yarn start` in tranquil-client. The theme
pickers are in **Settings View: Change Themes** (palette): **UI Theme** and **Syntax Theme**.

## Setup

- [ ] **Window: Reload** (⌃⌥⌘L), so the changed packages load.
- [ ] Note your current UI and syntax themes, to set them back at the end. The defaults are
  **Tranquil Business Dark** and **One Dark**.
- [ ] **Give the window a color:** menu bar, **Window > Window Color > Blue**. The top strip, the
  active tab and the status bar take a blue accent.
- [ ] **Open a start page:** **⌘T**. Leave the tab open.
- [ ] **Open a workbook:** **File > Open…**
  [`fixtures/workbooks/sample.workbook.md`](../fixtures/workbooks/sample.workbook.md). Leave it open
  beside the start page.

## 1. Dark UI, dark syntax

- [ ] Themes: UI **Tranquil Business Dark**, syntax **One Dark**.
- [ ] The window accent is the **light blue** (`#78A4FF`), the dark theme's shade.
- [ ] The start page is **dark**.
- [ ] The workbook is **dark**: dark background, light text, and its buttons and scrollbars dark.
- [ ] Open step 1's **▸ source**: the code block is **dark**, with light text.

## 2. Dark UI, light syntax (the case that disagreed)

- [ ] Change only the syntax theme to **One Light**.
- [ ] The window accent stays the **light blue** (`#78A4FF`). Before this branch it switched to the
  deep blue.
- [ ] The start page stays **dark** after **⌘T** opens another one.
- [ ] The workbook stays **dark**.

## 3. Light UI

- [ ] Change the UI theme to **Tranquil Business Light** (syntax theme either way).
- [ ] The window accent switches to the **deep blue** (`#155DFF`), without a reload.
- [ ] A new start page (**⌘T**) is **light**.
- [ ] The workbook switches to **light**, without a reload: light background, dark text, light
  buttons and scrollbars.
- [ ] Step 1's source code block is **light** too, with dark text, not near-black. Before this
  branch every code block was near-black in both themes (Skeleton's own `pre` style).

## Cleanup

- [ ] Set the UI and syntax themes back to the ones you noted.
- [ ] Remove the window color if you don't want it: **Window > Window Color > Clear Color**.
- [ ] Close the extra start pages and the workbook. If the workbook wrote anything into
  `sample.workbook.md`, discard it in Source Control.
