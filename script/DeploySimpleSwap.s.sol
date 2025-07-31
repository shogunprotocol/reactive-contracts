// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {SimpleSwap} from "../src/strategies/SimpleSwap.sol";

contract DeploySimpleSwap is Script {
    function run() external returns (SimpleSwap) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Sepolia addresses
        SimpleSwap simpleSwap = new SimpleSwap(
            0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b, // universalRouter Sepolia
            0xE03A1074c86CFeDd5C142C4F04F1a1536e203543, // poolManager Sepolia
            0x000000000022D473030F116dDEE9F6B43aC78BA3, // permit2 Sepolia
            0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA, // callbackManager Sepolia
            0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238, // token0 (USDC) Sepolia
            0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14 // token1 (WETH) Sepolia
        );

        vm.stopBroadcast();

        return simpleSwap;
    }
}
