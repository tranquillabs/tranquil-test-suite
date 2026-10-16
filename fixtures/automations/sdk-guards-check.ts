// sdk-guards fixture (ADR-0026): run as a parts check (SDK: Check Custom Parts), the fill checks its target and prints what
// it would do; nothing is typed. The script itself runs on to its RESULT line.
// @permissions forms sites=localhost
import { tabs } from "tranquil/automation";

const tab = await tabs.find(/\/forms\/guards\.html/);
await tab.fill({ label: "Name" }, "Checked, not typed");
console.log("RESULT " + JSON.stringify({ reachedTheEnd: true }));
