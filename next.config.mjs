/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Fallbacks for node-specific modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        path: false,
        os: false,
        'perf_hooks': false,
      };

      // Alias @safe-global packages to empty modules
      // These are pulled in by wagmi's Safe connector which we don't use
      config.resolve.alias = {
        ...config.resolve.alias,
        '@safe-global/safe-apps-sdk': false,
        '@safe-global/safe-apps-provider': false,
      };
    }
    return config;
  },
};

export default nextConfig;
