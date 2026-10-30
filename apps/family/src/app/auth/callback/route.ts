import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Magic-link callback.
 *
 * `@supabase/ssr` needs a server-side exchange so the session ends up in cookies
 * that the middleware can refresh. Without it the link would land back on
 * /dashboard with no session and bounce to /inloggen forever.
 */

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/inloggen?reason=unconfigured`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/inloggen?reason=missing-code`);
  }

  const response = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/inloggen?reason=invalid-link`);
  }

  return response;
}
