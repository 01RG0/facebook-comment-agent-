/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.facebook.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
}

export default nextConfig
