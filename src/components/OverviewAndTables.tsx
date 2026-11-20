import React, { useState } from 'react';
import { BrowserProvider, parseEther } from 'ethers';
import { ArrowLeft, ArrowUpRight, Copy, Check } from 'lucide-react';
import {
  AddressDetail,
  ExplorerBlock,
  ExplorerLog,
  ExplorerStats,
  ExplorerTransaction,
} from '../services/explorerClient';
import { formatGwei, formatTata, formatUnixTimestamp, shortHash } from './Formatters';

interface NavCallbacks {
  onSelectBlock: (id: string) => void;
  onSelectTx: (hash: string) => void;
  onSelectAddress: (addr: string) => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 rounded border border-slate-200 bg-white transition-colors"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export function EmptyNodeNotice({
  title,
  message,
  onOpenConfig,
}: {
  title: string;
  message: string;
  onOpenConfig: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
      <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 max-w-lg mx-auto mb-5">{message}</p>
      <button
        type="button"
        onClick={onOpenConfig}
        className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap"
      >
        Configure Node Endpoint
      </button>
    </div>
  );
}

export function OverviewSection({
  stats,
  blocks,
  transactions,
  loading,
  error,
  onOpenConfig,
  onViewAllBlocks,
  onViewAllTxs,
  onSelectBlock,
  onSelectTx,
  onSelectAddress,
}: {
  stats: ExplorerStats | null;
  blocks: ExplorerBlock[];
  transactions: ExplorerTransaction[];
  loading: boolean;
  error: string | null;
  onOpenConfig: () => void;
  onViewAllBlocks: () => void;
  onViewAllTxs: () => void;
} & NavCallbacks) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">TataService Blockchain Explorer</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Chain ID 810161</span>
            <span aria-hidden="true">·</span>
            <span>Native Coin TATA</span>
            <span aria-hidden="true">·</span>
            <span>Fixed Cap 1,000,000,000 TATA</span>
            {stats && (
              <>
                <span aria-hidden="true">·</span>
                <span>Source: {stats.source === 'indexer-api' ? 'PostgreSQL Indexer' : 'Direct JSON-RPC'}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Latest Block Height</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {loading ? '...' : stats && stats.latestBlock >= 0 ? `#${stats.latestBlock.toLocaleString()}` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Finalized Block: {stats ? `#${stats.finalizedBlock.toLocaleString()}` : '—'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Consensus Finality</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {loading ? '...' : stats ? `Epoch ${stats.finalizedEpoch}` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Justified: {stats ? `Epoch ${stats.justifiedEpoch}` : '—'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Current Gas Price</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {loading ? '...' : stats ? formatGwei(stats.gasPriceWei) : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Indexed Txs: {stats ? stats.totalTransactions.toLocaleString() : '—'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Active PoS Validators</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {loading ? '...' : stats ? stats.activeValidators.toLocaleString() : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Supply Cap: 1,000,000,000 TATA
          </div>
        </div>
      </div>

      {error && (
        <EmptyNodeNotice
          title="No Live TataService Node Connected"
          message={`Unable to fetch live chain telemetry (${error}). Connect this explorer to your Ubuntu node's /rpc and /api/v1 endpoints to inspect real blocks and transactions.`}
          onOpenConfig={onOpenConfig}
        />
      )}

      {!error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Latest Blocks */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Latest Blocks</h2>
              <button
                type="button"
                onClick={onViewAllBlocks}
                className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
              >
                View all blocks
              </button>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Block</th>
                    <th className="py-2.5 px-4 font-medium">Fee Recipient</th>
                    <th className="py-2.5 px-4 font-medium text-right">Txns</th>
                    <th className="py-2.5 px-4 font-medium text-right">Gas Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                        Loading blocks from chain...
                      </td>
                    </tr>
                  )}
                  {!loading && blocks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                        No blocks indexed yet.
                      </td>
                    </tr>
                  )}
                  {blocks.slice(0, 8).map((b) => (
                    <tr key={String(b.number)} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onSelectBlock(String(b.number))}
                          className="text-teal-700 hover:underline font-medium"
                        >
                          #{b.number}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        <button
                          type="button"
                          onClick={() => onSelectAddress(b.miner)}
                          className="hover:text-teal-700"
                        >
                          {shortHash(b.miner)}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {b.tx_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {Number(b.gas_used).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Latest Transactions */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Latest Transactions</h2>
              <button
                type="button"
                onClick={onViewAllTxs}
                className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
              >
                View all transactions
              </button>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Tx Hash</th>
                    <th className="py-2.5 px-4 font-medium">From / To</th>
                    <th className="py-2.5 px-4 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-xs text-slate-500">
                        Loading transactions...
                      </td>
                    </tr>
                  )}
                  {!loading && transactions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-xs text-slate-500">
                        No transactions recorded on-chain yet.
                      </td>
                    </tr>
                  )}
                  {transactions.slice(0, 8).map((tx) => (
                    <tr key={tx.hash} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => onSelectTx(tx.hash)}
                          className="text-teal-700 hover:underline font-medium"
                        >
                          {shortHash(tx.hash)}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => onSelectAddress(tx.from_address)} className="hover:text-teal-700">
                            {shortHash(tx.from_address, 6, 4)}
                          </button>
                          <span aria-hidden="true" className="text-slate-400">→</span>
                          {tx.to_address ? (
                            <button type="button" onClick={() => onSelectAddress(tx.to_address!)} className="hover:text-teal-700">
                              {shortHash(tx.to_address, 6, 4)}
                            </button>
                          ) : (
                            <span className="text-slate-500">Contract Create</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                        {formatTata(tx.value_wei, 4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function BlocksTableView({
  blocks,
  loading,
  onSelectBlock,
  onSelectAddress,
}: {
  blocks: ExplorerBlock[];
  loading: boolean;
  onSelectBlock: (id: string) => void;
  onSelectAddress: (addr: string) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Blocks</h1>
        <span className="text-xs text-slate-500 font-mono tabular-nums">Showing {blocks.length} latest blocks</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 font-medium">Height</th>
              <th className="py-3 px-4 font-medium">Timestamp</th>
              <th className="py-3 px-4 font-medium">Proposer / Fee Recipient</th>
              <th className="py-3 px-4 font-medium text-right">Txns</th>
              <th className="py-3 px-4 font-medium text-right">Gas Used / Limit</th>
              <th className="py-3 px-4 font-medium text-right">Base Fee</th>
              <th className="py-3 px-4 font-medium text-right">Finality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Loading blocks...
                </td>
              </tr>
            )}
            {!loading && blocks.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No blocks available from connected RPC / indexer.
                </td>
              </tr>
            )}
            {blocks.map((b) => (
              <tr key={String(b.number)} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 font-mono tabular-nums">
                  <button type="button" onClick={() => onSelectBlock(String(b.number))} className="text-teal-700 hover:underline font-medium">
                    #{b.number}
                  </button>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">{formatUnixTimestamp(b.timestamp)}</td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700">
                  <button type="button" onClick={() => onSelectAddress(b.miner)} className="hover:text-teal-700">
                    {shortHash(b.miner, 10, 6)}
                  </button>
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">{b.tx_count}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                  {Number(b.gas_used).toLocaleString()} / {Number(b.gas_limit).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{formatGwei(b.base_fee_per_gas)}</td>
                <td className="py-3 px-4 text-right text-xs font-medium">
                  {b.finalized ? (
                    <span className="text-emerald-700">Finalized</span>
                  ) : (
                    <span className="text-amber-700">Unfinalized</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BlockDetailView({
  detail,
  onBack,
  onSelectTx,
  onSelectAddress,
}: {
  detail: { block: ExplorerBlock; transactions: ExplorerTransaction[] };
  onBack: () => void;
  onSelectTx: (hash: string) => void;
  onSelectAddress: (addr: string) => void;
}) {
  const { block, transactions } = detail;
  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Blocks</span>
      </button>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <h1 className="text-xl font-bold font-mono tabular-nums text-slate-900">Block #{block.number}</h1>
          <span className={`text-xs font-medium ${block.finalized ? 'text-emerald-700' : 'text-amber-700'}`}>
            {block.finalized ? 'Finalized (Casper FFG)' : 'Pending Epoch Finality'}
          </span>
        </div>

        <dl className="divide-y divide-slate-100 text-sm">
          {[
            ['Block Hash', block.hash, true],
            ['Parent Hash', block.parent_hash, true],
            ['Timestamp', formatUnixTimestamp(block.timestamp), false],
            ['Fee Recipient', block.miner, true],
            ['Transactions', String(block.tx_count), false],
            ['Gas Used / Limit', `${Number(block.gas_used).toLocaleString()} / ${Number(block.gas_limit).toLocaleString()}`, false],
            ['Base Fee Per Gas', formatGwei(block.base_fee_per_gas), false],
            ['State Root', block.state_root ?? '—', false],
            ['Receipts Root', block.receipts_root ?? '—', false],
          ].map(([label, value, copyable]) => (
            <div key={String(label)} className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <dt className="text-slate-500 font-medium">{label}</dt>
              <dd className="md:col-span-3 font-mono text-xs text-slate-900 break-all flex items-center gap-2">
                {label === 'Fee Recipient' ? (
                  <button type="button" onClick={() => onSelectAddress(String(value))} className="text-teal-700 hover:underline">
                    {value}
                  </button>
                ) : (
                  <span>{value}</span>
                )}
                {copyable && typeof value === 'string' && value.startsWith('0x') && <CopyButton value={value} />}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <TransactionsTableView
        transactions={transactions}
        loading={false}
        onSelectTx={onSelectTx}
        onSelectAddress={onSelectAddress}
        onSelectBlock={() => undefined}
        title={`Transactions in Block #${block.number}`}
      />
    </div>
  );
}

export function TransactionsTableView({
  transactions,
  loading,
  onSelectTx,
  onSelectAddress,
  onSelectBlock,
  title = 'Transactions',
}: {
  transactions: ExplorerTransaction[];
  loading: boolean;
  onSelectTx: (hash: string) => void;
  onSelectAddress: (addr: string) => void;
  onSelectBlock: (num: string) => void;
  title?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500 font-mono tabular-nums">{transactions.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 font-medium">Tx Hash</th>
              <th className="py-3 px-4 font-medium">Block</th>
              <th className="py-3 px-4 font-medium">From</th>
              <th className="py-3 px-4 font-medium">To</th>
              <th className="py-3 px-4 font-medium text-right">Value</th>
              <th className="py-3 px-4 font-medium text-right">Gas Price</th>
              <th className="py-3 px-4 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Loading transactions...
                </td>
              </tr>
            )}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No transactions found.
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.hash} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 font-mono text-xs">
                  <button type="button" onClick={() => onSelectTx(tx.hash)} className="text-teal-700 hover:underline font-medium">
                    {shortHash(tx.hash)}
                  </button>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-xs">
                  <button type="button" onClick={() => onSelectBlock(String(tx.block_number))} className="text-slate-700 hover:text-teal-700">
                    #{tx.block_number}
                  </button>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700">
                  <button type="button" onClick={() => onSelectAddress(tx.from_address)} className="hover:text-teal-700">
                    {shortHash(tx.from_address)}
                  </button>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700">
                  {tx.to_address ? (
                    <button type="button" onClick={() => onSelectAddress(tx.to_address!)} className="hover:text-teal-700">
                      {shortHash(tx.to_address)}
                    </button>
                  ) : (
                    <span className="text-slate-500">Contract Deploy</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{formatTata(tx.value_wei, 4)}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">{formatGwei(tx.effective_gas_price)}</td>
                <td className="py-3 px-4 text-right text-xs font-medium">
                  {tx.status === 1 ? (
                    <span className="text-emerald-700">Success</span>
                  ) : (
                    <span className="text-red-700">Reverted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TransactionDetailView({
  detail,
  onBack,
  onSelectBlock,
  onSelectAddress,
}: {
  detail: { transaction: ExplorerTransaction; logs: ExplorerLog[] };
  onBack: () => void;
  onSelectBlock: (id: string) => void;
  onSelectAddress: (addr: string) => void;
}) {
  const { transaction: tx, logs } = detail;
  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Transactions</span>
      </button>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-900">Transaction Details</h1>
          <span className={`text-sm font-semibold ${tx.status === 1 ? 'text-emerald-700' : 'text-red-700'}`}>
            {tx.status === 1 ? 'Status: Success' : 'Status: Reverted'}
          </span>
        </div>

        <dl className="divide-y divide-slate-100 text-sm">
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">Transaction Hash</dt>
            <dd className="md:col-span-3 font-mono text-xs break-all flex items-center gap-2">
              <span>{tx.hash}</span>
              <CopyButton value={tx.hash} />
            </dd>
          </div>
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">Block</dt>
            <dd className="md:col-span-3 font-mono text-xs">
              <button type="button" onClick={() => onSelectBlock(String(tx.block_number))} className="text-teal-700 hover:underline">
                #{tx.block_number}
              </button>
              <span className="text-slate-400 mx-2">·</span>
              <span className="text-slate-600">{formatUnixTimestamp(tx.timestamp)}</span>
            </dd>
          </div>
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">From</dt>
            <dd className="md:col-span-3 font-mono text-xs">
              <button type="button" onClick={() => onSelectAddress(tx.from_address)} className="text-teal-700 hover:underline">
                {tx.from_address}
              </button>
            </dd>
          </div>
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">To</dt>
            <dd className="md:col-span-3 font-mono text-xs">
              {tx.to_address ? (
                <button type="button" onClick={() => onSelectAddress(tx.to_address!)} className="text-teal-700 hover:underline">
                  {tx.to_address}
                </button>
              ) : (
                <span>Contract Created: {tx.contract_address ?? '—'}</span>
              )}
            </dd>
          </div>
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">Value</dt>
            <dd className="md:col-span-3 font-mono text-xs font-semibold text-slate-900">{formatTata(tx.value_wei, 8)}</dd>
          </div>
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">Gas Used / Effective Price</dt>
            <dd className="md:col-span-3 font-mono text-xs text-slate-700">
              {Number(tx.gas_used).toLocaleString()} gas · {formatGwei(tx.effective_gas_price)} · Nonce {tx.nonce ?? 0}
            </dd>
          </div>
          <div className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <dt className="text-slate-500 font-medium">Input Data</dt>
            <dd className="md:col-span-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded p-3 max-h-40 overflow-y-auto break-all">
              {tx.input_data || '0x'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Event Logs ({logs.length})</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No event logs emitted by this transaction.</p>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.log_index} className="border border-slate-200 rounded p-4 text-xs font-mono space-y-2">
                <div className="text-slate-600">
                  Log Index #{log.log_index} · Emitter:{' '}
                  <button type="button" onClick={() => onSelectAddress(log.address)} className="text-teal-700 hover:underline">
                    {log.address}
                  </button>
                </div>
                {[log.topic0, log.topic1, log.topic2, log.topic3].filter(Boolean).map((t, i) => (
                  <div key={i} className="text-slate-700 break-all">
                    Topic[{i}]: {t}
                  </div>
                ))}
                <div className="text-slate-600 break-all">Data: {log.data}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AddressDetailView({
  detail,
  walletAccount,
  isTataNetwork,
  onSelectTx,
  onSelectBlock,
  onSelectAddress,
  onRefresh,
}: {
  detail: AddressDetail;
  walletAccount: string | null;
  isTataNetwork: boolean;
  onSelectTx: (hash: string) => void;
  onSelectBlock: (num: string) => void;
  onSelectAddress: (addr: string) => void;
  onRefresh: () => void;
}) {
  const [recipient, setRecipient] = useState(detail.address);
  const [amountTata, setAmountTata] = useState('');
  const [sending, setSending] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const handleSendTata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.ethereum || !walletAccount) {
      setTxStatus('Connect MetaMask first to sign and broadcast a native TATA transfer.');
      return;
    }
    if (!isTataNetwork) {
      setTxStatus('Switch MetaMask to TataService Blockchain (Chain ID 810161) before sending.');
      return;
    }
    setSending(true);
    setTxStatus(null);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: recipient.trim(),
        value: parseEther(amountTata.trim()),
      });
      setTxStatus(`Broadcasted tx ${tx.hash}. Waiting for confirmation...`);
      await tx.wait(1);
      setTxStatus(`Confirmed! Tx Hash: ${tx.hash}`);
      setAmountTata('');
      onRefresh();
    } catch (err) {
      setTxStatus(err instanceof Error ? err.message : 'Transaction rejected or failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-slate-500">
              {detail.isContract ? 'Smart Contract Address' : 'Externally Owned Account'}
            </div>
            <h1 className="mt-1 text-lg font-mono font-semibold text-slate-900 break-all">{detail.address}</h1>
          </div>
          <CopyButton value={detail.address} />
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-slate-500">Native TATA Balance</div>
            <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
              {formatTata(detail.balanceWei, 6)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Nonce / Outgoing Txs</div>
            <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">{detail.txCount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Contract Verification</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {detail.verifiedContract
                ? `Verified (${detail.verifiedContract.name})`
                : detail.isContract
                  ? 'Unverified Bytecode'
                  : 'Standard Wallet Account'}
            </div>
          </div>
        </div>
      </div>

      {/* Real MetaMask Native Transfer Form */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Send Native TATA via MetaMask</h2>
        <p className="text-xs text-slate-500 mb-4">
          Signs and broadcasts a real EIP-1559 native coin transaction through your MetaMask wallet (Chain ID 810161).
        </p>
        <form onSubmit={handleSendTata} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Recipient Address</label>
            <input
              type="text"
              required
              pattern="^0x[0-9a-fA-F]{40}$"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              placeholder="0x..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Amount (TATA)</label>
            <input
              type="number"
              step="any"
              min="0.000001"
              required
              value={amountTata}
              onChange={(e) => setAmountTata(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              placeholder="1.0"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={sending}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-md transition-colors"
            >
              <span>{sending ? 'Signing...' : 'Send TATA'}</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </form>
        {txStatus && <p className="mt-3 text-xs font-mono text-slate-700 break-all">{txStatus}</p>}
      </div>

      <TransactionsTableView
        transactions={detail.transactions}
        loading={false}
        onSelectTx={onSelectTx}
        onSelectBlock={onSelectBlock}
        onSelectAddress={onSelectAddress}
        title="Address Transactions"
      />
    </div>
  );
}
