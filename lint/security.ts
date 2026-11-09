// Tranquil security lint. Security of our own code comes first: nothing may get past the Deno
// sandbox, and nothing may hold a permission that was not explicitly asked for. Every rule here
// flags one kind of blanket grant, so a new one fails the lint instead of slipping in.
//
// Run over every owned repo with `deno task lint:security` (lint/run-security.ts). A justified
// exception is a `// deno-lint-ignore tranquil-security/<rule>` comment on the line before, with
// the reason next to it.

// The names below are Electron's and Deno's, which the lint looks for in Tranquil's code.
// lint/browser_contract_test.ts checks each Electron name against Electron's own declarations
// (tranquil-client's electron.d.ts), and the page settings against tranquil-browser's lib/pages.js.

/** Electron's session methods that decide what a page may use (camera, location, devices…). */
export const PERMISSION_SETTER_NAMES = [
  "setPermissionRequestHandler",
  "setPermissionCheckHandler",
  "setDevicePermissionHandler",
  "setDisplayMediaRequestHandler",
  "setBluetoothPairingHandler",
] as const;
/** `ipcRenderer`'s methods that carry a message on a channel. */
export const IPC_METHOD_NAMES = ["send", "sendSync", "invoke", "sendToHost", "on", "once", "postMessage"] as const;
/**
 * The settings every page runs with, as tranquil-browser's lib/pages.js has them (which this lint
 * can't import: its config's import map doesn't reach a plugin). The opposite value weakens it.
 */
export const PAGE_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  webSecurity: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  nodeIntegrationInWorker: false,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const;
/** <webview> attributes that weaken a page by being there at all. */
export const UNSAFE_WEBVIEW_ATTRS = ["nodeintegration", "nodeintegrationinsubframes", "disablewebsecurity"] as const;

// Deno's permissions, and the flags with no permission name: --allow-import, --allow-scripts and
// --allow-all (-A). A flag with no list after it grants everything of its kind.
type DenoPermission = Deno.PermissionName;
const DENO_PERMISSIONS = ["read", "write", "net", "env", "run", "ffi", "sys"] as const satisfies readonly DenoPermission[];
// Every permission Deno has is in the list above: one Deno adds fails the type check here.
type Unlisted = Exclude<DenoPermission, (typeof DENO_PERMISSIONS)[number]>;
const _everyDenoPermission: [Unlisted] extends [never] ? true : never = true;
const UNSCOPED_DENO = new RegExp(`^(--allow-(${[...DENO_PERMISSIONS, "import", "scripts", "all"].join("|")})|-A)$`);

const PERMISSION_SETTERS = new Set<string>(PERMISSION_SETTER_NAMES);
const IPC_METHODS = new Set<string>(IPC_METHOD_NAMES);
const WEBVIEW_ATTRS = new Set<string>(UNSAFE_WEBVIEW_ATTRS);
type PagePreference = keyof typeof PAGE_PREFERENCES;
const PREFERENCE_BY_LOWERCASE = new Map(
  (Object.keys(PAGE_PREFERENCES) as PagePreference[]).map((name) => [name.toLowerCase(), name]),
);

/**
 * The page settings a <webview> `webpreferences` string weakens, read as Electron reads it: a
 * comma-separated list where a name on its own is true, `yes` and `1` are true, and `no` and `0`
 * are false. Names match in any case, and any other value counts as true, so a doubtful string is
 * flagged rather than let through.
 */
export function weakenedIn(webpreferences: string): PagePreference[] {
  const weakened: PagePreference[] = [];
  for (const part of webpreferences.split(",")) {
    const [rawName, rawValue] = part.split("=", 2).map((s) => s.trim());
    const name = PREFERENCE_BY_LOWERCASE.get(rawName.toLowerCase());
    if (!name) continue;
    const on = rawValue === undefined || !/^(no|0|false)$/i.test(rawValue);
    if (on !== PAGE_PREFERENCES[name]) weakened.push(name);
  }
  return weakened;
}

type Node = Deno.lint.Node;
type Fn = Deno.lint.ArrowFunctionExpression | Deno.lint.FunctionExpression;
type Maybe = Node | null | undefined;

/** A key or identifier's name: `foo` or `"foo"`. */
const keyName = (n: Maybe): string | undefined =>
  n?.type === "Identifier" ? n.name : n?.type === "Literal" && typeof n.value === "string" ? n.value : undefined;
/** The property a member expression ends in: `a.b.allow` → "allow". */
const memberName = (n: Maybe): string | undefined => n?.type === "MemberExpression" ? keyName(n.property) : undefined;
const stringOf = (n: Maybe): string | undefined => {
  if (n?.type === "Literal" && typeof n.value === "string") return n.value;
  if (n?.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis[0]?.cooked ?? undefined;
  return undefined;
};
const literalIn = (n: Maybe, values: readonly unknown[]) => n?.type === "Literal" && values.includes(n.value);
const isOn = (n: Maybe) => literalIn(n, [true, "on", "true", "yes"]);
const isOff = (n: Maybe) => literalIn(n, [false, "off", "false", "no"]);
const isFunction = (n: Maybe): n is Fn => n?.type === "ArrowFunctionExpression" || n?.type === "FunctionExpression";
const paramName = (p: Deno.lint.Parameter) => p.type === "Identifier" ? p.name : undefined;
/** The condition an if, ternary or `&&`/`||` tests, if the node is one. */
const conditionOf = (n: Node): Node | null =>
  n.type === "IfStatement" || n.type === "ConditionalExpression" ? n.test : n.type === "LogicalExpression" ? n.left : null;

const plugin: Deno.lint.Plugin = {
  name: "tranquil-security",
  rules: {
    // A page (any website) or a device request granted without asking whether it was declared.
    "no-blanket-permission": {
      create(ctx) {
        return {
          CallExpression(node: Deno.lint.CallExpression) {
            const callee = node.callee;
            if (callee.type === "MemberExpression" && memberName(callee) === "allow" && memberName(callee.object) === "request") {
              ctx.report({
                node,
                message: "Grants every permission a page asks for (camera, microphone, location, ...). " +
                  "Deny by default and allow only a permission that was explicitly declared.",
              });
              return;
            }
            if (!PERMISSION_SETTERS.has(memberName(callee) ?? "")) return;
            const handler = node.arguments.find(isFunction);
            if (!handler) return;
            const params = new Set(handler.params.map(paramName));
            const body = handler.body;
            const unconditional = body.type === "BlockStatement"
              ? body.body.some((s) =>
                (s.type === "ReturnStatement" && isOn(s.argument)) ||
                (s.type === "ExpressionStatement" && s.expression.type === "CallExpression" &&
                  params.has(keyName(s.expression.callee)) && isOn(s.expression.arguments[0]))
              )
              : isOn(body);
            if (unconditional) {
              ctx.report({
                node: handler,
                message: "This permission handler allows unconditionally. Deny by default.",
              });
            }
          },
        };
      },
    },

    // A contextBridge method that hands a page-chosen channel name to IPC: any website could then
    // call every handler in the app.
    "no-generic-ipc-bridge": {
      create(ctx) {
        return {
          CallExpression(node: Deno.lint.CallExpression) {
            if (node.callee.type !== "MemberExpression" || !IPC_METHODS.has(memberName(node.callee) ?? "")) return;
            const target = node.callee.object;
            if (keyName(target) !== "ipcRenderer" && memberName(target) !== "ipcRenderer") return;
            const channel = node.arguments[0];
            if (channel?.type !== "Identifier") return;
            const ancestors = ctx.sourceCode.getAncestors(node);
            const exposed = ancestors.some((a) =>
              a.type === "CallExpression" && memberName(a.callee) === "exposeInMainWorld"
            );
            if (!exposed) return;
            const fromPage = ancestors.some((a) => isFunction(a) && a.params.some((p) => paramName(p) === channel.name));
            if (!fromPage) return;
            const allowlisted = new RegExp(`\\.has\\(\\s*${channel.name}\\s*\\)`);
            const guarded = ancestors.some((a) => {
              const condition = conditionOf(a);
              return condition !== null && allowlisted.test(ctx.sourceCode.getText(condition));
            });
            if (!guarded) {
              ctx.report({
                node,
                message: `The page chooses the IPC channel ("${channel.name}"). Expose a named method, ` +
                  "or check the channel against a fixed allowlist (`ALLOWED.has(channel)`) first.",
              });
            }
          },
        };
      },
    },

    // A Deno permission flag with no list: the process can then read, write, reach or run anything.
    "no-unscoped-deno-permission": {
      create(ctx) {
        const check = (node: Deno.lint.Literal | Deno.lint.TemplateLiteral) => {
          const s = stringOf(node);
          if (s !== undefined && UNSCOPED_DENO.test(s)) {
            ctx.report({
              node,
              message: `"${s}" grants everything of its kind. List exactly what is needed ` +
                "(--allow-read=<paths>, --allow-net=<hosts>, --allow-run=<programs>).",
            });
          }
        };
        return { Literal: check, TemplateLiteral: check };
      },
    },

    // Page code built by concatenating values into a string: a quote in a value breaks out of it.
    "no-string-page-code": {
      create(ctx) {
        return {
          CallExpression(node: Deno.lint.CallExpression) {
            const m = memberName(node.callee);
            if (m !== "executeJavaScript" && m !== "executeJavaScriptInIsolatedWorld") return;
            const code = node.arguments[0];
            const built = (code?.type === "BinaryExpression" && code.operator === "+") ||
              (code?.type === "TemplateLiteral" && code.expressions.length > 0);
            if (built) {
              ctx.report({
                node,
                message: "Page code is built from strings. Use callInPage(webview, fn, ...args), which " +
                  "sends a real function with JSON-encoded arguments.",
              });
            }
          },
        };
      },
    },

    // Pulsar's Markdown renderer keeps raw HTML by default, and its sanitizer runs on defaults
    // that let <style>, <img> and <form> through (src/ui.js). Text in this window can come from
    // web pages or an LLM, so every owned call must turn raw HTML off, as a literal the lint can
    // see. Tranquil's own UI draws Markdown with the shared Markdown component instead
    // (tranquil-automations ui/common/markdown, ADR-0032), which never parses HTML.
    "no-markdown-html": {
      create(ctx) {
        return {
          CallExpression(node: Deno.lint.CallExpression) {
            const callee = node.callee;
            if (memberName(callee) !== "render" || callee.type !== "MemberExpression") return;
            if (memberName(callee.object) !== "markdown") return;
            const opts = node.arguments[1];
            const htmlOff = opts?.type === "ObjectExpression" &&
              opts.properties.some((p) => p.type === "Property" && keyName(p.key) === "html" && isOff(p.value));
            if (!htmlOff) {
              ctx.report({
                node,
                message: "markdown.render keeps raw HTML unless told otherwise. Pass { html: false } as a " +
                  "literal, or draw Markdown with the shared Markdown component (ui/common/markdown, ADR-0032).",
              });
            }
          },
        };
      },
    },

    // A Deno server with no hostname listens on every network interface (0.0.0.0), so anyone on
    // the network can reach it. Name the interface: 127.0.0.1 for anything local.
    "no-unbound-server": {
      create(ctx) {
        return {
          CallExpression(node: Deno.lint.CallExpression) {
            const callee = node.callee;
            if (callee.type !== "MemberExpression" || keyName(callee.object) !== "Deno") return;
            const fn = memberName(callee);
            if (!(fn === "serve" || fn === "listen" || fn === "listenTls")) return;
            const options = node.arguments[0];
            const named = options?.type === "ObjectExpression" &&
              options.properties.some((p) => p.type === "Property" && ["hostname", "path"].includes(keyName(p.key) ?? ""));
            if (!named) {
              ctx.report({
                node,
                message: `Deno.${fn} without a hostname listens on every network interface. Pass { hostname: "127.0.0.1" } (or the one interface it must serve).`,
              });
            }
          },
        };
      },
    },

    // Electron web preferences or <webview> attributes that weaken the page's isolation.
    "no-insecure-webpreferences": {
      create(ctx) {
        const RULE = "Pages get no Node.js, and keep context isolation, the sandbox and web security on " +
          "(tranquil-browser lib/pages.js).";
        // A webpreferences string, wherever it is written: as a property (an attributes object, as
        // the browser's tab view builds) or as setAttribute's value.
        const checkString = (node: Node, value: Maybe) => {
          const s = stringOf(value);
          const weakened = s === undefined ? [] : weakenedIn(s);
          if (weakened.length) {
            ctx.report({ node, message: `webpreferences "${s}" weakens ${weakened.join(", ")}. ${RULE}` });
          }
        };
        return {
          Property(node: Deno.lint.Property) {
            const k = keyName(node.key);
            if (!k) return;
            const name = PREFERENCE_BY_LOWERCASE.get(k.toLowerCase());
            if (name === k && (PAGE_PREFERENCES[name] ? isOff(node.value) : isOn(node.value))) {
              ctx.report({ node, message: `${k}: ${ctx.sourceCode.getText(node.value)} weakens page isolation. ${RULE}` });
            } else if (WEBVIEW_ATTRS.has(k.toLowerCase()) && !isOff(node.value)) {
              ctx.report({ node, message: `The <webview> attribute "${k}" weakens page isolation. ${RULE}` });
            } else if (k.toLowerCase() === "webpreferences") {
              checkString(node, node.value);
            }
          },
          CallExpression(node: Deno.lint.CallExpression) {
            if (memberName(node.callee) !== "setAttribute") return;
            const attr = stringOf(node.arguments[0])?.toLowerCase();
            if (attr && WEBVIEW_ATTRS.has(attr)) {
              ctx.report({ node, message: `The <webview> attribute "${attr}" weakens page isolation. ${RULE}` });
            } else if (attr === "webpreferences") {
              checkString(node, node.arguments[1]);
            }
          },
        };
      },
    },
  },
};

export default plugin;
