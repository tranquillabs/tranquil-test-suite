// Serves fixtures/ for the SDK suites, twice: on localhost and on 127.0.0.1. Different hosts
// are different sites, so a localhost page embedding a 127.0.0.1 frame gets a real
// out-of-process cross-origin iframe; different ports alone would not.
//
// Run standalone (`deno task serve:fixtures`) to hand-test fixture pages in a dev instance.
import { serveDir } from "@std/http/file-server";
import { fromFileUrl, resolve } from "@std/path";

const FIXTURES = resolve(fromFileUrl(import.meta.resolve("tranquil-test-suite/fixtures/")));

export type FixtureServer = {
  /** Base URL on localhost, e.g. http://localhost:51234 */
  page: string;
  /** Base URL on 127.0.0.1 (a different site), for cross-origin frames. */
  frame: string;
  close: () => Promise<void>;
};

export function serveFixtures(port = 0): FixtureServer {
  const handler = (req: Request) => serveDir(req, { fsRoot: FIXTURES, quiet: true });
  const a = Deno.serve({ hostname: "localhost", port, onListen() {} }, handler);
  const b = Deno.serve({ hostname: "127.0.0.1", port: port ? port + 1 : 0, onListen() {} }, handler);
  return {
    page: `http://localhost:${(a.addr as Deno.NetAddr).port}`,
    frame: `http://127.0.0.1:${(b.addr as Deno.NetAddr).port}`,
    close: async () => {
      await a.shutdown();
      await b.shutdown();
    },
  };
}

if (import.meta.main) {
  const s = serveFixtures(8710);
  console.log(`Fixtures: ${s.page}/forms/text.html (frames from ${s.frame})`);
}
