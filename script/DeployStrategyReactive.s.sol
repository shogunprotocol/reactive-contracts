// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/reactive/StrategyEmergencyExitReactive.sol";

contract DeployStrategyReactive is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== DEPLOY STRATEGY EMERGENCY EXIT REACTIVE ===");
        console.log("Deployer address:", deployer);
        console.log("Network: Lasna (Reactive)");

        vm.startBroadcast(deployerPrivateKey);

        // Contract addresses from your deployments
        address strategyAddress = 0x77969091a0312E48970Fe46C35a9550FccdDC113; // Your Strategy on Sepolia
        address simpleSwapAddress = 0x518de48CEBe54c8f593360984c645E9851FE28a9; // NEW SimpleSwap with emergencySwap function

        console.log("Strategy Address (Sepolia):", strategyAddress);
        console.log("SimpleSwap Address (Sepolia):", simpleSwapAddress);
        console.log("Client Address:", deployer);

        // Deploy the reactive contract
        console.log("\nDeploying StrategyEmergencyExitReactive...");
        StrategyEmergencyExitReactive reactive = new StrategyEmergencyExitReactive{
            value: 1 ether
        }( // Send 1 ether for registration
            strategyAddress, // Strategy contract to monitor
            simpleSwapAddress, // SimpleSwap contract to trigger
            deployer // Client address (recipient of swapped tokens)
        );

        console.log("Reactive contract deployed at:", address(reactive));

        // Register the reactive contract
        console.log("\nRegistering reactive contract...");
        reactive.register();
        console.log("Registration completed!");

        // Display configuration
        console.log("\n=== CONFIGURATION SUMMARY ===");
        console.log("Strategy (monitored):", reactive.getStrategy());
        console.log("SimpleSwap (callback):", reactive.getSimpleSwap());
        console.log("Client (recipient):", reactive.getClient());
        console.log("Is Triggered:", reactive.isTriggered());
        console.log("Is Done:", reactive.isDone());

        console.log("\n=== DEPLOYMENT COMPLETED ===");
        console.log("To test the system:");
        console.log("1. Call emergencyExit() on your Strategy contract");
        console.log(
            "2. The reactive contract will detect the EmergencyExited event"
        );
        console.log("3. It will trigger a swap via the SimpleSwap contract");
        console.log("4. Monitor events on both networks for confirmation");

        vm.stopBroadcast();
    }
}
