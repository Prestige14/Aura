// src/app/layout.tsx
// Root layout with metadata, providers, and global structure

import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers/Providers';

export const metadata: Metadata = {
  title: 'Aura: The Autonomous Web3 Concierge',
  description:
    'An intelligent Web3 AI concierge powered by MetaMask Smart Accounts, EIP-7702, ERC-7715, 1Shot API, and Venice AI. Autonomously generate content, pay for AI inference in USDC, and delegate tasks to specialized sub-agents.',
  keywords: [
    'Web3', 'AI', 'MetaMask', 'Smart Accounts', 'EIP-7702', 'ERC-7715',
    'Venice AI', '1Shot API', 'USDC', 'Arbitrum', 'Autonomous Agents',
  ],
  authors: [{ name: 'Aura Labs' }],
  openGraph: {
    title: 'Aura: The Autonomous Web3 Concierge',
    description: 'AI-powered Web3 concierge with autonomous payments and agent delegation',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#070B12] text-[#E2E8F0] min-h-screen antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
