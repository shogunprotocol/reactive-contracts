// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/strategies/Strategies.sol";

contract DeployStrategy is Script {
    // Sepolia addresses - same as SimpleSwap
    address constant UNIVERSAL_ROUTER =
        0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b;
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant CALLBACK_MANAGER =
        0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    function run() external returns (Strategies) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== DEPLOY STRATEGY ===");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Strategy with USDC as main token
        console.log("Deploying Strategy contract...");
        Strategies strategy = new Strategies(
            USDC, // underlyingToken - using USDC as main token
            UNIVERSAL_ROUTER, // protocol address
            bytes4(0x12345678), // depositSelector - dummy
            bytes4(0x87654321), // withdrawSelector - dummy
            bytes4(0x11111111), // claimSelector - dummy
            bytes4(0x22222222) // getBalanceSelector - dummy
        );

        console.log("Strategy deployed at:", address(strategy));

        // Set vault to deployer
        console.log("Setting vault to deployer address...");
        strategy.setVault(deployer);
        console.log("Vault set successfully!");

        vm.stopBroadcast();

        console.log("=== DEPLOY COMPLETED ===");
        return strategy;
    }
}
