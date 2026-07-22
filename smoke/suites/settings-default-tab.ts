// Settings default tab — Settings opens on the Tranquil tab, pinned first.

import { assertEquals } from "@std/assert";
import type { Cdp } from "../lib/cdp.ts";

export async function settingsTab(cdp: Cdp): Promise<void> {
  await cdp.evalInAtom(
    `atom.commands.dispatch(atom.views.getView(atom.workspace), 'settings-view:open')`,
  );
  await cdp.waitFor(`!!document.querySelector('.settings-view')`);

  const info = await cdp.waitFor<{ active: string; first: string }>(`(() => {
    const sv = document.querySelector('.settings-view');
    if (!sv) return null;
    const active = sv.querySelector('.panels-menu .active, .nav .active, li.active');
    const items = [...sv.querySelectorAll('.panels-menu li, .nav li')]
      .map(li => (li.textContent || '').trim()).filter(Boolean);
    if (!active || !items.length) return null;
    return { active: (active.textContent || '').trim(), first: items[0] };
  })()`);

  assertEquals(
    info.active,
    "Tranquil",
    "Settings should open on the Tranquil tab",
  );
  assertEquals(
    info.first,
    "Tranquil",
    "Tranquil should be pinned first in the menu",
  );
}
