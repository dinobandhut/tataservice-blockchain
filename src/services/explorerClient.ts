import { JsonRpcProvider } from 'ethers';

export interface ExplorerStats {
  chainName: string;
  symbol: string;
  chainId: number;
  totalSupplyTata: string;
  latestBlock: number;
  finalizedBlock: number;
  justifiedEpoch: number;
  finalizedEpoch: number;
  totalTransactions: number;
  gasPriceWei: string;
  activeValidators: number;
  totalStakedGwei: string;
  source: 'indexer-api' | 'direct-rpc';
}

export interface ExplorerBlock {
  number: string | number;
  hash: string;
  parent_hash: string;
  timestamp: string | number;
  miner: string;
  gas_used: string;
  gas_limit: string;
  base_fee_per_gas: string;
  tx_count: number;
  size_bytes?: number;
  finalized?: boolean;
  state_root?: string;
  receipts_root?: string;
}

export interface ExplorerTransaction {
  hash: string;
  block_number: string | number;
  tx_index: number;
  from_address: string;
  to_address: string | null;
  value_wei: string;
  nonce?: number;
  gas_limit?: string;
  gas_used: string;
  effective_gas_price: string;
  input_data?: string;
  status: number;
  contract_address: string | null;
  timestamp: string | number;
}

export interface ExplorerLog {
  log_index: number;
  address: string;
  topic0: string | null;
  topic1: string | null;
  topic2: string | null;
  topic3: string | null;
  data: string;
}

export interface VerifiedContractSummary {
  address: string;
  name: string;
  compiler_version: string;
  evm_version: string;
  optimization_used: boolean;
  runs: number;
  bytecode_hash: string;
  verified_at: string;
  abi?: unknown[];
  source_code?: string;
}

export interface AddressDetail {
  address: string;
  balanceWei: string;
  txCount: number;
  isContract: boolean;
  verifiedContract: VerifiedContractSummary | null;
  transactions: ExplorerTransaction[];
}

export interface ValidatorRecord {
  validator_index: number;
  pubkey: string;
  withdrawal_credentials: string;
  effective_balance_gwei: number;
  balance_gwei: number;
  status: string;
  slashed: boolean;
  activation_epoch: number;
  exit_epoch: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Endpoint returned non-JSON response (${res.status})`);
    }
    const body = await res.json();
    if (!res.ok) {
      throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export class TataExplorerClient {
  constructor(
    public readonly apiUrl: string,
    public readonly rpcUrl: string
  ) {}

  private getRpcProvider(): JsonRpcProvider {
    return new JsonRpcProvider(this.rpcUrl, 810161, { staticNetwork: true });
  }

  async getStats(): Promise<ExplorerStats> {
    try {
      const data = await fetchJson<Omit<ExplorerStats, 'source'>>(`${this.apiUrl}/stats`);
      return { ...data, source: 'indexer-api' };
    } catch {
      const provider = this.getRpcProvider();
      const [blockNum, feeData] = await Promise.all([provider.getBlockNumber(), provider.getFeeData()]);
      return {
        chainName: 'TataService Blockchain',
        symbol: 'TATA',
        chainId: 810161,
        totalSupplyTata: '1000000000',
        latestBlock: blockNum,
        finalizedBlock: 0,
        justifiedEpoch: 0,
        finalizedEpoch: 0,
        totalTransactions: 0,
        gasPriceWei: (feeData.gasPrice ?? 1000000000n).toString(),
        activeValidators: 0,
        totalStakedGwei: '0',
        source: 'direct-rpc',
      };
    }
  }

  async getBlocks(limit = 15): Promise<ExplorerBlock[]> {
    try {
      const res = await fetchJson<{ blocks: ExplorerBlock[] }>(`${this.apiUrl}/blocks?limit=${limit}`);
      return res.blocks;
    } catch {
      const provider = this.getRpcProvider();
      const head = await provider.getBlockNumber();
      const count = Math.min(limit, head + 1);
      const numbers = Array.from({ length: count }, (_, idx) => head - idx);
      const rawBlocks = await Promise.all(numbers.map((n) => provider.getBlock(n, false)));
      return rawBlocks
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map((b) => ({
          number: b.number,
          hash: b.hash ?? '0x',
          parent_hash: b.parentHash,
          timestamp: b.timestamp,
          miner: b.miner,
          gas_used: b.gasUsed.toString(),
          gas_limit: b.gasLimit.toString(),
          base_fee_per_gas: (b.baseFeePerGas ?? 0n).toString(),
          tx_count: b.transactions.length,
          state_root: b.stateRoot ?? undefined,
          receipts_root: b.receiptsRoot ?? undefined,
        }));
    }
  }

  async getBlockDetail(identifier: string): Promise<{ block: ExplorerBlock; transactions: ExplorerTransaction[] }> {
    try {
      return await fetchJson<{ block: ExplorerBlock; transactions: ExplorerTransaction[] }>(
        `${this.apiUrl}/blocks/${encodeURIComponent(identifier)}`
      );
    } catch {
      const provider = this.getRpcProvider();
      const blockTag = /^\d+$/.test(identifier) ? Number(identifier) : identifier;
      const b = await provider.getBlock(blockTag, true);
      if (!b) throw new Error('Block not found');
      return {
        block: {
          number: b.number,
          hash: b.hash ?? '0x',
          parent_hash: b.parentHash,
          timestamp: b.timestamp,
          miner: b.miner,
          gas_used: b.gasUsed.toString(),
          gas_limit: b.gasLimit.toString(),
          base_fee_per_gas: (b.baseFeePerGas ?? 0n).toString(),
          tx_count: b.transactions.length,
          state_root: b.stateRoot ?? undefined,
          receipts_root: b.receiptsRoot ?? undefined,
        },
        transactions: b.prefetchedTransactions.map((tx, idx) => ({
          hash: tx.hash,
          block_number: b.number,
          tx_index: idx,
          from_address: tx.from,
          to_address: tx.to,
          value_wei: tx.value.toString(),
          gas_used: tx.gasLimit.toString(),
          effective_gas_price: (tx.gasPrice ?? 0n).toString(),
          status: 1,
          contract_address: null,
          timestamp: b.timestamp,
        })),
      };
    }
  }

  async getTransactions(limit = 15): Promise<ExplorerTransaction[]> {
    const res = await fetchJson<{ transactions: ExplorerTransaction[] }>(
      `${this.apiUrl}/transactions?limit=${limit}`
    );
    return res.transactions;
  }

  async getTransactionDetail(hash: string): Promise<{ transaction: ExplorerTransaction; logs: ExplorerLog[] }> {
    try {
      return await fetchJson<{ transaction: ExplorerTransaction; logs: ExplorerLog[] }>(
        `${this.apiUrl}/transactions/${encodeURIComponent(hash)}`
      );
    } catch {
      const provider = this.getRpcProvider();
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(hash),
        provider.getTransactionReceipt(hash),
      ]);
      if (!tx) throw new Error('Transaction not found');
      const block = tx.blockNumber !== null ? await provider.getBlock(tx.blockNumber) : null;
      return {
        transaction: {
          hash: tx.hash,
          block_number: tx.blockNumber ?? 0,
          tx_index: receipt?.index ?? 0,
          from_address: tx.from,
          to_address: tx.to,
          value_wei: tx.value.toString(),
          nonce: tx.nonce,
          gas_limit: tx.gasLimit.toString(),
          gas_used: (receipt?.gasUsed ?? 0n).toString(),
          effective_gas_price: (receipt?.gasPrice ?? tx.gasPrice ?? 0n).toString(),
          input_data: tx.data,
          status: receipt?.status ?? 1,
          contract_address: receipt?.contractAddress ?? null,
          timestamp: block?.timestamp ?? 0,
        },
        logs: (receipt?.logs ?? []).map((l) => ({
          log_index: l.index,
          address: l.address,
          topic0: l.topics[0] ?? null,
          topic1: l.topics[1] ?? null,
          topic2: l.topics[2] ?? null,
          topic3: l.topics[3] ?? null,
          data: l.data,
        })),
      };
    }
  }

  async getAddressDetail(address: string): Promise<AddressDetail> {
    try {
      return await fetchJson<AddressDetail>(`${this.apiUrl}/address/${encodeURIComponent(address)}`);
    } catch {
      const provider = this.getRpcProvider();
      const [bal, nonce, code] = await Promise.all([
        provider.getBalance(address),
        provider.getTransactionCount(address),
        provider.getCode(address),
      ]);
      return {
        address: address.toLowerCase(),
        balanceWei: bal.toString(),
        txCount: nonce,
        isContract: code !== '0x',
        verifiedContract: null,
        transactions: [],
      };
    }
  }

  async getContracts(): Promise<VerifiedContractSummary[]> {
    const res = await fetchJson<{ contracts: VerifiedContractSummary[] }>(`${this.apiUrl}/contracts`);
    return res.contracts;
  }

  async getContractByAddress(address: string): Promise<VerifiedContractSummary> {
    const res = await fetchJson<{ contract: VerifiedContractSummary }>(
      `${this.apiUrl}/contracts/${encodeURIComponent(address)}`
    );
    return res.contract;
  }

  async verifyContract(payload: {
    address: string;
    contractName: string;
    compilerVersion: string;
    evmVersion: string;
    optimizationUsed: boolean;
    runs: number;
    sourceCode: string;
  }) {
    return fetchJson<{ status: string; contract: VerifiedContractSummary }>(`${this.apiUrl}/contracts/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getValidators(): Promise<ValidatorRecord[]> {
    const res = await fetchJson<{ validators: ValidatorRecord[] }>(`${this.apiUrl}/validators`);
    return res.validators;
  }
}
