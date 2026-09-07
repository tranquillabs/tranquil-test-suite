// Fixture for the main-thread performance suite.
//
// Prints far more than the Runs panel's 64 KB ring buffer holds, in many small writes, so the
// panel sees a burst of `did-update` events (one per stdout chunk) and the buffer truncates from
// the front at least once. Both paths matter: the panel appends the delta while the output only
// grows, and must fall back to a full replace once truncation means the old text is no longer a
// prefix of the new.
//
// `none` because it only prints — no browser, no files, so it never prompts for consent.
// @permissions none

const LINES = 2400;
const PAD = "-".repeat(40);

for (let i = 1; i <= LINES; i++) {
  console.log(`line ${String(i).padStart(4, "0")} ${PAD}`);
}
