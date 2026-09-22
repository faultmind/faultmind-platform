import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Prevents circular JSON/ESLint 9 serialization errors from failing the Netlify build
    ignoreDuringBuilds: true,
  },
  experimental: {
    reactCompiler: true,
  },
};

export default withNextIntl(nextConfig);
