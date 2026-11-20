import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Settings2, Wallet } from 'lucide-react';
import { TATA_CHAIN_CONFIG, getSavedEndpoints, saveEndpoints } from './config/chain';
import { useMetaMask } from './hooks/useMetaMask';
import {
  AddressDetail,
  ExplorerBlock,
  ExplorerLog,
  ExplorerStats,
  ExplorerTransaction,
  TataExplorerClient,
  ValidatorRecord,
  VerifiedContractSummary,
} from './services/explorerClient';
import {
  AddressDetailView,
  BlockDetailView,
  BlocksTableView,
  OverviewSection,
  TransactionDetailView,
  TransactionsTableView,
} from './components/OverviewAndTables';
import { ContractsView, ValidatorsView } from './components/ContractsAndValidators';
import { shortHash } from './components/Formatters';

type ActiveRoute =
  | { view: 'overview' }
  | { view: 'blocks' }
  | { view: 'block'; id: string }
  | { view: 'transactions' }
  | { view: 'tx'; hash: string }
  | { view: 'address'; address: string }
  | { view: 'contracts' }
  | { view: 'validators' };

export default function App() {
  const initialEndpoints = useMemo(() => getSavedEndpoints(), []);
  const [rpcUrl, setRpcUrl] = useState(initialEndpoints.rpcUrl);
  const [apiUrl, setApiUrl] = useState(initialEndpoints.apiUrl);
  const [showConfig, setShowConfig] = useState(false);
  const [draftRpc, setDraftRpc] = useState(initialEndpoints.rpcUrl);
  const [draftApi, setDraftApi] = useState(initialEndpoints.apiUrl);

  const [route, setRoute] = useState<ActiveRoute>({ view: 'overview' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([]);
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [contracts, setContracts] = useState<VerifiedContractSummary[]>([]);
  const [validators, setValidators] = useState<ValidatorRecord[]>([]);

  const [blockDetail, setBlockDetail] = useState<{ block: ExplorerBlock; transactions: ExplorerTransaction[] } | null>(null);
  const [txDetail, setTxDetail] = useState<{ transaction: ExplorerTransaction; logs: ExplorerLog[] } | null>(null);
  const [addressDetail, setAddressDetail] = useState<AddressDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [nodeError, setNodeError] = useState<string | null>(null);

  const client = useMemo(() => new TataExplorerClient(apiUrl, rpcUrl), [apiUrl, rpcUrl]);
  const wallet = useMetaMask(rpcUrl);

  const loadData = useCallback(async () => {
    setLoading(true);
    setNodeError(null);
    try {
      if (route.view === 'overview' || route.view === 'blocks' || route.view === 'transactions') {
        const [s, b, t] = await Promise.all([
          client.getStats(),
          client.getBlocks(20),
          client.getTransactions(20).catch(() => []),
        ]);
        setStats(s);
        setBlocks(b);
        setTransactions(t);
      } else if (route.view === 'block') {
        setBlockDetail(await client.getBlockDetail(route.id));
      } else if (route.view === 'tx') {
        setTxDetail(await client.getTransactionDetail(route.hash));
      } else if (route.view === 'address') {
        setAddressDetail(await client.getAddressDetail(route.address));
      } else if (route.view === 'contracts') {
        setContracts(await client.getContracts().catch(() => []));
      } else if (route.view === 'validators') {
        setValidators(await client.getValidators().catch(() => []));
      }
    } catch (err) {
      setNodeError(err instanceof Error ? err.message : 'Node endpoint unreachable');
    } finally {
      setLoading(false);
    }
  }, [client, route]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    const q = searchQuery.trim();
    if (!q) return;

    if (/^\d+$/.test(q)) {
      setRoute({ view: 'block', id: q });
    } else if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      setRoute({ view: 'address', address: q.toLowerCase() });
    } else if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
      setRoute({ view: 'tx', hash: q.toLowerCase() });
    } else {
      setSearchError('Enter a valid block number, 0x address (42 chars), or transaction hash (66 chars).');
    }
  };

  const handleSaveEndpoints = (e: React.FormEvent) => {
    e.preventDefault();
    saveEndpoints(draftRpc, draftApi);
    setRpcUrl(draftRpc.trim());
    setApiUrl(draftApi.trim());
    setShowConfig(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setRoute({ view: 'overview' })}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Tata Explorer
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {(
              [
                ['overview', 'Overview'],
                ['blocks', 'Blocks'],
                ['transactions', 'Transactions'],
                ['contracts', 'Contracts'],
                ['validators', 'Validators'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRoute({ view: key })}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  route.view === key
                    ? 'border-teal-700 text-slate-900'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                if (wallet.account) {
                  setRoute({ view: 'address', address: wallet.account });
                } else {
                  void wallet.connect();
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{wallet.account ? shortHash(wallet.account, 6, 4) : 'Connect MetaMask'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Search & Network Toolbar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2 max-w-2xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Block Number, Tx Hash (0x...), or Address (0x...)"
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm font-mono bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
            >
              Lookup
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void wallet.addOrSwitchTataChain()}
              className="px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md whitespace-nowrap"
            >
              {wallet.isTataNetwork ? 'MetaMask: Chain 810161 Active' : 'Add TATA to MetaMask'}
            </button>
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md whitespace-nowrap"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Node RPC</span>
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600">
          {(['overview', 'blocks', 'transactions', 'contracts', 'validators'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setRoute({ view: k })}
              className={`capitalize whitespace-nowrap ${route.view === k ? 'text-teal-700 font-semibold' : ''}`}
            >
              {k}
            </button>
          ))}
        </div>

        {searchError && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 text-xs text-red-700">{searchError}</div>
        )}
        {wallet.error && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 text-xs text-red-700">{wallet.error}</div>
        )}

        {showConfig && (
          <form
            onSubmit={handleSaveEndpoints}
            className="max-w-7xl mx-auto px-4 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
          >
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">JSON-RPC Endpoint URL</label>
              <input
                type="url"
                required
                value={draftRpc}
                onChange={(e) => setDraftRpc(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Explorer API URL</label>
              <input
                type="url"
                required
                value={draftApi}
                onChange={(e) => setDraftApi(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
            >
              Save Endpoints
            </button>
          </form>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {route.view === 'overview' && (
          <OverviewSection
            stats={stats}
            blocks={blocks}
            transactions={transactions}
            loading={loading}
            error={nodeError}
            onOpenConfig={() => setShowConfig(true)}
            onViewAllBlocks={() => setRoute({ view: 'blocks' })}
            onViewAllTxs={() => setRoute({ view: 'transactions' })}
            onSelectBlock={(id) => setRoute({ view: 'block', id })}
            onSelectTx={(hash) => setRoute({ view: 'tx', hash })}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
          />
        )}

        {route.view === 'blocks' && (
          <BlocksTableView
            blocks={blocks}
            loading={loading}
            onSelectBlock={(id) => setRoute({ view: 'block', id })}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
          />
        )}

        {route.view === 'block' && blockDetail && (
          <BlockDetailView
            detail={blockDetail}
            onBack={() => setRoute({ view: 'blocks' })}
            onSelectTx={(hash) => setRoute({ view: 'tx', hash })}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
          />
        )}

        {route.view === 'transactions' && (
          <TransactionsTableView
            transactions={transactions}
            loading={loading}
            onSelectTx={(hash) => setRoute({ view: 'tx', hash })}
            onSelectBlock={(num) => setRoute({ view: 'block', id: num })}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
          />
        )}

        {route.view === 'tx' && txDetail && (
          <TransactionDetailView
            detail={txDetail}
            onBack={() => setRoute({ view: 'transactions' })}
            onSelectBlock={(id) => setRoute({ view: 'block', id })}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
          />
        )}

        {route.view === 'address' && addressDetail && (
          <AddressDetailView
            detail={addressDetail}
            walletAccount={wallet.account}
            isTataNetwork={wallet.isTataNetwork}
            onSelectTx={(hash) => setRoute({ view: 'tx', hash })}
            onSelectBlock={(num) => setRoute({ view: 'block', id: num })}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
            onRefresh={() => void loadData()}
          />
        )}

        {route.view === 'contracts' && (
          <ContractsView
            client={client}
            contracts={contracts}
            rpcUrl={rpcUrl}
            walletAccount={wallet.account}
            onSelectAddress={(addr) => setRoute({ view: 'address', address: addr })}
            onVerified={() => void loadData()}
          />
        )}

        {route.view === 'validators' && (
          <ValidatorsView
            validators={validators}
            rpcUrl={rpcUrl}
            walletAccount={wallet.account}
          />
        )}

        {((route.view === 'block' && !blockDetail) ||
          (route.view === 'tx' && !txDetail) ||
          (route.view === 'address' && !addressDetail)) &&
          !loading &&
          nodeError && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-red-700">
              {nodeError}
            </div>
          )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            {TATA_CHAIN_CONFIG.chainName} · Chain ID {TATA_CHAIN_CONFIG.chainIdDecimal} · Symbol {TATA_CHAIN_CONFIG.nativeCurrency.symbol}
          </div>
          <div className="font-mono">Total Genesis Supply: {TATA_CHAIN_CONFIG.totalSupplyTata} TATA</div>
        </div>
      </footer>
    </div>
  );
}
