// src/lib/chains.ts
// Chain configurations for Arbitrum Sepolia and Base Sepolia

import { arbitrumSepolia, base } from 'viem/chains';

export const SUPPORTED_CHAINS = [arbitrumSepolia, base] as const;

export const DEFAULT_CHAIN = arbitrumSepolia;

export const CHAIN_CONFIG = {
  [arbitrumSepolia.id]: {
    name: 'Arbitrum Sepolia',
    chain: arbitrumSepolia,
    usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_ARBITRUM_SEPOLIA as `0x${string}`,
    rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://sepolia.arbiscan.io',
    faucetUrl: 'https://faucet.circle.com',
  },
  [base.id]: {
    name: 'Base Mainnet',
    chain: base,
    usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE as `0x${string}`,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_MAINNET_RPC || 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    faucetUrl: '',
  },
} as const;

export const getChainConfig = (chainId: number) => {
  return CHAIN_CONFIG[chainId as keyof typeof CHAIN_CONFIG];
};
