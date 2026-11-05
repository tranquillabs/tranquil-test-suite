// Tranquil automation. Rules for writing and changing it: ~/.tranquil/llm/writing-automations.md
// @permissions none
// A workbook step that fails on purpose, to show a failed output (fixtures/workbooks/sample.workbook.md).
console.log("Starting, then failing on purpose");
throw new Error("This step fails on purpose");
