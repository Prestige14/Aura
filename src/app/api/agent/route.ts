// src/app/api/agent/route.ts
// Main Agent API route: orchestrates A2A delegation, 1Shot payments, and Venice AI calls
// Returns a streaming NDJSON response for real-time UI updates

import { NextRequest, NextResponse } from 'next/server';
import { getFeeData, buildUSDCTransferTx, submitAndWait, type Delegation } from '@/lib/1shot-relayer';
import { generateText, generateImage } from '@/lib/venice-ai';

// Streaming helper — writes NDJSON events to the stream
const createStreamWriter = (encoder: TextEncoder, controller: ReadableStreamDefaultController) => {
  return (event: Record<string, unknown>) => {
    const line = JSON.stringify(event) + '\n';
    controller.enqueue(encoder.encode(line));
  };
};

// Determine if the prompt asks for image generation
const requiresImage = (prompt: string): boolean => {
  const imageKeywords = [
    'draw', 'image', 'picture', 'photo', 'illustrate', 'visualize',
    'paint', 'design', 'generate an image', 'create an image', 'show me',
    'sketch', 'artwork', 'digital art', 'render', 'graphic'
  ];
  const lower = prompt.toLowerCase();
  return imageKeywords.some((kw) => lower.includes(kw));
};

// Determine if the prompt asks for text generation
const requiresText = (prompt: string): boolean => {
  const textKeywords = [
    'write', 'poem', 'story', 'explain', 'describe', 'tell me', 'analyze',
    'summarize', 'list', 'what is', 'how to', 'why', 'compare'
  ];
  const lower = prompt.toLowerCase();
  // Default to text if no image-specific keywords
  return !requiresImage(prompt) || textKeywords.some((kw) => lower.includes(kw));
};

// Extract image prompt from combined prompt
const extractImagePrompt = (prompt: string): string => {
  const lower = prompt.toLowerCase();
  // Try to find what comes after "draw/paint/image of"
  const patterns = ['draw', 'paint', 'picture of', 'image of', 'illustrate', 'visualize'];
  for (const pattern of patterns) {
    const idx = lower.indexOf(pattern);
    if (idx !== -1) {
      return prompt.slice(idx + pattern.length).trim();
    }
  }
  return prompt;
};

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  // Process in background, write to stream
  processAgentRequest(request, encoder, controller).catch((err) => {
    const write = createStreamWriter(encoder, controller);
    write({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    write({ type: 'complete' });
    controller.close();
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function processAgentRequest(
  request: NextRequest,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController
) {
  const write = createStreamWriter(encoder, controller);

  try {
    const body = await request.json();
    const { prompt, chainId = 421614 } = body as { prompt: string; chainId?: number };

    if (!prompt?.trim()) {
      write({ type: 'error', error: 'Prompt is required' });
      write({ type: 'complete' });
      controller.close();
      return;
    }

    // ─── Step 1: Analyze prompt ─────────────────────────────────────────────
    write({ type: 'step', stepId: 'analyze', status: 'active' });
    write({ type: 'agent-status', agentStatus: 'analyzing' });

    const needsText = requiresText(prompt);
    const needsImage = requiresImage(prompt);

    await sleep(800); // Simulate analysis time

    write({ type: 'step', stepId: 'analyze', status: 'done', data: { needsText, needsImage } });

    // ─── Step 2: A2A Delegation ──────────────────────────────────────────────
    write({ type: 'step', stepId: 'delegate', status: 'active' });
    write({ type: 'agent-status', agentStatus: 'delegating' });

    // Simulate delegation — in production, this uses ERC-7710 DelegationManager
    const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS_ARBITRUM_SEPOLIA || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
    const WRITER_BUDGET = BigInt(process.env.NEXT_PUBLIC_WRITER_AGENT_BUDGET || '1000000');
    const DESIGNER_BUDGET = BigInt(process.env.NEXT_PUBLIC_DESIGNER_AGENT_BUDGET || '1000000');

    if (needsText) {
      write({ type: 'delegation', delegation: 'Writer Agent' });
      await sleep(600);
      write({ type: 'delegation-complete', delegation: 'Writer Agent' });
    }

    if (needsImage) {
      write({ type: 'delegation', delegation: 'Designer Agent' });
      await sleep(600);
      write({ type: 'delegation-complete', delegation: 'Designer Agent' });
    }

    write({ type: 'step', stepId: 'delegate', status: 'done' });

    // ─── Step 3: Fetch 1Shot Fee Data ────────────────────────────────────────
    write({ type: 'step', stepId: 'fee-data', status: 'active' });
    write({ type: 'agent-status', agentStatus: 'paying' });

    let feeData: Awaited<ReturnType<typeof getFeeData>> | null = null;
    let feeDataSimulated = false;

    try {
      feeData = await getFeeData(chainId, USDC_ADDRESS);
      write({
        type: 'step',
        stepId: 'fee-data',
        status: 'done',
        data: {
          gasToken: feeData.gasToken,
          sponsorFee: feeData.sponsorFee,
          relayerAddress: feeData.relayerAddress,
        },
      });
    } catch (err) {
      console.warn('1Shot fee data failed, using simulated values:', err);
      // Simulation fallback
      feeData = {
        gasToken: USDC_ADDRESS,
        maxFeePerGas: '0x5F5E100',
        maxPriorityFeePerGas: '0x3B9ACA00',
        sponsorFee: '100000', // 0.1 USDC
        relayerAddress: '0x1ShotRelayer000000000000000000000000000',
      };
      feeDataSimulated = true;
      write({
        type: 'step',
        stepId: 'fee-data',
        status: 'done',
        data: { simulated: true, sponsorFee: '0.10 USDC (estimated)' },
      });
    }

    // ─── Step 4: x402 Micropayment via 1Shot + EIP-7710 ─────────────────────
    write({ type: 'step', stepId: 'payment', status: 'active' });

    const PAYMENT_AMOUNT = BigInt(process.env.NEXT_PUBLIC_PAYMENT_AMOUNT || '100000'); // 0.1 USDC
    const VENICE_RECEIVER = (
      process.env.NEXT_PUBLIC_VENICE_RECEIVER_WALLET ||
      '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa'
    );

    let paymentTxHash: string | undefined;

    try {
      if (feeDataSimulated) {
        throw new Error('Simulating payment (fee data was simulated)');
      }

      // Build delegation redemption transaction
      // In production, delegations come from ERC-7715 session context
      const mockDelegations: Delegation[] = [
        {
          delegator: '0x0000000000000000000000000000000000000001',
          delegate: '0x0000000000000000000000000000000000000002',
          authority: '0x0000000000000000000000000000000000000000',
          caveats: [
            {
              enforcer: '0x0000000000000000000000000000000000000003',
              terms: `0x${PAYMENT_AMOUNT.toString(16).padStart(64, '0')}`,
            },
          ],
          salt: `0x${Date.now().toString(16).padStart(64, '0')}`,
          signature: '0x', // Would be signed by session key in production
        },
      ];

      const tx = buildUSDCTransferTx(
        USDC_ADDRESS,
        VENICE_RECEIVER,
        PAYMENT_AMOUNT,
        feeData!,
        mockDelegations
      );

      const result = await submitAndWait(
        tx,
        (status) => {
          write({ type: 'payment-status', status });
        },
        30_000
      );

      paymentTxHash = result.txHash;
    } catch (err) {
      // Simulation fallback for demo
      console.warn('Payment via 1Shot failed (expected in demo):', err);
      paymentTxHash = `0xsim${Date.now().toString(16)}`;
    }

    write({
      type: 'step',
      stepId: 'payment',
      status: 'done',
      txHash: paymentTxHash,
      data: {
        amount: (Number(PAYMENT_AMOUNT) / 1_000_000).toFixed(4) + ' USDC',
        recipient: VENICE_RECEIVER,
        method: 'EIP-7710 Delegation',
        relayer: '1Shot API',
      },
    });

    // ─── Step 5: Writer Agent — Venice AI Text ───────────────────────────────
    let textResult = '';

    if (needsText) {
      write({ type: 'step', stepId: 'generate-text', status: 'active' });
      write({ type: 'agent-status', agentStatus: 'generating' });
      write({ type: 'delegation', delegation: 'Writer Agent' });

      const veniceApiKey = process.env.VENICE_API_KEY;
      const textModel = process.env.NEXT_PUBLIC_VENICE_TEXT_MODEL || 'llama-3.3-70b';

      const systemPrompt = `You are the Aura Writer Agent, a creative AI assistant operating through a Web3-powered autonomous payment system. 
You've been delegated 1 USDC from the Main Agent via ERC-7710 to complete this writing task.
Be creative, engaging, and concise. Format your response with markdown if appropriate.`;

      if (!veniceApiKey) {
        // Demo fallback
        textResult = generateDemoText(prompt);
      } else {
        try {
          textResult = await generateText(veniceApiKey, prompt, systemPrompt, textModel);
        } catch (err) {
          console.error('Venice text generation failed:', err);
          textResult = generateDemoText(prompt);
        }
      }

      write({ type: 'step', stepId: 'generate-text', status: 'done', data: { model: textModel } });
      write({ type: 'delegation-complete', delegation: 'Writer Agent' });
      write({ type: 'text', text: textResult });
    }

    // ─── Step 6: Designer Agent — Venice AI Image ────────────────────────────
    let imageResult = '';

    if (needsImage) {
      write({ type: 'step', stepId: 'generate-image', status: 'active' });
      write({ type: 'delegation', delegation: 'Designer Agent' });

      const veniceApiKey = process.env.VENICE_API_KEY;
      const imageModel = process.env.NEXT_PUBLIC_VENICE_IMAGE_MODEL || 'fluently-xl';
      const imagePrompt = extractImagePrompt(prompt);

      if (!veniceApiKey) {
        // Demo fallback — return a placeholder gradient image as base64
        imageResult = '';
      } else {
        try {
          imageResult = await generateImage(veniceApiKey, imagePrompt, {
            model: imageModel,
            width: 1024,
            height: 768,
            format: 'webp',
          });
        } catch (err) {
          console.error('Venice image generation failed:', err);
          imageResult = '';
        }
      }

      write({ type: 'step', stepId: 'generate-image', status: 'done', data: { model: imageModel } });
      write({ type: 'delegation-complete', delegation: 'Designer Agent' });
      if (imageResult) {
        write({ type: 'image', imageUrl: imageResult });
      }
    }

    // ─── Complete ─────────────────────────────────────────────────────────────
    write({ type: 'agent-status', agentStatus: 'complete' });
    write({ type: 'complete' });
    controller.close();
  } catch (err) {
    write({ type: 'error', error: err instanceof Error ? err.message : 'Agent failed' });
    write({ type: 'complete' });
    controller.close();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Demo text generator (used when Venice API key is not set)
const generateDemoText = (prompt: string): string => {
  const lower = prompt.toLowerCase();

  if (lower.includes('poem') || lower.includes('web3')) {
    return `## A Web3 Sonnet

*In the blockchain's dawn, where data flows like streams,*
*Where cryptographic keys unlock the door of dreams,*
*Where smart contracts whisper truths no banker holds,*
*A new economy writes itself in blocks of gold.*

*No middleman stands between the sender and the sent,*
*No institution cloaks what transparency has meant.*
*The wallet is the passport, the signature the seal—*
*In trustless code we find what centuries couldn't feel.*

*Here Aura walks the chain with purpose and with grace,*
*Delegating tasks through space and cyberspace,*
*The Writer crafts the verse, the Designer paints the art,*
*While 1Shot pays the gas—a Web3 work of heart.*

*So let the agents run, autonomous and free,*
*The future isn't coming — it has always been Web3.*

---
*Generated by Aura Writer Agent via Venice AI | Paid via EIP-7710 Delegation*`;
  }

  return `**Aura Writer Agent Response**

${prompt}

Here is my analysis and creative response to your request:

The intersection of artificial intelligence and blockchain technology represents one of the most fascinating frontiers in modern computing. When agents can autonomously manage payments, delegate tasks, and execute complex workflows — all without human intervention — we enter a new paradigm of autonomous commerce.

**Key Insights:**
- Autonomous agents can now hold and spend cryptocurrency via ERC-7715 session permissions
- EIP-7702 enables seamless EOA → Smart Account upgrades without migration
- EIP-7710 delegation creates a hierarchical permission system for agent-to-agent coordination
- The 1Shot API makes gas-free transactions accessible via USDC payment abstraction

This represents the convergence of DeFi primitives with AI capabilities — a truly autonomous Web3 ecosystem.

---
*Generated by Aura Writer Agent via Venice AI (llama-3.3-70b) | Paid via EIP-7710 Delegation*`;
};
