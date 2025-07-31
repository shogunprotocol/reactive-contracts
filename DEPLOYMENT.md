# Emergency Exit Swap Deployment Guide

This guide explains how to deploy and test the Emergency Exit Swap contracts across different networks.

## Overview

The system consists of three main contracts:

1. **Strategy Contract** (Sepolia) - Monitored for EmergencyExit events
2. **Callback Contract** (Sepolia) - Executes swaps to stable tokens
3. **Reactive Contract** (Kopli) - Monitors events and triggers callbacks

## Prerequisites

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Sepolia deployment
SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_PROJECT_ID"
SEPOLIA_PRIVATE_KEY="your-sepolia-private-key"

# Reactive deployment (Kopli testnet)
REACTIVE_RPC_URL="https://kopli-rpc.rnk.dev"
REACTIVE_PRIVATE_KEY="your-reactive-private-key"

# Contract addresses (set after Sepolia deployment)
STRATEGY_ADDRESS="0x..."
CALLBACK_ADDRESS="0x..."
```

### Network Setup

1. **Sepolia**: Get ETH from [Sepolia Faucet](https://sepoliafaucet.com/)
2. **Kopli**: Get REACT tokens by sending SepETH to `0x9b9BB25f1A81078C544C829c5EB7822d747Cf434`

## Deployment Steps

### Step 1: Deploy Sepolia Contracts

Deploy the Strategy and Callback contracts on Sepolia:

```bash
# Set environment variables
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_PROJECT_ID"
export SEPOLIA_PRIVATE_KEY="your-sepolia-private-key"

# Deploy contracts
forge script script/DeploySepolia.s.sol:DeploySepolia \
    --rpc-url $SEPOLIA_RPC_URL \
    --private-key $SEPOLIA_PRIVATE_KEY \
    --broadcast \
    --verify
```

This will create a `deployment-sepolia.txt` file with the contract addresses.

### Step 2: Deploy Reactive Contract

Deploy the Reactive contract on Kopli testnet:

```bash
# Set environment variables
export REACTIVE_RPC_URL="https://kopli-rpc.rnk.dev"
export REACTIVE_PRIVATE_KEY="your-reactive-private-key"

# Set contract addresses from Step 1
export STRATEGY_ADDRESS="0x..." # from deployment-sepolia.txt
export CALLBACK_ADDRESS="0x..." # from deployment-sepolia.txt

# Deploy reactive contract
forge script script/DeployReactive.s.sol:DeployReactive \
    --rpc-url $REACTIVE_RPC_URL \
    --private-key $REACTIVE_PRIVATE_KEY \
    --broadcast
```

This will create a `deployment-reactive.txt` file with the reactive contract address.

## Testing

### Local Testing

Run the test suite locally:

```bash
forge test --match-contract EmergencyExitSwapTest -vv
```

### Manual Testing

1. **Trigger Emergency Exit**:

   ```bash
   # Call emergencyExit on the strategy
   cast send $STRATEGY_ADDRESS "emergencyExit(bytes)" "0x" \
       --rpc-url $SEPOLIA_RPC_URL \
       --private-key $SEPOLIA_PRIVATE_KEY
   ```

2. **Monitor Events**:

   ```bash
   # Check for EmergencyExit events
   cast logs $STRATEGY_ADDRESS \
       --rpc-url $SEPOLIA_RPC_URL \
       --from-block latest
   ```

3. **Verify Swap Execution**:
   ```bash
   # Check callback events
   cast logs $CALLBACK_ADDRESS \
       --rpc-url $SEPOLIA_RPC_URL \
       --from-block latest
   ```

## Contract Addresses

### Sepolia Testnet

- **WETH**: `0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6`
- **USDC**: `0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008`
- **Uniswap V2 Router**: `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`

### Kopli Testnet (Reactive)

- **RPC**: `https://kopli-rpc.rnk.dev`
- **Explorer**: `https://kopli.reactscan.net`

## Troubleshooting

### Common Issues

1. **Insufficient REACT tokens**: Send SepETH to the Reactive faucet
2. **Gas estimation fails**: Ensure you have enough ETH on Sepolia
3. **Callback fails**: Check that the strategy has tokens to swap

### Debugging

1. **Check contract state**:

   ```bash
   cast call $REACTIVE_ADDRESS "isTriggered()" --rpc-url $REACTIVE_RPC_URL
   cast call $REACTIVE_ADDRESS "isDone()" --rpc-url $REACTIVE_RPC_URL
   ```

2. **Monitor reactive events**:
   ```bash
   cast logs $REACTIVE_ADDRESS \
       --rpc-url $REACTIVE_RPC_URL \
       --from-block latest
   ```

## Security Considerations

1. **Private Keys**: Never commit private keys to version control
2. **Gas Limits**: Set appropriate gas limits for cross-chain calls
3. **Slippage**: Configure minimum amounts to prevent MEV attacks
4. **Access Control**: Verify callback contract permissions

## Next Steps

1. **Production Deployment**: Update addresses for mainnet
2. **Monitoring**: Set up event monitoring and alerts
3. **Optimization**: Fine-tune gas limits and slippage parameters
4. **Integration**: Connect with your existing DeFi infrastructure
