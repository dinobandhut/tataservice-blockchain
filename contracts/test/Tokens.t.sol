// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {WTATA} from "../src/core/WTATA.sol";
import {TataERC20} from "../src/tokens/TataERC20.sol";
import {TataERC721} from "../src/tokens/TataERC721.sol";
import {TataERC1155} from "../src/tokens/TataERC1155.sol";

contract TokensTest is Test {
    WTATA internal wtata;
    TataERC20 internal erc20;
    TataERC721 internal erc721;
    TataERC1155 internal erc1155;

    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);

    function setUp() public {
        wtata = new WTATA();
        erc20 = new TataERC20("Tata USD", "TUSD", 1_000_000 ether, 100_000 ether, admin);
        erc721 = new TataERC721("Tata Pass", "TPASS", admin);
        erc1155 = new TataERC1155("https://meta.tataservice.network/{id}.json", admin);
    }

    function test_WTATAWrapAndUnwrap() public {
        vm.deal(user, 10 ether);
        vm.startPrank(user);
        wtata.deposit{value: 4 ether}();
        assertEq(wtata.balanceOf(user), 4 ether);
        assertEq(wtata.totalSupply(), 4 ether);

        wtata.withdraw(1.5 ether);
        assertEq(wtata.balanceOf(user), 2.5 ether);
        assertEq(user.balance, 7.5 ether);
        vm.stopPrank();
    }

    function test_TataERC20CapAndMint() public {
        vm.prank(admin);
        erc20.mint(user, 50_000 ether);
        assertEq(erc20.balanceOf(user), 50_000 ether);

        vm.prank(admin);
        vm.expectRevert();
        erc20.mint(user, 900_000 ether); // Exceeds 1,000,000 cap
    }

    function test_TataERC721MintAndURI() public {
        vm.prank(admin);
        uint256 id = erc721.safeMint(user, "ipfs://tata-nft-0");
        assertEq(erc721.ownerOf(id), user);
        assertEq(erc721.tokenURI(id), "ipfs://tata-nft-0");
    }

    function test_TataERC1155MintBatchAndSupply() public {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        amounts[0] = 100;
        amounts[1] = 250;

        vm.prank(admin);
        erc1155.mintBatch(user, ids, amounts, "");
        assertEq(erc1155.totalSupply(1), 100);
        assertEq(erc1155.balanceOf(user, 2), 250);
    }
}
