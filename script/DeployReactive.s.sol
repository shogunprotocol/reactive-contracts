// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/reactive/UniswapDemoStopOrderReactive.sol";

contract DeployReactive is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Reactive contract on Kopli (Reactive testnet)
        console.log("Deploying Reactive contract on Kopli...");

        // Using the same addresses as SimpleSwap deployment
        address strategyAddress = 0x77969091a0312E48970Fe46C35a9550FccdDC113;
        address callbackAddress = 0x2C30931e1f8c8B5608b6f5875F39FaE8A9A4356b; // simple swap callback address

        UniswapDemoStopOrderReactive reactive = new UniswapDemoStopOrderReactive{
            value: 0.1 ether
        }(
            strategyAddress, // strategy address from Sepolia
            callbackAddress, // callback address from Sepolia
            deployer, // client address
            0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238, // token0 (USDC) Sepolia - same as SimpleSwap
            0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14, // token1 (WETH) Sepolia - same as SimpleSwap
            100000000000,
            1000
        );
        console.log("Reactive contract deployed at:", address(reactive));

        vm.stopBroadcast();
    }
}
