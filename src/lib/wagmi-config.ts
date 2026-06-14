// src/lib/wagmi-config.ts  
// Wagmi v2 — use window.ethereum injected connector as fallback to avoid
// the @safe-global barrel issue from wagmi's connector exports

import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { arbitrumSepolia, base } from 'viem/chains';

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia, base],
  connectors: [
    // Use injected connector targeting MetaMask
    // This avoids importing wagmi/connectors barrel file which pulls in @safe-global
    injected({ target: 'metaMask' as any }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(
      process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc'
    ),
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_MAINNET_RPC || 'https://mainnet.base.org'
    ),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
