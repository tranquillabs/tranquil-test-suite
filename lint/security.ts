// Tranquil security lint. Security of our own code comes first: nothing may get past the Deno
// sandbox, and nothing may hold a permission that was not explicitly asked for. Every rule here
// flags one kind of blanket grant, so a new one fails the lint instead of slipping in.
//
// Run over every owned repo with `deno task lint:security` (lint/run-security.ts). A justified
// exception is a `// deno-lint-ignore tranquil-security/<rule>` comment on the line before, with
// the reason next to it.

const PERMISSION_SETTERS = new Set([
  "setPermissionRequestHandler",
  "setPermissionCheckHandler",
  "setDevicePermissionHandler",
  "setDisplayMediaRequestHandler",
  "setBluetoothPairingHandler",
]);
const IPC_METHODS = new Set(["send", "sendSync", "invoke", "sendToHost", "on", "once", "postMessage"]);
// A Deno permission flag with no list after it grants everything of its kind.
const UNSCOPED_DENO = /^(--allow-(all|read|write|net|env|run|ffi|sys|import|scripts)|-A)$/;
const MUST_BE_OFF = new Set([
  "nodeIntegration",
  "nodeIntegrationInSubFrames",
  "nodeIntegrationInWorker",
  "allowRunningInsecureContent",
  "enableRemoteModule",
  "experimentalFeatures",
]);
const MUST_BE_ON = new Set(["webSecurity", "contextIsolation", "sandbox"]);
const UNSAFE_WEBVIEW_ATTRS = new Set(["nodeintegration", "nodeintegrationinsubframes", "disablewebsecurity"]);
const UNSAFE_WEBPREFERENCES = /nodeIntegration=(yes|true)|contextIsolation=(no|false)|sandbox=(no|false)|webSecurity=(no|false)/i;

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
        return {
          Property(node: Deno.lint.Property) {
            const k = keyName(node.key);
            if (!k) return;
            if ((MUST_BE_OFF.has(k) && isOn(node.value)) || (MUST_BE_ON.has(k) && isOff(node.value))) {
              ctx.report({
                node,
                message: `${k}: ${ctx.sourceCode.getText(node.value)} weakens page isolation. ` +
                  "Pages get no Node.js, keep context isolation, the sandbox and web security on.",
              });
            }
          },
          CallExpression(node: Deno.lint.CallExpression) {
            if (memberName(node.callee) !== "setAttribute") return;
            const attr = stringOf(node.arguments[0])?.toLowerCase();
            const value = stringOf(node.arguments[1]) ?? "";
            if ((attr && UNSAFE_WEBVIEW_ATTRS.has(attr)) ||
              (attr === "webpreferences" && UNSAFE_WEBPREFERENCES.test(value))) {
              ctx.report({ node, message: `The <webview> attribute "${attr}" weakens page isolation.` });
            }
          },
        };
      },
    },
  },
};

export default plugin;
