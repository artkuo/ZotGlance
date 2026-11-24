/**
 * Development-only eval bridge, so Claude (or you) can inspect and drive the
 * dev Zotero instance from a terminal: `scripts/zq-eval.sh 'return ...'`.
 *
 * Registered only when the build is in development mode AND the dev profile
 * has `extensions.zotero.zotglance.devToken` set (zotero-plugin.config.ts writes
 * it from .env). Production builds never register it.
 *
 * Safety: Zotero's HTTP server only listens on 127.0.0.1 and already rejects
 * requests from web pages (see Zotero.Server "Preventing request from
 * browser"); on top of that every request must carry the token header.
 */

const PATH = "/zotglance/dev/eval";
const TOKEN_PREF = "extensions.zotero.zotglance.devToken";

type EvalRequest = {
  method: string;
  headers: Record<string, string>;
  data: unknown;
};

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

export function registerDevBridge(): void {
  if (__env__ !== "development") return;
  const token = String(Zotero.Prefs.get(TOKEN_PREF, true) || "");
  if (!token) return;

  const Endpoint = function () {} as unknown as {
    new (): unknown;
    prototype: Record<string, unknown>;
  };
  Endpoint.prototype.supportedMethods = ["POST"];
  Endpoint.prototype.supportedDataTypes = ["text/plain"];
  Endpoint.prototype.init = async function (req: EvalRequest) {
    if (req.headers["x-zotglance-dev-token"] !== token) {
      return [403, "text/plain", "bad token\n"];
    }
    try {
      const fn = new AsyncFunction("Zotero", "win", "addon", String(req.data));
      const value = await fn(Zotero, Zotero.getMainWindow(), addon);
      return [200, "application/json", safeStringify({ ok: true, value })];
    } catch (e) {
      const err = e as Error;
      return [
        200,
        "application/json",
        safeStringify({ ok: false, error: String(err), stack: err?.stack }),
      ];
    }
  };
  (Zotero.Server.Endpoints as Record<string, unknown>)[PATH] = Endpoint;
  ztoolkit.log(`dev bridge on ${PATH}`);
}

export function unregisterDevBridge(): void {
  delete (Zotero.Server.Endpoints as Record<string, unknown>)[PATH];
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[circular]";
        seen.add(v);
      }
      if (typeof v === "function") return `[function ${v.name}]`;
      return v;
    },
    2,
  );
}
