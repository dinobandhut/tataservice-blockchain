// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DepositContract, IDepositContract} from "../src/core/DepositContract.sol";

contract DepositContractTest is Test {
    DepositContract internal depositContract;

    function setUp() public {
        depositContract = new DepositContract();
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
        bytes32 sigRoot = sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(_slice(signature, 0, 64))),
                sha256(abi.encodePacked(_slice(signature, 64, 32), bytes32(0)))
            )
        );
        return sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(pubkeyRoot, withdrawalCredentials)),
                sha256(abi.encodePacked(amount, bytes24(0), sigRoot))
            )
        );
    }

    function _slice(bytes memory data, uint256 start, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = data[start + i];
        }
    }

    function test_ValidDepositUpdatesRootAndCount() public {
        bytes memory pubkey = new bytes(48);
        pubkey[0] = 0xaa;
        bytes memory creds = abi.encodePacked(bytes1(0x01), bytes11(0), address(0x1234));
        bytes memory sig = new bytes(96);
        sig[0] = 0xbb;

        uint256 stake = 32 ether;
        bytes32 root = _computeDepositDataRoot(pubkey, creds, stake, sig);
        bytes32 initialRoot = depositContract.get_deposit_root();

        vm.deal(address(this), stake);
        depositContract.deposit{value: stake}(pubkey, creds, sig, root);

        assertEq(depositContract.get_deposit_count(), _toLittleEndian64(1));
        assertTrue(depositContract.get_deposit_root() != initialRoot);
    }

    function test_RevertOnCorruptedDepositRoot() public {
        bytes memory pubkey = new bytes(48);
        bytes memory creds = new bytes(32);
        bytes memory sig = new bytes(96);
        vm.deal(address(this), 32 ether);

        vm.expectRevert("DepositContract: reconstructed DepositData does not match supplied value");
        depositContract.deposit{value: 32 ether}(pubkey, creds, sig, bytes32(uint256(1)));
    }

    function test_RevertBelowMinimumDeposit() public {
        bytes memory pubkey = new bytes(48);
        bytes memory creds = new bytes(32);
        bytes memory sig = new bytes(96);
        vm.deal(address(this), 0.5 ether);

        vm.expectRevert("DepositContract: deposit value too low");
        depositContract.deposit{value: 0.5 ether}(pubkey, creds, sig, bytes32(0));
    }

    function test_SupportsERC165() public view {
        assertTrue(depositContract.supportsInterface(type(IDepositContract).interfaceId));
    }
}
