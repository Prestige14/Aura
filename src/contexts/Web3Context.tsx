'use client';

// src/contexts/Web3Context.tsx
// MetaMask Smart Accounts + ERC-7715 Session Management Context

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { createWalletClient, custom, createPublicClient, http, type Address } from 'viem';
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi';
import { ERC20_ABI } from '@/lib/usdc-abi';
import { getChainConfig, DEFAULT_CHAIN } from '@/lib/chains';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SmartAccountStatus =
  | 'idle'
  | 'upgrading'
  | 'requesting-permissions'
  | 'active'
  | 'error';

export interface SessionPermission {
  grantedAt: number;
  expiresAt: number;
  spendLimit: bigint; // USDC amount in raw units
  sessionKey: Address;
  permissionContext: unknown; // Raw ERC-7715 context
}

export interface Web3State {
  // Wallet
  address: Address | undefined;
  isConnected: boolean;
  chainId: number | undefined;

  // Smart Account
  smartAccountStatus: SmartAccountStatus;
  isSmartAccount: boolean;
  sessionPermission: SessionPermission | null;

  // Balances
  usdcBalance: bigint;
  isLoadingBalance: boolean;

  // Actions
  switchToTestnet: () => Promise<void>;
  upgradeToSmartAccount: () => Promise<void>;
  checkSmartAccountStatus: () => Promise<boolean>;
  requestSessionPermissions: () => Promise<SessionPermission>;
  refreshBalance: () => Promise<void>;

  // Error
  error: string | null;
  clearError: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const Web3Context = createContext<Web3State | null>(null);

export const useWeb3 = (): Web3State => {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error('useWeb3 must be used within Web3Provider');
  return ctx;
};

// ─── Provider ────────────────────────────────────────────────────────────────

export function Web3Provider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  // useWalletClient returns a viem WalletClient that is properly authorized
  // through the wagmi connector — this avoids the MetaMask "not authorized" error
  // that occurs when using raw window.ethereum.request for wallet_sendCalls
  const { data: walletClient } = useWalletClient();

  const [smartAccountStatus, setSmartAccountStatus] = useState<SmartAccountStatus>('idle');
  const [isSmartAccount, setIsSmartAccount] = useState(false);
  const [sessionPermission, setSessionPermission] = useState<SessionPermission | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ── Get chain config ──────────────────────────────────────────────────────

  const chainConfig = chainId ? getChainConfig(chainId) : getChainConfig(DEFAULT_CHAIN.id);

  // ── Public client ─────────────────────────────────────────────────────────

  const getPublicClient = useCallback(() => {
    const cfg = chainConfig || getChainConfig(DEFAULT_CHAIN.id);
    return createPublicClient({
      chain: cfg.chain,
      transport: http(cfg.rpcUrl),
    });
  }, [chainConfig]);

  // ── Refresh USDC balance ──────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    if (!address || !chainConfig) return;

    setIsLoadingBalance(true);
    try {
      const publicClient = getPublicClient();
      const balance = await publicClient.readContract({
        address: chainConfig.usdcAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      setUsdcBalance(balance);
    } catch (err) {
      console.error('Failed to fetch USDC balance:', err);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address, chainConfig, getPublicClient]);

  // Auto-refresh balance when address/chain changes
  useEffect(() => {
    if (isConnected && address) {
      refreshBalance();
    }
  }, [isConnected, address, chainId, refreshBalance]);

  // ── Switch to testnet ─────────────────────────────────────────────────────

  const switchToTestnet = useCallback(async () => {
    try {
      // First request the switch
      await switchChainAsync({ chainId: DEFAULT_CHAIN.id });
      
      // Then wait for MetaMask to actually emit the chainChanged event
      // This is the only reliable way to know the switch is complete
      await new Promise<void>((resolve, reject) => {
        const targetChainHex = `0x${DEFAULT_CHAIN.id.toString(16)}`;
        
        // Already on the right chain?
        if ((window.ethereum as any)?.chainId === targetChainHex) {
          resolve();
          return;
        }
        
        const timeout = setTimeout(() => {
          window.ethereum?.removeListener?.('chainChanged', handler);
          reject(new Error('Network switch timed out. Please switch to Arbitrum Sepolia manually in MetaMask.'));
        }, 8000); // 8 seconds to give the user enough time to click approve
        
        const handler = (chainId: string) => {
          if (chainId === targetChainHex) {
            clearTimeout(timeout);
            window.ethereum?.removeListener?.('chainChanged', handler);
            resolve();
          }
        };
        
        window.ethereum?.on?.('chainChanged', handler);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to switch network';
      setError(msg);
      throw err;
    }
  }, [switchChainAsync]);

  // ── Upgrade to Smart Account via EIP-7702 ────────────────────────────────
  //
  // EIP-7702: EOA signs an authorization to point to a smart account
  // implementation. This "upgrades" the EOA without migrating it.
  // MetaMask Smart Accounts Kit handles this via wallet_sendCalls with
  // EIP-7702 authorization.

  // ── Check if account is already a Smart Account on-chain ────────────────
  //
  // EIP-7702 upgrade sets bytecode at the EOA address. If getCode returns
  // non-empty bytecode, the account is already a smart account.

  const checkSmartAccountStatus = useCallback(async (): Promise<boolean> => {
    if (!address) return false;
    try {
      const publicClient = getPublicClient();
      const code = await publicClient.getCode({ address });
      const isSmart = !!code && code !== '0x';
      console.log('[checkSA] bytecode at', address, ':', code?.slice(0, 20), '→ isSmart:', isSmart);
      if (isSmart) {
        setIsSmartAccount(true);
        setSmartAccountStatus('active');
      }
      return isSmart;
    } catch (err) {
      console.error('[checkSA] failed:', err);
      return false;
    }
  }, [address, getPublicClient]);

  // Auto-check smart account status when address/chain changes
  useEffect(() => {
    if (isConnected && address) {
      checkSmartAccountStatus();
    } else {
      setIsSmartAccount(false);
      setSmartAccountStatus('idle');
    }
  }, [isConnected, address, chainId, checkSmartAccountStatus]);

  const upgradeToSmartAccount = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask not connected');
    }

    setSmartAccountStatus('upgrading');
    setError(null);

    try {
      // Step 0: Check if already a smart account (has on-chain bytecode)
      const alreadySmart = await checkSmartAccountStatus();
      if (alreadySmart) {
        console.log('[upgrade] Account already a smart account (has bytecode). Done.');
        return;
      }

      // Step 1: Verify chain
      const liveChainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      console.log('[upgrade] Live chain ID:', liveChainIdHex);
      const isAllowedChain = liveChainIdHex.toLowerCase() === '0x66eee' || liveChainIdHex.toLowerCase() === '0x2105';
      if (!isAllowedChain) {
        throw new Error(`Please switch MetaMask to Arbitrum Sepolia or Base Mainnet. Currently on chain ${liveChainIdHex}.`);
      }

      const liveAccount = address as Address;
      console.log('[upgrade] Using account:', liveAccount);

      // Step 2: Attempt wallet_sendCalls via wagmi walletClient
      // MetaMask Flask may restrict external EIP-7702 initiation — we handle
      // that error gracefully below.
      if (!walletClient) {
        throw new Error('Wallet client not ready. Please reconnect MetaMask.');
      }

      console.log('[upgrade] Calling wallet_sendCalls via wagmi walletClient...');
      try {
        const batchId = await (walletClient as any).request({
          method: 'wallet_sendCalls',
          params: [{
            version: '2.0.0',
            chainId: liveChainIdHex,
            from: liveAccount,
            atomicRequired: false,
            calls: [{
              to: liveAccount,
              value: '0x0',
            }],
          }],
        });
        console.log('[upgrade] wallet_sendCalls batchId:', batchId);
        setIsSmartAccount(true);
        setSmartAccountStatus('active');
        return;
      } catch (sendCallsErr: any) {
        const errCode = sendCallsErr?.code ?? sendCallsErr?.cause?.code;
        const errMsg = sendCallsErr?.message ?? '';
        console.warn('[upgrade] wallet_sendCalls failed (code:', errCode, '):', errMsg);

        // MetaMask Flask blocks external EIP-7702 for dApps (error 4100 or specific messages)
        // In this case, prompt the user to upgrade via MetaMask's own UI
        const isFlaskRestriction =
          errCode === 4100 ||
          errMsg.includes('not been authorized') ||
          errMsg.includes('not supported') ||
          errMsg.includes('not authorized');

        if (isFlaskRestriction) {
          throw new Error(
            'MetaMask Flask restricts external EIP-7702 upgrades. ' +
            'Please upgrade your account inside MetaMask (Settings → Smart Account), ' +
            'then click "Verify Smart Account" below.'
          );
        }
        throw sendCallsErr;
      }
    } catch (err: any) {
      console.error('[upgrade] FAILED at step:', err);
      const msg = err instanceof Error ? err.message : (err?.message || 'Failed to upgrade smart account');
      setError(msg);
      setSmartAccountStatus('error');
      throw err;
    }
  }, [address, chainConfig, walletClient, checkSmartAccountStatus]);

  // ── Request ERC-7715 Session Permissions ─────────────────────────────────
  //
  // ERC-7715: wallet_grantPermissions allows dApps to request scoped
  // spending rights. Here we request permission to spend up to 5 USDC
  // on behalf of the user for AI interactions.

  const requestSessionPermissions = useCallback(async (): Promise<SessionPermission> => {
    if (!address || !window.ethereum) {
      throw new Error('MetaMask not connected');
    }

    setSmartAccountStatus('requesting-permissions');
    setError(null);

    try {
      const { erc7715ProviderActions } = await import('@metamask/smart-accounts-kit/actions');

      const walletClient = createWalletClient({
        account: address,
        transport: custom(window.ethereum),
      }).extend(erc7715ProviderActions()) as any;

      const expiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
      const spendLimit = BigInt(5000000); // 5 USDC (6 decimals)
      
      // Get USDC address for the current chain config, fallback to Base Mainnet USDC address
      const usdcAddress = chainConfig?.usdcAddress || ('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address);

      const agentAddress = (process.env.NEXT_PUBLIC_AGENT_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8') as Address; // Default anvil account 1 for dev

      console.log('Requesting session permissions for Agent via Smart Accounts Kit...');

      // In MetaMask Smart Accounts Kit, the method is requestExecutionPermissions
      // which takes an array of PermissionRequestParameter
      const permissionResult = await walletClient.requestExecutionPermissions([
        {
          chainId: chainId || 8453, // Defaults to Base Mainnet
          to: agentAddress,
          expiry,
          permission: {
            type: 'erc20-token-allowance',
            isAdjustmentAllowed: false,
            data: {
              tokenAddress: usdcAddress,
              allowanceAmount: spendLimit,
            },
          },
        },
      ]);

      console.log('Permission granted:', permissionResult);

      const sessionKey = address;

      const permission: SessionPermission = {
        grantedAt: Math.floor(Date.now() / 1000),
        expiresAt: expiry,
        spendLimit,
        sessionKey,
        permissionContext: permissionResult,
      };

      setSessionPermission(permission);
      setSmartAccountStatus('active');
      return permission;
    } catch (err: any) {
      console.error(err);
      const msg = err instanceof Error ? err.message : (err?.message || 'Failed to grant permissions');
      setError(msg);
      setSmartAccountStatus('error');

      // Removed simulation fallback per user request for "real" implementation
      throw err;
    }
  }, [address, chainId, chainConfig]);

  const value: Web3State = {
    address,
    isConnected,
    chainId,
    smartAccountStatus,
    isSmartAccount,
    sessionPermission,
    usdcBalance,
    isLoadingBalance,
    switchToTestnet,
    upgradeToSmartAccount,
    checkSmartAccountStatus,
    requestSessionPermissions,
    refreshBalance,
    error,
    clearError,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

// Extend window.ethereum type
declare global {
  interface Window {
    ethereum?: any;
  }
}
