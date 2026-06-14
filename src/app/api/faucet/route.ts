// src/app/api/faucet/route.ts
// Faucet API: Sends testnet USDC to newly connected wallets
// This route uses a developer private key (server-side only) to send USDC

import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, type Address, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, base } from 'viem/chains';
import { ERC20_ABI, USDC_UNIT } from '@/lib/usdc-abi';

// Rate limiting: track recent faucet requests (in-memory for demo)
const recentRequests = new Map<string, number>();
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

const getChainAndUSDC = (chainId: number) => {
  const chains: Record<number, { chain: Chain; usdcAddress: Address; rpcUrl: string }> = {
    [arbitrumSepolia.id]: {
      chain: arbitrumSepolia,
      usdcAddress: (process.env.NEXT_PUBLIC_USDC_ADDRESS_ARBITRUM_SEPOLIA || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d') as Address,
      rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    },
    [base.id]: {
      chain: base,
      usdcAddress: (process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Address,
      rpcUrl: process.env.NEXT_PUBLIC_BASE_MAINNET_RPC || 'https://mainnet.base.org',
    },
  };

  return chains[chainId] || chains[arbitrumSepolia.id];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, chainId = arbitrumSepolia.id } = body as {
      address: string;
      chainId?: number;
    };

    // Validate address
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    // Check developer private key
    const devPrivateKey = process.env.DEVELOPER_PRIVATE_KEY;
    if (!devPrivateKey) {
      return NextResponse.json(
        { 
          error: 'Faucet not configured. Please set DEVELOPER_PRIVATE_KEY in .env.local.',
          simulated: true,
          message: 'Running in simulation mode — 5 USDC virtually credited!',
          amount: '5.00',
          txHash: `0xsimulated${Date.now().toString(16)}`,
        },
        { status: 200 }
      );
    }

    // Rate limiting check
    const lastRequest = recentRequests.get(address.toLowerCase());
    if (lastRequest && Date.now() - lastRequest < RATE_LIMIT_MS) {
      const hoursLeft = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastRequest)) / (60 * 60 * 1000));
      return NextResponse.json(
        { error: `Faucet used recently. Try again in ${hoursLeft} hour(s).` },
        { status: 429 }
      );
    }

    const { chain, usdcAddress, rpcUrl } = getChainAndUSDC(chainId);

    // Format private key properly (ensure it has 0x prefix)
    const formattedPrivateKey = devPrivateKey.startsWith('0x') 
      ? (devPrivateKey as `0x${string}`) 
      : (`0x${devPrivateKey}` as `0x${string}`);

    // Set up developer wallet
    const devAccount = privateKeyToAccount(formattedPrivateKey);
    const walletClient = createWalletClient({
      account: devAccount,
      chain,
      transport: http(rpcUrl),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Check developer USDC balance
    const devBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [devAccount.address],
    });

    const faucetAmount = BigInt(process.env.NEXT_PUBLIC_FAUCET_AMOUNT || '5000000'); // 5 USDC

    if (devBalance < faucetAmount) {
      return NextResponse.json(
        { 
          error: 'Faucet depleted. Please refill the developer wallet with testnet USDC.',
          simulated: true,
          message: 'Faucet depleted — 5 USDC virtually credited for demo!',
          amount: '5.00',
          txHash: `0xsimulated${Date.now().toString(16)}`,
        },
        { status: 200 }
      );
    }

    // Send USDC transfer
    const txHash = await walletClient.writeContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [address as Address, faucetAmount],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
    });

    // Record rate limit
    recentRequests.set(address.toLowerCase(), Date.now());

    return NextResponse.json({
      success: true,
      txHash: receipt.transactionHash,
      amount: (Number(faucetAmount) / 1_000_000).toFixed(2),
      message: `Successfully sent ${(Number(faucetAmount) / 1_000_000).toFixed(2)} USDC to your wallet!`,
      blockNumber: receipt.blockNumber.toString(),
      network: chain.name,
    });
  } catch (err) {
    console.error('Faucet error:', err);
    const errMsg = err instanceof Error ? err.message : 'Faucet failed';
    
    return NextResponse.json(
      { error: `Faucet transaction failed: ${errMsg}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    description: 'Aura Testnet USDC Faucet',
    faucetAmount: '5 USDC',
    rateLimit: '24 hours per address',
  });
}
