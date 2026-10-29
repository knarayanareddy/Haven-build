// P1.3 — family dashboard authorisation.
//
// Three defects are pinned here, all of which let a visitor read an older adult's
// data without a relationship check:
//   1. middleware.ts checked `cookies.get('sb-access-token')` — a cookie name
//      @supabase/ssr never writes, so it was a "did you set any cookie" test.
//   2. The permission map only added an `x-haven-required-permission` response
//      header; nothing was ever denied.
//   3. The dashboard authenticated with one shared server-side token
//      (HAVEN_FAMILY_ACCESS_TOKEN) and picked the elder with HAVEN_FAMILY_ELDER_ID.
//
// These are static/behavioural assertions over the real source, because the Next
// runtime is not started in the unit suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

/** Source with comments removed — the files document the defects they fixed. */
function code(rel) {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('middleware validates the session with Supabase Auth instead of a cookie name guess', () => {
  const middleware = code('apps/family/middleware.ts');
  assert.equal(/sb-access-token/.test(middleware), false, 'the invented cookie name must be gone');
  assert.match(middleware, /supabase\.auth\.getUser\(\)/, 'must validate the JWT server-side');
  assert.match(middleware, /createServerClient/, 'must use @supabase/ssr so tokens refresh');
  assert.match(middleware, /NextResponse\.redirect/, 'must actually redirect unauthenticated callers');
  assert.equal(
    /x-haven-required-permission/.test(middleware),
    false,
    'a response header is not an authorisation decision',
  );
});

test('middleware fails closed when Supabase is not configured', () => {
  const middleware = code('apps/family/middleware.ts');
  const unconfigured = middleware.slice(middleware.indexOf('if (!url || !anonKey)'));
  assert.match(unconfigured.slice(0, 400), /redirect/, 'missing configuration must still block /dashboard');
});

test('the dashboard no longer authenticates with a shared environment token', () => {
  const page = code('apps/family/src/app/dashboard/page.tsx');
  assert.equal(/HAVEN_FAMILY_ACCESS_TOKEN/.test(page), false);
  assert.equal(/HAVEN_FAMILY_ELDER_ID/.test(page), false);
  assert.match(page, /resolveFamilySession/, 'identity must come from the caller session');
  assert.match(page, /export const dynamic = 'force-dynamic'/, 'a session-dependent page must not be prerendered');
});

test('permissions come from the family_relationships row, not from the route', () => {
  const session = read('apps/family/src/lib/session.ts');
  for (const column of [
    'can_view_medications',
    'can_view_messages',
    'can_view_location_events',
    'can_view_alerts',
    'can_view_stories',
    'can_view_financials',
  ]) {
    assert.match(session, new RegExp(column), `must read ${column}`);
  }
  assert.match(session, /elder_consented === true/, 'an unconsented relationship must never grant access');
  assert.match(session, /is_active === true/, 'an inactive relationship must never grant access');
  assert.match(session, /getUser\(\)/, 'must use getUser(), not getSession(), for authorisation');
});

test('every dashboard sub-page is consent-gated', () => {
  const pages = {
    agenda: 'medications',
    buurt: 'stories',
    locatie: 'location',
    medicijnen: 'medications',
    meldingen: 'alerts',
    wacht: 'visits',
  };
  for (const [page, permission] of Object.entries(pages)) {
    const source = read(`apps/family/src/app/dashboard/${page}/page.tsx`);
    assert.match(
      source,
      new RegExp(`withFamilyConsent\\('${permission}'`),
      `/dashboard/${page} must be gated on ${permission}`,
    );
    assert.match(source, /export const dynamic = 'force-dynamic'/, `/dashboard/${page} must be dynamic`);
  }
});

test('invented clinical content is not rendered to family members', () => {
  const agenda = code('apps/family/src/app/dashboard/agenda/page.tsx');
  const medicijnen = code('apps/family/src/app/dashboard/medicijnen/page.tsx');

  assert.equal(/DEMO_AGENDA/.test(agenda), false, 'the demo appointment list must be gone');
  for (const invented of ['dr. van der Linden', 'Bloedprikken', 'OLVG', 'Apotheek De Pijp']) {
    assert.equal(agenda.includes(invented), false, `invented appointment "${invented}" must not be rendered`);
  }
  for (const invented of ['Metformine', 'Lisinopril']) {
    assert.equal(medicijnen.includes(invented), false, `invented medication "${invented}" must not be rendered`);
  }
});

test('sign-in page provides a real authentication flow', () => {
  const signIn = read('apps/family/src/app/inloggen/page.tsx');
  assert.match(signIn, /signInWithOtp/, 'must actually sign the user in');
  assert.match(signIn, /createBrowserClient/, 'must use @supabase/ssr');
  assert.match(signIn, /shouldCreateUser: false/, 'must not silently create accounts');
});

test('the magic-link callback exchanges the code for a session', () => {
  const callback = read('apps/family/src/app/auth/callback/route.ts');
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /startsWith\('\/'\)/, 'the `next` target must not be an open redirect');
});

test('the family app declares the Supabase SSR dependencies', () => {
  const pkg = JSON.parse(read('apps/family/package.json'));
  assert.ok(pkg.dependencies['@supabase/ssr'], '@supabase/ssr must be a dependency');
  assert.ok(pkg.dependencies['@supabase/supabase-js'], '@supabase/supabase-js must be a dependency');
});
