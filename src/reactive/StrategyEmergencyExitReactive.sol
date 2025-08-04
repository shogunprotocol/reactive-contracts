// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity >=0.8.0;

import "../../../lib/reactive-lib/src/interfaces/IReactive.sol";
import "../../../lib/reactive-lib/src/abstract-base/AbstractReactive.sol";

/**
 * @title StrategyEmergencyExitReactive
 * @dev Reactive contract that monitors Strategy contracts for EmergencyExited events
 *      and triggers Uniswap V4 swaps via SimpleSwap callback
 */
contract StrategyEmergencyExitReactive is IReactive, AbstractReactive {
    event Subscribed(
        address indexed service_address,
        address indexed _contract,
        uint256 indexed topic_0
    );

    event EmergencyExitDetected(
        uint256 indexed balance,
        bytes data,
        address indexed strategy
    );

    event CallbackSent(address indexed callback_contract, uint256 balance);

    event SwapCompleted();
    event Done();

    // Constants
    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 private constant EMERGENCY_EXITED_TOPIC_0 =
        0x33707543538a74978cfbe255a9a187ce79ed7695a03a48d36b5a3cf8b569aa52; // keccak256("EmergencyExited(uint256,bytes)")
    uint64 private constant CALLBACK_GAS_LIMIT = 1000000;

    // State variables
    bool private triggered;
    bool private done;
    address private strategy;
    address private simpleSwap;
    address private client;
    address private owner;

    constructor(
        address _strategy,
        address _simpleSwap,
        address _client
    ) payable {
        triggered = false;
        done = false;
        strategy = _strategy;
        simpleSwap = _simpleSwap;
        client = _client;
        owner = msg.sender;

        // Note: Subscription will be done manually via register() function after deployment
    }

    /**
     * @dev React to EmergencyExited events from the Strategy contract
     * @param log The log record from the monitored event
     */
    function react(LogRecord calldata log) external vmOnly {
        require(!done, "Already processed");

        // Verify this is from our monitored strategy
        if (log._contract != strategy) {
            return;
        }

        // Verify this is the EmergencyExited event
        if (log.topic_0 != EMERGENCY_EXITED_TOPIC_0) {
            return;
        }

        // Decode the event data: EmergencyExited(uint256 balance, bytes data)
        (uint256 balance, bytes memory data) = abi.decode(
            log.data,
            (uint256, bytes)
        );

        emit EmergencyExitDetected(balance, data, strategy);

        if (!triggered && balance > 0) {
            triggered = true;

            // Create simple payload for emergency swap
            bytes memory payload = abi.encodeWithSignature(
                "emergencySwap(uint256,address,uint256)",
                balance, // amount to swap
                client, // recipient of swapped tokens
                (balance * 95) / 100 // minimum amount (5% slippage tolerance)
            );

            emit CallbackSent(simpleSwap, balance);

            // Send callback to SimpleSwap on Sepolia
            emit Callback(
                SEPOLIA_CHAIN_ID,
                simpleSwap,
                CALLBACK_GAS_LIMIT,
                payload
            );
        }
    }

    /**
     * @dev Check if the reactive contract has been triggered
     */
    function isTriggered() external view returns (bool) {
        return triggered;
    }

    /**
     * @dev Check if the emergency exit process is complete
     */
    function isDone() external view returns (bool) {
        return done;
    }

    /**
     * @dev Get the monitored strategy address
     */
    function getStrategy() external view returns (address) {
        return strategy;
    }

    /**
     * @dev Get the SimpleSwap callback address
     */
    function getSimpleSwap() external view returns (address) {
        return simpleSwap;
    }

    /**
     * @dev Get the client address
     */
    function getClient() external view returns (address) {
        return client;
    }

    /**
     * @dev Mark the process as complete (can be called by authorized sources)
     */
    function markComplete() external {
        // In a real implementation, you might want to add access control here
        done = true;
        emit Done();
    }

    /**
     * @dev Register the reactive contract (must be called by owner)
     */
    function register() external {
        require(msg.sender == owner, "Only owner");
        service.subscribe(
            SEPOLIA_CHAIN_ID,
            strategy,
            EMERGENCY_EXITED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        emit Subscribed(address(service), strategy, EMERGENCY_EXITED_TOPIC_0);
    }

    /**
     * @dev Emergency function to reset state if needed
     */
    function reset() external {
        require(msg.sender == owner, "Only owner");
        triggered = false;
        done = false;
    }

    /**
     * @dev Get the owner address
     */
    function getOwner() external view returns (address) {
        return owner;
    }
}
