// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DepositContract} from "../src/core/DepositContract.sol";
import {TataStakingPool} from "../src/core/TataStakingPool.sol";
import {TataWithdrawalVault} from "../src/core/TataWithdrawalVault.sol";
import {WTATA} from "../src/core/WTATA.sol";

/// @title DeployCore
/// @notice Deploys canonical core protocol contracts onto TataService Blockchain (Chain ID 810161).
///         Requires DEPLOYER_PRIVATE_KEY (via --private-key or keystore) and ADMIN_ADDRESS env var.
contract DeployCore is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        require(admin != address(0), "ADMIN_ADDRESS env var required");

        vm.startBroadcast();

        DepositContract depositContract = new DepositContract();
        TataStakingPool stakingPool = new TataStakingPool(admin, address(depositContract));
        TataWithdrawalVault withdrawalVault = new TataWithdrawalVault(admin, address(stakingPool));
        WTATA wtata = new WTATA();

        if (msg.sender == admin) {
            stakingPool.setWithdrawalVault(address(withdrawalVault));
        }

        vm.stopBroadcast();

        console2.log("TataService Core Contracts Deployed (Chain ID:", block.chainid, ")");
        console2.log("DepositContract:     ", address(depositContract));
        console2.log("TataStakingPool:     ", address(stakingPool));
        console2.log("TataWithdrawalVault: ", address(withdrawalVault));
        console2.log("WTATA:               ", address(wtata));
    }
}
