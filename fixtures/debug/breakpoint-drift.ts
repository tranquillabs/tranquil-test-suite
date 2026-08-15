// Fixture for the debugger smoke suites.
//
// Deliberately shaped so naive 1:1 TS→JS line mapping FAILS. Deno's transpile re-prints from the
// AST rather than stripping types in place, so blank lines vanish, multi-line object literals and
// call arguments get re-flowed, and fluent chains collapse onto one line. Every construct below
// is here to move the generated line away from the source line — if the source-map decoder
// regresses, the breakpoint suite stops on the wrong statement and fails.
//
// No permission grants, deliberately: `ensureConsent` short-circuits when a script asks for
// nothing, so no approval dialog can block the run.


interface Widget {
  name: string;
  count: number;
}


function build(): Widget {
  const widget: Widget = {
    name: "widget",
    count: 42,
  };
  return widget; // BREAK_INSIDE
}


const built = build();

const joined = ["a", "b", "c"]
  .map((s) => s.toUpperCase())
  .join("-");

console.log("fixture done", built.name, joined); // BREAK_TOP

// Never executed — a breakpoint here must stay unbound rather than silently binding elsewhere.
function unreachable(): number {
  return 1; // BREAK_UNREACHABLE
}

export { unreachable };
