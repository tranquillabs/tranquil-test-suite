// Tranquil automation. Rules for writing and changing it: ~/.tranquil/llm/writing-automations.md
// @permissions none
// A workbook step that hands back a table as its result (fixtures/workbooks/sample.workbook.md).
import { context } from "tranquil/automation";

console.log("Found 2 customers with overdue orders");
await context.result([
  { customer: "Acme Ltd", orders: 2, total: 1250 },
  { customer: "Globex", orders: 1, total: 400 },
]);
