// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {UniswapDemoStopOrderReactive} from "../src/reactive/UniswapDemoStopOrderReactive.sol";

contract Register is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        UniswapDemoStopOrderReactive reactive = UniswapDemoStopOrderReactive(
            payable(0x8fDE7A649c782c96e7f4D9D88490a7C5031F51a9)
        );
        reactive.register();
        vm.stopBroadcast();
    }
}
