// TypeScript in Tranquil's repos is typed: no `any` (tranquil-llm developers/rules/types.md).
// `any` turns type checking off for everything it touches, so a wrong name, shape or argument
// compiles and fails at run time instead. Run by lint/run-security.ts over every repo's
// TypeScript, tests and fixtures included; no exceptions, so it cannot be ignored inline either.

const plugin: Deno.lint.Plugin = {
  name: "tranquil-types",
  rules: {
    "no-any": {
      create(ctx) {
        return {
          TSAnyKeyword(node: Deno.lint.TSAnyKeyword) {
            ctx.report({
              node,
              message: "`any` turns type checking off. Use the real type: `unknown` for a value whose shape " +
                "is not known yet (narrow it before use), `(...args: never[]) => unknown` for any function, " +
                "a declared interface for JSON from outside (cast once, where it enters). " +
                "See tranquil-llm developers/rules/types.md.",
            });
          },
        };
      },
    },
  },
};

export default plugin;
