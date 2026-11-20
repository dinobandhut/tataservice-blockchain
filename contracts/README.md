# TataService Blockchain — Smart Contracts (Phase 2)

Solidity `0.8.24` (Cancun EVM) contracts for **TataService Blockchain (Chain ID 810161)**.

## Contracts Included
1. **`src/core/DepositContract.sol`**: Canonical Ethereum PoS deposit contract with incremental SHA-256 Merkle root (`get_deposit_root()` / `DepositEvent`) consumed by Lighthouse.
2. **`src/core/TataStakingPool.sol`**: Non-custodial native `TATA` delegated staking pool & `32,000 TATA` validator operator bond manager with virtual-offset share inflation protection, 7-day unbonding queue, reward distribution, and consensus slashing accounting.
3. **`src/core/TataWithdrawalVault.sol`**: Execution-layer `0x01` withdrawal credential target that collects consensus withdrawals & fee tips and sweeps them into `TataStakingPool`.
4. **`src/core/WTATA.sol`**: Canonical WETH9-compatible Wrapped TATA (`deposit()`, `withdraw()`, ERC-20).
5. **`src/tokens/TataERC20.sol`**, **`TataERC721.sol`**, **`TataERC1155.sol`**: OpenZeppelin v5 reference token contracts with role-based access control and supply bounds.

## Run Tests on Your Ubuntu Server
```bash
cd contracts
chmod +x bootstrap.sh
./bootstrap.sh
```

## Deploy Core Contracts to Live TataService RPC
```bash
export ADMIN_ADDRESS="0xYOUR_MULTISIG_OR_ADMIN_ADDRESS"
forge script script/DeployCore.s.sol:DeployCore \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```
