import { useCallback, useEffect, useState } from 'react';
import { BrowserProvider, formatEther } from 'ethers';
import { TATA_CHAIN_CONFIG } from '../config/chain';

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export interface WalletState {
  hasProvider: boolean;
  account: string | null;
  chainId: number | null;
  balanceTata: string | null;
  connecting: boolean;
  error: string | null;
}

export function useMetaMask(rpcUrl: string) {
  const [state, setState] = useState<WalletState>({
    hasProvider: typeof window !== 'undefined' && Boolean(window.ethereum),
    account: null,
    chainId: null,
    balanceTata: null,
    connecting: false,
    error: null,
  });

  const refreshWalletInfo = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
      const chainHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      const chainId = parseInt(chainHex, 16);

      if (accounts.length > 0) {
        const bal = await provider.getBalance(accounts[0]);
        setState({
          hasProvider: true,
          account: accounts[0],
          chainId,
          balanceTata: formatEther(bal),
          connecting: false,
          error: null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          hasProvider: true,
          account: null,
          chainId,
          balanceTata: null,
          connecting: false,
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connecting: false,
        error: err instanceof Error ? err.message : 'Unable to read wallet state',
      }));
    }
  }, []);

  useEffect(() => {
    void refreshWalletInfo();
    const eth = window.ethereum;
    if (!eth?.on) return;

    const handleAccountsChanged = () => void refreshWalletInfo();
    const handleChainChanged = () => void refreshWalletInfo();

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);
    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
      eth.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [refreshWalletInfo]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState((prev) => ({
        ...prev,
        error: 'MetaMask or an EIP-1193 wallet extension was not detected in this browser.',
      }));
      return;
    }
    setState((prev) => ({ ...prev, connecting: true, error: null }));
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      await refreshWalletInfo();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connecting: false,
        error: err instanceof Error ? err.message : 'Wallet connection rejected',
      }));
    }
  }, [refreshWalletInfo]);

  const addOrSwitchTataChain = useCallback(async () => {
    if (!window.ethereum) {
      setState((prev) => ({
        ...prev,
        error: 'Install MetaMask to add TataService Blockchain (Chain ID 810161).',
      }));
      return;
    }
    setState((prev) => ({ ...prev, error: null }));
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TATA_CHAIN_CONFIG.chainIdHex }],
      });
      await refreshWalletInfo();
    } catch (switchErr: unknown) {
      const code =
        typeof switchErr === 'object' && switchErr !== null && 'code' in switchErr
          ? (switchErr as { code: number }).code
          : 0;
      if (code === 4902 || code === -32603) {
        try {
          const explorerUrl = typeof window !== 'undefined' ? window.location.origin : 'https://explorer.tataservice.network';
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: TATA_CHAIN_CONFIG.chainIdHex,
                chainName: TATA_CHAIN_CONFIG.chainName,
                nativeCurrency: TATA_CHAIN_CONFIG.nativeCurrency,
                rpcUrls: [rpcUrl],
                blockExplorerUrls: [explorerUrl],
              },
            ],
          });
          await refreshWalletInfo();
        } catch (addErr) {
          setState((prev) => ({
            ...prev,
            error: addErr instanceof Error ? addErr.message : 'Failed to add TataService network',
          }));
        }
      } else {
        setState((prev) => ({
          ...prev,
          error: switchErr instanceof Error ? switchErr.message : 'Failed to switch network',
        }));
      }
    }
  }, [rpcUrl, refreshWalletInfo]);

  return {
    ...state,
    isTataNetwork: state.chainId === TATA_CHAIN_CONFIG.chainIdDecimal,
    connect,
    addOrSwitchTataChain,
    refreshWalletInfo,
  };
}
