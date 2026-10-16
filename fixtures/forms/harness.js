// Shared fixture harness. Every form fixture page imports this.
//
// It records each input-ish event with its isTrusted flag, publishes the page's FRAMEWORK
// state (not DOM state) as window.__fixture.state(), and offers a negative control: a naive
// synthetic write that must NOT register in that state. If the control registers, the fixture
// cannot tell a broken fill from a working one, and its other results are void.
const events = [];
for (const type of ["beforeinput", "input", "change", "focusin", "focusout", "click"]) {
  document.addEventListener(type, (e) => {
    events.push({ type, target: e.target.id || e.target.name || e.target.tagName, trusted: e.isTrusted });
  }, true);
}

let stateFn = () => ({});
export function publishState(fn) {
  stateFn = fn;
}

export function installFixture() {
  window.__fixture = {
    state: () => ({ ...stateFn(), events: events.slice() }),
    clearEvents: () => void (events.length = 0),
    // What the job-search scripts did before ADR-0026: assign, then dispatch an untrusted event.
    naiveWrite(selector, value) {
      const el = document.querySelector(selector);
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
  };
  const panel = document.getElementById("fixture-state");
  if (panel) {
    const render = () => (panel.textContent = JSON.stringify(window.__fixture.state(), null, 1));
    setInterval(render, 300);
  }
  // Inside a frame, report state to the embedding page (the test can only read the top page).
  if (window.parent !== window) {
    setInterval(() => window.parent.postMessage({ fixtureState: window.__fixture.state() }, "*"), 200);
  }
}

// On an embedding page: keep the latest state any child frame reported.
window.addEventListener("message", (e) => {
  if (e.data && e.data.fixtureState) window.__frameState = e.data.fixtureState;
});
