// A dropdown widget for the select fixture page, modelled on react-select 5.8 with
// `classNamePrefix: "select"`, a widget many application forms use. The SDK's tests depend on its
// markup and behaviour, so this keeps both:
//  - The class names, nesting and ARIA attributes, so the custom parts map (automations/parts.ts)
//    and SDK: Map Custom Parts find the same parts.
//  - The chosen value shown in its own element, outside the input, where web standards don't say,
//    so a fill without a map can't see what it chose.
//  - The input's size and place: a few pixels wide when searchable, and moved off screen when not,
//    so only a map's `open` part can be pressed to open a non-searchable one.
//  - Opening on a press of the control, filtering as you type, choosing with a click or Enter,
//    the clear button, multi-select chips, and options loaded asynchronously with "Loading..."
//    meanwhile.
// DOM nodes are reused between redraws, as React reuses them, so a click whose press and release
// straddle a redraw still lands on one element. Changes and blurs go to the page's form (form.js),
// as react-select reports them to its Controller.
import { watchChanges } from "./form.js";

const DOWN =
  "M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z";
const CROSS =
  "M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z";
// Inline styles for the elements react-select styles without a prefixed class.
const CONTAINER = "position: relative; box-sizing: border-box;";
const A11Y_TEXT =
  "z-index: 9999; border: 0; clip: rect(1px, 1px, 1px, 1px); height: 1px; width: 1px; position: absolute; overflow: hidden; padding: 0; white-space: nowrap;";
const INPUT = (hidden) =>
  `color: inherit; background: 0 center; opacity: ${hidden ? 0 : 1}; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0; margin: 0; outline: 0; padding: 0;`;
const DUMMY_INPUT =
  "background: 0; border: 0; caret-color: transparent; font-size: inherit; grid-area: 1 / 1 / 2 / 3; outline: 0; padding: 0; width: 1px; color: transparent; left: -100px; opacity: 0; position: relative; transform: scale(.01);";

let instances = 0;

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function icon(d, size = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ height: size, width: size, viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" })) {
    svg.setAttribute(k, String(v));
  }
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

const classes = (...names) => names.filter(Boolean).join(" ");

/** Make `parent`'s children exactly `kids`, touching nothing when they already are. */
function sync(parent, kids) {
  const have = [...parent.children];
  if (have.length === kids.length && kids.every((k, i) => have[i] === k)) return;
  parent.replaceChildren(...kids);
}

/**
 * A dropdown. Returns its outermost element, for the page to place. `options` are
 * `{ value, label }`; with `loadOptions(text)` instead, options come from that promise as the
 * person types.
 */
export function dropdown({
  inputId,
  labelledBy,
  name,
  options = [],
  isSearchable = true,
  isMulti = false,
  isClearable = isMulti,
  loadOptions = null,
  cacheOptions = false,
  placeholder = "Select...",
  onChange = () => {},
  onBlur = () => {},
}) {
  const id = `react-select-${++instances}`;

  let value = isMulti ? [] : null;
  let inputValue = "";
  let menuIsOpen = false;
  let isFocused = false;
  let focused = null; // the option the keyboard would choose
  let inputHidden = false; // after a single choice, the input hides until the next edit
  let openAfterFocus = false;
  let announcement = "";
  // Asynchronous options.
  let isLoading = false;
  let loadedFor = "";
  let loaded = [];
  let passEmpty = false;
  let lastRequest = null;
  const cache = new Map();

  const chosen = () => (isMulti ? value : value ? [value] : []);
  const hasValue = () => chosen().length > 0;
  const same = (a, b) => a && b && a.value === b.value;
  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  /** The options the open menu lists: filtered by what was typed, without those already chosen. */
  function menuOptions() {
    const all = loadOptions
      ? passEmpty ? [] : inputValue && loadedFor ? loaded : []
      : options.filter((o) => fold(`${o.label} ${o.value}`).includes(fold(inputValue)));
    return isMulti ? all.filter((o) => !value.some((v) => same(v, o))) : all;
  }

  // ---- the elements, made once ----

  const live = h("span", { id: `${id}-live-region`, style: A11Y_TEXT });
  const log = h("span", { "aria-live": "polite", "aria-atomic": "false", "aria-relevant": "additions text", role: "log", style: A11Y_TEXT });
  const placeholderEl = h("div", { class: "select__placeholder", id: `${id}-placeholder` }, placeholder);
  const singleValue = h("div", { class: "select__single-value" });
  const input = isSearchable
    ? h("input", {
      class: "select__input",
      style: INPUT(false),
      autocapitalize: "none",
      autocomplete: "off",
      autocorrect: "off",
      id: inputId,
      spellcheck: "false",
      tabindex: "0",
      type: "text",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-haspopup": "true",
      "aria-labelledby": labelledBy,
      role: "combobox",
    })
    : h("input", {
      id: inputId,
      inputmode: "none",
      tabindex: "0",
      "aria-readonly": "true",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-haspopup": "true",
      "aria-labelledby": labelledBy,
      role: "combobox",
      style: DUMMY_INPUT,
    });
  const inputBox = isSearchable ? h("div", { class: "select__input-container", "data-value": "" }, input) : input;
  const valueContainer = h("div", { class: "select__value-container" }, inputBox);
  const clearIndicator = h("div", { class: "select__indicator select__clear-indicator", "aria-hidden": "true" }, icon(CROSS));
  const loadingIndicator = h("div", { class: "select__indicator select__loading-indicator", "aria-hidden": "true" }, h("span"), h("span"), h("span"));
  const separator = h("span", { class: "select__indicator-separator" });
  const dropdownIndicator = h("div", { class: "select__indicator select__dropdown-indicator", "aria-hidden": "true" }, icon(DOWN));
  const indicators = h("div", { class: "select__indicators" });
  const control = h("div", { class: "select__control" }, valueContainer, indicators);
  const menuList = h("div", { role: "listbox", id: `${id}-listbox` });
  const menu = h("div", { class: "select__menu" }, menuList);
  const notice = h("div");
  const container = h("div", { style: CONTAINER }, live, log, control);

  const optionNodes = new Map(); // option value -> its element, reused while it's listed
  const optionOf = new WeakMap(); // element -> the option it shows now
  const chipNodes = new Map(); // value -> its chip
  let formFields = [];

  function optionNode(o, index) {
    let node = optionNodes.get(o.value);
    if (!node) {
      node = h("div", { "aria-disabled": "false", tabindex: "-1", role: "option" });
      const hover = () => {
        if (!same(focused, optionOf.get(node))) {
          focused = optionOf.get(node);
          render();
        }
      };
      node.addEventListener("mousemove", hover);
      node.addEventListener("mouseover", hover);
      node.addEventListener("click", () => selectOption(optionOf.get(node)));
      optionNodes.set(o.value, node);
    }
    optionOf.set(node, o);
    node.textContent = o.label;
    node.id = `${id}-option-${index}`;
    const isSelected = chosen().some((v) => same(v, o));
    node.className = classes("select__option", same(focused, o) && "select__option--is-focused", isSelected && "select__option--is-selected");
    node.setAttribute("aria-selected", String(isSelected));
    return node;
  }

  function chip(o) {
    let node = chipNodes.get(o.value);
    if (!node) {
      const remove = h("div", { role: "button", class: "select__multi-value__remove", "aria-label": `Remove ${o.label}` }, icon(CROSS, 14));
      remove.addEventListener("mousedown", (e) => e.preventDefault());
      remove.addEventListener("click", () => removeValue(o));
      node = h("div", { class: "select__multi-value" }, h("div", { class: "select__multi-value__label" }, o.label), remove);
      chipNodes.set(o.value, node);
    }
    return node;
  }

  // ---- drawing ----

  function render() {
    const listed = menuOptions();
    if (menuIsOpen && !listed.some((o) => same(o, focused))) focused = listed[0] ?? null;

    // The value, shown before the input; the input itself is never moved, so it keeps focus.
    let shown = [];
    if (!hasValue()) shown = inputValue ? [] : [placeholderEl];
    else if (isMulti) shown = value.map(chip);
    else if (!inputValue) {
      singleValue.textContent = value.label;
      shown = [singleValue];
    }
    for (const c of [...valueContainer.children]) if (c !== inputBox && !shown.includes(c)) c.remove();
    for (const c of shown) inputBox.before(c);
    for (const [key, node] of chipNodes) if (!shown.includes(node)) chipNodes.delete(key);
    valueContainer.className = classes(
      "select__value-container",
      isMulti && "select__value-container--is-multi",
      hasValue() && "select__value-container--has-value",
    );

    if (isSearchable) {
      if (input.value !== inputValue) input.value = inputValue;
      inputBox.dataset.value = inputValue;
      inputBox.style.transform = inputValue ? "translateZ(0)" : "";
      input.style.opacity = inputHidden ? "0" : "1";
    }
    input.setAttribute("aria-expanded", String(menuIsOpen));
    input.setAttribute("aria-activedescendant", menuIsOpen && focused ? optionNode(focused, idx(focused)).id : "");
    if (menuIsOpen) input.setAttribute("aria-controls", `${id}-listbox`);
    else input.removeAttribute("aria-controls");
    if (hasValue()) input.removeAttribute("aria-describedby");
    else input.setAttribute("aria-describedby", `${id}-placeholder`);

    control.className = classes(
      "select__control",
      isFocused && "select__control--is-focused",
      menuIsOpen && "select__control--menu-is-open",
    );
    sync(indicators, [
      isClearable && hasValue() && !isLoading ? clearIndicator : null,
      isLoading ? loadingIndicator : null,
      separator,
      dropdownIndicator,
    ].filter(Boolean));

    if (menuIsOpen) {
      menuList.className = classes("select__menu-list", isMulti && "select__menu-list--is-multi");
      menuList.setAttribute("aria-multiselectable", String(isMulti));
      if (listed.length) sync(menuList, listed.map((o) => optionNode(o, idx(o))));
      else {
        notice.className = classes("select__menu-notice", isLoading ? "select__menu-notice--loading" : "select__menu-notice--no-options");
        notice.textContent = isLoading ? "Loading..." : "No options";
        sync(menuList, [notice]);
      }
      if (!menu.isConnected) control.after(menu);
    } else menu.remove();

    // The values a form submission would send, as hidden inputs.
    for (const f of formFields) f.remove();
    if (name) {
      const field = (v) => h("input", { name, type: "hidden", value: v });
      formFields = isMulti ? (value.length ? value.map((o) => field(o.value)) : [field("")]) : [field(value ? value.value : "")];
      container.append(...formFields);
    }

    live.textContent = "";
    log.textContent = isFocused ? announcement : "";
  }

  /** An option's place in the full list, for its id. */
  function idx(o) {
    const all = loadOptions ? loaded : options;
    return Math.max(0, all.findIndex((x) => same(x, o)));
  }

  // ---- what the person does ----

  function setInput(text) {
    inputValue = text;
    if (!loadOptions) return;
    if (!text) {
      lastRequest = null;
      loadedFor = "";
      loaded = [];
      isLoading = false;
      passEmpty = false;
      return;
    }
    if (cacheOptions && cache.has(text)) {
      loadedFor = text;
      loaded = cache.get(text);
      isLoading = false;
      passEmpty = false;
      return;
    }
    const request = (lastRequest = {});
    isLoading = true;
    passEmpty = !loadedFor;
    Promise.resolve(loadOptions(text)).then((got) => {
      if (request !== lastRequest) return; // a later keystroke asked again
      lastRequest = null;
      isLoading = false;
      loadedFor = text;
      loaded = got ?? [];
      passEmpty = false;
      if (cacheOptions) cache.set(text, loaded);
      render();
    });
  }

  function openMenu(which) {
    const listed = menuOptions();
    let at = which === "first" ? 0 : listed.length - 1;
    if (!isMulti && value) {
      const i = listed.findIndex((o) => same(o, value));
      if (i > -1) at = i;
    }
    inputHidden = false;
    focused = listed[at] ?? null;
    menuIsOpen = true;
    render();
  }

  function closeMenu() {
    setInput("");
    menuIsOpen = false;
    focused = null;
    render();
  }

  function change(next, message) {
    value = next;
    announcement = message;
    onChange(value);
  }

  function selectOption(o) {
    const deselect = isMulti && value.some((v) => same(v, o));
    const next = deselect ? value.filter((v) => !same(v, o)) : isMulti ? [...value, o] : o;
    // The input empties and the menu closes on every choice, as react-select's closeMenuOnSelect.
    setInput("");
    inputHidden = !isMulti;
    menuIsOpen = false;
    focused = null;
    change(next, `option ${o.label}, ${deselect ? "deselected" : "selected"}.`);
    render();
  }

  function clearValue() {
    change(isMulti ? [] : null, "All selected options have been cleared.");
    render();
  }

  function removeValue(o) {
    change(isMulti ? value.filter((v) => !same(v, o)) : null, `option ${o.label}, deselected.`);
    render();
    input.focus();
  }

  function popValue() {
    const last = value[value.length - 1];
    change(value.slice(0, -1), last ? `option ${last.label}, deselected.` : "");
    render();
  }

  function moveFocus(step) {
    const listed = menuOptions();
    if (!listed.length) return;
    const i = listed.findIndex((o) => same(o, focused));
    focused = listed[(i + step + listed.length) % listed.length];
    render();
  }

  control.addEventListener("mousedown", (e) => {
    if (e.defaultPrevented) return; // an indicator or a chip's remove button handled it
    const onInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
    if (!isFocused) {
      openAfterFocus = true;
      input.focus();
    } else if (!menuIsOpen) openMenu("first");
    else if (!onInput) closeMenu();
    if (!onInput) e.preventDefault();
  });

  dropdownIndicator.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    input.focus();
    if (menuIsOpen) {
      inputHidden = !isMulti;
      closeMenu();
    } else openMenu("first");
    e.preventDefault();
  });

  clearIndicator.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    clearValue();
    e.preventDefault();
    openAfterFocus = false;
    setTimeout(() => input.focus());
  });

  // Pressing in the menu keeps focus in the input, so choosing an option doesn't blur the field.
  menu.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    input.focus();
  });

  input.addEventListener("focus", () => {
    inputHidden = false;
    isFocused = true;
    const open = openAfterFocus;
    openAfterFocus = false;
    if (open) openMenu("first");
    else render();
  });

  input.addEventListener("blur", () => {
    if (menu.contains(document.activeElement)) return input.focus();
    onBlur();
    setInput("");
    menuIsOpen = false;
    focused = null;
    isFocused = false;
    announcement = "";
    render();
  });

  if (isSearchable) {
    watchChanges(input, () => {
      inputHidden = false;
      setInput(input.value);
      menuIsOpen = true;
      render();
    });
  } else {
    // The stand-in input of a non-searchable dropdown always holds nothing.
    input.addEventListener("input", () => (input.value = ""));
  }

  container.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "Delete":
      case "Backspace":
        if (inputValue) return;
        if (isMulti) popValue();
        else if (isClearable) clearValue();
        break;
      case "Tab":
        if (e.shiftKey || !menuIsOpen || !focused) return;
        selectOption(focused);
        break;
      case "Enter":
        if (!menuIsOpen || !focused) return;
        selectOption(focused);
        break;
      case "Escape":
        if (!menuIsOpen) return;
        inputHidden = false;
        closeMenu();
        break;
      case " ":
        if (inputValue) return;
        if (!menuIsOpen) openMenu("first");
        else if (focused) selectOption(focused);
        else return;
        break;
      case "ArrowUp":
        if (menuIsOpen) moveFocus(-1);
        else openMenu("last");
        break;
      case "ArrowDown":
        if (menuIsOpen) moveFocus(1);
        else openMenu("first");
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  render();
  return container;
}
