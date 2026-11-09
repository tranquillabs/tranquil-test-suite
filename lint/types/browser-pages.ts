// What tranquil-browser's lib/pages.js exports, as far as lint/browser_contract_test.ts uses it.
// The module is plain JavaScript, so its shapes are declared here for the TypeScript that loads it.
// Types only.

export interface BrowserPagesModule {
  /** The settings every page runs with (Electron's webPreferences names). */
  PAGE_PREFERENCES: Readonly<Record<string, boolean>>;
  /** The settings as the tab view's <webview> `webpreferences` attribute. */
  webpreferencesAttribute(): string;
  /** Whether an address is a web page's: http or https. */
  isWebURL(url: string): boolean;
}
