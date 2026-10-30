import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Session gate for the family dashboard.
 *
 * What this replaced (and why it matters):
 *   • `Boolean(request.cookies.get('sb-access-token'))` — that cookie name is not
 *     used by Supabase Auth (`@supabase/ssr` writes `sb-<project-ref>-auth-token`,
 *     possibly chunked), so the check was a presence check on a cookie anyone can
 *     set by hand. Any visitor could reach /dashboard.
 *   • The permission map only *set a response header*
 *     (`x-haven-required-permission`) and never denied anything, so the dashboard
 *     rendered medication, location and care notes regardless of consent.
 *
 * Now: the session is refreshed against Supabase Auth (getUser validates the JWT),
 * unauthenticated requests are redirected, and the permission decision is enforced
 * in the page from the same `family_relationships` row that RLS checks.
 */

const PROTECTED_PREFIX = '/dashboard';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without configuration we cannot verify anyone. Fail closed on the dashboard.
  if (!url || !anonKey) {
    if (request.nextUrl.pathname.startsWith(PROTECTED_PREFIX)) {
      return NextResponse.redirect(new URL('/inloggen?reason=unconfigured', request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith(PROTECTED_PREFIX)) {
    const signIn = new URL('/inloggen', request.url);
    signIn.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  if (user && request.nextUrl.pathname === '/inloggen') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/inloggen'],
};
