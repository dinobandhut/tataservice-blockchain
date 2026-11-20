import { keccak256 } from 'ethers';
import solc from 'solc';
import { query } from '../db/pool';
import { gethRpcCall } from '../rpc/gethClient';

export interface VerifyContractRequest {
  address: string;
  contractName: string;
  compilerVersion: string;
  evmVersion: string;
  optimizationUsed: boolean;
  runs: number;
  sourceCode: string;
  constructorArgs?: string;
}

export interface VerifiedContractResult {
  address: string;
  name: string;
  compilerVersion: string;
  evmVersion: string;
  optimizationUsed: boolean;
  runs: number;
  abi: unknown[];
  bytecodeHash: string;
}

/**
 * Strips trailing CBOR-encoded Solidity metadata from deployed bytecode so
 * deterministic bytecode comparison succeeds regardless of metadata hash differences.
 */
function stripSolidityCborMetadata(hexBytecode: string): string {
  const clean = hexBytecode.toLowerCase().replace(/^0x/, '');
  if (clean.length < 4) return clean;
  const cborByteLen = parseInt(clean.slice(-4), 16);
  const totalMetaChars = (cborByteLen + 2) * 2;
  if (!Number.isFinite(cborByteLen) || cborByteLen <= 0 || totalMetaChars >= clean.length) {
    return clean;
  }
  // Solidity CBOR metadata typically begins with 0xa2 0x64 ('ipfs') or 0xa2 0x65 ('bzzr1') or 0xa1 0x65 ('solc')
  const metaSlice = clean.slice(clean.length - totalMetaChars);
  if (metaSlice.startsWith('a264') || metaSlice.startsWith('a265') || metaSlice.startsWith('a165')) {
    return clean.slice(0, clean.length - totalMetaChars);
  }
  return clean;
}

export async function verifyAndStoreContract(
  input: VerifyContractRequest
): Promise<VerifiedContractResult> {
  const address = input.address.toLowerCase();
  const onChainCode = await gethRpcCall<string>('eth_getCode', [address, 'latest']);
  if (!onChainCode || onChainCode === '0x') {
    throw new Error(`No contract bytecode deployed at ${address}`);
  }

  const standardInput = {
    language: 'Solidity',
    sources: {
      'Contract.sol': {
        content: input.sourceCode,
      },
    },
    settings: {
      evmVersion: input.evmVersion || 'cancun',
      optimizer: {
        enabled: input.optimizationUsed,
        runs: input.runs,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.deployedBytecode.object'],
        },
      },
    },
  };

  const compiledRaw = solc.compile(JSON.stringify(standardInput));
  const compiled = JSON.parse(compiledRaw) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts?: Record<
      string,
      Record<
        string,
        {
          abi: unknown[];
          evm: { deployedBytecode: { object: string } };
        }
      >
    >;
  };

  const fatalErrors = (compiled.errors ?? []).filter((e) => e.severity === 'error');
  if (fatalErrors.length > 0) {
    throw new Error(`Solidity compilation failed: ${fatalErrors[0].formattedMessage}`);
  }

  const fileContracts = compiled.contracts?.['Contract.sol'];
  const targetArtifact = fileContracts?.[input.contractName];
  if (!targetArtifact) {
    const available = Object.keys(fileContracts ?? {}).join(', ') || 'none';
    throw new Error(`Contract "${input.contractName}" not found in compiled output. Available: ${available}`);
  }

  const compiledBytecode = targetArtifact.evm?.deployedBytecode?.object ?? '';
  if (!compiledBytecode) {
    throw new Error(`Compiled contract "${input.contractName}" produced empty deployedBytecode`);
  }

  const strippedOnChain = stripSolidityCborMetadata(onChainCode);
  const strippedCompiled = stripSolidityCborMetadata(compiledBytecode);

  if (strippedOnChain !== strippedCompiled) {
    throw new Error(
      `Bytecode mismatch against on-chain code at ${address} (check compiler settings, optimizer runs, and EVM version)`
    );
  }

  const bytecodeHash = keccak256(onChainCode);

  await query(
    `INSERT INTO verified_contracts (
      address, name, compiler_version, evm_version, optimization_used, runs,
      source_code, abi, constructor_args, bytecode_hash, verified_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,NOW())
    ON CONFLICT (address) DO UPDATE SET
      name = EXCLUDED.name,
      compiler_version = EXCLUDED.compiler_version,
      evm_version = EXCLUDED.evm_version,
      optimization_used = EXCLUDED.optimization_used,
      runs = EXCLUDED.runs,
      source_code = EXCLUDED.source_code,
      abi = EXCLUDED.abi,
      constructor_args = EXCLUDED.constructor_args,
      bytecode_hash = EXCLUDED.bytecode_hash,
      verified_at = NOW()`,
    [
      address,
      input.contractName,
      input.compilerVersion,
      input.evmVersion,
      input.optimizationUsed,
      input.runs,
      input.sourceCode,
      JSON.stringify(targetArtifact.abi),
      input.constructorArgs ?? '',
      bytecodeHash,
    ]
  );

  return {
    address,
    name: input.contractName,
    compilerVersion: input.compilerVersion,
    evmVersion: input.evmVersion,
    optimizationUsed: input.optimizationUsed,
    runs: input.runs,
    abi: targetArtifact.abi,
    bytecodeHash,
  };
}
