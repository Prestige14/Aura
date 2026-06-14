import { NextResponse } from 'next/server';
import { parseUnits, encodeFunctionData, erc20Abi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, base } from 'viem/chains';

const VENICE_API_KEY = process.env.VENICE_API_KEY;

// 1Shot Public Relayer
const RELAYER_URL = (process.env.NEXT_PUBLIC_1SHOT_RELAYER_URL || 'https://relayer.1shotapi.com') + '/relayers';

// Hardcoded USDC addresses
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

/** Convert delegation bigints / Uint8Arrays into JSON-safe shapes. */
function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) {
    return Array.from(value).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) out[k] = toRelayerJson(v);
    return out;
  }
  return value;
}

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
    let subAgentResponse = null;
    let subAgentTxHash = null;

    if (prompt.toLowerCase().includes('design') || prompt.toLowerCase().includes('delegate') || prompt.toLowerCase().includes('sub-agent')) {
      console.log("A2A Coordination Triggered. Redelegating to Sub-Agent...");
      
      const redelegatedPermissionContext = {
        ...permissionContext,
        redelegated: true,
        parentSession: agentAccount.address,
      };

      try {
        const subAgentRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/agent/sub-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: prompt,
            userAddress,
            permissionContext: redelegatedPermissionContext,
          })
        });
        const subAgentData = await subAgentRes.json();
        subAgentResponse = subAgentData.reply;
        subAgentTxHash = subAgentData.txHash;
      } catch (err) {
        console.warn("Sub-agent call failed, continuing with main agent:", err);
      }
    }

    // Determine chain ID from context or default to Base Mainnet (8453)
    const contextChainId = Array.isArray(permissionContext)
      ? permissionContext[0]?.chainId
      : (permissionContext?.chainId || permissionContext?.permissionContext?.[0]?.chainId);
    const chainId = contextChainId || 8453;
    const config = getChainConfig(chainId);

    const usdcAddress: Address = config.usdcAddress;
    console.log(`[x402] Resolved chainId=${chainId}, usdcAddress=${usdcAddress}`);

    let txHash = 'skipped';
    let paymentError: string | null = null;

    try {
      // ── Step 1: Get relayer capabilities (get feeCollector + targetAddress) ──
      console.log(`[x402] Fetching relayer capabilities...`);
      const capRes = await fetch(RELAYER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'relayer_getCapabilities',
          params: [String(chainId)],
        }),
      });
      
      const capJson = await capRes.json();
      console.log(`[x402] Capabilities response:`, JSON.stringify(capJson).slice(0, 300));
      
      const capabilities = capJson.result ?? {};
      const chainCaps = capabilities[String(chainId)];
      
      // FeeCollector address from relayer (fallback to agent account)
      const feeCollector: Address = chainCaps?.feeCollector || agentAccount.address;
      console.log(`[x402] feeCollector=${feeCollector}`);

      // ── Detect Transfer Intent ──
      const transferMatch = prompt.match(/(?:transfer|kirim|send|kirimkan).*?([0-9.]+).*?(0x[a-fA-F0-9]{40})/i);
      
      // ── Step 2: Decode permissionContext from MetaMask ──
      let decodedDelegations: any[];
      
      try {
        const { decodeDelegations } = await import('@metamask/smart-accounts-kit/utils');
        
        if (Array.isArray(permissionContext) && permissionContext.length > 0 && typeof permissionContext[0] === 'object' && 'delegate' in permissionContext[0]) {
          decodedDelegations = permissionContext.map((d: any) => toRelayerJson(d));
        } else if (typeof permissionContext === 'string') {
          const decoded = decodeDelegations(permissionContext);
          decodedDelegations = decoded.map((d: any) => toRelayerJson(d));
        } else if (permissionContext?.context && typeof permissionContext.context === 'string') {
          const decoded = decodeDelegations(permissionContext.context);
          decodedDelegations = decoded.map((d: any) => toRelayerJson(d));
        } else if (Array.isArray(permissionContext) && permissionContext[0]?.context) {
          const decoded = decodeDelegations(permissionContext[0].context);
          decodedDelegations = decoded.map((d: any) => toRelayerJson(d));
        } else {
          decodedDelegations = [toRelayerJson(permissionContext)];
        }
        console.log(`[x402] Decoded ${decodedDelegations.length} delegation(s)`);
      } catch (decodeErr: any) {
        console.warn('[x402] decodeDelegations failed, using raw permissionContext:', decodeErr.message);
        decodedDelegations = Array.isArray(permissionContext)
          ? permissionContext.map((d: any) => toRelayerJson(d))
          : [toRelayerJson(permissionContext)];
      }

      // Ensure delegation has signature formatted properly
      decodedDelegations = decodedDelegations.map(d => {
         if (d.signature && !d.signature.startsWith('0x')) {
            d.signature = `0x${d.signature}`;
         }
         return d;
      });

      // Hardcoded allowedChains since getCapabilities may return empty
      const allowedChains = ['8453', '421614', '0x2105', '0x66eee'];
      const hexChainId = `0x${Number(chainId).toString(16)}`;
      const isSupported = allowedChains.includes(String(chainId)) || allowedChains.includes(hexChainId);

      if (!isSupported) {
        txHash = 'chain_not_supported';
        aiResponseText += `\n\n[Aura Action]: Failed to execute transfer. Current network (${chainId}) is not supported by 1Shot Relayer.`;
      } else {
        // ── Step 3: Build executions per 1Shot spec ──
        const amountToCharge = parseUnits('0.1', 6); // 0.1 USDC fee

        // Fee execution: USDC transfer to feeCollector
        const feeExecutionData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [feeCollector, amountToCharge],
        });
        
        const executions: any[] = [
          { target: usdcAddress, value: '0x0', data: feeExecutionData }
        ];

        // If user requested a USDC transfer, add it to executions
        if (transferMatch) {
          const transferAmount = parseFloat(transferMatch[1]);
          const transferTo = transferMatch[2] as Address;
          const amountToTransfer = parseUnits(transferAmount.toString(), 6);
          const workExecutionData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [transferTo, amountToTransfer],
          });
          executions.push({ target: usdcAddress, value: '0x0', data: workExecutionData });
          console.log(`[x402] Added user transfer: ${transferAmount} USDC to ${transferTo}`);
        }

        // ── Step 4: Submit per 1Shot official format ──
        console.log(`[x402] Submitting relayer_send7710Transaction with ${executions.length} execution(s)...`);
        const sendBody = {
          jsonrpc: '2.0', id: 2,
          method: 'relayer_send7710Transaction',
          params: {
            chainId: String(chainId),
            transactions: [{
              permissionContext: decodedDelegations,
              executions,
            }],
          },
        };
        console.log('[x402] Payload:', JSON.stringify(sendBody).slice(0, 500));

        const sendRes = await fetch(RELAYER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(sendBody),
        });
        if (!sendRes.ok) {
          const errText = await sendRes.text();
          throw new Error(`relayer_send7710Transaction HTTP ${sendRes.status}: ${errText}`);
        }
        const sendJson = await sendRes.json();
        if (sendJson.error) throw new Error(`relayer_send7710Transaction: ${sendJson.error.message}`);
        txHash = sendJson.result?.taskId ?? sendJson.result ?? 'submitted';
        console.log('[x402] Payment submitted. TaskId:', txHash);

        // Success message only after confirmed relay submission
        if (transferMatch) {
          aiResponseText += `\n\n[Aura Action]: Successfully executed the transfer of ${parseFloat(transferMatch[1])} USDC to ${transferMatch[2]} autonomously via 1Shot Relayer! 🚀\nTask ID: ${txHash}`;
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
