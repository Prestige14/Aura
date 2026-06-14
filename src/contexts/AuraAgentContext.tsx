'use client';

// src/contexts/AuraAgentContext.tsx
// Agent state management: tracks all A2A coordination, payment flow, and AI outputs

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

// ─── Global BigInt Polyfill ──────────────────────────────────────────────────
// Prevents "Do not know how to serialize a BigInt" errors globally by teaching
// JSON.stringify how to handle BigInts natively.
if (typeof BigInt !== 'undefined' && !('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    get() {
      return function (this: bigint) {
        return this.toString();
      };
    },
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentStatus =
  | 'idle'
  | 'analyzing'
  | 'delegating'
  | 'paying'
  | 'generating'
  | 'complete'
  | 'error';

export type TransactionStepStatus = 'pending' | 'active' | 'done' | 'error';

export interface TransactionStep {
  id: string;
  label: string;
  description: string;
  status: TransactionStepStatus;
  txHash?: string;
  data?: unknown;
}

export interface AgentDelegation {
  agentName: string;
  agentType: 'writer' | 'designer';
  budget: bigint;
  taskDescription: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export interface AgentOutput {
  type: 'text' | 'image';
  content: string; // Text content or base64 image URL
  model: string;
  agentName: string;
  generatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  timestamp: number;
  agentOutputs?: AgentOutput[];
  transactionSteps?: TransactionStep[];
}

export interface AuraAgentState {
  // Chat
  messages: ChatMessage[];
  isProcessing: boolean;
  agentStatus: AgentStatus;

  // Agent delegation
  delegations: AgentDelegation[];
  currentDelegation: string | null; // Which agent is currently active

  // Transaction tracking
  transactionSteps: TransactionStep[];

  // Actions
  sendMessage: (content: string, address?: string, permissionContext?: any) => Promise<void>;
  clearChat: () => void;
  resetAgentState: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuraAgentContext = createContext<AuraAgentState | null>(null);

export const useAuraAgent = (): AuraAgentState => {
  const ctx = useContext(AuraAgentContext);
  if (!ctx) throw new Error('useAuraAgent must be used within AuraAgentProvider');
  return ctx;
};

// ─── Initial Steps ────────────────────────────────────────────────────────────

const createInitialSteps = (): TransactionStep[] => [
  {
    id: 'analyze',
    label: 'Analyze Prompt',
    description: 'Main Agent analyzing your request...',
    status: 'pending',
  },
  {
    id: 'delegate',
    label: 'A2A Delegation',
    description: 'Splitting allowance to sub-agents via ERC-7710...',
    status: 'pending',
  },
  {
    id: 'fee-data',
    label: 'Fetch Gas Quote',
    description: 'Getting USDC gas fees from 1Shot Relayer...',
    status: 'pending',
  },
  {
    id: 'payment',
    label: 'x402 Micropayment',
    description: 'Paying Venice AI via EIP-7710 delegation...',
    status: 'pending',
  },
  {
    id: 'generate-text',
    label: 'Writer Agent',
    description: 'Writer Agent calling Venice AI (llama-3.3-70b)...',
    status: 'pending',
  },
  {
    id: 'generate-image',
    label: 'Designer Agent',
    description: 'Designer Agent calling Venice AI (image model)...',
    status: 'pending',
  },
];

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuraAgentProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Welcome to Aura — your Autonomous Web3 Concierge. Connect your MetaMask wallet to begin. Aura will upgrade your wallet to a Smart Account and request session permissions to autonomously handle payments and AI generation on your behalf.',
      timestamp: Date.now(),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [delegations, setDelegations] = useState<AgentDelegation[]>([]);
  const [currentDelegation, setCurrentDelegation] = useState<string | null>(null);
  const [transactionSteps, setTransactionSteps] = useState<TransactionStep[]>(createInitialSteps());

  // ── Step helper ──────────────────────────────────────────────────────────

  const updateStep = (
    id: string,
    status: TransactionStepStatus,
    extra?: Partial<TransactionStep>
  ) => {
    setTransactionSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, status, ...extra } : step
      )
    );
  };

  // ── Send message / trigger agent pipeline ─────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, address?: string, permissionContext?: any) => {
      if (isProcessing) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);
      setAgentStatus('analyzing');

      // Reset steps
      const freshSteps = createInitialSteps();
      setTransactionSteps(freshSteps);

      try {
        // Step 1: Analyzing
        updateStep('analyze', 'active');
        await new Promise((r) => setTimeout(r, 800));
        updateStep('analyze', 'done');

        const isSubAgent = content.toLowerCase().includes('design') || content.toLowerCase().includes('sub-agent');

        if (isSubAgent) {
          updateStep('delegate', 'active');
          await new Promise((r) => setTimeout(r, 1000));
          updateStep('delegate', 'done');
          
          updateStep('generate-image', 'active');
        } else {
          updateStep('generate-text', 'active');
        }

        // Call the new JSON API
        const response = await fetch('/api/agent/venice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: content,
            userAddress: address || '0xUserAddressFallback',
            permissionContext: permissionContext || { dummy: true },
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Network error' }));
          throw new Error(errData.error || `API error: ${response.status}`);
        }

        const data = await response.json();

        if (isSubAgent) {
          updateStep('generate-image', 'done');
        } else {
          updateStep('generate-text', 'done');
        }

        // Step: x402 payment
        updateStep('payment', 'active');
        await new Promise((r) => setTimeout(r, 800));
        updateStep('payment', 'done', { txHash: data.txHash });

        // Add assistant response to chat
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.reply || 'Task completed successfully.',
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setAgentStatus('complete');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'An error occurred';
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Agent encountered an error: ${errMsg}. Please check your wallet connection and try again.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setAgentStatus('error');
      } finally {
        setIsProcessing(false);
        setCurrentDelegation(null);
      }
    },
    [isProcessing]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setTransactionSteps(createInitialSteps());
    setDelegations([]);
  }, []);

  const resetAgentState = useCallback(() => {
    setAgentStatus('idle');
    setTransactionSteps(createInitialSteps());
    setDelegations([]);
    setCurrentDelegation(null);
  }, []);

  const value: AuraAgentState = {
    messages,
    isProcessing,
    agentStatus,
    delegations,
    currentDelegation,
    transactionSteps,
    sendMessage,
    clearChat,
    resetAgentState,
  };

  return <AuraAgentContext.Provider value={value}>{children}</AuraAgentContext.Provider>;
}
