'use client';

// src/components/chat/ChatInterface.tsx
// Main chat interface with message rendering, input, and agent status

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RefreshCw, Bot, User, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useAuraAgent, type ChatMessage } from '@/contexts/AuraAgentContext';
import { useWeb3 } from '@/contexts/Web3Context';
import { TransactionTracker } from './TransactionTracker';
import clsx from 'clsx';

const EXAMPLE_PROMPTS = [
  '✍️ Write a poem about Web3 and autonomous AI agents',
  '🎨 Draw a futuristic city where AI and blockchain coexist',
  '📖 Explain how EIP-7702 transforms EOA wallets',
  '🌐 Write a story about an AI agent that pays for its own compute',
  '🖼️ Paint a digital artwork of a neural network on the blockchain',
];

export function ChatInterface() {
  const {
    messages,
    isProcessing,
    agentStatus,
    delegations,
    currentDelegation,
    transactionSteps,
    sendMessage,
    clearChat,
  } = useAuraAgent();

  const [input, setInput] = useState('');
  const [rows, setRows] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, transactionSteps]);

  // Textarea auto-resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const lineCount = e.target.value.split('\n').length;
    setRows(Math.min(lineCount, 5));
  };

  const { address, sessionPermission } = useWeb3();

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;
    const msg = input.trim();
    setInput('');
    setRows(1);
    await sendMessage(msg, address, sessionPermission?.permissionContext);
  }, [input, isProcessing, sendMessage, address, sessionPermission]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scroll-smooth">
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>

        {/* Live transaction tracker (shown while processing) */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto"
          >
            <TransactionTracker
              steps={transactionSteps}
              delegations={delegations}
              currentDelegation={currentDelegation}
            />
          </motion.div>
        )}

        {/* Typing indicator */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 max-w-3xl mx-auto"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aura-accent to-violet-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-aura-surface border border-aura-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-aura-accent"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
                <span className="text-xs text-aura-muted ml-2">{getStatusLabel(agentStatus)}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Example prompts (shown when empty) */}
        {messages.length <= 1 && !isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="max-w-2xl mx-auto space-y-3"
          >
            <p className="text-center text-aura-muted text-sm">Try asking Aura to:</p>
            <div className="grid grid-cols-1 gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <motion.button
                  key={prompt}
                  whileHover={{ scale: 1.01, x: 4 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => sendMessage(prompt.slice(2).trim(), address, sessionPermission?.permissionContext)}
                  className="text-left px-4 py-3 rounded-xl border border-aura-border bg-aura-surface hover:border-aura-accent/50 hover:bg-aura-card text-sm text-aura-muted hover:text-aura-text transition-all"
                >
                  {prompt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-aura-border bg-aura-bg px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div
            className={clsx(
              'flex items-end gap-3 bg-aura-surface border rounded-2xl px-4 py-3 transition-all duration-200',
              isProcessing
                ? 'border-aura-accent/30 shadow-[0_0_20px_rgba(108,99,255,0.1)]'
                : 'border-aura-border hover:border-aura-accent/30'
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={rows}
              disabled={isProcessing}
              placeholder={isProcessing ? 'Aura is working...' : 'Ask Aura anything — text, images, Web3...'}
              className="flex-1 bg-transparent resize-none text-aura-text placeholder-aura-muted text-sm outline-none leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '120px' }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={clearChat}
                className="text-aura-muted hover:text-aura-text transition-colors p-1"
                title="Clear chat"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSubmit}
                disabled={!input.trim() || isProcessing}
                className={clsx(
                  'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                  input.trim() && !isProcessing
                    ? 'bg-gradient-to-r from-aura-accent to-violet-600 text-white shadow-glow-sm'
                    : 'bg-aura-card text-aura-muted cursor-not-allowed'
                )}
              >
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
          <p className="text-center text-xs text-aura-muted mt-2">
            Powered by Venice AI · Gas paid in USDC via 1Shot API · ERC-7715 Session Active
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl mx-auto"
      >
        <div className="text-center bg-aura-surface border border-aura-border rounded-2xl px-6 py-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-aura-accent" />
            <span className="text-sm font-semibold text-aura-accent">Aura Concierge</span>
          </div>
          <p className="text-sm text-aura-muted leading-relaxed">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'flex gap-3 max-w-3xl',
        isUser ? 'ml-auto flex-row-reverse' : 'mx-auto'
      )}
    >
      {/* Avatar */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
          isUser
            ? 'bg-gradient-to-br from-aura-cyan to-blue-600'
            : 'bg-gradient-to-br from-aura-accent to-violet-700'
        )}
      >
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>

      {/* Content */}
      <div className={clsx('flex flex-col gap-3', isUser ? 'items-end' : 'items-start', 'flex-1 min-w-0')}>
        <div
          className={clsx(
            'rounded-2xl px-4 py-3 max-w-full',
            isUser
              ? 'rounded-tr-sm bg-gradient-to-br from-aura-accent to-violet-700 text-white'
              : 'rounded-tl-sm bg-aura-surface border border-aura-border text-aura-text'
          )}
        >
          <MarkdownContent content={message.content} isUser={isUser} />
        </div>

        {/* Image output */}
        {message.imageUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl overflow-hidden border border-aura-border shadow-card max-w-lg"
          >
            <div className="bg-aura-surface px-3 py-2 border-b border-aura-border flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-aura-muted" />
              <span className="text-xs text-aura-muted">Designer Agent — Venice AI Image</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.imageUrl}
              alt="Generated by Designer Agent via Venice AI"
              className="w-full object-contain"
            />
          </motion.div>
        )}

        {/* Transaction steps */}
        {message.transactionSteps && message.transactionSteps.length > 0 && (
          <div className="w-full max-w-lg">
            <TransactionTracker
              steps={message.transactionSteps}
              delegations={[]}
              currentDelegation={null}
            />
          </div>
        )}

        {/* Timestamp */}
        <p className="text-xs text-aura-muted px-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  // Very lightweight markdown — headings, bold, italic, code, bullets
  const rendered = content
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-3 mb-1">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-black/20 px-1 rounded font-mono text-xs">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="flex gap-2 text-sm"><span>•</span><span>$1</span></li>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');

  return (
    <div
      className={clsx('text-sm leading-relaxed prose-sm', isUser ? 'text-white' : 'text-aura-text')}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

// ─── Status label helper ──────────────────────────────────────────────────────

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    analyzing: 'Analyzing your request...',
    delegating: 'Delegating to sub-agents via ERC-7710...',
    paying: 'Processing x402 payment via 1Shot...',
    generating: 'Generating with Venice AI...',
    complete: 'Complete!',
    error: 'Error occurred',
  };
  return labels[status] || 'Processing...';
};
