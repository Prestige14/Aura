# Aura: The Autonomous Web3 Concierge

A production-ready Next.js hackathon project that combines MetaMask Smart Accounts, Agent-to-Agent (A2A) delegation, 1Shot API gasless transactions, and Venice AI content generation.

## 🚀 Features

- **EIP-7702 Smart Account Upgrade**: Automatically upgrades connected MetaMask EOA to a Smart Account
- **ERC-7715 Session Permissions**: Requests scoped USDC spending permission from the user
- **A2A Agent Delegation**: Orchestrates Writer Agent + Designer Agent via ERC-7710 delegations  
- **1Shot API Gasless Transactions**: Pays for AI inference in USDC via permissionless relayer
- **Venice AI Integration**: Real text (llama-3.3-70b) and image generation
- **x402 Micropayments**: HTTP payment protocol for AI API access
- **Auto Faucet**: Sends 5 testnet USDC to new users automatically

## 📋 Prerequisites

- Node.js 18+
- MetaMask Flask (for EIP-7702 + ERC-7715 features)
- Venice AI API Key
- Testnet wallet with ETH for gas

## 🛠️ Setup

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Fill in your `.env.local`:

```env
DEVELOPER_PRIVATE_KEY=0x...          # Developer wallet private key (for faucet)
VENICE_API_KEY=...                    # Venice AI API key
NEXT_PUBLIC_USDC_ADDRESS_ARBITRUM_SEPOLIA=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
│                                                              │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────────┐  │
│  │ MetaMask │    │ Aura Frontend  │    │  Next.js API     │  │
│  │  Flask   │◄──►│  (Next.js)    │◄──►│  Routes          │  │
│  └──────────┘    └───────────────┘    └──────────────────┘  │
│       │                                       │              │
│  EIP-7702                              ┌──────┴──────┐      │
│  ERC-7715                              │ Main Agent  │       │
│                                         │  Pipeline   │       │
│                                         └──────┬──────┘      │
└─────────────────────────────────────────────────────────────┘
                                                │
                          ┌─────────────────────┼──────────────┐
                          │                     │              │
                    ┌─────▼─────┐        ┌──────▼──────┐      │
                    │  1Shot API │        │  Venice AI  │      │
                    │  Relayer  │        │  API        │      │
                    │ (EIP-7710)│        │  (llama/img)│      │
                    └───────────┘        └─────────────┘      │
                          │
                    Arbitrum Sepolia
                    USDC Transfer
```

## 🔑 Key Standards Implemented

| Standard | Purpose | Implementation |
|----------|---------|----------------|
| **EIP-7702** | EOA → Smart Account | `wallet_sendCalls` with authorization |
| **ERC-7715** | Session Permissions | `wallet_grantPermissions` via MetaMask Flask |
| **ERC-7710** | Delegation Framework | Delegation objects passed to 1Shot relayer |
| **x402** | HTTP Payments | USDC micropayment before AI inference |

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx              # Main page (chat + sidebar)
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Design system CSS
│   └── api/
│       ├── agent/route.ts    # Main agent pipeline (streaming NDJSON)
│       └── faucet/route.ts   # Testnet USDC faucet
├── components/
│   ├── chat/
│   │   ├── ChatInterface.tsx       # Chat UI with messages
│   │   └── TransactionTracker.tsx  # Real-time pipeline visualization
│   ├── wallet/
│   │   └── WalletConnect.tsx       # Wallet + Smart Account setup
│   └── providers/
│       └── Providers.tsx           # Root provider composition
├── contexts/
│   ├── Web3Context.tsx        # Wallet + Smart Account state
│   └── AuraAgentContext.tsx   # Agent orchestration state
└── lib/
    ├── wagmi-config.ts        # Wagmi v2 configuration
    ├── chains.ts              # Chain configs (Arb/Base Sepolia)
    ├── usdc-abi.ts            # ERC-20 ABI + utilities
    ├── 1shot-relayer.ts       # 1Shot JSON-RPC client
    └── venice-ai.ts           # Venice AI REST client
```

## 🧪 Testing Without MetaMask Flask

The app includes simulation fallbacks for all MetaMask Flask features:
- EIP-7702 upgrade is simulated if Flask not available
- ERC-7715 permissions are simulated
- 1Shot API falls back to simulated fee data
- Venice AI falls back to demo text if no API key

## 🌐 Testnet Resources

- **Arbitrum Sepolia Faucet**: https://faucet.arbitrum.io
- **USDC Faucet**: https://faucet.circle.com
- **Block Explorer**: https://sepolia.arbiscan.io

## 🔗 Technology Documentation

- [MetaMask Smart Accounts Kit](https://docs.metamask.io/smart-accounts-kit/)
- [1Shot API](https://1shotapi.com)
- [Venice AI API](https://docs.venice.ai)
- [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)
- [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715)
