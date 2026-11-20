import React, { useState } from 'react';
import { BrowserProvider, Contract, InterfaceAbi, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import {
  TataExplorerClient,
  ValidatorRecord,
  VerifiedContractSummary,
} from '../services/explorerClient';
import { formatGweiBalanceAsTata, shortHash } from './Formatters';

const STAKING_POOL_ABI = [
  'function totalManagedAssets() view returns (uint256)',
  'function liquidReserve() view returns (uint256)',
  'function activeValidatorPrincipal() view returns (uint256)',
  'function totalShares() view returns (uint256)',
  'function sharesOf(address) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function delegate() payable returns (uint256)',
  'function requestUnstake(uint256 shares) returns (uint256)',
];

export function ContractsView({
  client,
  contracts,
  rpcUrl,
  walletAccount,
  onSelectAddress,
  onVerified,
}: {
  client: TataExplorerClient;
  contracts: VerifiedContractSummary[];
  rpcUrl: string;
  walletAccount: string | null;
  onSelectAddress: (addr: string) => void;
  onVerified: () => void;
}) {
  const [address, setAddress] = useState('');
  const [contractName, setContractName] = useState('');
  const [evmVersion, setEvmVersion] = useState('cancun');
  const [optimizationUsed, setOptimizationUsed] = useState(true);
  const [runs, setRuns] = useState(200);
  const [sourceCode, setSourceCode] = useState('');
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ABI Interaction state
  const [interactAddr, setInteractAddr] = useState('');
  const [abiJson, setAbiJson] = useState('');
  const [fnName, setFnName] = useState('');
  const [fnArgs, setFnArgs] = useState('');
  const [txValueTata, setTxValueTata] = useState('0');
  const [callOutput, setCallOutput] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setVerifyMsg(null);
    try {
      const res = await client.verifyContract({
        address: address.trim(),
        contractName: contractName.trim(),
        compilerVersion: '0.8.24',
        evmVersion,
        optimizationUsed,
        runs: Number(runs),
        sourceCode,
      });
      setVerifyMsg(`Verified ${res.contract.name} at ${res.contract.address}`);
      setAbiJson(JSON.stringify(res.contract.abi ?? [], null, 2));
      setInteractAddr(res.contract.address);
      onVerified();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const loadContractAbi = async (addr: string) => {
    try {
      const c = await client.getContractByAddress(addr);
      setInteractAddr(c.address);
      setAbiJson(JSON.stringify(c.abi ?? [], null, 2));
      setCallOutput(`Loaded ABI for ${c.name}`);
    } catch (err) {
      setCallOutput(err instanceof Error ? err.message : 'Unable to load contract ABI');
    }
  };

  const handleExecuteAbi = async (mode: 'read' | 'write') => {
    setCallOutput(null);
    try {
      const parsedAbi = JSON.parse(abiJson) as InterfaceAbi;
      const args = fnArgs.trim() ? (JSON.parse(`[${fnArgs}]`) as unknown[]) : [];
      if (mode === 'read') {
        const provider = new JsonRpcProvider(rpcUrl, 810161, { staticNetwork: true });
        const contract = new Contract(interactAddr.trim(), parsedAbi, provider);
        const result = await contract[fnName.trim()](...args);
        setCallOutput(typeof result === 'bigint' ? result.toString() : JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
      } else {
        if (!window.ethereum || !walletAccount) {
          setCallOutput('Connect MetaMask first to submit write transactions.');
          return;
        }
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new Contract(interactAddr.trim(), parsedAbi, signer);
        const tx = await contract[fnName.trim()](...args, {
          value: parseEther(txValueTata || '0'),
        });
        setCallOutput(`Submitted tx: ${tx.hash}`);
        await tx.wait(1);
        setCallOutput(`Confirmed tx: ${tx.hash}`);
      }
    } catch (err) {
      setCallOutput(err instanceof Error ? err.message : 'Contract call failed');
    }
  };

  return (
    <div className="space-y-8">
      {/* Verified Contracts Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Verified Smart Contracts</h1>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{contracts.length} verified</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-medium">Contract Name</th>
                <th className="py-3 px-4 font-medium">Address</th>
                <th className="py-3 px-4 font-medium">Compiler</th>
                <th className="py-3 px-4 font-medium">EVM</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No contracts verified yet. Deploy a Solidity contract and verify its source below.
                  </td>
                </tr>
              )}
              {contracts.map((c) => (
                <tr key={c.address} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                  <td className="py-3 px-4 font-mono text-xs">
                    <button type="button" onClick={() => onSelectAddress(c.address)} className="text-teal-700 hover:underline">
                      {shortHash(c.address, 10, 8)}
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{c.compiler_version}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{c.evm_version}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => void loadContractAbi(c.address)}
                      className="text-xs font-medium text-teal-700 hover:underline"
                    >
                      Load ABI
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verify + ABI Interaction Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Verify Solidity Contract</h2>
          <p className="text-xs text-slate-500 mb-4">
            Compiles Solidity 0.8.24 source against deployed bytecode on TataService Blockchain.
          </p>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contract Address</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  placeholder="0x..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contract Name</label>
                <input
                  type="text"
                  required
                  value={contractName}
                  onChange={(e) => setContractName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  placeholder="WTATA"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">EVM Target</label>
                <select
                  value={evmVersion}
                  onChange={(e) => setEvmVersion(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="cancun">cancun</option>
                  <option value="shanghai">shanghai</option>
                  <option value="paris">paris</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Optimizer</label>
                <select
                  value={optimizationUsed ? 'yes' : 'no'}
                  onChange={(e) => setOptimizationUsed(e.target.value === 'yes')}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="yes">Enabled</option>
                  <option value="no">Disabled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Runs</label>
                <input
                  type="number"
                  value={runs}
                  onChange={(e) => setRuns(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Solidity Source Code</label>
              <textarea
                rows={7}
                required
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                placeholder="// SPDX-License-Identifier: Apache-2.0&#10;pragma solidity 0.8.24;..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-md transition-colors"
            >
              {submitting ? 'Compiling & Matching...' : 'Verify and Publish'}
            </button>
            {verifyMsg && <p className="text-xs font-mono text-slate-700 break-all">{verifyMsg}</p>}
          </form>
        </div>

        {/* Read / Write ABI Panel */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">Contract ABI Interaction</h2>
            <p className="text-xs text-slate-500">
              Query read-only methods via JSON-RPC or execute state writes via MetaMask.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Contract Address</label>
            <input
              type="text"
              value={interactAddr}
              onChange={(e) => setInteractAddr(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              placeholder="0x..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Contract ABI (JSON)</label>
            <textarea
              rows={4}
              value={abiJson}
              onChange={(e) => setAbiJson(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              placeholder='[{"type":"function","name":"totalSupply","inputs":[],"outputs":[{"type":"uint256"}],"stateMutability":"view"}]'
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Function Name</label>
              <input
                type="text"
                value={fnName}
                onChange={(e) => setFnName(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                placeholder="balanceOf"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Arguments (CSV JSON)</label>
              <input
                type="text"
                value={fnArgs}
                onChange={(e) => setFnArgs(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                placeholder='"0x..."'
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Value (TATA)</label>
              <input
                type="text"
                value={txValueTata}
                onChange={(e) => setTxValueTata(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleExecuteAbi('read')}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md"
            >
              Read (eth_call)
            </button>
            <button
              type="button"
              onClick={() => void handleExecuteAbi('write')}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
            >
              Write via MetaMask
            </button>
          </div>
          {callOutput && (
            <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">
              {callOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function ValidatorsView({
  validators,
  rpcUrl,
  walletAccount,
}: {
  validators: ValidatorRecord[];
  rpcUrl: string;
  walletAccount: string | null;
}) {
  const [poolAddr, setPoolAddr] = useState('');
  const [poolStats, setPoolStats] = useState<{
    managedTata: string;
    liquidTata: string;
    activeTata: string;
    userShares: string;
  } | null>(null);
  const [delegateTata, setDelegateTata] = useState('10');
  const [poolMsg, setPoolMsg] = useState<string | null>(null);

  const loadPoolStats = async () => {
    setPoolMsg(null);
    try {
      const provider = new JsonRpcProvider(rpcUrl, 810161, { staticNetwork: true });
      const pool = new Contract(poolAddr.trim(), STAKING_POOL_ABI, provider);
      const [managed, liquid, active, userShares] = await Promise.all([
        pool.totalManagedAssets() as Promise<bigint>,
        pool.liquidReserve() as Promise<bigint>,
        pool.activeValidatorPrincipal() as Promise<bigint>,
        walletAccount ? (pool.sharesOf(walletAccount) as Promise<bigint>) : Promise.resolve(0n),
      ]);
      setPoolStats({
        managedTata: formatEther(managed),
        liquidTata: formatEther(liquid),
        activeTata: formatEther(active),
        userShares: formatEther(userShares),
      });
    } catch (err) {
      setPoolMsg(err instanceof Error ? err.message : 'Unable to query TataStakingPool');
    }
  };

  const handleDelegate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.ethereum || !walletAccount) {
      setPoolMsg('Connect MetaMask first to delegate TATA.');
      return;
    }
    setPoolMsg(null);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const pool = new Contract(poolAddr.trim(), STAKING_POOL_ABI, signer);
      const tx = await pool.delegate({ value: parseEther(delegateTata) });
      setPoolMsg(`Delegation tx submitted: ${tx.hash}`);
      await tx.wait(1);
      setPoolMsg(`Delegation confirmed: ${tx.hash}`);
      void loadPoolStats();
    } catch (err) {
      setPoolMsg(err instanceof Error ? err.message : 'Delegation failed');
    }
  };

  return (
    <div className="space-y-8">
      {/* Beacon Validators Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Proof-of-Stake Validators</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Synced directly from Lighthouse Consensus Beacon API
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{validators.length} validators</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-medium">Index</th>
                <th className="py-3 px-4 font-medium">BLS Pubkey</th>
                <th className="py-3 px-4 font-medium text-right">Effective Balance</th>
                <th className="py-3 px-4 font-medium text-right">Actual Balance</th>
                <th className="py-3 px-4 font-medium text-right">Slashed</th>
                <th className="py-3 px-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {validators.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No Beacon Chain validators indexed yet. Connect Lighthouse Beacon API on your node.
                  </td>
                </tr>
              )}
              {validators.map((v) => (
                <tr key={v.validator_index} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono tabular-nums font-medium">#{v.validator_index}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{shortHash(v.pubkey, 12, 8)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                    {formatGweiBalanceAsTata(v.effective_balance_gwei)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                    {formatGweiBalanceAsTata(v.balance_gwei)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium">
                    {v.slashed ? <span className="text-red-700">Yes</span> : <span className="text-slate-600">No</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium">
                    <span className={v.status.startsWith('active') ? 'text-emerald-700' : 'text-amber-700'}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* On-Chain TataStakingPool Delegation Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">TataStakingPool Delegation Portal</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your deployed TataStakingPool contract address to inspect real pool reserves and delegate native TATA via MetaMask.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">TataStakingPool Contract Address</label>
            <input
              type="text"
              value={poolAddr}
              onChange={(e) => setPoolAddr(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              placeholder="0x..."
            />
          </div>
          <button
            type="button"
            onClick={() => void loadPoolStats()}
            className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md"
          >
            Load Pool State
          </button>
        </div>

        {poolStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100 text-xs">
            <div>
              <div className="text-slate-500">Total Managed Assets</div>
              <div className="mt-1 font-mono font-semibold text-sm">{poolStats.managedTata} TATA</div>
            </div>
            <div>
              <div className="text-slate-500">Liquid Reserve</div>
              <div className="mt-1 font-mono font-semibold text-sm">{poolStats.liquidTata} TATA</div>
            </div>
            <div>
              <div className="text-slate-500">Active Validator Stake</div>
              <div className="mt-1 font-mono font-semibold text-sm">{poolStats.activeTata} TATA</div>
            </div>
            <div>
              <div className="text-slate-500">Your Pool Shares</div>
              <div className="mt-1 font-mono font-semibold text-sm">{poolStats.userShares}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleDelegate} className="flex flex-wrap gap-3 items-end pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Delegate Amount (TATA, min 1)</label>
            <input
              type="number"
              min="1"
              step="any"
              required
              value={delegateTata}
              onChange={(e) => setDelegateTata(e.target.value)}
              className="w-48 px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
          >
            Delegate TATA
          </button>
        </form>
        {poolMsg && <p className="text-xs font-mono text-slate-700 break-all">{poolMsg}</p>}
      </div>
    </div>
  );
}
