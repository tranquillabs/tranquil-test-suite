// Minimal Chrome DevTools Protocol client over Deno's native WebSocket.
//
// Just enough to evaluate JavaScript inside the Tranquil editor window's
// `atom` global — no external dependencies.

const CDP_PORT = 9222;

type CdpTarget = {
  type: string;
  url: string;
  title: string;
  webSocketDebuggerUrl: string;
};

type EvalResult = {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
};

/** Is a Tranquil dev instance answering on the CDP port? */
export async function cdpAlive(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${CDP_PORT}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function listTargets(): Promise<CdpTarget[]> {
  const res = await fetch(`http://localhost:${CDP_PORT}/json`, {
    signal: AbortSignal.timeout(3000),
  });
  return await res.json();
}

/** A connected CDP session to a single page target. */
export class Cdp {
  #ws: WebSocket;
  #id = 0;
  #pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      if (msg.id == null) return; // event, not a command reply
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    };
  }

  static async open(wsUrl: string): Promise<Cdp> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`WS failed: ${wsUrl}`));
    });
    return new Cdp(ws);
  }

  #send<R>(method: string, params: unknown): Promise<R> {
    const id = ++this.#id;
    return new Promise<R>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate an expression in the page and return its value (awaits promises). */
  async evalInAtom<T = unknown>(expression: string): Promise<T> {
    const result = await this.#send<EvalResult>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error(
        `evalInAtom threw: ${d.exception?.description ?? d.text}`,
      );
    }
    return result.result?.value as T;
  }

  /** Poll `expression` until it returns a truthy value (or throw on timeout). */
  async waitFor<T = unknown>(
    expression: string,
    { timeout = 8000, interval = 200 } = {},
  ): Promise<T> {
    const deadline = Date.now() + timeout;
    let last: T;
    while (Date.now() < deadline) {
      last = await this.evalInAtom<T>(expression);
      if (last) return last;
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`waitFor timed out (${timeout}ms): ${expression}`);
  }

  close() {
    try {
      this.#ws.close();
    } catch { /* ignore */ }
  }
}

/**
 * Connect to the editor window — the page target whose `atom` global has a
 * loaded project. Retries while the app is still booting.
 */
export async function connectAtom(
  { timeout = 30000 } = {},
): Promise<Cdp> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let targets: CdpTarget[] = [];
    try {
      targets = (await listTargets()).filter((t) => t.type === "page");
    } catch {
      // CDP not ready yet
    }
    for (const target of targets) {
      let cdp: Cdp | undefined;
      try {
        cdp = await Cdp.open(target.webSocketDebuggerUrl);
        const ready = await cdp.evalInAtom<boolean>(
          "typeof atom !== 'undefined' && !!atom.workspace && atom.project.getPaths().length > 0",
        );
        if (ready) return cdp;
        cdp.close();
      } catch {
        cdp?.close();
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    "connectAtom: no editor window with a loaded project appeared",
  );
}
