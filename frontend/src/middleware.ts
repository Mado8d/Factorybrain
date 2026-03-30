import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('fb_token')?.value;
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // For dashboard routes, we rely on client-side auth check
  // since the JWT is stored in localStorage (not cookies).
  // The AuthGuard component handles redirect to /login.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
