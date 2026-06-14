import { NextResponse } from 'next/server';
import { parseUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, base } from 'viem/chains';

const VENICE_API_KEY = process.env.VENICE_API_KEY;
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // Default anvil account 1 for dev

// 1Shot Public Relayer — correct endpoint per docs: POST to /relayers (plural)
const RELAYER_URL = (process.env.NEXT_PUBLIC_1SHOT_RELAYER_URL || 'https://relayer.1shotapi.com') + '/relayers';

// Hardcoded USDC addresses — avoids env var resolution issues in server-side API routes
const USDC_ADDRESS_BASE    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const USDC_ADDRESS_ARBITRUM_SEPOLIA = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as const;

const getChainConfig = (chainId: number) => {
  if (chainId === 8453) {
    return {
      chain: base,
      rpcUrl: process.env.NEXT_PUBLIC_BASE_MAINNET_RPC || 'https://mainnet.base.org',
      usdcAddress: USDC_ADDRESS_BASE,
    };
  }
  return {
    chain: arbitrumSepolia,
    rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    usdcAddress: USDC_ADDRESS_ARBITRUM_SEPOLIA,
  };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, userAddress, permissionContext } = body;

    if (!prompt || !userAddress || !permissionContext) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!VENICE_API_KEY) {
      console.warn("VENICE_API_KEY not set. Using mock response for demo.");
    }

    // 1. Call Venice AI to get intelligence
    let aiResponseText = "Mock response: Venice AI key not configured.";
    
    if (VENICE_API_KEY) {
      console.log("Calling Venice AI API...");
      const veniceRes = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VENICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
          messages: [
            { role: "system", content: "You are Aura, an elite autonomous Web3 concierge. You operate on-chain and charge x402 micro-payments for your services using 1Shot Relayer. Keep answers concise." },
            { role: "user", content: prompt }
          ]
        })
      });

      if (veniceRes.ok) {
        const veniceData = await veniceRes.json();
        aiResponseText = veniceData.choices[0].message.content;
      } else {
        const errorText = await veniceRes.text();
        console.error("Venice API Error:", errorText);
        try {
          const errJson = JSON.parse(errorText);
          aiResponseText = `[Aura Error]: Venice AI API failed. Reason: ${errJson.error || errorText}. (If it says Insufficient USD, please add credits at venice.ai/settings/api)`;
        } catch {
          aiResponseText = `[Aura Error]: I encountered an error connecting to my neural net (Venice AI). ${errorText}`;
        }
      }
    }

    // Formatting private key properly for viem
    let rawKey = process.env.AGENT_PRIVATE_KEY || 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    if (!rawKey.startsWith('0x')) {
      rawKey = '0x' + rawKey;
    }
    const agentAccount = privateKeyToAccount(rawKey as `0x${string}`);

    // 1.5 A2A Coordination (Redelegation)
    // If the prompt asks for something specific (e.g., "design", "sub-agent", "delegate"),
    // Aura will redelegate a portion of its permission to a sub-agent.
    let subAgentResponse = null;
    let subAgentTxHash = null;

    if (prompt.toLowerCase().includes('design') || prompt.toLowerCase().includes('delegate') || prompt.toLowerCase().includes('sub-agent')) {
      console.log("A2A Coordination Triggered. Redelegating to Sub-Agent...");
      
      // In a real implementation, the main agent would sign a new ERC-7715 permission 
      // delegating a portion of its spendLimit to the sub-agent's address.
      const redelegatedPermissionContext = {
        ...permissionContext,
        redelegated: true,
        parentSession: agentAccount.address,
        spendLimit: '0.05'
      };

      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      const host = req.headers.get('host');
      const subAgentUrl = `${protocol}://${host}/api/agent/sub-agent`;

      const subAgentRes = await fetch(subAgentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: `The user requested: "${prompt}". Please handle the specialized sub-task.`,
          redelegatedPermissionContext
        })
      });

      if (subAgentRes.ok) {
        const subData = await subAgentRes.json();
        subAgentResponse = subData.reply;
        subAgentTxHash = subData.txHash;
        console.log("Sub-Agent completed task successfully.");
      } else {
        console.error("Sub-Agent delegation failed.");
      }
    }

    // 2. x402 Payment Execution via 1Shot API Relayer
    // The agent uses the granted ERC-7715 permissions to charge the user 0.1 USDC.
    console.log("Executing x402 payment via 1Shot Relayer...");

    // Determine chain ID from context or default to Base Mainnet (8453)
    const contextChainId = Array.isArray(permissionContext)
      ? permissionContext[0]?.chainId
      : (permissionContext?.chainId || permissionContext?.permissionContext?.[0]?.chainId);
    const chainId = contextChainId || 8453;
    const config = getChainConfig(chainId);

    // config.usdcAddress is now hardcoded above — guaranteed to be a valid 0x address
    const usdcAddress: Address = config.usdcAddress;
    const amountToCharge = parseUnits('0.1', 6); // 0.1 USDC
    console.log(`[x402] Resolved chainId=${chainId}, usdcAddress=${usdcAddress}, amount=${amountToCharge}`);

    let txHash = 'skipped';
    let paymentError: string | null = null;

    try {
      // ── Step 1: Get relayer capabilities, check if this chain is supported ──
      console.log(`[x402] Fetching relayer capabilities for chainId=${chainId}...`);
      const capRes = await fetch(RELAYER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'relayer_getCapabilities',
          params: [],  // no filter — get all supported chains
        }),
      });
      if (!capRes.ok) throw new Error(`relayer_getCapabilities HTTP ${capRes.status}`);
      const capJson = await capRes.json();
      if (capJson.error) throw new Error(`relayer_getCapabilities: ${capJson.error.message}`);

      const capabilities = capJson.result ?? {};
      const supportedChainIds: string[] = Object.keys(capabilities);
      console.log(`[x402] Supported chains: [${supportedChainIds.join(', ')}]`);

      // ── Detect Transfer Intent ──
      // Fleksibel: mendeteksi (transfer/kirim/send) ... (angka) ... (0x... address)
      const transferMatch = prompt.match(/(?:transfer|kirim|send|kirimkan).*?([0-9.]+).*?(0x[a-fA-F0-9]{40})/i);
      let userTransferTx = null;
      let transferMsg = '';

      if (transferMatch) {
        const transferAmount = parseFloat(transferMatch[1]);
        const transferTo = transferMatch[2];
        const amountToTransfer = parseUnits(transferAmount.toString(), 6);
        
        userTransferTx = {
          to: usdcAddress,
          data: `0xa9059cbb000000000000000000000000${transferTo.replace('0x', '')}${amountToTransfer.toString(16).padStart(64, '0')}`,
          value: '0x0',
        };
        console.log(`[x402] Detected user transfer request: ${transferAmount} USDC to ${transferTo}`);
      }

      // Normalize chain ID to hex for EIP-5792 capabilities comparison
      const hexChainId = typeof chainId === 'string' && chainId.startsWith('0x') 
        ? chainId.toLowerCase() 
        : `0x${Number(chainId).toString(16)}`;

      // 1Shot Relayer's relayer_getCapabilities currently returns {} (empty), 
      // so we hardcode the known supported chains for this hackathon:
      // 8453 (Base Mainnet) and 421614 (Arbitrum Sepolia)
      const allowedChains = ['8453', '421614', '0x2105', '0x66eee'];
      const isSupported = allowedChains.includes(String(chainId)) || allowedChains.includes(hexChainId);

      // If this chain is not supported (e.g. testnets), skip relay gracefully
      if (!isSupported) {
        txHash = 'chain_not_supported';
        paymentError = `Chain ${chainId} not supported by 1Shot relayer (supported: ${supportedChainIds.join(', ') || 'none'})`;
        console.warn(`[x402] ${paymentError} — skipping relay.`);
        
        if (userTransferTx) {
          aiResponseText += `\n\n[Aura Action]: Gagal mengeksekusi transfer. Jaringan saat ini (${chainId}) tidak didukung oleh 1Shot Relayer.`;
        }
      } else {
        // ── Step 2: Submit relayer_send7710Transaction ──
        console.log(`[x402] Submitting relayer_send7710Transaction...`);
        
        // Enrich permissionContext to ensure 1Shot Relayer can find the address regardless of the field name it expects
        const enrichedPermissionContext = Array.isArray(permissionContext) 
          ? permissionContext.map((p: any) => ({
              ...p,
              account: p.account || userAddress,
              grantor: p.grantor || userAddress,
              sender: p.sender || userAddress,
              smartAccount: p.smartAccount || userAddress
            }))
          : permissionContext;

        const transactionsToRelay: any[] = [
          // 1. x402 Micropayment to Agent
          {
            to: usdcAddress,
            data: `0xa9059cbb000000000000000000000000${agentAccount.address.replace('0x', '')}${amountToCharge.toString(16).padStart(64, '0')}`,
            value: '0x0',
            permissionContext: enrichedPermissionContext,
          }
        ];

        // 2. Add user requested transfer if detected
        if (userTransferTx) {
          transactionsToRelay.push({
            ...userTransferTx,
            permissionContext: enrichedPermissionContext
          });
        }
        
        const sendRes = await fetch(RELAYER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 2,
            method: 'relayer_send7710Transaction',
            params: {
              chainId: String(chainId),
              permissionContext: enrichedPermissionContext,
              transactions: transactionsToRelay,
            },
          }),
        });
        if (!sendRes.ok) {
          const errText = await sendRes.text();
          throw new Error(`relayer_send7710Transaction HTTP ${sendRes.status}: ${errText}`);
        }
        const sendJson = await sendRes.json();
        if (sendJson.error) throw new Error(`relayer_send7710Transaction: ${sendJson.error.message}`);
        txHash = sendJson.result?.taskId ?? sendJson.result ?? 'submitted';
        console.log('[x402] Payment submitted. TaskId:', txHash);

        // Append success message ONLY if it actually succeeded
        if (userTransferTx) {
          aiResponseText += `\n\n[Aura Action]: Successfully executed the transfer of ${transferMatch ? parseFloat(transferMatch[1]) : ''} USDC to ${transferMatch ? transferMatch[2] : ''} autonomously via 1Shot Relayer! 🚀\nTask ID: ${txHash}`;
        }
      }
    } catch (e: any) {
      paymentError = e?.message ?? String(e);
      console.error('[x402] Execution Error:', paymentError);
      aiResponseText += `\n\n[Aura Error]: Failed to execute transaction. Relayer response: ${paymentError}`;
    }

    // Combine responses if sub-agent was called
    if (subAgentResponse) {
      aiResponseText = `[Aura (Main Agent)]: I have coordinated with my sub-agent to handle this.\n\n[Sub-Agent]: ${subAgentResponse}`;
    }

    return NextResponse.json({
      reply: aiResponseText,
      paymentStatus: paymentError ? 'error' : 'success',
      paymentError: paymentError ?? undefined,
      txHash,
      subAgentTxHash: subAgentTxHash
    });

  } catch (err: any) {
    console.error("Agent Route Error:", err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
