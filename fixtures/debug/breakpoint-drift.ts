// Fixture for the debugger smoke suites.
//
// Deliberately shaped so naive 1:1 TS→JS line mapping FAILS. Deno's transpile re-prints from the
// AST rather than stripping types in place, so blank lines vanish, multi-line object literals and
// call arguments get re-flowed, and fluent chains collapse onto one line. Every construct below
// is here to move the generated line away from the source line — if the source-map decoder
// regresses, the breakpoint suite stops on the wrong statement and fails.
//
// `@permissions none` deliberately: consent short-circuits when a script asks for nothing beyond
// its own folder, so no approval dialog can block the run. A header is required of every script
// (ADR-0025), so "none" is how a script says it needs nothing.
// @permissions none


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

// Never called — but its body is real, compiled code the script loads regardless of whether
// it's ever invoked, so V8 legitimately binds and verifies a breakpoint inside it (confirmed
// against a live session, see debugger-breakpoints.ts). Nor is a type-only or trailing-comment
// line unbindable: both SourceMap.originalToGenerated and V8 itself snap forward to the nearest
// mapping/instruction that DOES exist and bind there instead, dot and all — even the very last
// comment in this file resolves that way. Only a request with no mapping ANYWHERE near it
// (constructed directly in the test, well past this file's actual line count) stays unbound.
function unreachable(): number {
  return 1;
}

export { unreachable };
