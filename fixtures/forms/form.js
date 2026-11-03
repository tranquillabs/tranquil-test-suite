// A form library in miniature, for the fixture pages. It stands in for the React form libraries
// real application forms use, and keeps the behaviour the SDK's tests depend on:
//  - A field's change counts only when its value really changed since the library last saw it,
//    as React's value tracking does. A script that assigns `el.value` and then dispatches an input
//    event is ignored (the harness's negative control). Typing, a value set through the element's
//    native setter, and a click that toggles a box all count.
//  - Changes are read from the events React listens to: `input` for text, `click` for checkboxes
//    and radios, `change` for selects and file inputs.
//  - Values, touched fields and errors live in the library, not the page, as in react-hook-form's
//    "onTouched" mode: a field is validated on its first blur and on every change after that.

const resyncs = new WeakMap(); // element -> re-read its value without counting a change

/** Call `onChange` for each real change to `el`, the way React decides there was one. */
export function watchChanges(el, onChange) {
  if (el.tagName === "SELECT" || el.type === "file") {
    el.addEventListener("change", onChange);
    return;
  }
  const checkable = el.type === "checkbox" || el.type === "radio";
  const prop = checkable ? "checked" : "value";
  const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), prop);
  const read = () => String(native.get.call(el));
  let last = read();
  // A value assigned from script is recorded here, so the event that follows shows no change.
  Object.defineProperty(el, prop, {
    configurable: true,
    get() {
      return native.get.call(this);
    },
    set(v) {
      native.set.call(this, v);
      last = read();
    },
  });
  resyncs.set(el, () => (last = read()));
  for (const type of checkable ? ["click"] : ["input", "change"]) {
    el.addEventListener(type, (e) => {
      const now = read();
      if (now === last) return;
      last = now;
      // Choosing a radio clears the others in its group; they re-read, so they stay in step.
      if (el.type === "radio" && el.name) {
        for (const other of document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)) {
          resyncs.get(other)?.();
        }
      }
      onChange(e);
    });
  }
}

/** A registered field's value, read from its elements as react-hook-form reads them. */
function read(els) {
  const [first] = els;
  if (first.type === "radio") return els.find((el) => el.checked)?.value ?? null;
  if (first.type === "checkbox") {
    if (els.length > 1) return els.filter((el) => el.checked).map((el) => el.value);
    return first.hasAttribute("value") ? (first.checked ? first.value : false) : first.checked;
  }
  return first.value;
}

function write(els, value) {
  for (const el of els) {
    if (el.type === "radio") el.checked = el.value === value;
    else if (el.type === "checkbox") el.checked = Array.isArray(value) ? value.includes(el.value) : Boolean(value);
    else el.value = value;
  }
}

/**
 * A form's state: its values, touched fields and errors. `onUpdate` runs after every change and
 * blur, so the page can redraw its errors.
 */
export function createForm({ defaultValues = {}, onUpdate = () => {} } = {}) {
  const values = {};
  const rulesOf = {};
  const touched = new Set();
  const errors = {};

  function validate(name) {
    const rules = rulesOf[name];
    const v = values[name];
    const empty = v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
    let message;
    if (empty) message = rules.required;
    else if (rules.minLength && String(v).length < rules.minLength.value) message = rules.minLength.message;
    else if (rules.pattern && !rules.pattern.value.test(String(v))) message = rules.pattern.message;
    if (message) errors[name] = message;
    else delete errors[name];
  }
  function changed(name, value) {
    values[name] = value;
    if (touched.has(name)) validate(name);
    onUpdate();
  }
  function blurred(name) {
    touched.add(name);
    validate(name);
    onUpdate();
  }

  return {
    /** A field the page draws itself: an input, a textarea, a select, or a group sharing a name. */
    register(name, els, rules = {}) {
      const list = Array.isArray(els) ? els : [els];
      rulesOf[name] = rules;
      for (const el of list) {
        watchChanges(el, () => changed(name, read(list)));
        el.addEventListener("focusout", () => blurred(name));
      }
      if (name in defaultValues) write(list, defaultValues[name]);
      values[name] = name in defaultValues ? defaultValues[name] : read(list);
    },
    /** A field a widget draws, which reports its own changes and blurs (a Controller's field). */
    control(name, rules = {}) {
      rulesOf[name] = rules;
      values[name] = defaultValues[name];
      return { onChange: (v) => changed(name, v), onBlur: () => blurred(name) };
    },
    errorOf: (name) => errors[name],
    state: () => ({ values: { ...values }, touched: [...touched].sort(), errors: { ...errors } }),
  };
}

/** The error under a field, as the form pages draw it: there only while there is one. */
export function errorSlot(after, id) {
  const node = document.createElement("div");
  node.className = "error";
  if (id) node.id = id;
  node.setAttribute("role", "alert");
  return (message) => {
    if (!message) return node.remove();
    node.textContent = message;
    if (!node.isConnected) after.after(node);
  };
}
