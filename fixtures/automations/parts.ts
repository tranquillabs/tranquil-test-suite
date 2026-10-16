// The custom parts map for the select fixture page (fixtures/forms/select.html), written by hand.
// Its dropdowns keep their chosen value, the control that opens them and their clear button where
// web standards don't say, so the default verbs need this map to drive them. It's an ordinary
// module of the script author's own, imported by the fixtures that fill that page; each declares
// `read=parts.ts`, as any script that imports a module of its own does.
import type { CustomPartsMap } from "tranquil/automation";

export const customParts: CustomPartsMap = {
  value: ".select__single-value",
  values: ".select__multi-value__label",
  multiple: ".select__value-container--is-multi",
  open: ".select__control",
  clear: ".select__clear-indicator",
};
