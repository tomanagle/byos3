/**
 * Wide-event logging, modelled as spans. The root span IS the canonical event - ONE context-rich
 * JSON line per request/hop (loggingsucks.com). Build it up as the request flows; it flushes once at
 * `end()`. Open a child `span(name)` to time a sub-operation: its fields merge into the same event
 * under a `<name>.` prefix and it stamps `<name>.duration_ms` at its own `end()` - children never
 * emit their own line, so you still get exactly one event per request, now with nested timings.
 *
 * NEVER `set()` a secret or a presigned URL - events are shipped to logs; presigned URLs are bearer
 * tokens. See agents/docs/logging.md.
 */

export type Fields = Record<string, unknown>;

export interface Span {
  /** Merge fields (last-write-wins). Accepts either `set(key, value)` or `set({ ...fields })`. */
  set(fields: Fields): void;
  set(key: string, value: unknown): void;
  /** Attach an error's message + type (never the raw object/stack with secrets). */
  setError(err: unknown): void;
  /**
   * Open a child span. Its `set`/`setError` write into the same event under `<name>.`; `end()` stamps
   * `<name>.duration_ms`. Children do not flush - only the root span emits the line.
   */
  span(name: string, seed?: Fields): Span;
  /** Child: stamp `<name>.duration_ms`. Root: stamp `duration_ms` + flush the JSON line. Idempotent. */
  end(): void;
}

export interface ServiceLoggerOptions {
  service: string;
  version?: string;
  environment?: string;
}

/** Internal: one span over a shared `data` bag. Root has `flush`; children keep a dotted `prefix`. */
function makeSpan(data: Fields, prefix: string, flush: (() => void) | null): Span {
  const start = Date.now();
  let ended = false;
  const key = (k: string): string => (prefix ? `${prefix}.${k}` : k);

  return {
    set(a: string | Fields, b?: unknown): void {
      if (typeof a === "string") {
        data[key(a)] = b;
      } else {
        for (const [k, v] of Object.entries(a)) data[key(k)] = v;
      }
    },
    setError(err: unknown): void {
      data[key("error.message")] = err instanceof Error ? err.message : String(err);
      data[key("error.type")] = err instanceof Error ? err.name : "unknown";
    },
    span(name: string, seed: Fields = {}): Span {
      const child = makeSpan(data, key(name), null);
      child.set(seed);
      return child;
    },
    end(): void {
      if (ended) return;
      ended = true;
      data[key("duration_ms")] = Date.now() - start;
      flush?.();
    },
  };
}

/** Start a root span. Auto-attaches environment/service context + stamps `duration_ms` at `end()`. */
export function createSpan(
  seed: Fields = {},
  ctx: ServiceLoggerOptions | undefined = undefined,
): Span {
  const data: Fields = {
    ...(ctx?.service ? { service: ctx.service } : {}),
    ...(ctx?.version ? { version: ctx.version } : {}),
    ...(ctx?.environment ? { environment: ctx.environment } : {}),
    ...seed,
  };
  const flush = (): void => {
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(data));
    } catch {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({ service: data["service"] ?? "unknown", "log.error": "serialize_failed" }),
      );
    }
  };
  return makeSpan(data, "", flush);
}

/** A logger pre-seeded with service context; `createSpan(seed)` merges per-request fields. */
export function createServiceLogger(opts: ServiceLoggerOptions) {
  return {
    createSpan: (seed: Fields = {}): Span => createSpan(seed, opts),
  };
}
