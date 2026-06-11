import { NextRequest, NextResponse } from 'next/server';

const permissionMap: Record<string, string> = {
  '/dashboard/medicijnen': 'can_view_medications',
  '/dashboard/meldingen': 'can_view_alerts',
  '/dashboard/buurt': 'can_view_stories',
  '/dashboard/locatie': 'can_view_location_events',
  '/dashboard/wacht': 'can_view_visit_logs',
};

export function middleware(request: NextRequest) {
  const required = permissionMap[request.nextUrl.pathname];
  const hasSession = Boolean(request.cookies.get('sb-access-token')?.value || request.headers.get('authorization'));
  if (!hasSession && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/inloggen', request.url));
  }
  if (required) {
    const response = NextResponse.next();
    response.headers.set('x-haven-required-permission', required);
    return response;
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
