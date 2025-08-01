# Emergency Exit Swap - Uniswap V4 Integration

A reactive smart contract system that monitors strategy contracts for EmergencyExit events and automatically executes swaps to stable tokens using Uniswap V4.

## 🏗️ Architecture

The system consists of three main components deployed across different networks:

1. **Strategy Contract** (Sepolia) - Monitored for EmergencyExit events
2. **Callback Contract** (Sepolia) - Executes V4 swaps to stable tokens
3. **Reactive Contract** (Kopli) - Monitors events and triggers callbacks

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp env.example .env

# Edit .env with your actual values
nano .env
```

### 2. Deploy Contracts

```bash
# Deploy on Sepolia
forge script script/DeploySepolia.s.sol:DeploySepolia \
    --rpc-url $SEPOLIA_RPC_URL \
    --private-key $SEPOLIA_PRIVATE_KEY \
    --broadcast \
    --verify

# Deploy on Kopli (Reactive)
forge script script/DeployReactive.s.sol:DeployReactive \
    --rpc-url $REACTIVE_RPC_URL \
    --private-key $REACTIVE_PRIVATE_KEY \
    --broadcast
```

### 3. Test System

```bash
# Run tests
forge test --match-contract SimpleEmergencyExitTest -vv

# Manual testing
cast send $STRATEGY_ADDRESS "emergencyExit(bytes)" "0x" \
    --rpc-url $SEPOLIA_RPC_URL \
    --private-key $SEPOLIA_PRIVATE_KEY
```

## 📁 Project Structure

```
├── src/
│   ├── reactive/
│   │   ├── old.sol                          # Reactive contract (Kopli)
│   │   └── EmergencyExitSwapCallback.sol    # V4 Swap callback (Sepolia)
│   └── strategies/
│       └── Strategies.sol                    # Strategy contract (Sepolia)
├── script/
│   ├── DeploySepolia.s.sol                  # Sepolia deployment
│   └── DeployReactive.s.sol                 # Kopli deployment
├── test/
│   └── SimpleEmergencyExitTest.t.sol        # Test suite
├── env.example                              # Environment template
└── DEPLOYMENT.md                            # Detailed deployment guide
```

## 🔧 Configuration

### Environment Variables

Key variables in `.env`:

```bash
# Networks
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
REACTIVE_RPC_URL=https://kopli-rpc.rnk.dev

# Private Keys
SEPOLIA_PRIVATE_KEY=your-sepolia-private-key
REACTIVE_PRIVATE_KEY=your-reactive-private-key

# Uniswap V4 Addresses
UNISWAP_V4_UNIVERSAL_ROUTER=0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b
UNISWAP_V4_PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3

# Tokens
WETH_ADDRESS=0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6
USDC_ADDRESS=0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008
```

## 🔄 How It Works

1. **Monitoring**: Reactive contract on Kopli monitors EmergencyExit events from strategy on Sepolia
2. **Trigger**: When EmergencyExit is detected, reactive contract sends callback to Sepolia
3. **Swap**: Callback contract executes V4 swap from strategy tokens to USDC
4. **Completion**: Stable tokens are sent to the client and confirmation event is emitted

## 🧪 Testing

### Local Testing

```bash
# Run all tests
forge test -vv

# Run specific test
forge test --match-contract SimpleEmergencyExitTest -vv
```

### Manual Testing

```bash
# 1. Check contract state
cast call $REACTIVE_ADDRESS "isTriggered()" --rpc-url $REACTIVE_RPC_URL

# 2. Trigger emergency exit
cast send $STRATEGY_ADDRESS "emergencyExit(bytes)" "0x" \
    --rpc-url $SEPOLIA_RPC_URL \
    --private-key $SEPOLIA_PRIVATE_KEY

# 3. Monitor events
cast logs $CALLBACK_ADDRESS --rpc-url $SEPOLIA_RPC_URL --from-block latest
```

## 📊 Monitoring

### Event Monitoring

```bash
# EmergencyExit events
cast logs $STRATEGY_ADDRESS \
    --rpc-url $SEPOLIA_RPC_URL \
    --from-block latest

# Swap events
cast logs $CALLBACK_ADDRESS \
    --rpc-url $SEPOLIA_RPC_URL \
    --from-block latest

# Reactive events
cast logs $REACTIVE_ADDRESS \
    --rpc-url $REACTIVE_RPC_URL \
    --from-block latest
```

## 🔒 Security Features

- **Slippage Protection**: Minimum output amounts prevent MEV attacks
- **Gas Optimization**: V4 is more gas efficient than V2
- **Error Handling**: Failed swaps return tokens to strategy
- **Access Control**: Emergency functions protected by owner
- **Event Logging**: Comprehensive event tracking

## 🆚 Uniswap V4 Advantages

- **Better Gas Efficiency**: ~30% less gas than V2
- **Improved Price Execution**: Better slippage protection
- **Universal Router**: Single interface for all swaps
- **Hook System**: Extensible functionality
- **Better MEV Protection**: Advanced routing algorithms

## 🚨 Troubleshooting

### Common Issues

1. **Insufficient REACT tokens**: Send SepETH to `0x9b9BB25f1A81078C544C829c5EB7822d747Cf434`
2. **Gas estimation fails**: Ensure sufficient ETH on Sepolia
3. **Swap fails**: Check token balances and approvals
4. **Callback not triggered**: Verify event monitoring setup

### Debugging Commands

```bash
# Check contract balances
cast balance $STRATEGY_ADDRESS --rpc-url $SEPOLIA_RPC_URL
cast call $STRATEGY_ADDRESS "getBalance()" --rpc-url $SEPOLIA_RPC_URL

# Verify approvals
cast call $TOKEN_ADDRESS "allowance(address,address)" $STRATEGY_ADDRESS $CALLBACK_ADDRESS --rpc-url $SEPOLIA_RPC_URL

# Check reactive state
cast call $REACTIVE_ADDRESS "isDone()" --rpc-url $REACTIVE_RPC_URL
```

## 📈 Next Steps

1. **Production Deployment**: Update addresses for mainnet
2. **Monitoring Dashboard**: Set up real-time event monitoring
3. **Gas Optimization**: Fine-tune gas limits and parameters
4. **Integration**: Connect with existing DeFi infrastructure
5. **Multi-Strategy Support**: Extend to monitor multiple strategies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

BUSL-1.1

## 🆘 Support

For issues and questions:

- Check the troubleshooting section
- Review the deployment guide
- Open an issue on GitHub
