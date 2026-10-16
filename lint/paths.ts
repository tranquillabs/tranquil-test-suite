// Paths that count ../ from a file's own location to reach another repo, or a fixed place in its own
// repo, break when the file moves or the layout changes, and hide a dependency in a code body. Name
// the place once instead (tranquil-llm developers/rules/paths.md):
//
// - Deno: an entry in deno.json "imports" ("<repo>/": "../<repo>/", or "./" for the repo itself),
//   then an import from "<repo>/..." or import.meta.resolve("<repo>/...").
// - Node: require.resolve("<package>/...").
//
// One level up inside a package (path.join(__dirname, "..", "resources")) is allowed: a Pulsar
// package loaded from a sibling repo cannot require itself by name.
//
// The rule looks only where a path is anchored to the file's location: import and require
// specifiers, new URL(x, ...), path join/resolve calls, and template paths built on __dirname.
// Strings that merely contain ../ (a link target being written, a message) are data.

type Node = Deno.lint.Node;

const SIBLING = /^(tranquil-[\w-]+|atom-[\w-]+|www-tranquil|deno-dom|pulsar)$/;

/** Why a relative path is out of bounds, or null when it is fine. */
function problem(path: string): string | null {
  const parts = path.split("/");
  let up = 0;
  while (parts[up] === "..") up++;
  if (up >= 2) return `climbs ${up} levels`;
  if (up === 1 && SIBLING.test(parts[1] ?? "")) return `reaches the sibling repo ${parts[1]}`;
  return null;
}

const stringOf = (n: Node | null | undefined): string | undefined => {
  if (n?.type === "Literal" && typeof n.value === "string") return n.value;
  if (n?.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis[0]?.cooked ?? undefined;
  return undefined;
};
/** The name a callee or object ends in: `require`, `path.join` → "join". */
const nameOf = (n: Node | null | undefined): string | undefined =>
  n?.type === "Identifier"
    ? n.name
    : n?.type === "MemberExpression" && n.property.type === "Identifier"
    ? n.property.name
    : undefined;
const isDirname = (n: Node) =>
  (n.type === "Identifier" && n.name === "__dirname") ||
  (n.type === "MemberExpression" && n.object.type === "MetaProperty" && nameOf(n) === "dirname");

const HOW = "Name the place once: in Deno, an entry in deno.json \"imports\" then import.meta.resolve(\"<name>/...\"); " +
  "in Node, require.resolve(\"<package>/...\"). See tranquil-llm developers/rules/paths.md.";

const plugin: Deno.lint.Plugin = {
  name: "tranquil-paths",
  rules: {
    "no-path-climbing": {
      create(ctx) {
        const check = (node: Node, path: string | undefined) => {
          const why = path === undefined ? null : problem(path);
          if (why) ctx.report({ node, message: `"${path}" ${why} from this file's folder. ${HOW}` });
        };
        return {
          ImportDeclaration: (node: Deno.lint.ImportDeclaration) => check(node.source, node.source.value),
          ExportNamedDeclaration: (node: Deno.lint.ExportNamedDeclaration) => {
            if (node.source) check(node.source, node.source.value);
          },
          ExportAllDeclaration: (node: Deno.lint.ExportAllDeclaration) => check(node.source, node.source.value),
          ImportExpression: (node: Deno.lint.ImportExpression) => check(node.source, stringOf(node.source)),
          NewExpression(node: Deno.lint.NewExpression) {
            if (nameOf(node.callee) === "URL" && node.arguments.length >= 2) check(node, stringOf(node.arguments[0]));
          },
          CallExpression(node: Deno.lint.CallExpression) {
            const name = nameOf(node.callee);
            const onRequire = node.callee.type === "MemberExpression" && nameOf(node.callee.object) === "require";
            if (name === "require" || (name === "resolve" && onRequire)) {
              check(node, stringOf(node.arguments[0]));
              return;
            }
            if (name !== "join" && name !== "resolve") return;
            // path.join(base, "..", "..", "x") and friends: read the literal segments as one path.
            const segments: string[] = [];
            for (const arg of node.arguments) {
              const s = stringOf(arg);
              if (s === undefined) {
                if (segments.length) break; // a variable in the middle starts a new path
                continue;
              }
              segments.push(...s.split("/").filter((p) => p && p !== "."));
            }
            check(node, segments.length ? segments.join("/") : undefined);
          },
          TemplateLiteral(node: Deno.lint.TemplateLiteral) {
            // `${__dirname}/../../x`
            const i = node.expressions.findIndex(isDirname);
            if (i < 0) return;
            const rest = node.quasis.slice(i + 1).map((q) => q.cooked ?? "").join("");
            check(node, rest.replace(/^\/+/, ""));
          },
        };
      },
    },
  },
};

export default plugin;
