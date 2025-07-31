// // SPDX-License-Identifier: GPL-2.0-or-later
// pragma solidity ^0.8.13;

// import "forge-std/Test.sol";
// import "../src/strategies/Strategies.sol";
// import "../src/reactive/UniswapDemoStopOrderReactive.sol";
// import "../src/base/VaultAccessControl.sol";

// contract IntegrationTest is Test {
//     // Deployed contract addresses
//     address constant STRATEGY_ADDRESS =
//         0xACF69128c3577c9C154E4D46A8B7C2576C230e2C;
//     address constant CALLBACK_ADDRESS =
//         0x04Ef9046624802FcbF476DC07F885aDcED074AFf;
//     address constant REACTIVE_ADDRESS =
//         0x8fDE7A649c782c96e7f4D9D88490a7C5031F51a9;

//     // Uniswap V4 addresses on Sepolia
//     address constant UNIVERSAL_ROUTER =
//         0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b;
//     address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
//     address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
//     address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

//     // Test addresses
//     address deployer = 0xb70649baF7A93EEB95E3946b3A82F8F312477d2b;
//     address client = 0xb70649baF7A93EEB95E3946b3A82F8F312477d2b;

//     Strategies strategy;
//     UniswapDemoStopOrderReactive reactive;

//     function setUp() public {
//         // Fork Sepolia for testing
//         vm.createSelectFork(vm.envString("SEPOLIA_RPC_URL"));

//         // Get deployed contracts
//         strategy = Strategies(STRATEGY_ADDRESS);
//         callback = EmergencyExitSwapCallback(payable(CALLBACK_ADDRESS));

//         // Give deployer some ETH for testing
//         vm.deal(deployer, 100 ether);

//         console.log("=== INTEGRATION TEST SETUP ===");
//         console.log("Strategy:", address(strategy));
//         console.log("Callback:", address(callback));
//         console.log("Reactive:", REACTIVE_ADDRESS);
//         console.log("Deployer:", deployer);
//         console.log("Client:", client);
//     }

//     function testCompleteFlow() public {
//         console.log("\n=== TESTING COMPLETE FLOW ===");

//         // Step 1: Verify initial state
//         console.log("1. Checking initial state...");
//         uint256 initialBalance = address(deployer).balance;
//         console.log("Initial deployer balance:", initialBalance);

//         // Step 2: Check if strategy has any tokens
//         console.log("2. Checking strategy token balance...");
//         uint256 strategyBalance = IERC20(WETH).balanceOf(address(strategy));
//         console.log("Strategy WETH balance:", strategyBalance);

//         // Step 3: Trigger emergency exit from strategy
//         console.log("3. Triggering emergency exit...");
//         vm.startPrank(deployer);

//         // Try to call emergencyExit on strategy
//         try strategy.emergencyExit("") {
//             console.log("Emergency exit triggered successfully");
//         } catch Error(string memory reason) {
//             console.log("Emergency exit failed:", reason);
//         } catch {
//             console.log("Emergency exit failed with unknown error");
//         }

//         vm.stopPrank();

//         // Step 4: Check if callback was triggered
//         console.log("4. Checking callback state...");
//         uint256 callbackBalance = IERC20(USDC).balanceOf(address(callback));
//         console.log("Callback USDC balance:", callbackBalance);

//         // Step 5: Verify final state
//         console.log("5. Checking final state...");
//         uint256 finalBalance = address(deployer).balance;
//         console.log("Final deployer balance:", finalBalance);

//         console.log("\n=== TEST COMPLETED ===");
//     }

//     function testStrategyContract() public {
//         console.log("\n=== TESTING STRATEGY CONTRACT ===");

//         vm.startPrank(deployer);

//         // Test strategy functions
//         console.log("Testing strategy functions...");

//         // Check if we can call emergencyExit
//         try strategy.emergencyExit("") {
//             console.log("Emergency exit function works");
//         } catch Error(string memory reason) {
//             console.log("Emergency exit failed:", reason);
//         }

//         vm.stopPrank();
//     }

//     function testCallbackContract() public {
//         console.log("\n=== TESTING CALLBACK CONTRACT ===");

//         vm.startPrank(deployer);

//         // Test callback functions
//         console.log("Testing callback functions...");

//         // Check if we can call swapToStable
//         try
//             callback.swapToStable(
//                 address(strategy), // strategy address
//                 USDC, // stable token
//                 1000000 // minAmountOut (1 USDC with 6 decimals)
//             )
//         {
//             console.log("SwapToStable function works");
//         } catch Error(string memory reason) {
//             console.log("SwapToStable failed:", reason);
//         }

//         vm.stopPrank();
//     }

//     function testTokenBalances() public {
//         console.log("\n=== TESTING TOKEN BALANCES ===");

//         // Check WETH balances
//         uint256 deployerWETH = IERC20(WETH).balanceOf(deployer);
//         uint256 strategyWETH = IERC20(WETH).balanceOf(address(strategy));
//         uint256 callbackWETH = IERC20(WETH).balanceOf(address(callback));

//         console.log("WETH Balances:");
//         console.log("  Deployer:", deployerWETH);
//         console.log("  Strategy:", strategyWETH);
//         console.log("  Callback:", callbackWETH);

//         // Check USDC balances
//         uint256 deployerUSDC = IERC20(USDC).balanceOf(deployer);
//         uint256 strategyUSDC = IERC20(USDC).balanceOf(address(strategy));
//         uint256 callbackUSDC = IERC20(USDC).balanceOf(address(callback));

//         console.log("USDC Balances:");
//         console.log("  Deployer:", deployerUSDC);
//         console.log("  Strategy:", strategyUSDC);
//         console.log("  Callback:", callbackUSDC);
//     }
// }

// interface IToken {
//     function balanceOf(address account) external view returns (uint256);

//     function transfer(address to, uint256 amount) external returns (bool);

//     function approve(address spender, uint256 amount) external returns (bool);
// }
