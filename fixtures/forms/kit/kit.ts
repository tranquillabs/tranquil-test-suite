// Entry for the vendored fixture kit: the real libraries the form fixtures are built on.
// Rebuild with `deno task vendor:forms`; the output (fixtures/forms/vendor/kit.js) is committed
// so the suite runs offline. Versions are pinned here and nowhere else.
import * as React from "npm:react@18.3.1";
import { createRoot } from "npm:react-dom@18.3.1/client";
import { Controller, useForm } from "npm:react-hook-form@7.53.0";
import Select from "npm:react-select@5.8.0";
import AsyncSelect from "npm:react-select@5.8.0/async";

export { AsyncSelect, Controller, createRoot, React, Select, useForm };
