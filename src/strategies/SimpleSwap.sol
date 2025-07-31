// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {UniversalRouter} from "@uniswap/universal-router/contracts/UniversalRouter.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPermit2} from "@uniswap/permit2/src/interfaces/IPermit2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import "../../lib/reactive-lib/src/abstract-base/AbstractCallback.sol";

contract SimpleSwap is AbstractCallback {
    using StateLibrary for IPoolManager;

    UniversalRouter public immutable router;
    IPoolManager public immutable poolManager;
    IPermit2 public immutable permit2;
    address public immutable token0;
    address public immutable token1;

    event Stop(uint256 amountOut);

    constructor(
        address _router,
        address _poolManager,
        address _permit2,
        address _callbackManager,
        address _token0,
        address _token1
    ) payable AbstractCallback(_callbackManager) {
        router = UniversalRouter(payable(_router));
        poolManager = IPoolManager(_poolManager);
        permit2 = IPermit2(_permit2);
    }

    /// @notice Approves `amount` of `token` via Permit2 for the UniversalRouter
    function approveTokenWithPermit2(
        address token,
        uint160 amount,
        uint48 expiration
    ) external {
        IERC20(token).approve(address(permit2), type(uint256).max);
        permit2.approve(token, address(router), amount, expiration);
    }

    function swapExactInputSingle(
        PoolKey calldata key,
        uint128 amountIn,
        address recipient,
        uint128 minAmountOut
    ) external authorizedSenderOnly returns (uint256 amountOut) {
        // 1) Pull `amountIn` of token0 from the recipient (they must have approved this contract)
        IERC20(token0).transferFrom(recipient, address(this), amountIn);

        // Encode the Universal Router command
        bytes memory commands = abi.encodePacked(uint8(0x10));
        bytes[] memory inputs = new bytes[](1);

        // Encode V4Router actions
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        // Prepare parameters for each action
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: true,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                hookData: bytes("")
            })
        );
        params[1] = abi.encode(key.currency0, amountIn);
        params[2] = abi.encode(key.currency1, minAmountOut);

        // Combine actions and params into inputs
        inputs[0] = abi.encode(actions, params);

        // Execute the swap
        uint256 deadline = block.timestamp + 20;
        router.execute(commands, inputs, deadline);

        // Verify and return the output amount
        amountOut = key.currency1.balanceOf(address(this));
        emit Stop(amountOut);
        require(amountOut >= minAmountOut, "Insufficient output amount");
        return amountOut;
    }
}
