// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DepositContract} from "../src/core/DepositContract.sol";
import {TataStakingPool} from "../src/core/TataStakingPool.sol";
import {TataWithdrawalVault} from "../src/core/TataWithdrawalVault.sol";

contract TataStakingPoolTest is Test {
    DepositContract internal depositContract;
    TataStakingPool internal pool;
    TataWithdrawalVault internal vault;

    address internal admin = address(0xA11CE);
    address internal operator = address(0x09E2);
    address internal alice = address(0x1111);
    address internal bob = address(0x2222);

    function setUp() public {
        vm.startPrank(admin);
        depositContract = new DepositContract();
        pool = new TataStakingPool(admin, address(depositContract));
        vault = new TataWithdrawalVault(admin, address(pool));
        pool.setWithdrawalVault(address(vault));
        pool.grantRole(pool.OPERATOR_ROLE(), operator);
        vm.stopPrank();
    }

    function _toLittleEndian64(uint64 value) internal pure returns (bytes memory ret) {
        ret = new bytes(8);
        bytes8 b = bytes8(value);
        for (uint256 i = 0; i < 8; i++) {
            ret[i] = b[7 - i];
        }
    }

    function _computeDepositDataRoot(
        bytes memory pubkey,
        bytes memory withdrawalCredentials,
        uint256 valueWei,
        bytes memory signature
    ) internal pure returns (bytes32) {
        bytes memory amount = _toLittleEndian64(uint64(valueWei / 1 gwei));
        bytes32 pubkeyRoot = sha256(abi.encodePacked(pubkey, bytes16(0)));
        bytes memory s0 = new bytes(64);
        bytes memory s1 = new bytes(32);
        for (uint256 i = 0; i < 64; i++) s0[i] = signature[i];
        for (uint256 i = 0; i < 32; i++) s1[i] = signature[64 + i];
        bytes32 sigRoot = sha256(abi.encodePacked(sha256(s0), sha256(abi.encodePacked(s1, bytes32(0)))));
        return sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(pubkeyRoot, withdrawalCredentials)),
                sha256(abi.encodePacked(amount, bytes24(0), sigRoot))
            )
        );
    }

    function test_DelegationRewardsAndUnbondingLifecycle() public {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(admin, 20 ether);

        vm.prank(alice);
        uint256 aliceShares = pool.delegate{value: 100 ether}();
        assertEq(aliceShares, 100 ether);

        // Distribute 20 TATA in rewards (5% protocol fee = 1 TATA, 19 TATA net to pool)
        vm.prank(admin);
        pool.distributeRewards{value: 20 ether}();

        assertApproxEqAbs(pool.previewRedeem(aliceShares), 119 ether, 1e12);

        // Bob delegates 119 TATA later and receives ~100 shares (fair proportional pricing)
        vm.prank(bob);
        uint256 bobShares = pool.delegate{value: 119 ether}();
        assertApproxEqAbs(bobShares, 100 ether, 1e12);

        // Alice requests unstake and cannot claim before unbondingPeriod
        vm.prank(alice);
        uint256 reqId = pool.requestUnstake(aliceShares);

        vm.prank(alice);
        vm.expectRevert("TataStakingPool: unbonding period active");
        pool.claimUnstake(reqId);

        vm.warp(block.timestamp + 7 days);
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        pool.claimUnstake(reqId);
        assertApproxEqAbs(alice.balance - balBefore, 119 ether, 1e12);
    }

    function test_OperatorBondAndLaunchValidatorWithVaultCredentials() public {
        vm.deal(alice, 64 ether);
        vm.prank(alice);
        pool.delegate{value: 64 ether}();

        // Operator cannot launch validator without 32,000 TATA bond
        bytes memory pubkey = new bytes(48);
        pubkey[0] = 0x11;
        bytes memory creds = abi.encodePacked(bytes32(uint256(0x01) << 248 | uint256(uint160(address(vault)))));
        bytes memory sig = new bytes(96);
        bytes32 root = _computeDepositDataRoot(pubkey, creds, 32 ether, sig);

        vm.prank(operator);
        vm.expectRevert("TataStakingPool: insufficient 32,000 TATA operator bond");
        pool.launchValidator(pubkey, creds, sig, root);

        // Post 32,000 TATA bond and launch validator cleanly
        vm.deal(operator, 32_000 ether);
        vm.startPrank(operator);
        pool.depositOperatorBond{value: 32_000 ether}();
        pool.launchValidator(pubkey, creds, sig, root);
        vm.stopPrank();

        assertEq(pool.activeValidatorPrincipal(), 32 ether);
        assertEq(pool.liquidReserve(), 32 ether);
    }

    function test_SlashingAbsorbedByOperatorBondFirst() public {
        vm.deal(alice, 50 ether);
        vm.prank(alice);
        pool.delegate{value: 50 ether}();

        vm.deal(operator, 32_000 ether);
        vm.prank(operator);
        pool.depositOperatorBond{value: 32_000 ether}();

        // Simulate 10 TATA slashing loss: covered 100% by operator bond
        vm.prank(admin);
        pool.recordSlashing(operator, 10 ether);

        (, uint256 bondAfter, , ) = pool.operators(operator);
        assertEq(bondAfter, 31_990 ether);
        assertEq(pool.totalManagedAssets(), 60 ether); // Delegators compensated from slashed bond
    }

    function test_RevertUnauthorizedAdminActions() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert();
        pool.distributeRewards{value: 10 ether}();

        vm.prank(alice);
        vm.expectRevert();
        pool.recordSlashing(operator, 1 ether);
    }
}
