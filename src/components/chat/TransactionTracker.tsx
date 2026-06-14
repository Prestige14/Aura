'use client';

// src/components/chat/TransactionTracker.tsx
// Renders the visual pipeline of transaction steps in real-time

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, Circle, Loader2, AlertCircle,
  ExternalLink, ChevronDown, ChevronUp
} from 'lucide-react';
import { type TransactionStep, type AgentDelegation } from '@/contexts/AuraAgentContext';
import clsx from 'clsx';
import { useState } from 'react';

interface TransactionTrackerProps {
  steps: TransactionStep[];
  delegations: AgentDelegation[];
  currentDelegation: string | null;
}

const STEP_ICONS: Record<string, string> = {
  analyze: '🧠',
  delegate: '🔗',
  'fee-data': '⛽',
  payment: '💳',
  'generate-text': '✍️',
  'generate-image': '🎨',
};

export function TransactionTracker({ steps, delegations, currentDelegation }: TransactionTrackerProps) {
  const [expanded, setExpanded] = useState(true);

  const activeStep = steps.find((s) => s.status === 'active');
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const hasError = steps.some((s) => s.status === 'error');
  const allDone = doneCount === steps.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-aura-border bg-aura-surface rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-aura-card transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
              allDone ? 'bg-aura-emerald/20 text-aura-emerald' : 
              hasError ? 'bg-aura-rose/20 text-aura-rose' :
              'bg-aura-accent/20 text-aura-accent'
            )}
          >
            {allDone ? '✓' : hasError ? '✗' : '⚡'}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-aura-text">
              {allDone ? 'Pipeline Complete' : hasError ? 'Pipeline Error' : 'Running Agent Pipeline'}
            </p>
            <p className="text-xs text-aura-muted">
              {doneCount}/{steps.length} steps · {activeStep?.label || (allDone ? 'All done!' : 'Starting...')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress bar */}
          <div className="w-20 h-1.5 bg-aura-card rounded-full overflow-hidden">
            <motion.div
              className={clsx(
                'h-full rounded-full',
                allDone ? 'bg-aura-emerald' : 'bg-aura-accent'
              )}
              animate={{ width: `${(doneCount / steps.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-aura-muted" /> : <ChevronDown className="w-4 h-4 text-aura-muted" />}
        </div>
      </button>

      {/* Steps */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-aura-border">
              {/* Agent Delegations */}
              {delegations.length > 0 && (
                <div className="mt-3 mb-2">
                  <p className="text-xs text-aura-muted uppercase tracking-wider mb-2">
                    A2A Delegations (ERC-7710)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {delegations.map((d) => (
                      <motion.div
                        key={d.agentName}
                        animate={
                          currentDelegation === d.agentName
                            ? { boxShadow: ['0 0 0px rgba(108,99,255,0)', '0 0 15px rgba(108,99,255,0.5)', '0 0 0px rgba(108,99,255,0)'] }
                            : {}
                        }
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className={clsx(
                          'rounded-xl p-2.5 border text-xs transition-all',
                          d.status === 'complete'
                            ? 'border-aura-emerald/40 bg-aura-emerald/5'
                            : d.status === 'active'
                            ? 'border-aura-accent/60 bg-aura-accent/10'
                            : 'border-aura-border bg-aura-card'
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span>{d.agentType === 'writer' ? '✍️' : '🎨'}</span>
                          <span className="font-semibold text-aura-text">{d.agentName}</span>
                          {d.status === 'active' && (
                            <Loader2 className="w-3 h-3 animate-spin text-aura-accent ml-auto" />
                          )}
                          {d.status === 'complete' && (
                            <CheckCircle className="w-3 h-3 text-aura-emerald ml-auto" />
                          )}
                        </div>
                        <p className="text-aura-muted">
                          Budget: {(Number(d.budget) / 1_000_000).toFixed(2)} USDC
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transaction steps */}
              <p className="text-xs text-aura-muted uppercase tracking-wider mt-3 mb-2">
                Transaction Pipeline
              </p>
              {steps.map((step, i) => (
                <StepRow key={step.id} step={step} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StepRow({ step, index }: { step: TransactionStep; index: number }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={clsx(
        'rounded-xl px-3 py-2.5 border transition-all',
        step.status === 'done' ? 'border-aura-emerald/30 bg-aura-emerald/5' :
        step.status === 'active' ? 'border-aura-accent/50 bg-aura-accent/10' :
        step.status === 'error' ? 'border-aura-rose/30 bg-aura-rose/5' :
        'border-transparent bg-aura-card'
      )}
    >
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
          {step.status === 'done' && <CheckCircle className="w-4 h-4 text-aura-emerald" />}
          {step.status === 'active' && <Loader2 className="w-4 h-4 text-aura-accent animate-spin" />}
          {step.status === 'error' && <AlertCircle className="w-4 h-4 text-aura-rose" />}
          {step.status === 'pending' && <Circle className="w-4 h-4 text-aura-muted" />}
        </div>

        {/* Icon + label */}
        <span className="text-base">{STEP_ICONS[step.id] || '📍'}</span>
        <div className="flex-1 min-w-0">
          <p className={clsx(
            'text-xs font-medium',
            step.status === 'done' ? 'text-aura-emerald' :
            step.status === 'active' ? 'text-aura-accent' :
            step.status === 'error' ? 'text-aura-rose' :
            'text-aura-muted'
          )}>
            {step.label}
          </p>
          {step.status === 'active' && (
            <p className="text-xs text-aura-muted animate-pulse">{step.description}</p>
          )}
        </div>

        {/* Tx hash link */}
        {step.txHash && (
          <a
            href={`https://sepolia.arbiscan.io/tx/${step.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-aura-muted hover:text-aura-accent transition-colors"
            title="View on explorer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Details toggle */}
        {!!step.data && step.status === 'done' && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-aura-muted hover:text-aura-text"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {showDetails && !!step.data && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-9 text-xs text-aura-muted space-y-1 font-mono bg-aura-bg rounded-lg p-2">
              {Object.entries(step.data as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-aura-accent">{k}:</span>
                  <span className="text-aura-text break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
