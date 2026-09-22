import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse } from 'next/server';

const handleI18nRouting = createMiddleware(routing);

export function middleware(request) {
  const pathname = request.nextUrl.pathname;

  // 1. Example: Block access to /admin paths across any locale
  // Matches /admin, /en/admin, /ar/admin, /de/admin
  if (pathname.includes('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 2. Execute next-intl routing (handles locale prefixing, cookies, and redirects)
  const response = handleI18nRouting(request);

  // 3. Add security headers to the localized response
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Middleware-Executed', 'true');

  // 4. Custom header for API / diagnostic endpoints
  if (pathname.startsWith('/api/')) {
    response.headers.set('X-API-Version', '1.0');
  }

  return response;
}

export const config = {
  // Match all paths except internal Next.js assets, static files, and images
  matcher: [
    '/',
    '/(ar|en|de)/:path*',
    '/((?!api|_next|_vercel|favicon.ico|.*\\..*).*)',
  ],
};
