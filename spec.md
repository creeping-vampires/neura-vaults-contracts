1. YieldAllocatorVault — an ERC‑4626-compatible vault (e.g. deposit USDC or USDT and receive aiXYZ shares)

2. AIAgent — a restricted executor that can only move funds between the vault and whitelisted pools

3. A governance-driven WhitelistRegistry controls which pools the agent may interact with.





Vault holds user deposits and issues ERC‑4626 compliant shares (aiXYZ) proportional to how much they deposit. Users redeem those shares to reclaim their principal + yield.

AI Agent never holds users’ assets. It only takes funds from the vault, invests them into whitelisted pools, and brings funds back to the vault—but it never retains custody.




Vault holds all funds	-> ERC‑4626 compliance & totalAssets() logic
Share tokens proportional	-> deposit()/redeem() inherited from ERC‑4626
Agent only allocates funds	-> Agent never retains balances, vault tracks poolBalances
Pool whitelist enforced	 -> WhitelistRegistry managed by governance
Clean separation of roles	 -> AccessControl roles for admin and executor


# Share Calculation

The YieldAllocatorVault implements the ERC-4626 standard for tokenized vaults, which standardizes the conversion between assets (underlying tokens) and shares (vault tokens).

## Converting Assets to Shares (Deposit/Mint)

When a user deposits assets into the vault, they receive shares based on the following formula:

```
shares = assets * totalSupply / totalAssets
```

Where:
- `assets` is the amount of tokens being deposited
- `totalSupply` is the total number of shares currently issued by the vault
- `totalAssets` is the total value of assets currently managed by the vault

For the first deposit (when `totalSupply` = 0), shares are minted 1:1 with assets.

### Example:
- Initial state: Empty vault (0 assets, 0 shares)
- User 1 deposits 100 USDTEST
  - Receives 100 shares (1:1 for first deposit)
- Vault generates 10 USDTEST in yield (now has 110 USDTEST total)
- User 2 deposits 110 USDTEST
  - Receives 100 shares (110 * 100 / 110 = 100)

## Converting Shares to Assets (Withdraw/Redeem)

When a user redeems their shares, they receive assets based on the following formula:

```
assets = shares * totalAssets / totalSupply
```

Where:
- `shares` is the amount of shares being redeemed
- `totalAssets` is the total value of assets currently managed by the vault
- `totalSupply` is the total number of shares currently issued by the vault

### Example:
- Current state: Vault has 220 USDTEST total assets and 200 shares total supply
- User 1 redeems 100 shares
  - Receives 110 USDTEST (100 * 220 / 200 = 110)
- User 2 redeems 100 shares
  - Receives 110 USDTEST (100 * 110 / 100 = 110)

## Withdrawal Process

The withdrawal process in YieldAllocatorVault has two paths:

1. **Immediate Withdrawal**: If the vault has sufficient idle assets, the withdrawal is processed immediately using the standard ERC-4626 conversion.

2. **Delayed Withdrawal**: If the vault has insufficient idle assets:
   - A withdrawal request is created
   - AIAgent fulfills the request by withdrawing funds from pools
   - User claims their assets after the request is fulfilled

In both cases, the asset amount is calculated using the same share-to-asset conversion formula.


# withdrawal flow 

1. User requests withdrawal from vault (burn shares)
2. AI Agent deposits vault funds to MockPool (transfer assets to vault)
3. MockPool generates yield
4. Users withdraw one by one from the vault (transfer assets to user)
5. AI Agent withdraws funds from MockPool (transfer assets to vault)
6. AI Agent sends funds to user
7. User claims withdrawal



# Flow test

Flow 1 : test vault deposits yield simulation and user withdrawal flow

run: `yarn deploy --tags YieldAllocatorFlow`


Flow 2 : test vault deposits and delayed withdrawal flow

run: `yarn deploy --tags DelayedWithdrawalFlow`

Flow 3 : Test multiuser deposits and withdrawal flow

run: `yarn deploy --tags MultiUserFlow`


# Protocol Operation Guide

## Operating the Yield Allocator Protocol with AI Agents

The Yield Allocator protocol is designed to optimize yield generation while maintaining security through a clear separation of concerns. This guide explains how to operate the protocol effectively.

### Key Components

1. **YieldAllocatorVault (ERC-4626)**: Holds user deposits and issues shares
2. **AIAgent**: Manages fund allocation between vault and whitelisted pools
3. **WhitelistRegistry**: Controls which pools the AIAgent can interact with

### Protocol Operation Workflow

#### 1. Initial Setup

- Deploy the WhitelistRegistry, YieldAllocatorVault, and AIAgent contracts
- Grant the EXECUTOR role to the AIAgent in the YieldAllocatorVault
- Whitelist trusted pools in the WhitelistRegistry

```bash
# Deploy the core protocol
yarn deploy --tags YieldAllocator
```

#### 2. Managing Whitelisted Pools

Only governance can add or remove pools from the whitelist:

```solidity
// Add a pool to whitelist
whitelistRegistry.setPool(poolAddress, true);

// Remove a pool from whitelist
whitelistRegistry.setPool(poolAddress, false);
```

#### 3. AI Agent Operations

The AIAgent with the EXECUTOR role can perform these key operations:

```solidity
// Deposit vault funds to a whitelisted pool
aiAgent.depositToPool(poolAddress, amount);

// Withdraw funds from a pool back to the vault
aiAgent.withdrawFromPool(poolAddress, amount);

// Fulfill pending withdrawal requests
aiAgent.fulfillWithdrawalRequests();
```

#### 4. Monitoring and Rebalancing

For optimal yield generation:

- Monitor pool performance and yields regularly
- Rebalance funds between pools based on yield opportunities
- Maintain sufficient idle assets in the vault for expected withdrawals
- Regularly check for pending withdrawal requests

```solidity
// Check total pending withdrawal requests
uint256 pendingWithdrawals = aiAgent.checkWithdrawalRequests();
```

#### 5. Emergency Operations

In case of emergencies:

- Governance can pause the vault if needed
- AIAgent can quickly withdraw funds from pools
- Withdrawal requests can be prioritized and fulfilled

## Providing Liquidity for Share Tokens

Making vault share tokens (aiXYZ) liquid through DEX liquidity pools increases utility and potentially attracts more users.

### Setting Up Liquidity Pools

#### 1. Create a Liquidity Pool

Choose a DEX protocol (Uniswap, SushiSwap, etc.) and create a pair for the vault share token:

```solidity
// Example for Uniswap V2
IUniswapV2Factory factory = IUniswapV2Factory(FACTORY_ADDRESS);
address pair = factory.createPair(address(yieldAllocatorVault), address(baseToken));
```

#### 2. Add Initial Liquidity

Seed the pool with initial liquidity to enable trading:

```solidity
// Approve tokens for router
yieldAllocatorVault.approve(ROUTER_ADDRESS, initialShareAmount);
baseToken.approve(ROUTER_ADDRESS, initialTokenAmount);

// Add liquidity
IUniswapV2Router02 router = IUniswapV2Router02(ROUTER_ADDRESS);
router.addLiquidity(
    address(yieldAllocatorVault),
    address(baseToken),
    initialShareAmount,
    initialTokenAmount,
    minShareAmount,
    minTokenAmount,
    treasury, // LP token recipient
    deadline
);
```

#### 3. Liquidity Management Strategies

For sustainable liquidity:

- **Range-Bound Liquidity**: For Uniswap V3, concentrate liquidity around the expected trading range
- **Balanced Reserves**: Maintain balanced reserves to minimize impermanent loss
- **Fee Tier Selection**: Choose appropriate fee tiers based on expected volatility
- **Liquidity Mining**: Incentivize liquidity providers with additional rewards

#### 4. Arbitrage Considerations

Arbitrage between the DEX price and the vault's intrinsic share value (NAV) helps maintain price alignment:

- If DEX price < NAV: Arbitrageurs buy shares on DEX and redeem from vault
- If DEX price > NAV: Arbitrageurs mint shares from vault and sell on DEX

#### 5. Governance and Parameter Tuning

Optimize protocol parameters through governance:

- Adjust deposit/withdrawal fees if applicable
- Modify liquidity mining rewards
- Update pool whitelist based on performance

### Benefits of Share Token Liquidity

1. **Improved User Experience**: Users can enter/exit positions without waiting for withdrawal processing
2. **Increased Capital Efficiency**: Traders can speculate on yield performance
3. **Price Discovery**: Market-based valuation of the vault strategy
4. **Additional Yield**: LP fees provide another source of yield for liquidity providers

## Testing and Simulation

Test the protocol operations with the provided simulation scripts:

```bash
# Test basic yield flow
yarn deploy --tags YieldAllocatorFlow

# Test delayed withdrawal scenario
yarn deploy --tags DelayedWithdrawal

# Test multi-user deposits and withdrawals
yarn deploy --tags MultiUserFlow



🚀 Deployment Summary USDe:
====================
Network: hype-mainnet
WhitelistRegistry: 0x91cbFcd28fAE1940FE32AB6dB7A28649a8986F21
YieldAllocatorVault: 0xc0A0D96584052195245888F3b31ecE7F3b6b1F3e
AIAgent: 0x1aEf153B20c9Ec2527CbB653FAeA7A6318b0cB26
Underlying Asset: 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34
Governor: 0x4cacfA4B61105852580BA184b6466FD9952654ce
Treasury: 0x4cacfA4B61105852580BA184b6466FD9952654ce


🚀 Deployment Summary USDT0:
====================
Network: hype-mainnet
WhitelistRegistry: 0x91cbFcd28fAE1940FE32AB6dB7A28649a8986F21
YieldAllocatorVault: 0x900759fC4d5bdBa2d849bF9A8Af55BB06A54aCd5
AIAgent: 0x51Ca397bf3dBFCeFfAeA0fb9eD4F55f379Ca5169
Underlying Asset: 0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb
Governor: 0x4cacfA4B61105852580BA184b6466FD9952654ce
Treasury: 0x4cacfA4B61105852580BA184b6466FD9952654ce
====================
✅ Deployment complete!


# Protocol Operation Commands

This section provides a comprehensive list of all commands needed to operate the Yield Allocator protocol on the Hyperliquid blockchain (hype-mainnet).

## Deployment Commands

### Initial Deployment

Deploy the core protocol contracts to the Hyperliquid blockchain:

```bash
yarn deploy --tags DeployMainnet --network hype-mainnet
```

### Whitelist Pools

Add trusted pools to the WhitelistRegistry:

```bash
yarn deploy --tags WhitelistPools --network hype-mainnet
```

### Assign Executor Role

Grant the EXECUTOR role to the AIAgent:

```bash
yarn deploy --tags AssignExecutorRole --network hype-mainnet
```

## User Operations

### Deposit Assets to Vault

Users can deposit assets (USDe) into the YieldAllocatorVault:

```bash
yarn deploy --tags UserDeposit --network hype-mainnet
```

This script:
- Checks user's asset token balance
- Approves the vault to spend the asset if needed
- Deposits either 10% of the user's balance or the full balance if it's small
- Verifies the deposit by checking share balance changes
- Provides detailed information about shares received and exchange rates

### Request Withdrawal from Vault

Users can request withdrawals from the YieldAllocatorVault:

```bash
yarn deploy --tags UserWithdraw --network hype-mainnet
```

This script:
- Checks if the user already has a pending withdrawal request
- If yes and it's fulfilled, claims the withdrawal
- If yes but not fulfilled, provides instructions to fulfill it
- If no pending request, initiates a new withdrawal (default: 50% of shares)
- Shows detailed information about share balances, asset amounts, and exchange rates

### Claim Fulfilled Withdrawal

Users can check and claim their fulfilled withdrawal requests:

```bash
yarn deploy --tags ClaimWithdrawal --network hype-mainnet
```

This script:
- Checks if the user has a pending withdrawal request
- If a request exists and is fulfilled, claims the withdrawal automatically
- Shows the amount of assets received and updated balances
- If a request exists but is not fulfilled, provides guidance on running the executor script

## Executor Operations

### Check Protocol Status

Monitor the current status of the protocol:

```bash
npx hardhat run scripts/check-protocol-status.ts --network hype-mainnet
```

This script provides detailed information about:
- Idle asset balance in the vault
- Total assets (including those in pools)
- Allocated assets in pools
- Pending withdrawal requests and coverage
- Individual pool balances with percentages
- Liquidity ratio with health indicators

### Check and Deposit Idle Assets

Manage idle assets in the vault and fulfill withdrawal requests:

```bash
npx hardhat run scripts/check-and-deposit-idle-assets.ts --network hype-mainnet
```

This script:
- Checks for pending withdrawal requests first
- If there are requests and sufficient idle assets, fulfills them immediately
- If there are insufficient idle assets, withdraws from pools to cover the requests
- After withdrawing from pools, checks again if requests can be fulfilled
- Only deposits idle assets into pools if there are no pending withdrawals to fulfill

### Fulfill Withdrawal Requests

Specifically focus on fulfilling pending withdrawal requests:

```bash
npx hardhat run scripts/fulfill-withdrawal-requests.ts --network hype-mainnet
```

This script:
- Checks for pending withdrawal requests
- Calculates total assets needed for all requests
- Ensures the vault has sufficient idle assets (withdrawing from pools if necessary)
- Marks all pending requests as fulfilled

### Verify Contracts

Prepare contract verification information for manual verification on Hyperliquid block explorer:

```bash
npx hardhat run scripts/verify-contracts.ts --network hype-mainnet
```

This script:
- Extracts deployment information for each contract
- Provides instructions for manual verification on hyperevmscan.io

## Simulation and Testing

### Test Basic Yield Flow

```bash
yarn deploy --tags YieldAllocatorFlow --network hardhat
```

### Test Delayed Withdrawal Scenario

```bash
yarn deploy --tags DelayedWithdrawalFlow --network hardhat
```

### Test Multi-User Deposits and Withdrawals

```bash
yarn deploy --tags MultiUserFlow --network hardhat
```

## Monitoring Yield

To track generated yield from lending pools:

1. Use the `getReserveData` method from the IPool interface:
   ```typescript
   const reserveData = await poolContract.getReserveData(assetAddress);
   const liquidityIndex = reserveData.liquidityIndex;
   const currentLiquidityRate = reserveData.currentLiquidityRate;
   ```

2. Calculate yield by comparing the current liquidityIndex with a previously stored value:
   ```typescript
   // Convert to BigInt for calculation
   const initialIndexBigInt = BigInt(initialLiquidityIndex.toString());
   const currentIndexBigInt = BigInt(currentLiquidityIndex.toString());
   const depositAmountBigInt = BigInt(depositAmount.toString());

   // Calculate yield (assuming 1e27 ray precision)
   const rayPrecision = BigInt(10) ** BigInt(27);
   const yieldRatio = (currentIndexBigInt * rayPrecision) / initialIndexBigInt;
   const generatedYield = ((yieldRatio - rayPrecision) * depositAmountBigInt) / rayPrecision;
   ```

## Operational Best Practices

1. **Regular Monitoring**: Run the check-protocol-status script daily to monitor the health of the protocol.

2. **Liquidity Management**: Maintain sufficient idle assets in the vault to handle expected withdrawals.

3. **Withdrawal Processing**: Process withdrawal requests promptly to ensure good user experience.

4. **Yield Optimization**: Regularly rebalance assets between pools based on yield performance.

5. **Security Checks**: Periodically verify that only whitelisted pools are being used.

6. **Backup Procedures**: Maintain backup procedures for emergency situations.
