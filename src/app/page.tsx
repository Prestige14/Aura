'use client';

// src/app/page.tsx
// Main page: full-screen chat with sidebar for wallet/agent status

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Bot, Zap, Shield, Network,
  ChevronRight, Menu, X, ExternalLink
} from 'lucide-react';
import { useWeb3 } from '@/contexts/Web3Context';
import { useAuraAgent } from '@/contexts/AuraAgentContext';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { formatUSDC } from '@/lib/usdc-abi';
import clsx from 'clsx';

// ─── Agent Status Badge ───────────────────────────────────────────────────────

const STATUS_CONFIG = {
  idle: { label: 'Idle', color: 'text-aura-muted', dot: 'bg-aura-muted' },
  analyzing: { label: 'Analyzing', color: 'text-aura-amber', dot: 'bg-aura-amber animate-pulse' },
  delegating: { label: 'Delegating', color: 'text-aura-cyan', dot: 'bg-aura-cyan animate-pulse' },
  paying: { label: 'Paying (x402)', color: 'text-aura-accent', dot: 'bg-aura-accent animate-pulse' },
  generating: { label: 'Generating', color: 'text-violet-400', dot: 'bg-violet-400 animate-pulse' },
  complete: { label: 'Complete', color: 'text-aura-emerald', dot: 'bg-aura-emerald' },
  error: { label: 'Error', color: 'text-aura-rose', dot: 'bg-aura-rose' },
};

// ─── Page Component ───────────────────────────────────────────────────────────

export default function AuraPage() {
  const { isConnected, isSmartAccount, sessionPermission, usdcBalance, address } = useWeb3();
  const { agentStatus, messages, delegations } = useAuraAgent();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(true);

  const isReady = isConnected && isSmartAccount && sessionPermission;
  const statusCfg = STATUS_CONFIG[agentStatus] || STATUS_CONFIG.idle;

  useEffect(() => {
    if (isReady) setShowSetup(false);
  }, [isReady]);

  return (
    <div className="flex h-screen bg-aura-bg overflow-hidden relative">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="noise-bg" />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            />
            {/* Sidebar panel */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-aura-surface border-r border-aura-border z-30 flex flex-col"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-72 flex-col bg-aura-surface border-r border-aura-border flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <header className="border-b border-aura-border bg-aura-bg/80 backdrop-blur-xl px-4 h-16 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-aura-muted hover:text-aura-text p-2"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-8 h-8 rounded-xl bg-gradient-to-br from-aura-accent to-violet-700 flex items-center justify-center shadow-glow-sm"
              >
                <Sparkles className="w-4 h-4 text-white" />
              </motion.div>
              <div>
                <h1 className="font-bold text-aura-text text-sm leading-tight">Aura</h1>
                <p className="text-aura-muted text-xs leading-tight">Autonomous Web3 Concierge</p>
              </div>
            </div>
          </div>

          {/* Agent status + wallet info */}
          <div className="flex items-center gap-4">
            {/* Agent status pill */}
            <AnimatePresence mode="wait">
              <motion.div
                key={agentStatus}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="hidden sm:flex items-center gap-2 bg-aura-surface border border-aura-border rounded-full px-3 py-1.5"
              >
                <div className={clsx('w-2 h-2 rounded-full', statusCfg.dot)} />
                <span className={clsx('text-xs font-medium', statusCfg.color)}>
                  {statusCfg.label}
                </span>
              </motion.div>
            </AnimatePresence>

            {/* Wallet widget */}
            <WalletConnect compact={true} />
          </div>
        </header>

        {/* Body: Setup or Chat */}
        <main className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {showSetup ? (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full overflow-y-auto"
              >
                <div className="max-w-2xl mx-auto px-4 py-8">
                  <WalletConnect />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <ChatInterface />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ─── Sidebar Content ──────────────────────────────────────────────────────────

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { isConnected, isSmartAccount, sessionPermission, usdcBalance, address } = useWeb3();
  const { delegations, agentStatus, messages } = useAuraAgent();

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="flex flex-col h-full">
      {/* Logo + close */}
      <div className="p-4 border-b border-aura-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-aura-accent to-violet-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-aura-text">Aura</p>
            <p className="text-xs text-aura-muted">Web3 Concierge</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-aura-muted hover:text-aura-text">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Wallet section */}
        <div className="space-y-2">
          <p className="text-xs text-aura-muted uppercase tracking-wider">Wallet</p>

          {isConnected && address ? (
            <div className="bg-aura-card border border-aura-border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-aura-accent to-violet-700" />
                <span className="font-mono text-xs text-aura-text">{shortenAddress(address)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-aura-muted">USDC Balance</span>
                <span className="text-xs font-semibold text-aura-emerald">
                  {formatUSDC(usdcBalance)} USDC
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-aura-card border border-aura-border rounded-xl p-3 text-center">
              <p className="text-xs text-aura-muted">Not connected</p>
            </div>
          )}
        </div>

        {/* Account features */}
        <div className="space-y-2">
          <p className="text-xs text-aura-muted uppercase tracking-wider">Smart Account</p>
          <div className="space-y-1.5">
            <FeatureRow
              icon={<Zap className="w-3.5 h-3.5" />}
              label="EIP-7702 Upgrade"
              active={isSmartAccount}
            />
            <FeatureRow
              icon={<Shield className="w-3.5 h-3.5" />}
              label="ERC-7715 Session"
              active={!!sessionPermission}
            />
            <FeatureRow
              icon={<Network className="w-3.5 h-3.5" />}
              label="1Shot Relayer"
              active={isConnected}
            />
            <FeatureRow
              icon={<Bot className="w-3.5 h-3.5" />}
              label="Venice AI"
              active={isConnected}
            />
          </div>
        </div>

        {/* Session info */}
        {sessionPermission && (
          <div className="space-y-2">
            <p className="text-xs text-aura-muted uppercase tracking-wider">Session</p>
            <div className="bg-aura-card border border-aura-emerald/20 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-aura-muted">Limit</span>
                <span className="text-aura-text">{formatUSDC(sessionPermission.spendLimit)} USDC</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-aura-muted">Expires</span>
                <span className="text-aura-text">
                  {new Date(sessionPermission.expiresAt * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-aura-muted">Standard</span>
                <span className="text-aura-accent">ERC-7715</span>
              </div>
            </div>
          </div>
        )}

        {/* Active delegations */}
        {delegations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-aura-muted uppercase tracking-wider">A2A Agents (ERC-7710)</p>
            <div className="space-y-1.5">
              {delegations.map((d) => (
                <div
                  key={d.agentName}
                  className={clsx(
                    'flex items-center justify-between bg-aura-card rounded-xl p-3 border transition-all',
                    d.status === 'active' ? 'border-aura-accent/50' : 'border-aura-border'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span>{d.agentType === 'writer' ? '✍️' : '🎨'}</span>
                    <div>
                      <p className="text-xs font-medium text-aura-text">{d.agentName}</p>
                      <p className="text-xs text-aura-muted">
                        {(Number(d.budget) / 1_000_000).toFixed(2)} USDC
                      </p>
                    </div>
                  </div>
                  <StatusDot status={d.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="space-y-2">
          <p className="text-xs text-aura-muted uppercase tracking-wider">Session Stats</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Messages" value={messages.filter(m => m.role !== 'system').length} />
            <StatCard label="Agent Status" value={agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)} />
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="p-4 border-t border-aura-border space-y-2">
        <p className="text-xs text-aura-muted uppercase tracking-wider">Resources</p>
        <div className="space-y-1">
          {[
            { label: 'MetaMask Smart Accounts', url: 'https://docs.metamask.io/smart-accounts-kit/' },
            { label: '1Shot API Docs', url: 'https://1shotapi.com' },
            { label: 'Venice AI Docs', url: 'https://docs.venice.ai' },
          ].map(({ label, url }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-aura-muted hover:text-aura-text transition-colors py-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FeatureRow({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className={clsx('flex-shrink-0', active ? 'text-aura-emerald' : 'text-aura-muted')}>
        {icon}
      </div>
      <span className={clsx('text-xs', active ? 'text-aura-text' : 'text-aura-muted')}>{label}</span>
      <div className="ml-auto">
        {active ? (
          <div className="w-2 h-2 rounded-full bg-aura-emerald" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-aura-muted/40" />
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors = {
    pending: 'bg-aura-muted',
    active: 'bg-aura-accent animate-pulse',
    complete: 'bg-aura-emerald',
    error: 'bg-aura-rose',
  };
  return (
    <div className={clsx('w-2 h-2 rounded-full', colors[status as keyof typeof colors] || 'bg-aura-muted')} />
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-aura-card border border-aura-border rounded-xl p-3">
      <p className="text-xs text-aura-muted mb-1">{label}</p>
      <p className="text-sm font-semibold text-aura-text">{value}</p>
    </div>
  );
}
