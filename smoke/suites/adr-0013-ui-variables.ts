// ADR-0013 — business-theme ui-variables resolve to dark values (not the light
// fallback), and the global `button{…!important}` rule was removed.

import { assert } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

function parseRgb(s: string): [number, number, number] {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  assert(m, `could not parse rgb from "${s}"`);
  return [Number(m![1]), Number(m![2]), Number(m![3])];
}

export async function adr0013(cdp: Cdp): Promise<void> {
  // 1. The fixed fixture config pins the business-dark theme.
  const theme = await cdp.evalInAtom<string>(
    `atom.config.get('core.themes')[0]`,
  );
  assert(
    theme === "tranquil-business-dark",
    `expected tranquil-business-dark, got ${theme}`,
  );

  // 2. ui-variables resolve to business (dark) values: dark background, light
  //    text. The old light fallback (#fff bg / #333 text) would flip these.
  const colors = await cdp.evalInAtom<{ color: string; bg: string }>(`(() => {
    const cs = getComputedStyle(document.querySelector('atom-workspace'));
    return { color: cs.color, bg: cs.backgroundColor };
  })()`);
  const [tr, tg, tb] = parseRgb(colors.color);
  const [br, bg, bb] = parseRgb(colors.bg);
  assert(
    br < 60 && bg < 60 && bb < 60,
    `workspace background should be dark, got ${colors.bg}`,
  );
  assert(
    tr > 180 && tg > 180 && tb > 180,
    `workspace text should be light, got ${colors.color}`,
  );

  // 3. No loaded stylesheet forces `button { background: … !important }`.
  const forced = await cdp.evalInAtom<boolean>(`(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of rules) {
        if (r.selectorText && /(^|,|\\s)button(\\s|,|$)/.test(r.selectorText) &&
            r.style && r.style.getPropertyPriority('background') === 'important') {
          return true;
        }
      }
    }
    return false;
  })()`);
  assert(!forced, "no button{ background:…!important } rule should be loaded");
}
