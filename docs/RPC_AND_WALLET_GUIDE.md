# RPC API & MetaMask Wallet Guide — TataService Blockchain

## MetaMask Network Parameters
| Field | Value |
| :--- | :--- |
| **Network Name** | `TataService Blockchain` |
| **New RPC URL** | `https://rpc.yourdomain.com/rpc` *(or `http://YOUR_SERVER_IP/rpc` during local/IP testing)* |
| **Chain ID** | `810161` (`0xc5c71`) |
| **Currency Symbol** | `TATA` |
| **Block Explorer URL** | `https://explorer.yourdomain.com` |

## Supported Public JSON-RPC Methods (`POST /rpc`)
- `eth_chainId` → `"0xc5c71"` (`810161`)
- `net_version` → `"810161"`
- `web3_clientVersion`
- `eth_blockNumber`
- `eth_getBlockByNumber` / `eth_getBlockByHash`
- `eth_getBalance`
- `eth_getTransactionByHash`
- `eth_sendRawTransaction` *(validated for ECDSA signature & Chain ID `810161`)*
- `eth_getTransactionReceipt`
- `eth_call`
- `eth_estimateGas`
- `eth_gasPrice` / `eth_feeHistory` / `eth_maxPriorityFeePerGas`
- `eth_getLogs` *(capped to 2,000 blocks per query)*
- `eth_getCode` / `eth_getTransactionCount` / `eth_getStorageAt`

## Verify Live RPC via `curl`
```bash
curl -s -X POST http://127.0.0.1:4000/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```
