// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ITataStakingPoolVaultReceiver {
    function receiveVaultProceeds(uint256 principalReturned, uint256 rewardsEarned) external payable;
}

/// @title TataWithdrawalVault
/// @notice Execution-layer vault configured as the `0x01` withdrawal credential and fee-recipient
///         target for delegated validators managed by TataStakingPool.
contract TataWithdrawalVault is AccessControl, ReentrancyGuard {
    bytes32 public constant SWEEPER_ROLE = keccak256("SWEEPER_ROLE");

    address public immutable stakingPool;
    uint256 public totalPrincipalSwept;
    uint256 public totalRewardsSwept;

    event ProceedsReceived(address indexed sender, uint256 amount);
    event ProceedsSwept(uint256 principalReturned, uint256 rewardsEarned);

    constructor(address admin, address _stakingPool) {
        require(admin != address(0), "TataWithdrawalVault: zero admin");
        require(_stakingPool != address(0), "TataWithdrawalVault: zero pool");
        stakingPool = _stakingPool;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SWEEPER_ROLE, admin);
    }

    receive() external payable {
        emit ProceedsReceived(msg.sender, msg.value);
    }

    /// @notice Sweeps accumulated consensus withdrawals and execution fee tips into TataStakingPool.
    /// @param principalReturned Validator principal portion returned upon validator exit.
    /// @param rewardsEarned Consensus & execution reward portion distributed to delegators.
    function sweepToPool(uint256 principalReturned, uint256 rewardsEarned)
        external
        onlyRole(SWEEPER_ROLE)
        nonReentrant
    {
        uint256 total = principalReturned + rewardsEarned;
        require(total > 0, "TataWithdrawalVault: zero sweep");
        require(address(this).balance >= total, "TataWithdrawalVault: insufficient vault balance");

        totalPrincipalSwept += principalReturned;
        totalRewardsSwept += rewardsEarned;

        ITataStakingPoolVaultReceiver(stakingPool).receiveVaultProceeds{value: total}(
            principalReturned,
            rewardsEarned
        );
        emit ProceedsSwept(principalReturned, rewardsEarned);
    }
}
