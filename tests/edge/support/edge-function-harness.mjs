// Harness for driving real Edge Function handlers under Node.
//
// Fourteen suites in `tests/edge` assert on the *text* of a handler because loading
// one is awkward: the module is Deno TypeScript, it registers itself through
// `Deno.serve`, its `../_shared/*.ts` imports do not resolve in Node, and it talks to
// PostgREST through supabase-js. Each of those is mechanical, so this module does the
// four things once:
//
//   1. transpile `supabase/functions/_shared/*.ts` and `<fn>/index.ts` into one temp
//      directory, rewriting `../_shared/foo.ts` → `./foo.mjs`;
//   2. install a Deno shim whose `serve()` captures the handler instead of listening;
//   3. install an in-memory PostgREST double that records every operation in order
//      (`db.feed`), so ordering guarantees are observable;
//   4. hand back `call()` so a test can issue a real `Request` and read the `Response`.
//
// The point is that a converted suite exercises the shipped handler. If someone edits
// `fn-fall-escalation/index.ts`, the assertions move with the code; a text match would
// not.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkSharedModules, transpileModuleFile } from './shared-loader.mjs';

const SHARED = new URL('../../../supabase/functions/_shared/', import.meta.url);
const FUNCTIONS = new URL('../../../supabase/functions/', import.meta.url);

/**
 * In-memory PostgREST double.
 *
 * `tables` seeds rows. Every call is appended to `feed` as
 * `{ table, op, values, filters }`, which is what makes "the MAR write happened
 * before the confirmation was resolved" testable.
 *
 * `failures` injects database errors — supabase-js reports those in the result
 * object, so a handler that ignores `{ error }` looks identical to a healthy one
 * unless the double produces one. Each entry is `{ table, op, message, code }`
 * (omit `table` to fail on `.rpc()`).
 *
 * `storage` supplies buckets for `.storage.from(bucket)`: `{ [bucket]: { download(path), remove(paths) } }`.
 * A handler that reads an uploaded object back (the medicine-label reader does) needs real
 * bytes; without an entry the download reports 404, which is also a shape worth testing.
 */
export function createMockDb({ tables = {}, rpcResults = {}, failures = [], storage = {} } = {}) {
  const feed = [];
  const store = {};
  for (const [table, rows] of Object.entries(tables)) store[table] = rows.map((row) => ({ ...row }));

  const failureFor = (table, op) => failures.find(
    (entry) => entry.op === op && (entry.table === undefined || entry.table === table),
  ) ?? null;

  const matches = (row, filters) => filters.every(({ kind, column, value }) => {
    switch (kind) {
      case 'eq': return row[column] === value;
      case 'neq': return row[column] !== value;
      case 'is': return (row[column] ?? null) === value;
      case 'in': return value.includes(row[column]);
      case 'gt': return row[column] > value;
      case 'gte': return row[column] >= value;
      case 'lt': return row[column] < value;
      case 'lte': return row[column] <= value;
      case 'like': return String(row[column] ?? '').includes(String(value).replaceAll('%', ''));
      case 'not': return !(row[column] === value);
      default: return true;
    }
  });

  const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

  function builder(table) {
    const state = { table, op: null, values: null, filters: [], count: null, columns: '*', limit: null, returning: true };

    const rowsFor = () => {
      if (!Object.hasOwn(store, table)) store[table] = [];
      return store[table];
    };

    const result = () => {
      const failure = failureFor(table, state.op ?? 'select');
      if (failure) return { data: null, error: { message: failure.message ?? 'db rejected', code: failure.code ?? 'XX000' } };

      const rows = rowsFor();
      if (state.op === 'insert') {
        const incoming = Array.isArray(state.values) ? state.values : [state.values];
        const created = incoming.map((values, index) => ({
          id: `${table}-${rows.length + index + 1}`,
          ...values,
        }));
        rows.push(...created);
        const data = Array.isArray(state.values) ? created : created[0];
        return { data: state.returning ? clone(data) : null, error: null };
      }
      if (state.op === 'upsert') {
        const incoming = Array.isArray(state.values) ? state.values : [state.values];
        for (const values of incoming) {
          const existing = rows.find((row) => row.id === values.id);
          if (existing) Object.assign(existing, values);
          else rows.push({ ...values });
        }
        return { data: state.returning ? clone(state.values) : null, error: null };
      }
      if (state.op === 'update') {
        const targets = rows.filter((row) => matches(row, state.filters));
        for (const row of targets) Object.assign(row, state.values);
        const data = targets.map((row) => clone(row));
        return {
          data: state.columns === null ? null : data,
          error: null,
          ...(state.count ? { count: targets.length } : {}),
        };
      }
      if (state.op === 'delete') {
        const targets = rows.filter((row) => matches(row, state.filters));
        store[table] = rows.filter((row) => !targets.includes(row));
        return { data: state.returning ? targets.map((row) => clone(row)) : null, error: null };
      }

      let targets = rows.filter((row) => matches(row, state.filters));
      if (state.limit !== null) targets = targets.slice(0, state.limit);
      return {
        data: state.columns === null ? null : targets.map((row) => clone(row)),
        error: null,
        ...(state.count ? { count: targets.length } : {}),
      };
    };

    const proxy = {
      select(columns = '*', options = {}) {
        state.columns = options.head ? null : columns;
        if (options.count) state.count = options.count;
        if (!state.op) state.op = 'select';
        return proxy;
      },
      insert(values) { state.op = 'insert'; state.values = values; feed.push({ table, op: 'insert', values: clone(values), filters: [] }); return proxy; },
      upsert(values) { state.op = 'upsert'; state.values = values; feed.push({ table, op: 'upsert', values: clone(values), filters: [] }); return proxy; },
      update(values, options = {}) {
        state.op = 'update';
        state.values = values;
        if (options.count) state.count = options.count;
        feed.push({ table, op: 'update', values: clone(values), count: options.count ?? null, filters: state.filters });
        return proxy;
      },
      delete() { state.op = 'delete'; feed.push({ table, op: 'delete', values: null, filters: state.filters }); return proxy; },
      eq(column, value) { state.filters.push({ kind: 'eq', column, value }); return proxy; },
      neq(column, value) { state.filters.push({ kind: 'neq', column, value }); return proxy; },
      is(column, value) { state.filters.push({ kind: 'is', column, value }); return proxy; },
      in(column, value) { state.filters.push({ kind: 'in', column, value }); return proxy; },
      gt(column, value) { state.filters.push({ kind: 'gt', column, value }); return proxy; },
      gte(column, value) { state.filters.push({ kind: 'gte', column, value }); return proxy; },
      lt(column, value) { state.filters.push({ kind: 'lt', column, value }); return proxy; },
      lte(column, value) { state.filters.push({ kind: 'lte', column, value }); return proxy; },
      like(column, value) { state.filters.push({ kind: 'like', column, value }); return proxy; },
      ilike(column, value) { state.filters.push({ kind: 'like', column, value }); return proxy; },
      not(column, _operator, value) { state.filters.push({ kind: 'not', column, value }); return proxy; },
      or() { return proxy; },
      filter() { return proxy; },
      order() { return proxy; },
      limit(value) { state.limit = value; return proxy; },
      range() { return proxy; },
      abortSignal() { return proxy; },
      single() {
        const out = result();
        if (out.error) return Promise.resolve(out);
        const list = Array.isArray(out.data) ? out.data : out.data ? [out.data] : [];
        return Promise.resolve({ ...out, data: list[0] ?? null, error: list.length ? null : { message: 'no rows', code: 'PGRST116' } });
      },
      maybeSingle() {
        const out = result();
        if (out.error) return Promise.resolve(out);
        const list = Array.isArray(out.data) ? out.data : out.data ? [out.data] : [];
        return Promise.resolve({ ...out, data: list[0] ?? null, error: null });
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(result()).then(onFulfilled, onRejected);
      },
    };
    return proxy;
  }

  return {
    feed,
    store,
    from(table) { return builder(table); },
    rpc(name, args) {
      feed.push({ table: `rpc:${name}`, op: 'rpc', values: clone(args ?? null), filters: [] });
      const failure = failures.find((entry) => entry.op === 'rpc' && (entry.table === undefined || entry.table === name));
      if (failure) return Promise.resolve({ data: null, error: { message: failure.message ?? 'rpc rejected', code: failure.code ?? 'XX000' } });
      const supplied = rpcResults[name];
      const value = typeof supplied === 'function' ? supplied(args) : supplied;
      if (value && typeof value === 'object' && ('data' in value || 'error' in value)) return Promise.resolve(value);
      return Promise.resolve({ data: value ?? null, error: null });
    },
    auth: {
      getUser(token) {
        const raw = String(token ?? '').replace(/^Bearer\s+/i, '');
        const match = /^(?:test-user|user):(.+)$/.exec(raw);
        if (!match) return Promise.resolve({ data: { user: null }, error: { message: 'invalid token' } });
        return Promise.resolve({ data: { user: { id: match[1] } }, error: null });
      },
      admin: {
        signOut: () => Promise.resolve({ error: null }),
        deleteUser: () => Promise.resolve({ error: null }),
      },
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://example.test/signed' }, error: null }),
        remove: (paths) => {
          const supplied = storage?.[bucket]?.remove;
          if (supplied) return Promise.resolve(supplied(paths));
          return Promise.resolve({ data: [], error: null });
        },
        upload: () => Promise.resolve({ data: { path: 'mock' }, error: null }),
        copy: () => Promise.resolve({ data: null, error: null }),
        // Reads a stored object back. A handler that reads an upload (the medicine-label
        // reader does) needs bytes, not a promise of a URL; `createMockDb({ storage })` can
        // supply its own, per bucket, when a test needs to control the content.
        download: (path) => {
          const supplied = storage?.[bucket]?.download;
          if (supplied) return Promise.resolve(supplied(path));
          return Promise.resolve({ data: null, error: { message: 'not found', statusCode: 404 } });
        },
      }),
    },
  };
}

const DEFAULT_ENV = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  SUPABASE_ANON_KEY: 'anon-test-key',
  HAVEN_INTERNAL_KEY: 'test-internal-key-that-is-at-least-32-chars',
};

let shimCounter = 0;

/** The harness whose handler is currently running; outbound fetch is routed to it. */
let activeFetch = null;
let fetchShimInstalled = false;

/**
 * Installs the outbound-HTTP stub once per process. Anything the handler fetches is
 * recorded on the active harness and answered by its `fetchImpl`, so a push provider
 * can be told to return 410 for one token without touching the network.
 */
function ensureFetchShim() {
  if (fetchShimInstalled) return;
  fetchShimInstalled = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    activeFetch?.calls.push({ url, init });
    // Always a promise: production code chains `.finally()` on fetch (the escalation
    // timeout clears itself that way), which a bare Response does not have.
    if (activeFetch?.fetchImpl) return Promise.resolve(activeFetch.fetchImpl(url, init, realFetch));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

/**
 * Installs the globals an Edge Function expects and imports it.
 *
 * Returns `{ handler, calls, db, env, waitUntil }` where `calls` collects the URLs
 * fetched by the handler (push notifications, outbound HTTP) and `waitUntil` holds the
 * promises handed to `EdgeRuntime.waitUntil`, so a test can await real background work
 * instead of racing it.
 */
export async function loadEdgeFunction(name, { db, env = {}, fetchImpl } = {}) {
  const outDir = await linkSharedModules();
  const sourceUrl = new URL(`${name}/index.ts`, FUNCTIONS);
  const path = await transpileModuleFile(sourceUrl, { outDir });

  const rewritten = readFileSync(path, 'utf8')
    .replace(/from\s+['"]\.\.\/_shared\/([A-Za-z0-9_-]+)(?:\.ts)?['"]/g, "from './$1.mjs'")
    .replace(/import\(\s*['"]\.\.\/_shared\/([A-Za-z0-9_-]+)(?:\.ts)?['"]\s*\)/g, "import('./$1.mjs')");
  writeFileSync(path, rewritten);

  let handler = null;
  const environment = { ...DEFAULT_ENV, ...env };
  globalThis.Deno = {
    env: {
      get: (key) => (Object.hasOwn(environment, key) ? environment[key] : undefined),
      set: (key, value) => { environment[key] = value; },
      delete: (key) => { delete environment[key]; },
      has: (key) => Object.hasOwn(environment, key),
      toObject: () => ({ ...environment }),
    },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve(), shutdown: () => Promise.resolve() }; },
    stdout: { write: () => Promise.resolve(0) },
    stderr: { write: () => Promise.resolve(0) },
    exit: () => undefined,
    // Deno.resolveDns is real (it backs the SSRF pre-resolution guard); a test sets
    // globalThis.__HAVEN_DNS_STUB__ to answer it, or leaves it undefined to fail.
    resolveDns: (name) => {
      const stub = globalThis.__HAVEN_DNS_STUB__;
      if (typeof stub === 'function') return Promise.resolve(stub(name));
      if (Array.isArray(stub)) return Promise.resolve([...stub]);
      return Promise.reject(new Error('dns not stubbed'));
    },
    // deno-lint-ignore no-explicit-any
    version: { deno: 'test-shim' },
  };

  const waitUntil = [];
  globalThis.EdgeRuntime = {
    waitUntil: (promise) => { waitUntil.push(Promise.resolve(promise)); },
  };

  // The handler runs *after* import, so the outbound-HTTP stub has to stay installed
  // for its whole life — restoring fetch here made every dispatch hit the real network.
  const session = { calls: [], fetchImpl };
  ensureFetchShim();
  activeFetch = session;
  globalThis.__HAVEN_SUPABASE_MOCK__ = db ?? createMockDb();

  shimCounter += 1;
  await import(`${path}?harness=${shimCounter}`);

  if (typeof handler !== 'function') {
    throw new Error(`${name} did not register a handler through Deno.serve`);
  }

  return {
    handler,
    calls: session.calls,
    waitUntil,
    db,
    env: environment,
    /** Await everything the handler handed to EdgeRuntime.waitUntil. */
    async settle() {
      while (waitUntil.length) await Promise.all(waitUntil.splice(0));
    },
  };
}

/**
 * Loads a `_shared/*.ts` module for direct unit-level testing.
 *
 * `env` is applied to the Deno shim first — without it a module that reads
 * configuration at import time (regulatory_escalation reads its webhook URL) would
 * see the defaults and the test would exercise the unconfigured path by accident.
 */
export async function loadSharedModule(name, { env = {} } = {}) {
  const outDir = await linkSharedModules();
  installGlobalShim(env);
  const module = await import(`${outDir}/${name}.mjs?shared=${(shimCounter += 1)}`);
  return module;
}

/** Installs only the globals a `_shared` module needs (env), without capturing a handler. */
export function installGlobalShim(env = {}) {
  const environment = { ...DEFAULT_ENV, ...env };
  globalThis.Deno = {
    env: {
      get: (key) => (Object.hasOwn(environment, key) ? environment[key] : undefined),
      set: (key, value) => { environment[key] = value; },
      delete: (key) => { delete environment[key]; },
      has: (key) => Object.hasOwn(environment, key),
      toObject: () => ({ ...environment }),
    },
    serve: () => ({ finished: Promise.resolve() }),
    stdout: { write: () => Promise.resolve(0) },
    stderr: { write: () => Promise.resolve(0) },
    exit: () => undefined,
    resolveDns: (name) => {
      const stub = globalThis.__HAVEN_DNS_STUB__;
      if (typeof stub === 'function') return Promise.resolve(stub(name));
      if (Array.isArray(stub)) return Promise.resolve([...stub]);
      return Promise.reject(new Error('dns not stubbed'));
    },
    version: { deno: 'test-shim' },
  };
  globalThis.EdgeRuntime = { waitUntil: (promise) => Promise.resolve(promise) };
  return environment;
}

/** Builds a Request the way the gateway would deliver it. */
export function request(path, { method = 'POST', body, headers = {}, base = 'https://example.test' } = {}) {
  const init = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(`${base}/${path.replace(/^\//, '')}`, init);
}

/** Runs the handler and parses the response, so assertions read as behaviour. */
export async function call(handler, req) {
  const response = await handler(req);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers, response };
}

/**
 * Transpiles an app module that imports `expo-sqlite`, rewriting that specifier to the
 * node:sqlite shim so the real queue code can run in this environment.
 *
 * @param {string|URL} relativePath path under the repository root, e.g.
 *   'apps/elder/src/services/sqliteOfflineQueue.ts'
 * @returns {Promise<string>} importable path of the transpiled module
 */
// A relative import specifier as the transpiler leaves it: './x', './x.mjs', '../a/b'.
const relativeSpecifier = /from\s+['"](\.[^'"]*)['"]/g;

/**
 * Resolves a relative specifier against `from` (the original source file) to the .ts/.tsx
 * file it means. Returns null when the specifier is already flattened or names a stub.
 */
function resolveAppModule(from, specifier) {
  if (specifier.endsWith('.mjs')) return null; // already a stub or already flattened
  const base = new URL(specifier, from);
  for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = new URL(`${base.href}${suffix}`);
    try {
      if (statSync(fileURLToPath(candidate)).isFile()) return candidate;
    } catch {
      // try the next suffix
    }
  }
  return null;
}

export async function loadAppModule(relativePath, { stubs = {} } = {}) {
  installGlobalShim();
  const outDir = await linkSharedModules();
  // The rewritten specifier is relative to the transpile directory, so the shim has to
  // exist there too.
  writeFileSync(
    join(outDir, 'expo-sqlite-node.mjs'),
    readFileSync(new URL('./expo-sqlite-node.mjs', import.meta.url), 'utf8'),
  );
  const url = new URL(`../../../${relativePath}`, import.meta.url);
  const path = await transpileModuleFile(url, { outDir });

  // Stubs are applied to the *original* specifiers, before relative imports are
  // normalised — otherwise `./supabase-server` has already become `./supabase-server.mjs`
  // and the stub would never match.
  let rewritten = readFileSync(path, 'utf8');
  const stubbed = new Set();
  let stubIndex = 0;
  for (const [specifier, stub] of Object.entries(stubs)) {
    stubIndex += 1;
    let target;
    if (typeof stub === 'string') {
      const name = `stub-${stubIndex}-${specifier.replace(/[^a-z0-9]+/gi, '-')}.mjs`;
      writeFileSync(join(outDir, name), stub);
      target = `./${name}`;
    } else {
      target = new URL(`../../../${stub.path}`, import.meta.url).href;
    }
    // The transpiler has already turned './x' into './x.mjs', so a stub key may be
    // written either way.
    const candidates = new Set([
      specifier,
      specifier.replace(/\.ts$/, '.mjs'),
      `${specifier.replace(/\.ts$/, '')}.mjs`,
      `${specifier.replace(/\.ts$/, '')}.ts`,
    ]);
    for (const candidate of candidates) {
      for (const quote of ["'", '"']) {
        rewritten = rewritten.split(`from ${quote}${candidate}${quote}`).join(`from '${target}'`);
      }
    }
    // A stubbed relative module must not also be transpiled into the directory.
    stubbed.add(specifier.replace(/^\.\//, '').replace(/\.ts$/, ''));
  }

  // Modules the app module imports from elsewhere in the app ('./sibling', or
  // '../services/x' as the button imports its recorder). Node resolves a relative specifier
  // against the transpile directory, so everything outside it is copied in and the import
  // flattened to './<basename>.mjs'. `url` is the original source, so specifiers resolve
  // against the real tree; a specifier that resolves to nothing is left alone (it may name a
  // package subpath) rather than guessed at.
  const copied = new Map();
  const queue = [];

  const normalise = (fromUrl, text, depth) => text
    .replace(/from\s+['"]expo-sqlite['"]/g, "from './expo-sqlite-node.mjs'")
    .replace(relativeSpecifier, (match, name) => {
      // A stub was already pointed at a generated file in the transpile directory. Those names
      // carry a `stub-` or shim prefix and resolve to nothing in the app tree, so the lookup
      // below leaves them alone.
      if (stubbed.has(name) || stubbed.has(name.replace(/\.mjs$/, ''))) return match;
      // `transpileModuleFile` already appends `.mjs` to single-dot sibling imports, so a
      // sibling can arrive here pre-flattened. Resolving it as well is what makes an entry
      // module with a `./sibling` import loadable at all: the copy used to be skipped and Node
      // failed with ERR_MODULE_NOT_FOUND for a module that exists in the repository.
      const base = name.replace(/\.mjs$/, '').replace(/\.tsx?$/, '');
      const basename = base.split('/').pop();
      const target = resolveAppModule(fromUrl, base);
      if (!target) return match; // a type-only sibling, or not a file at all
      const seen = copied.get(basename);
      if (seen && seen.href !== target.href) {
        throw new Error(
          `loadAppModule: two different modules both named ${basename}.mjs (${seen.href} and ${target.href})`,
        );
      }
      copied.set(basename, target);
      if (!seen && depth < 8) queue.push({ source: target, depth: depth + 1 });
      return `from './${basename}.mjs'`;
    });

  rewritten = normalise(url, rewritten, 0);
  writeFileSync(path, rewritten);

  while (queue.length > 0) {
    const { source, depth } = queue.shift();
    const emitted = await transpileModuleFile(source, { outDir });
    writeFileSync(emitted, normalise(source, readFileSync(emitted, 'utf8'), depth));
  }

  const loaded = await import(`${path}?app=${(shimCounter += 1)}`);
  // Returned as a plain copy because a module namespace object is frozen, and the test
  // needs the same sqlite shim instance the module is using (to age a lease, say).
  return {
    ...loaded,
    __sqlite: await import(join(outDir, 'expo-sqlite-node.mjs')),
  };
}

export { SHARED, FUNCTIONS };
