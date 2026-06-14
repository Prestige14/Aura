import { NextResponse } from 'next/server';
import { parseUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, base } from 'viem/chains';

const VENICE_API_KEY = process.env.VENICE_API_KEY;
// The sub-agent has its own unique private key
const SUB_AGENT_PRIVATE_KEY = process.env.SUB_AGENT_PRIVATE_KEY || '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'; 

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
    const { task, redelegatedPermissionContext } = body;

    if (!task || !redelegatedPermissionContext) {
      return NextResponse.json({ error: 'Missing required parameters (task or redelegatedPermissionContext)' }, { status: 400 });
    }

    console.log("Sub-Agent received task:", task);

    // 1. Sub-Agent executes its specific intelligence task (e.g. generate image prompt or specialized response)
    let aiResponseText = "Mock Sub-Agent response.";
    
    if (VENICE_API_KEY) {
      console.log("Sub-Agent calling Venice AI API...");
      const veniceRes = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VENICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
          messages: [
            { role: "system", content: "You are an autonomous sub-agent specialized in resolving specific micro-tasks. Keep answers under 2 sentences." },
            { role: "user", content: task }
          ]
        })
      });

      if (veniceRes.ok) {
        const veniceData = await veniceRes.json();
        aiResponseText = veniceData.choices[0].message.content;
      } else {
        const errorText = await veniceRes.text();
        console.error("Venice API Error (Sub-Agent):", errorText);
        try {
          const errJson = JSON.parse(errorText);
          aiResponseText = `[Sub-Agent Error]: Venice AI API failed. Reason: ${errJson.error || errorText}`;
        } catch {
          aiResponseText = `[Sub-Agent Error]: I encountered an error connecting to my neural net (Venice AI). ${errorText}`;
        }
      }
    }

    // 2. x402 Payment Execution via 1Shot Relayer using REDELEGATED permissions
    console.log("Sub-Agent executing x402 payment via 1Shot Relayer using redelegated permissions...");

    // Determine chain ID from context or default to Base Mainnet (8453)
    const contextChainId = Array.isArray(redelegatedPermissionContext)
      ? redelegatedPermissionContext[0]?.chainId
      : (redelegatedPermissionContext?.chainId || redelegatedPermissionContext?.permissionContext?.[0]?.chainId);
    const chainId = contextChainId || 8453;
    const config = getChainConfig(chainId);
    const usdcAddress: Address = config.usdcAddress;
    const subAgentAccount = privateKeyToAccount(SUB_AGENT_PRIVATE_KEY as `0x${string}`);
    const amountToCharge = parseUnits('0.05', 6); // Sub-agent charges 0.05 USDC
    console.log(`[x402/sub-agent] Resolved chainId=${chainId}, usdcAddress=${usdcAddress}`);

    let txHash = 'skipped';
    let paymentError: string | null = null;

    try {
      console.log(`[x402/sub-agent] Fetching relayer capabilities for chainId=${chainId}...`);
      const capRes = await fetch(RELAYER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'relayer_getCapabilities', params: [] }),
      });
      if (!capRes.ok) throw new Error(`relayer_getCapabilities HTTP ${capRes.status}`);
      const capJson = await capRes.json();
      if (capJson.error) throw new Error(`relayer_getCapabilities: ${capJson.error.message}`);

      const capabilities = capJson.result ?? {};
      const supportedChainIds: string[] = Object.keys(capabilities);
      console.log(`[x402/sub-agent] Supported chains: [${supportedChainIds.join(', ')}]`);

      if (!supportedChainIds.includes(String(chainId))) {
        txHash = 'chain_not_supported';
        paymentError = `Chain ${chainId} not supported by 1Shot relayer`;
        console.warn(`[x402/sub-agent] ${paymentError} — skipping relay.`);
      } else {
        console.log(`[x402/sub-agent] Submitting relayer_send7710Transaction...`);
        const sendRes = await fetch(RELAYER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 2,
            method: 'relayer_send7710Transaction',
            params: {
              chainId: String(chainId),
              permissionContext: redelegatedPermissionContext,
              transactions: [
                {
                  to: usdcAddress,
                  data: `0xa9059cbb000000000000000000000000${subAgentAccount.address.replace('0x', '')}${amountToCharge.toString(16).padStart(64, '0')}`,
                  value: '0x0',
                },
              ],
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
        console.log('[x402/sub-agent] Payment submitted. TaskId:', txHash);
      }
    } catch (e: any) {
      paymentError = e?.message ?? String(e);
      console.error('[x402/sub-agent] Execution Error:', paymentError);
    }

    return NextResponse.json({
      reply: aiResponseText,
      paymentStatus: paymentError ? 'error' : 'success',
      paymentError: paymentError ?? undefined,
      txHash,
      subAgentAddress: subAgentAccount.address
    });

  } catch (err: any) {
    console.error("Sub-Agent Route Error:", err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
