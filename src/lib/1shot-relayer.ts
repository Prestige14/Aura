// src/lib/1shot-relayer.ts
// 1Shot API Permissionless Relayer integration
// Based on: https://relayer.1shotapi.com
// Methods: relayer_getFeeData, relayer_send7710Transaction, relayer_getStatus

const ONESHOT_BASE_URL = (process.env.NEXT_PUBLIC_ONESHOT_RELAYER_URL || 'https://relayer.1shotapi.com') + '/relayer';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: unknown[];
  id: number;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface FeeData {
  gasToken: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  sponsorFee: string;
  relayerAddress: string;
}

interface RelayerTransaction {
  delegations: Delegation[];
  action: {
    target: string;
    value: string;
    calldata: string;
  };
  feeToken: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

interface Delegation {
  delegator: string;
  delegate: string;
  authority: string;
  caveats: Caveat[];
  salt: string;
  signature: string;
}

interface Caveat {
  enforcer: string;
  terms: string;
}

interface TransactionStatus {
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

let requestId = 1;

const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++,
  };

  const response = await fetch(ONESHOT_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`1Shot API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data: JsonRpcResponse<T> = await response.json();

  if (data.error) {
    throw new Error(`1Shot JSON-RPC error: ${data.error.message} (code: ${data.error.code})`);
  }

  return data.result as T;
};

/**
 * Step 1: Get fee data for USDC-sponsored gas
 * Uses relayer_getFeeData to get current gas price quotes
 */
export const getFeeData = async (chainId: number, gasTokenAddress: string): Promise<FeeData> => {
  return rpcCall<FeeData>('relayer_getFeeData', [
    {
      chainId: `0x${chainId.toString(16)}`,
      gasToken: gasTokenAddress,
    },
  ]);
};

/**
 * Step 2: Submit EIP-7710 transaction via 1Shot relayer
 * The relayer pays gas and deducts from user's USDC allowance
 */
export const send7710Transaction = async (tx: RelayerTransaction): Promise<string> => {
  // Returns a request ID (not txHash yet — need to poll for status)
  const requestId = await rpcCall<string>('relayer_send7710Transaction', [tx]);
  return requestId;
};

/**
 * Step 3: Poll for transaction status
 */
export const getTransactionStatus = async (requestId: string): Promise<TransactionStatus> => {
  return rpcCall<TransactionStatus>('relayer_getStatus', [{ requestId }]);
};

/**
 * Full flow: Submit tx and poll until confirmed
 * @param tx - The 7710 transaction object
 * @param onStatus - Callback for status updates
 * @param maxWaitMs - Maximum wait time in ms (default 60 seconds)
 */
export const submitAndWait = async (
  tx: RelayerTransaction,
  onStatus?: (status: TransactionStatus) => void,
  maxWaitMs = 60_000
): Promise<TransactionStatus> => {
  const reqId = await send7710Transaction(tx);
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getTransactionStatus(reqId);
    onStatus?.(status);

    if (status.status === 'confirmed') {
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(`Transaction failed: ${status.error || 'Unknown error'}`);
    }

    // Poll every 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Transaction timed out after 60 seconds');
};

/**
 * Build a simple USDC transfer transaction for delegation redemption
 * This is used to pay Venice AI for inference
 */
export const buildUSDCTransferTx = (
  usdcAddress: string,
  toAddress: string,
  amount: bigint,
  feeData: FeeData,
  delegations: Delegation[]
): RelayerTransaction => {
  // Encode ERC-20 transfer calldata: transfer(address to, uint256 amount)
  // Function selector: 0xa9059cbb
  const paddedTo = toAddress.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  const calldata = `0xa9059cbb${paddedTo}${paddedAmount}`;

  return {
    delegations,
    action: {
      target: usdcAddress,
      value: '0x0',
      calldata,
    },
    feeToken: feeData.gasToken,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  };
};

export type { FeeData, Delegation, Caveat, RelayerTransaction, TransactionStatus };
