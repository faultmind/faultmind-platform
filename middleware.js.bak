import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse } from 'next/server';

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request) {
  const pathname = request.nextUrl.pathname;

  // 1. Guard administrative routes across all locales
  if (pathname.includes('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 2. Delegate to next-intl for locale detection and redirects
  const response = handleI18nRouting(request);

  // 3. Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    '/',
    '/(ar|en|de)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
