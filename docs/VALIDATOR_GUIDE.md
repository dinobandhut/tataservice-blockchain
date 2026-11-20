# Validator, Staking & Delegation Guide — TataService Blockchain

## Consensus & Supply Rules
- **Consensus Protocol:** Ethereum-compatible Proof-of-Stake (Go-Ethereum + Lighthouse Beacon Chain)
- **Slot Time:** `12 seconds` | **Epoch:** `32 slots` (`384 seconds`)
- **Total Supply:** `1,000,000,000 TATA` fixed at genesis (`240,000,000 TATA` allocated to the Staking & Delegator Rewards Reserve)

## Running a Validator Safely
1. **Never run two validator clients with the same EIP-2335 keystore simultaneously.** Double-signing results in immediate Beacon Chain slashing and ejection.
2. **Always preserve `slashing_protection.sqlite`** when migrating servers (`05-backup-and-restore.sh`).
3. **Delegation & 32,000 TATA Operator Bond:**
   - Delegators stake any amount `>= 1 TATA` via `TataStakingPool.delegate()`.
   - Operators post the `32,000 TATA` bond via `depositOperatorBond()` and launch Beacon validators via `launchValidator(...)` bound to `TataWithdrawalVault` (`0x01` withdrawal credentials).
   - Unstaking enters a 7-day unbonding queue (`requestUnstake` -> `claimUnstake`).
