import { env } from '../config/env';

interface JsonRpcResponse<T = unknown> {
  jsonrpc: string;
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export async function gethRpcCall<T = unknown>(
  method: string,
  params: unknown[] = [],
  id: number | string | null = 1
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(env.GETH_HTTP_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Geth HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = (await res.json()) as JsonRpcResponse<T>;
    if (payload.error) {
      throw new Error(`Geth RPC error (${payload.error.code}): ${payload.error.message}`);
    }
    return payload.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function gethRawForward(body: unknown): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(env.GETH_HTTP_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();
    return { status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

export interface BeaconFinalityCheckpoints {
  data: {
    previous_justified: { epoch: string; root: string };
    current_justified: { epoch: string; root: string };
    finalized: { epoch: string; root: string };
  };
}

export interface BeaconValidatorEntry {
  index: string;
  balance: string;
  status: string;
  validator: {
    pubkey: string;
    withdrawal_credentials: string;
    effective_balance: string;
    slashed: boolean;
    activation_epoch: string;
    exit_epoch: string;
  };
}

export async function lighthouseGet<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const baseUrl = env.LIGHTHOUSE_BEACON_API_URL.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
