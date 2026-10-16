// sdk-custom-parts fixture (ADR-0026): run as a parts check (SDK: Check Custom Parts)
// with the page's custom parts map. Each fill and clear checks its target and the parts it
// needs, and prints what it would do; nothing is typed or clicked.
// @permissions forms read=parts.ts sites=localhost
import { tabs } from "tranquil/automation";
import { customParts } from "./parts.ts";

const tab = await tabs.find(/\/forms\/select\.html\?parts$/);
tab.useCustomParts(customParts);
await tab.fill({ label: "Will you require sponsorship?" }, "Yes");
await tab.fill({ label: "Other skills" }, ["Java"]);
await tab.clear({ label: "Favourite language" });
console.log("RESULT " + JSON.stringify({ reachedTheEnd: true }));
