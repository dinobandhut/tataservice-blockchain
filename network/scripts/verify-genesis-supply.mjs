#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const genesisPath = path.join(rootDir, 'network/execution/genesis.json');
const configPath = path.join(rootDir, 'network/consensus/config.yaml');

const WEI_PER_TATA = 10n ** 18n;
const EXPECTED_TOTAL_TATA = 1_000_000_000n;
const EXPECTED_TOTAL_WEI = EXPECTED_TOTAL_TATA * WEI_PER_TATA;
const EXPECTED_CHAIN_ID = 810161;

const genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf8'));
const configYaml = fs.readFileSync(configPath, 'utf8');

// 1. Verify Chain ID & Cancun Post-Merge Config
if (genesis.config?.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Invalid chainId in genesis.json: expected ${EXPECTED_CHAIN_ID}, got ${genesis.config?.chainId}`);
}
if (genesis.config?.terminalTotalDifficulty !== 0 || genesis.config?.terminalTotalDifficultyPassed !== true) {
  throw new Error('genesis.json must enable terminalTotalDifficulty=0 and terminalTotalDifficultyPassed=true');
}
if (genesis.config?.shanghaiTime !== 0 || genesis.config?.cancunTime !== 0) {
  throw new Error('genesis.json must enable shanghaiTime=0 and cancunTime=0 at genesis');
}

// 2. Verify EIP-4788 Beacon Roots Contract
const eip4788 = genesis.alloc?.['0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02'];
if (!eip4788?.code || !eip4788.code.startsWith('0x3373')) {
  throw new Error('Missing EIP-4788 beacon roots system contract bytecode in genesis.json');
}

// 3. Verify Consensus Config Alignment
if (!configYaml.includes(`DEPOSIT_CHAIN_ID: ${EXPECTED_CHAIN_ID}`)) {
  throw new Error(`config.yaml missing DEPOSIT_CHAIN_ID: ${EXPECTED_CHAIN_ID}`);
}
if (!configYaml.includes(`DEPOSIT_NETWORK_ID: ${EXPECTED_CHAIN_ID}`)) {
  throw new Error(`config.yaml missing DEPOSIT_NETWORK_ID: ${EXPECTED_CHAIN_ID}`);
}

// 4. Verify Exact 1,000,000,000 TATA Total Supply
let executionAllocWei = 0n;
for (const [address, entry] of Object.entries(genesis.alloc || {})) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address in genesis alloc: ${address}`);
  }
  const bal = BigInt(entry.balance || '0x0');
  executionAllocWei += bal;
}

const valCount = BigInt(process.env.GENESIS_VALIDATOR_COUNT || '4');
const valStakeTata = BigInt(process.env.VALIDATOR_STAKE_TATA || '32');
const beaconStakeWei = valCount * valStakeTata * WEI_PER_TATA;
const combinedSupplyWei = executionAllocWei + beaconStakeWei;

if (combinedSupplyWei !== EXPECTED_TOTAL_WEI) {
  throw new Error(
    `Total supply mismatch! Execution (${executionAllocWei}) + Beacon (${beaconStakeWei}) = ${combinedSupplyWei}, expected ${EXPECTED_TOTAL_WEI}`
  );
}

console.log(
  JSON.stringify(
    {
      status: 'OK',
      blockchain: 'TataService Blockchain (Tata Chain)',
      symbol: 'TATA',
      chainId: EXPECTED_CHAIN_ID,
      executionAllocTATA: (executionAllocWei / WEI_PER_TATA).toString(),
      beaconGenesisValidators: valCount.toString(),
      beaconStakeTATA: (beaconStakeWei / WEI_PER_TATA).toString(),
      totalSupplyTATA: (combinedSupplyWei / WEI_PER_TATA).toString(),
      totalSupplyWei: combinedSupplyWei.toString(),
    },
    null,
    2
  )
);
