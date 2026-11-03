// Tranquil automation. Rules for writing and changing it: ~/.tranquil/llm/writing-automations.md
// @permissions tabs sites=example.com
// A workbook step that reads a web page (fixtures/workbooks/sample.workbook.md).
import { tabs } from "tranquil/automation";

const tab = await tabs.active();
console.log(`${(await tab.fields()).length} fields on the page`);
