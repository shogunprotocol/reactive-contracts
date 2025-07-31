// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/strategies/Strategies.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// contract SimpleEmergencyExitTest is Test {
//     Strategies strategy;

//     address deployer;
//     address client;
//     address weth = 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6; // WETH on Sepolia
//     address usdc = 0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008; // USDC on Sepolia
//     address universalRouter = 0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b; // Uniswap V4 Universal Router on Sepolia
//     address permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3; // Permit2 on Sepolia

//     // Mock tokens for testing
//     MockERC20 mockToken;
//     MockERC20 mockStableToken;

//     function setUp() public {
//         deployer = makeAddr("deployer");
//         client = makeAddr("client");

//         // Give deployer some ETH
//         vm.deal(deployer, 10 ether);

//         vm.startPrank(deployer);

//         // Deploy mock tokens
//         mockToken = new MockERC20("Mock Token", "MTK");
//         mockStableToken = new MockERC20("Mock Stable", "MST");

//         // Deploy Strategy first
//         console.log("Deploying Strategy...");
//         strategy = new Strategies(
//             address(mockToken), // Use mock token instead of WETH
//             universalRouter,
//             bytes4(0x12345678), // depositSelector
//             bytes4(0x87654321), // withdrawSelector
//             bytes4(0x11111111), // claimSelector
//             bytes4(0x22222222) // getBalanceSelector
//         );
//         console.log("Strategy deployed at:", address(strategy));

//         // Deploy Callback
//         console.log("Deploying Callback...");
//         // callback = new EmergencyExitSwapCallback(
//         //     universalRouter,
//         //     permit2,
//         //     address(mockToken) // Use mock token as WETH
//         // );

//         vm.stopPrank();
//     }

//     function testEmergencyWithdraw() public {
//         // Test emergency withdraw function
//         vm.startPrank(deployer);

//         // Try to withdraw (should fail because owner is not set)
//         vm.expectRevert("Only owner");
//         // callback.emergencyWithdraw(address(mockToken), deployer);

//         vm.stopPrank();
//     }

//     function testCallbackOwner() public view {
//         // Test that owner function returns address(0) as expected
//         // address owner = callback.owner();
//         assertEq(owner, address(0));
//     }

//     function testCallbackEventEmission() public {
//         // Test that the callback contract can emit events
//         vm.startPrank(client);

//         // This tests that the contract can emit events (basic functionality)
//         // We'll just verify the contract can be called without reverting
//         try
// callback.swapToStable(
//     address(strategy),
//     address(mockStableToken),
//     1000000
// )
// {
//     console.log("Event emission test passed");
// } catch Error(string memory reason) {
//     console.log("Event emission test failed as expected:", reason);
// }

// vm.stopPrank();
// .}

// function testCallbackBasicFunctionality() public {
//     // Test basic functionality without V4 dependencies
//     vm.startPrank(client);

//     // Test that we can call the function and it doesn't revert immediately
//     // This tests the function signature and basic contract interaction
//     try
//         callback.swapToStable(
//             address(strategy),
//             address(mockStableToken),
//             1000000
//         )
//     {
//         console.log("Basic functionality test passed");
//     } catch Error(string memory reason) {
//         // This is expected to fail because we're not mocking V4
//         // but it should fail for the right reason (V4 related, not basic contract issues)
//         console.log("Basic functionality test failed as expected:", reason);
//         assertTrue(bytes(reason).length > 0, "Should fail with a reason");
//     }

//     vm.stopPrank();
// }

// function testCallbackContractState() public view {
//     // Test that the callback contract has the correct state
//     assertEq(callback.weth(), address(mockToken));
//     assertEq(callback.owner(), address(0));

//     console.log("Callback contract state is correct");
// }

// function testStrategyDeployment() public view {
//     assertEq(strategy.underlyingToken(), address(mockToken));
//     assertEq(strategy.protocol(), universalRouter);
// }

// function testCallbackDeployment() public view {
//     assertEq(callback.weth(), address(mockToken));
// }

// function testStrategyTokenBalance() public view {
//     uint256 balance = mockToken.balanceOf(address(strategy));
//     assertEq(balance, 1000 * 10 ** 18);
//     console.log("Strategy token balance:", balance);
// }

// function testCallbackStableTokenBalance() public view {
//     uint256 balance = mockStableToken.balanceOf(address(callback));
//     assertEq(balance, 5000 * 10 ** 18);
//     console.log("Callback stable token balance:", balance);
// }
// }

// Mock ERC20 token for testing
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(
            allowance[from][msg.sender] >= amount,
            "Insufficient allowance"
        );
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
