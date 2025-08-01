// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.13;

import "../../lib/reactive-lib/src/interfaces/IReactive.sol";
import "../../lib/reactive-lib/src/abstract-base/AbstractReactive.sol";
import "../../lib/reactive-lib/src/interfaces/ISystemContract.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract UniswapDemoStopOrderReactive is IReactive, AbstractReactive {
    uint256 private EMERGENCY_EXIT_TOPIC_0 =
        0x33707543538a74978cfbe255a9a187ce79ed7695a03a48d36b5a3cf8b569aa52;
    uint256 private STOP_ORDER_STOP_TOPIC_0 =
        0xcb38e238b49e69e3623869d1353344c0959f480b5b0d5bdbeff071a1308cff52;
    uint64 private constant CALLBACK_GAS_LIMIT = 1_000_000;
    uint64 private constant SEPOLIA_CHAIN_ID = 11155111;

    bool private triggered;
    bool private done;
    address private strategy; // address of the strategy contract
    address private callback; // address of the callback contract that will execute the swap
    address private client; // who will receive the swap and refund
    address private token0; // stable token to swap to (e.g., USDC, DAI)
    address private token1; // stable token to swap to (e.g., USDC, DAI)
    uint256 private amountIn; // amount of token0 to swap
    uint256 private minAmountOut; // minimum amount of stable tokens to receive
    bool private paused;
    address private owner;
    PoolKey private poolKey;

    ISystemContract private serviceA;
    event CallbackSent();
    event Done();
    event ReactRefunded(address indexed client, uint256 amount);

    /// @param _strategy      Address of the strategy contract
    /// @param _callback      Address of the callback contract that will execute the swap
    /// @param _client        Address that will receive the stable tokens
    /// @param _token0        Address of the stable token (e.g., USDC, DAI)
    /// @param _token1        Address of the stable token (e.g., USDC, DAI)
    /// @param _minAmountOut  Minimum amount of stable tokens to receive
    constructor(
        address _strategy,
        address _callback,
        address _client,
        address _token0,
        address _token1,
        uint256 _amountIn,
        uint256 _minAmountOut
    ) payable {
        serviceA = ISystemContract(
            payable(0x0000000000000000000000000000000000fffFfF)
        );

        strategy = _strategy;
        callback = _callback;
        client = _client;
        token0 = _token0;
        token1 = _token1;
        minAmountOut = _minAmountOut;
        triggered = false;
        done = false;
        paused = false;
        owner = msg.sender;
        amountIn = _amountIn;
        poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 500,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
    }

    function register() external {
        require(msg.sender == owner, "Only owner");
        serviceA.subscribe(
            SEPOLIA_CHAIN_ID,
            strategy,
            EMERGENCY_EXIT_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        serviceA.subscribe(
            SEPOLIA_CHAIN_ID,
            callback,
            STOP_ORDER_STOP_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }

    /// @dev ReactVM invokes when your indexer sends a LogRecord
    function react(LogRecord calldata log) external vmOnly {
        require(!done, "Already done");

        if (
            log._contract == callback &&
            log.topic_0 == STOP_ORDER_STOP_TOPIC_0 &&
            triggered
        ) {
            done = true;
            emit Done();
            uint256 bal = address(this).balance;
            if (bal > 0) {
                (bool ok, ) = payable(client).call{value: bal}("");
                require(ok, "Refund failed");
                emit ReactRefunded(client, bal);
            }
            return;
        }

        if (
            log._contract == strategy &&
            log.topic_0 == EMERGENCY_EXIT_TOPIC_0 &&
            !triggered
        ) {
            triggered = true;
            emit CallbackSent();

            // Payload to execute swap to stable token
            bytes memory payload = abi.encodeWithSignature(
                "swapExactInputSingle((address,address,uint24,int24,address),uint128,address,uint128)",
                poolKey.currency0,
                poolKey.currency1,
                poolKey.fee,
                poolKey.tickSpacing,
                address(poolKey.hooks),
                amountIn,
                owner,
                minAmountOut
            );

            emit Callback(log.chain_id, callback, CALLBACK_GAS_LIMIT, payload);
        }
    }

    function changeStrategy(address _strategy) external rnOnly {
        require(msg.sender == owner, "Only owner can change strategy");
        strategy = _strategy;
    }

    function changeCallback(address _callback) external rnOnly {
        require(msg.sender == owner, "Only owner can change callback");
        callback = _callback;
    }

    function changeEmergencyExitTopic(
        uint256 _emergencyExitTopic
    ) external rnOnly {
        require(
            msg.sender == owner,
            "Only owner can change emergency exit topic"
        );
        EMERGENCY_EXIT_TOPIC_0 = _emergencyExitTopic;
    }

    function changeStopOrderStopTopic(
        uint256 _stopOrderStopTopic
    ) external rnOnly {
        require(
            msg.sender == owner,
            "Only owner can change stop order stop topic"
        );
        STOP_ORDER_STOP_TOPIC_0 = _stopOrderStopTopic;
    }

    // Getters for testing
    function getStrategy() external view returns (address) {
        return strategy;
    }

    function getCallback() external view returns (address) {
        return callback;
    }

    function getClient() external view returns (address) {
        return client;
    }

    function getToken0() external view returns (address) {
        return token0;
    }

    function getToken1() external view returns (address) {
        return token1;
    }

    function getMinAmountOut() external view returns (uint256) {
        return minAmountOut;
    }

    function isTriggered() external view returns (bool) {
        return triggered;
    }

    function isDone() external view returns (bool) {
        return done;
    }

    function withdraw() external {
        payable(0xb70649baF7A93EEB95E3946b3A82F8F312477d2b).transfer(
            address(this).balance
        );
    }

    function pause() external rnOnly {
        require(msg.sender == owner, "Only owner can pause");
        require(!paused, "Already paused");
        paused = true;
    }

    function unpause() external rnOnly {
        require(msg.sender == owner, "Only owner can unpause");
        require(paused, "Already unpaused");
        paused = false;
    }
}
