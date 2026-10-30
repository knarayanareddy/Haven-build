// Behavioural tests for the family dashboard session gate.
//
// Replaces tests/edge/family-dashboard-auth.test.mjs, which read middleware.ts and
// page.tsx and matched strings. The defects it documented were real — a presence check
// on a cookie name Supabase never writes, and a "permission" that only set a response
// header — but a string search cannot tell "redirects when there is no session" from
// "contains the word redirect".
//
// Two units are driven here:
//   apps/family/middleware.ts        with the real `next/server` and a stubbed
//                                    @supabase/ssr, so the request/response behaviour
//                                    is the framework's own;
//   apps/family/src/lib/session.ts   with the Supabase server client stubbed, so each
//                                    branch of the permission mapping is exercised.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppModule } from './support/edge-function-harness.mjs';

const NEXT_SERVER = { path: 'apps/family/node_modules/next/server.js' };

/** @supabase/ssr stand-in; `__HAVEN_MIDDLEWARE_USER__` decides who is signed in. */
const SSR_STUB = `
export function createServerClient(_url, _key, options) {
  return {
    auth: {
      async getUser() {
        const user = globalThis.__HAVEN_MIDDLEWARE_USER__ ?? null;
        return { data: { user }, error: user ? null : { message: 'no session' } };
      },
    },
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    cookies: options?.cookies,
  };
}
`;

const REDIRECT_STUB = `
export function redirect(url) {
  const error = new Error('NEXT_REDIRECT');
  error.digest = 'NEXT_REDIRECT;replace;' + url + ';307;';
  throw error;
}
`;

async function loadMiddleware() {
  const module = await loadAppModule('apps/family/middleware.ts', {
    stubs: { 'next/server': NEXT_SERVER, '@supabase/ssr': SSR_STUB },
  });
  return module.middleware;
}

function nextRequest(path, { cookies = [] } = {}) {
  const request = new Request(`https://gezin.haven.test${path}`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') } });
  // The middleware reads `request.nextUrl.pathname`, which Next's own NextRequest parses.
  request.nextUrl = new URL(`https://gezin.haven.test${path}`);
  request.cookies = {
    getAll: () => cookies,
    get: (name) => cookies.find((cookie) => cookie.name === name),
    set: () => undefined,
  };
  return request;
}

function setEnv({ configured = true } = {}) {
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
}

test('an unconfigured deployment still refuses the dashboard', async () => {
  // Failing open here would mean that forgetting an environment variable publishes every
  // family's medication and location data.
  setEnv({ configured: false });
  globalThis.__HAVEN_MIDDLEWARE_USER__ = null;
  const middleware = await loadMiddleware();

  const response = await middleware(nextRequest('/dashboard'));
  assert.equal(response.status, 307);
  assert.match(response.headers.get('location'), /\/inloggen\?reason=unconfigured$/);

  const publicPage = await middleware(nextRequest('/'));
  assert.notEqual(publicPage.status, 307, 'an unmatched page must not be redirected');
});

test('a request with no session is sent to sign in, carrying the destination', async () => {
  setEnv();
  globalThis.__HAVEN_MIDDLEWARE_USER__ = null;
  const middleware = await loadMiddleware();

  // A hand-set cookie is not a session: @supabase/ssr's getUser() is what decides.
  const response = await middleware(nextRequest('/dashboard/medicatie', {
    cookies: [{ name: 'sb-fake-auth-token', value: 'not-a-real-jwt' }],
  }));

  assert.equal(response.status, 307, 'the invented cookie name must no longer be enough');
  const location = new URL(response.headers.get('location'));
  assert.equal(location.pathname, '/inloggen');
  assert.equal(location.searchParams.get('next'), '/dashboard/medicatie');
});

test('a signed-in family member reaches the dashboard', async () => {
  setEnv();
  globalThis.__HAVEN_MIDDLEWARE_USER__ = { id: 'user-1' };
  const middleware = await loadMiddleware();

  const response = await middleware(nextRequest('/dashboard'));
  assert.equal(response.status, 200, 'an authenticated request must pass through');
});

test('a signed-in visitor is moved off the sign-in page', async () => {
  setEnv();
  globalThis.__HAVEN_MIDDLEWARE_USER__ = { id: 'user-1' };
  const middleware = await loadMiddleware();

  const response = await middleware(nextRequest('/inloggen'));
  assert.equal(response.status, 307);
  assert.match(response.headers.get('location'), /\/dashboard$/);
});

// ─── resolveFamilySession: the permission decision ───────────────────────────

function sessionStub(rows, { user = { id: 'user-1', email: 'a@b.nl' }, configured = true } = {}) {
  if (!configured) return 'export async function createSupabaseServerClient() { return null; }\n';
  return `
const rows = ${JSON.stringify(rows)};
const user = ${JSON.stringify(user)};
export async function createSupabaseServerClient() {
  return {
    auth: { async getUser() { return { data: { user }, error: user ? null : { message: 'none' } }; } },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
    },
  };
}
`;
}

async function loadSession(rows, options) {
  return loadAppModule('apps/family/src/lib/session.ts', {
    stubs: {
      './supabase-server': sessionStub(rows, options),
      'next/navigation': REDIRECT_STUB,
    },
  });
}

const consentedRow = {
  elder_id: 'elder-1',
  elder_consented: true,
  is_active: true,
  can_view_medications: true,
  can_view_messages: false,
  can_view_location_events: true,
  can_view_alerts: true,
  can_view_stories: false,
  can_view_financials: false,
};

test('an unconfigured deployment yields unconfigured, not an empty session', async () => {
  const session = await loadSession([], { configured: false });
  assert.equal((await session.resolveFamilySession()).kind, 'unconfigured');
});

test('a relationship the elder has not consented to grants nothing', async () => {
  const session = await loadSession([{ ...consentedRow, elder_consented: false }]);
  const result = await session.resolveFamilySession();

  assert.equal(result.kind, 'no-consent');
  assert.deepEqual(result.elderIds, ['elder-1']);
});

test('an inactive relationship is treated the same as an unconsented one', async () => {
  const session = await loadSession([{ ...consentedRow, is_active: false }]);
  assert.equal((await session.resolveFamilySession()).kind, 'no-consent');
});

test('permissions are the row\'s own columns, not the route', async () => {
  const session = await loadSession([consentedRow]);
  const result = await session.resolveFamilySession();

  assert.equal(result.kind, 'ready');
  assert.equal(result.session.userId, 'user-1');
  assert.equal(result.session.email, 'a@b.nl');
  assert.deepEqual(result.session.permissions, {
    medications: true,
    messages: false,
    location: true,
    alerts: true,
    stories: false,
    finances: false,
    // No separate column exists; visits follow the care-note permission.
    visits: false,
  });
});

test('every permission defaults to false when the columns are null', async () => {
  // A row written before these columns existed must not read as "allowed".
  const session = await loadSession([{
    elder_id: 'elder-1',
    elder_consented: true,
    is_active: true,
    can_view_medications: null,
    can_view_messages: null,
    can_view_location_events: null,
    can_view_alerts: null,
    can_view_stories: null,
    can_view_financials: null,
  }]);
  const result = await session.resolveFamilySession();

  assert.deepEqual(Object.values(result.session.permissions).every((value) => value === false), true);
});

test('a requested elder is honoured when consent exists for them', async () => {
  const session = await loadSession([
    { ...consentedRow, elder_id: 'elder-1' },
    { ...consentedRow, elder_id: 'elder-2', can_view_medications: false },
  ]);
  const result = await session.resolveFamilySession('elder-2');

  assert.equal(result.session.elderId, 'elder-2');
  assert.equal(result.session.permissions.medications, false);
});

test('an unconsented requested elder falls back to one that is consented', async () => {
  const session = await loadSession([
    { ...consentedRow, elder_id: 'elder-1' },
    { ...consentedRow, elder_id: 'elder-2', elder_consented: false },
  ]);
  const result = await session.resolveFamilySession('elder-2');

  assert.equal(result.session.elderId, 'elder-1', 'a request cannot select a person who has not consented');
});
