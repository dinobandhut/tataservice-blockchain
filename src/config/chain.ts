export const TATA_CHAIN_CONFIG = {
  chainIdDecimal: 810161,
  chainIdHex: '0xc5c71',
  chainName: 'TataService Blockchain',
  nativeCurrency: {
    name: 'TATA',
    symbol: 'TATA',
    decimals: 18,
  },
  totalSupplyTata: '1,000,000,000',
  defaultRpcPath: '/rpc',
  defaultApiPath: '/api/v1',
};

const STORAGE_RPC_KEY = 'tataservice_rpc_url';
const STORAGE_API_KEY = 'tataservice_api_url';

export function getSavedEndpoints(): { rpcUrl: string; apiUrl: string } {
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const envRpc = (import.meta.env.VITE_TATA_RPC_URL as string | undefined)?.trim();
  const envApi = (import.meta.env.VITE_TATA_API_URL as string | undefined)?.trim();

  if (typeof window === 'undefined') {
    return {
      rpcUrl: envRpc || 'http://127.0.0.1:4000/rpc',
      apiUrl: envApi || 'http://127.0.0.1:4000/api/v1',
    };
  }

  const savedRpc = window.localStorage.getItem(STORAGE_RPC_KEY)?.trim();
  const savedApi = window.localStorage.getItem(STORAGE_API_KEY)?.trim();

  return {
    rpcUrl: savedRpc || envRpc || `${defaultOrigin}${TATA_CHAIN_CONFIG.defaultRpcPath}`,
    apiUrl: savedApi || envApi || `${defaultOrigin}${TATA_CHAIN_CONFIG.defaultApiPath}`,
  };
}

export function saveEndpoints(rpcUrl: string, apiUrl: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_RPC_KEY, rpcUrl.trim());
  window.localStorage.setItem(STORAGE_API_KEY, apiUrl.trim());
}
