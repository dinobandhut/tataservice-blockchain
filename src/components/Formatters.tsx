import { formatEther, formatUnits } from 'ethers';

export function formatTata(wei: string | bigint | number, decimals = 4): string {
  try {
    const raw = typeof wei === 'bigint' ? wei : BigInt(wei || '0');
    const full = formatEther(raw);
    const [whole, frac = ''] = full.split('.');
    const formattedWhole = Number(whole).toLocaleString('en-US');
    if (!frac || decimals === 0) return `${formattedWhole} TATA`;
    const trimmed = frac.slice(0, decimals).replace(/0+$/, '');
    return trimmed ? `${formattedWhole}.${trimmed} TATA` : `${formattedWhole} TATA`;
  } catch {
    return '0 TATA';
  }
}

export function formatGwei(wei: string | bigint | number): string {
  try {
    const raw = typeof wei === 'bigint' ? wei : BigInt(wei || '0');
    const val = Number(formatUnits(raw, 'gwei'));
    return `${val.toFixed(val < 1 ? 4 : 2)} Gwei`;
  } catch {
    return '0 Gwei';
  }
}

export function formatGweiBalanceAsTata(gwei: string | number): string {
  try {
    const val = BigInt(gwei || 0);
    const whole = val / 1_000_000_000n;
    const rem = val % 1_000_000_000n;
    const frac = rem.toString().padStart(9, '0').slice(0, 2);
    return `${whole.toLocaleString('en-US')}.${frac} TATA`;
  } catch {
    return '0 TATA';
  }
}

export function shortHash(hash: string | null | undefined, head = 8, tail = 6): string {
  if (!hash) return '—';
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
}

export function formatUnixTimestamp(ts: string | number | undefined): string {
  const num = Number(ts ?? 0);
  if (!num) return '—';
  return new Date(num * 1000).toLocaleString();
}
