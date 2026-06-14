'use client';

// src/components/providers/Providers.tsx
// Root provider composition: QueryClient + Wagmi + Web3 + AuraAgent

import React, { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi-config';
import { Web3Provider } from '@/contexts/Web3Context';
import { AuraAgentProvider } from '@/contexts/AuraAgentContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <Web3Provider>
          <AuraAgentProvider>{children}</AuraAgentProvider>
        </Web3Provider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
