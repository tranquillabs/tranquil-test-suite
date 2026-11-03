// Tranquil automation. Rules for writing and changing it: ~/.tranquil/llm/writing-automations.md
// @permissions none
// Sends a notification full of markup, as text taken from a web page might be. The toast must
// show it exactly as written: no bold, no link, and no image fetched.
import { ui } from "tranquil/automation";

await ui.notify(`<b>not bold</b> **not bold either** [not a link](https://example.com) ![no image](https://example.com/t.png)`);
