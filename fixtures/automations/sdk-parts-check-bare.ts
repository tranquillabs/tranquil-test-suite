// sdk-custom-parts fixture (ADR-0026): the same parts check with no custom parts map. The check
// reports the parts web standards don't describe as missing, with each field's markup.
// @permissions forms sites=localhost
import { tabs } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/select\.html\?parts$/);
await tab.fill({ label: "Will you require sponsorship?" }, "Yes");
await tab.fill({ label: "Other skills" }, ["Java"]);
await tab.clear({ label: "Favourite language" });
console.log("RESULT " + JSON.stringify({ reachedTheEnd: true }));
