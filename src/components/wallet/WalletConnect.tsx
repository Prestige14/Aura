'use client';

// src/components/wallet/WalletConnect.tsx
// Wallet connection, Smart Account upgrade, and ERC-7715 permission flow

import React, { useState, useCallback } from 'react';
import { useConnect, useDisconnect } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Zap, Shield, CheckCircle, AlertCircle, 
  Loader2, ExternalLink, ChevronDown, Copy, LogOut 
} from 'lucide-react';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatUSDC } from '@/lib/usdc-abi';
import clsx from 'clsx';

const STEPS = [
  { id: 'connect', label: 'Connect MetaMask', icon: Wallet },
  { id: 'upgrade', label: 'Upgrade to Smart Account', icon: Shield },
  { id: 'permissions', label: 'Grant Session Permissions', icon: CheckCircle },
];

interface WalletConnectProps {
  compact?: boolean;
}

export function WalletConnect({ compact = false }: WalletConnectProps) {
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    address,
    isConnected,
    chainId,
    smartAccountStatus,
    isSmartAccount,
    sessionPermission,
    usdcBalance,
    isLoadingBalance,
    switchToDefaultChain,
    upgradeToSmartAccount,
    checkSmartAccountStatus,
    requestSessionPermissions,
    refreshBalance,
    error,
    clearError,
  } = useWeb3();

  const [currentStep, setCurrentStep] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  // ── Step tracker ──────────────────────────────────────────────────────────

  const getCompletedSteps = () => {
    const steps = [];
    if (isConnected) steps.push('connect');
    if (isSmartAccount) steps.push('upgrade');
    if (sessionPermission) steps.push('permissions');
    return steps;
  };

  const completedSteps = getCompletedSteps();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    const metaMaskConnector = connectors.find(
      (c: any) => c.id === 'metaMask' || c.id === 'injected' || c.name === 'MetaMask' || c.name === 'Injected'
    );
    if (!metaMaskConnector) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    connect({ connector: metaMaskConnector });
  }, [connectors, connect]);

  const handleUpgrade = useCallback(async () => {
    setUpgradeLoading(true);
    try {
      // Allow Base Mainnet or Arbitrum Sepolia; switch only if not on either
      if (chainId !== 421614 && chainId !== 8453) {
        try {
          await switchToDefaultChain();
          // Give MetaMask extension time to propagate the new active network
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (switchErr: any) {
          // switchToDefaultChain failed or timed out — upgradeToSmartAccount
          // will verify chain ID and throw a clear error
          console.warn('Chain switch failed or timed out:', switchErr.message);
        }
      }
      await upgradeToSmartAccount();
    } catch (err) {
      console.error(err);
    } finally {
      setUpgradeLoading(false);
    }
  }, [chainId, switchToDefaultChain, upgradeToSmartAccount]);

  const handleVerifySmartAccount = useCallback(async () => {
    clearError();
    const isSmart = await checkSmartAccountStatus();
    if (!isSmart) {
      // Show message via error channel
      // (checkSmartAccountStatus doesn't set error, so we set it here)
      import('@/contexts/Web3Context').then(() => {}).catch(() => {});
      // We use a toast-style approach via the error state
      alert('No smart account bytecode detected on-chain yet. Please complete the upgrade in MetaMask Flask first.');
    }
  }, [checkSmartAccountStatus, clearError]);

  const handlePermissions = useCallback(async () => {
    setPermissionsLoading(true);
    try {
      if (chainId !== 421614 && chainId !== 8453) {
        await switchToDefaultChain();
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await requestSessionPermissions();
      setSetupComplete(true);
    } catch (err) {
      console.error(err);
    } finally {
      setPermissionsLoading(false);
    }
  }, [chainId, switchToDefaultChain, requestSessionPermissions]);

  const handleCopy = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // ── Not Connected ──────────────────────────────────────────────────────────

  if (!isConnected) {
    if (compact) {
      return (
        <button
          onClick={handleConnect}
          disabled={isPending}
          className="flex items-center gap-2 bg-gradient-to-r from-aura-accent to-violet-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:shadow-glow-sm transition-all"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wallet className="w-4 h-4" />
          )}
          {isPending ? 'Connecting...' : 'Connect'}
        </button>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-8"
      >
        {/* Hero section */}
        <div className="text-center space-y-4 max-w-xl">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="text-6xl mb-2"
          >
            ✦
          </motion.div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-aura-accent via-violet-400 to-aura-cyan bg-clip-text text-transparent">
            Your Autonomous AI Concierge
          </h2>
          <p className="text-aura-muted text-lg leading-relaxed">
            Connect MetaMask to unlock Smart Account capabilities, AI-powered content generation,
            and gasless transactions via USDC.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            { icon: '🔐', label: 'EIP-7702 Smart Account' },
            { icon: '🎫', label: 'ERC-7715 Sessions' },
            { icon: '⛽', label: 'Gasless via USDC' },
            { icon: '🤖', label: 'Venice AI' },
          ].map((f) => (
            <span
              key={f.label}
              className="px-4 py-2 rounded-full border border-aura-border bg-aura-surface text-sm text-aura-text flex items-center gap-2"
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </span>
          ))}
        </div>

        {/* Connect button */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleConnect}
          disabled={isPending}
          className={clsx(
            'relative px-8 py-4 rounded-2xl font-semibold text-lg text-white',
            'bg-gradient-to-r from-aura-accent to-violet-600',
            'shadow-[0_0_30px_rgba(108,99,255,0.4)]',
            'hover:shadow-[0_0_50px_rgba(108,99,255,0.6)]',
            'transition-all duration-300',
            'flex items-center gap-3',
            isPending && 'opacity-70 cursor-not-allowed'
          )}
        >
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Wallet className="w-5 h-5" />
          )}
          {isPending ? 'Connecting...' : 'Connect MetaMask'}
        </motion.button>

        <p className="text-aura-muted text-sm">
          Requires MetaMask Flask for full Smart Account features
        </p>
      </motion.div>
    );
  }

  // ── Connected — Setup Flow ─────────────────────────────────────────────────

  if (!compact && (!setupComplete || (!isSmartAccount || !sessionPermission))) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-lg mx-auto space-y-6"
      >
        {/* Wallet badge */}
        <div className="flex items-center justify-between bg-aura-surface border border-aura-border rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aura-accent to-violet-700 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-aura-text font-mono text-sm">{shortenAddress(address!)}</p>
              <p className="text-aura-muted text-xs">
                {isLoadingBalance ? '...' : `${formatUSDC(usdcBalance)} USDC`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-aura-muted hover:text-aura-text transition-colors p-2"
              title="Copy address"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-aura-emerald" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => disconnect()}
              className="text-aura-muted hover:text-aura-rose transition-colors p-2"
              title="Disconnect"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-aura-rose/10 border border-aura-rose/30 rounded-xl p-3 flex flex-col gap-2"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-aura-rose mt-0.5 flex-shrink-0" />
                <p className="text-sm text-aura-rose flex-1">{error}</p>
                <button onClick={clearError} className="ml-auto text-aura-rose hover:opacity-70">✕</button>
              </div>
              {error.includes('MetaMask Flask restricts') && (
                <button
                  onClick={handleVerifySmartAccount}
                  className="mt-1 self-start bg-aura-rose text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Verify Smart Account
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Setup steps */}
        <div className="space-y-3">
          <p className="text-aura-muted text-sm font-medium uppercase tracking-wider px-1">
            Setup Progress
          </p>

          {/* Step: Smart Account Upgrade */}
          <SetupStep
            icon={<Shield className="w-5 h-5" />}
            title="Upgrade to Smart Account"
            description="EIP-7702: Enable smart account capabilities on your EOA"
            completed={completedSteps.includes('upgrade')}
            loading={upgradeLoading || smartAccountStatus === 'upgrading'}
            onAction={handleUpgrade}
            actionLabel="Upgrade Account"
            disabled={false}
          />

          {/* Step: ERC-7715 Permissions */}
          <SetupStep
            icon={<CheckCircle className="w-5 h-5" />}
            title="Grant Session Permissions"
            description="ERC-7715: Allow Aura to spend up to 5 USDC on your behalf"
            completed={completedSteps.includes('permissions')}
            loading={permissionsLoading || smartAccountStatus === 'requesting-permissions'}
            onAction={handlePermissions}
            actionLabel="Grant Permissions"
            disabled={!isSmartAccount}
          />
        </div>

        {/* Session info */}
        <AnimatePresence>
          {sessionPermission && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-aura-emerald/10 border border-aura-emerald/30 rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-aura-emerald font-semibold">
                <CheckCircle className="w-5 h-5" />
                <span>Aura is Ready!</span>
              </div>
              <p className="text-sm text-aura-muted">
                Session active · Expires in 24h · Limit: {formatUSDC(sessionPermission.spendLimit)} USDC
              </p>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setSetupComplete(true)}
                className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-aura-accent to-violet-600 text-white font-semibold text-sm shadow-aura"
              >
                Start Chatting with Aura →
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── Connected & Ready — Compact header widget ─────────────────────────────

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 bg-aura-surface border border-aura-border rounded-xl px-3 py-2 text-sm hover:border-aura-accent/50 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-aura-accent to-violet-700" />
        <span className="text-aura-text font-mono">{shortenAddress(address!)}</span>
        <span className="text-aura-muted">{formatUSDC(usdcBalance)} USDC</span>
        <ChevronDown className="w-4 h-4 text-aura-muted" />
      </button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-12 w-64 bg-aura-surface border border-aura-border rounded-xl shadow-card p-3 space-y-2 z-50"
          >
            <div className="px-2 py-1">
              <p className="text-xs text-aura-muted">Connected Wallet</p>
              <p className="font-mono text-sm text-aura-text">{address}</p>
            </div>
            <div className="border-t border-aura-border" />
            <button
              onClick={handleCopy}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-aura-card text-sm text-aura-muted flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Address'}
            </button>
            <button
              onClick={refreshBalance}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-aura-card text-sm text-aura-muted flex items-center gap-2"
            >
              <Loader2 className={clsx('w-4 h-4', isLoadingBalance && 'animate-spin')} />
              Refresh Balance
            </button>
            <button
              onClick={() => { disconnect(); setShowDropdown(false); }}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-aura-rose/10 text-sm text-aura-rose flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SetupStep sub-component ──────────────────────────────────────────────────

interface SetupStepProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  completed: boolean;
  loading: boolean;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
  result?: { txHash?: string; message?: string; error?: string; simulated?: boolean } | null;
}

function SetupStep({
  icon, title, description, completed, loading, onAction, actionLabel, disabled, result
}: SetupStepProps) {
  return (
    <div
      className={clsx(
        'border rounded-2xl p-4 transition-all duration-300',
        completed
          ? 'border-aura-emerald/40 bg-aura-emerald/5'
          : 'border-aura-border bg-aura-surface'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            completed ? 'bg-aura-emerald/20 text-aura-emerald' : 'bg-aura-card text-aura-muted'
          )}
        >
          {completed ? <CheckCircle className="w-5 h-5" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={clsx('font-semibold text-sm', completed ? 'text-aura-emerald' : 'text-aura-text')}>
            {title}
          </p>
          <p className="text-aura-muted text-xs mt-0.5">{description}</p>

          {/* Result message */}
          {result && !result.error && (
            <p className="text-xs text-aura-emerald mt-1">
              ✓ {result.message || 'Done'} {result.simulated ? '(demo)' : ''}
            </p>
          )}
          {result?.error && (
            <p className="text-xs text-aura-rose mt-1">✗ {result.error}</p>
          )}
        </div>
        {!completed && (
          <button
            onClick={onAction}
            disabled={loading || disabled}
            className={clsx(
              'px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5',
              disabled
                ? 'bg-aura-card text-aura-muted cursor-not-allowed'
                : 'bg-aura-accent text-white hover:bg-violet-600 shadow-glow-sm'
            )}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {loading ? 'Processing...' : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
