# Neura-Vault Protocol Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
   - [Core Components](#core-components)
   - [Contract Interactions](#contract-interactions)
   - [Security Model](#security-model)
3. [Smart Contracts](#smart-contracts)
   - [Neura-Vault](#neura-vault)
   - [AIAgent](#aiagent)
   - [WhitelistRegistry](#whitelistregistry)
4. [Protocol Mechanics](#protocol-mechanics)
   - [Share Price Calculation](#share-price-calculation)
   - [Deposit Process](#deposit-process)
   - [Withdrawal Process](#withdrawal-process)
   - [Yield Generation](#yield-generation)
5. [Deployment and Operation Procedures](#deployment-and-operation-procedures)
   - [Deployment Guide](#deployment-guide)
   - [Post-Deployment Configuration](#post-deployment-configuration)
   - [Automated Operations](#automated-operations)
   - [Kubernetes Deployment](#kubernetes-deployment)
6. [User Guide](#user-guide)
   - [Depositing Assets](#depositing-assets)
   - [Withdrawing Assets](#withdrawing-assets)
   - [Checking Share Price and Balance](#checking-share-price-and-balance)
   - [Monitoring Protocol Status](#monitoring-protocol-status)
   - [Web Interface](#web-interface)
7. [Executor Operations](#executor-operations)
   - [Protocol Status Monitoring](#protocol-status-monitoring)
   - [Idle Asset Management](#idle-asset-management)
   - [Withdrawal Fulfillment](#withdrawal-fulfillment)
   - [Yield Reinvestment](#yield-reinvestment)
   - [Automated Operations](#automated-operations-1)
   - [Emergency Procedures](#emergency-procedures)
8. [Best Practices](#best-practices)
   - [Liquidity Management](#liquidity-management)
   - [Risk Mitigation](#risk-mitigation)
   - [Emergency Procedures](#emergency-procedures-1)
9. [Technical Reference](#technical-reference)
   - [Pyth Oracle Integration](#pyth-oracle-integration)
   - [Contract Addresses](#contract-addresses)
   - [Function Reference](#function-reference)
   - [Event Reference](#event-reference)
   - [Script Reference](#script-reference)
10. [Appendix](#appendix)
    - [Glossary](#glossary)
    - [Frequently Asked Questions](#frequently-asked-questions)

## Introduction

The Neura-Vault protocol is a decentralized yield optimization platform built on the Hyperliquid blockchain (hype-mainnet). It enables users to deposit stablecoin assets (USDe) and earn yield through automated allocation to whitelisted lending pools.

This documentation provides a comprehensive guide to understanding, deploying, and operating the Neura-Vault protocol. It covers the technical architecture, smart contract functionality, deployment procedures, user operations, and best practices for protocol management.

### Key Features

- **ERC-4626 Compliant**: Implements the tokenized vault standard for seamless integration with other DeFi protocols
- **Automated Yield Generation**: Allocates idle assets to whitelisted lending pools to generate yield
- **Secure Withdrawal System**: Implements a queue-based withdrawal system with share escrow to prevent price manipulation
- **Role-Based Access Control**: Enforces strict permission controls for protocol operations
- **Executor Operations**: Provides tools for managing asset allocation, withdrawal fulfillment, and yield reinvestment
- **Automated Workflows**: Includes GitHub Actions and Kubernetes configurations for automated protocol management

### Target Audience

This documentation is intended for:

- **Developers**: Technical details for understanding, deploying, and extending the protocol
- **Users**: Instructions for depositing, withdrawing, and monitoring investments
- **Operators**: Guidelines for managing protocol operations and optimizing yield
- **Auditors**: Information about security considerations and protocol mechanics

## Overview

The Neura-Vault protocol is designed to optimize yield generation for stablecoin assets (USDe) by allocating them across multiple lending pools on the Hyperliquid blockchain. The protocol follows the ERC-4626 tokenized vault standard, providing users with shares that represent their proportional ownership of the underlying assets and generated yield.

### Protocol Goals

1. **Yield Optimization**: Maximize returns by allocating assets across multiple whitelisted lending pools
2. **Capital Efficiency**: Maintain optimal balance between idle assets for liquidity and allocated assets for yield
3. **Security**: Implement robust security measures to protect user funds
4. **Accessibility**: Provide simple interfaces for users to deposit, withdraw, and monitor their investments
5. **Automation**: Reduce operational overhead through automated scripts and workflows

### Key Stakeholders

- **Users**: Deposit assets to earn yield
- **Executors**: Manage protocol operations including asset allocation and withdrawal fulfillment
- **Governors**: Control protocol parameters and whitelist management

## Architecture

The Neura-Vault protocol consists of three main smart contracts that work together to provide a secure and efficient yield optimization platform.

### Core Components

1. **Neura-Vault**: The main contract implementing the ERC-4626 standard. It manages deposits, withdrawals, share issuance, and asset allocation.

2. **AIAgent**: An executor contract that interacts with lending pools to deposit assets, withdraw assets, and reinvest yield.

3. **WhitelistRegistry**: A registry contract that maintains a list of approved lending pools that the protocol can interact with.

### Contract Interactions

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│      Users      │◄────►│   Neura-Vault   │◄────►│   AIAgent      │
│                 │      │                 │      │                 │
└─────────────────┘      └────────┬────────┘      └────────┬────────┘
                                  │                        │
                                  │                        │
                                  ▼                        ▼
                         ┌─────────────────┐      ┌─────────────────┐
                         │                 │      │                 │
                         │  Whitelist     │      │  Lending Pools  │
                         │   Registry     │◄────►│                 │
                         │                 │      │                 │
                         └─────────────────┘      └─────────────────┘
```

- **Users** interact with the Neura-Vault to deposit assets and receive shares, or to withdraw assets by redeeming shares.
- **Neura-Vault** manages user deposits, withdrawals, and share accounting.
- **AIAgent** acts as an executor to interact with lending pools for depositing assets, withdrawing assets, and reinvesting yield.
- **WhitelistRegistry** maintains the list of approved lending pools that the protocol can interact with.
- **Lending Pools** are external protocols where assets are deposited to generate yield.

### Security Model

The protocol implements a robust security model with the following key features:

1. **Role-Based Access Control**:
   - **GOVERNOR_ROLE**: Can update protocol parameters, manage whitelists, and assign roles
   - **EXECUTOR_ROLE**: Can execute operations like asset allocation and withdrawal fulfillment

2. **Share Escrow System**:
   - When users request withdrawals that exceed available idle assets, their shares are placed in escrow
   - This prevents share price manipulation and ensures fair distribution of yield

3. **Whitelisting**:
   - Only approved lending pools can be used for asset allocation
   - Pools must meet security and reliability criteria to be whitelisted

4. **Withdrawal Queue**:
   - Implements a First-In-First-Out (FIFO) queue for withdrawal requests
   - Ensures fair and orderly processing of withdrawals

5. **Emergency Controls**:
   - Ability to pause deposits and withdrawals in emergency situations
   - Procedures for recovering from pool failures or other critical issues

## Smart Contracts

The protocol consists of three main smart contracts that work together to provide a secure and efficient yield optimization platform.

### Neura-Vault

The Neura-Vault is the core contract of the protocol, implementing the ERC-4626 tokenized vault standard. It manages user deposits, withdrawals, share issuance, and asset allocation.

**Key Features:**

- **ERC-4626 Compliance**: Implements the standard interface for tokenized vaults
- **Asset Management**: Tracks idle assets and assets allocated to lending pools
- **Share Accounting**: Issues and redeems shares representing ownership of the vault
- **Withdrawal Queue**: Manages withdrawal requests when idle assets are insufficient
- **Share Escrow**: Holds shares in escrow during pending withdrawal requests

**Key Functions:**

- `deposit(uint256 assets, address receiver)`: Deposits assets and issues shares to the receiver
- `withdraw(uint256 assets, address receiver, address owner)`: Withdraws assets to the receiver by burning shares from the owner
- `redeem(uint256 shares, address receiver, address owner)`: Redeems shares for assets and sends them to the receiver
- `requestWithdrawal(uint256 shares)`: Places a withdrawal request in the queue when idle assets are insufficient
- `fulfillWithdrawalRequests(uint256 maxRequestsToFulfill)`: Fulfills pending withdrawal requests in FIFO order
- `claimWithdrawal()`: Allows users to claim fulfilled withdrawal requests
- `depositToPool(address pool, uint256 amount)`: Deposits idle assets to a whitelisted lending pool
- `withdrawFromPool(address pool, uint256 amount)`: Withdraws assets from a lending pool back to the vault

### AIAgent

The AIAgent contract acts as an executor for the Neura-Vault, providing functionality to interact with lending pools for depositing assets, withdrawing assets, and reinvesting yield.

**Key Features:**

- **Pool Interaction**: Interfaces with lending pools to deposit and withdraw assets
- **Yield Reinvestment**: Calculates and reinvests yield generated from lending pools
- **Role-Based Access**: Restricts operations to authorized executors

**Key Functions:**

- `depositToPool(address pool, uint256 amount)`: Instructs the vault to deposit assets to a pool
- `withdrawFromPool(address pool, uint256 amount)`: Instructs the vault to withdraw assets from a pool
- `fulfillWithdrawalRequests(uint256 maxRequestsToFulfill)`: Fulfills pending withdrawal requests
- `calculateAndReinvestYield()`: Calculates yield and reinvests it into lending pools

### WhitelistRegistry

The WhitelistRegistry contract maintains a list of approved lending pools that the protocol can interact with. It provides functions to add and remove pools from the whitelist.

**Key Features:**

- **Whitelist Management**: Maintains a list of approved lending pools
- **Governance Control**: Restricts whitelist modifications to governance role
- **Pool Validation**: Provides functions to check if a pool is whitelisted

**Key Functions:**

- `addToWhitelist(address pool)`: Adds a pool to the whitelist
- `removeFromWhitelist(address pool)`: Removes a pool from the whitelist
- `isWhitelisted(address pool)`: Checks if a pool is whitelisted
- `getWhitelist()`: Returns the list of all whitelisted pools

## Protocol Mechanics

### Share Price Calculation

The Neura-Vault follows the ERC-4626 standard for calculating share price, which determines the relationship between vault shares and underlying assets.

**Asset-to-Share Conversion:**

When a user deposits assets, the number of shares they receive is calculated as:

```
shares = assets * totalSupply / totalAssets
```

If `totalSupply` is zero (first deposit), then:

```
shares = assets
```

**Share-to-Asset Conversion:**

When a user redeems shares, the number of assets they receive is calculated as:

```
assets = shares * totalAssets / totalSupply
```

**Example:**

1. Initial state: `totalAssets = 1000 USDe`, `totalSupply = 1000 shares`
2. User deposits 100 USDe
3. Shares received: `100 * 1000 / 1000 = 100 shares`
4. New state: `totalAssets = 1100 USDe`, `totalSupply = 1100 shares`
5. Yield generated: 50 USDe (from lending pools)
6. New state: `totalAssets = 1150 USDe`, `totalSupply = 1100 shares`
7. Share price: `1150 / 1100 = 1.045 USDe per share`
8. User redeems 100 shares
9. Assets received: `100 * 1150 / 1100 = 104.5 USDe`

This mechanism ensures that yield is automatically distributed to all share holders proportionally to their ownership.

### Deposit Process

The deposit process in the Neura-Vault follows the standard ERC-4626 pattern:

1. User calls `deposit(assets, receiver)` function with the amount of assets to deposit
2. Contract calculates the number of shares to mint based on the current share price
3. Assets are transferred from the user to the vault
4. Shares are minted to the specified receiver
5. Idle assets in the vault increase
6. Executor can later allocate idle assets to whitelisted lending pools

### Withdrawal Process

The Neura-Vault implements two withdrawal paths depending on the availability of idle assets:

**Immediate Withdrawal:**

If the vault has sufficient idle assets to cover the withdrawal:

1. User calls `withdraw(assets, receiver, owner)` or `redeem(shares, receiver, owner)`
2. Contract calculates the number of shares to burn or assets to return
3. Shares are burned from the owner
4. Assets are transferred from the vault to the receiver
5. Idle assets in the vault decrease

**Queued Withdrawal:**

If the vault does not have sufficient idle assets to cover the withdrawal:

1. User calls `withdraw(assets, receiver, owner)` or `redeem(shares, receiver, owner)`
2. Contract determines that idle assets are insufficient
3. Contract creates a withdrawal request and places it in the queue
4. Shares are transferred from the owner to the vault's escrow
5. User receives a withdrawal request ID

**Withdrawal Fulfillment:**

1. Executor calls `fulfillWithdrawalRequests(maxRequestsToFulfill)`
2. Contract processes withdrawal requests in FIFO order
3. If necessary, assets are withdrawn from lending pools to cover the requests
4. Escrowed shares are burned
5. Assets are made available for claiming

**Withdrawal Claiming:**

1. User calls `claimWithdrawal()`
2. Contract verifies that the user has a fulfilled withdrawal request
3. Assets are transferred from the vault to the user
4. Withdrawal request is marked as claimed

This two-phase withdrawal process ensures that the protocol can maintain optimal capital efficiency while still providing liquidity to users.

### Yield Generation

The Neura-Vault generates yield by allocating assets to whitelisted lending pools. The yield generation process involves several steps:

**Asset Allocation:**

1. Executor monitors idle assets in the vault
2. When idle assets exceed the required buffer for withdrawals, the executor allocates excess assets to lending pools
3. Assets are deposited into lending pools through the `depositToPool(pool, amount)` function
4. Lending pools generate yield over time through lending activities

**Yield Accounting:**

1. The vault tracks the principal amount deposited to each pool using the `poolPrincipal` mapping
2. Total assets are calculated as the sum of idle assets plus the current balance in all lending pools
3. Yield is implicitly calculated as the difference between total assets and total principal

**Yield Distribution:**

1. Yield is automatically reflected in the share price calculation
2. As total assets increase while total supply remains constant, the share price increases
3. When users redeem shares, they receive their proportional share of the yield

**Yield Reinvestment:**

1. Executor periodically calls the `calculateAndReinvestYield()` function
2. Function calculates the yield generated by each pool
3. Yield is withdrawn from the pools and reinvested according to the current allocation strategy
4. This compound interest approach maximizes returns for users

## Deployment and Operation Procedures

### Deployment Guide

This section provides step-by-step instructions for deploying the Neura-Vault protocol to the Hyperliquid blockchain (hype-mainnet).

**Prerequisites:**

1. Node.js (v18+) and Yarn installed
2. Access to a wallet with hype-mainnet ETH for gas fees
3. Private key for deployment wallet

**Environment Setup:**

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/neura-vault.git
   cd neura-vault
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Create a `.env` file with the following variables:
   ```
   PRIVATE_KEY=your_private_key_here
   EXECUTOR_PRIVATE_KEY=executor_private_key_here
   GOVERNOR_ADDRESS=governor_address_here
   ```

**Contract Compilation:**

1. Compile the contracts:
   ```bash
   cd packages/hardhat
   yarn compile
   ```

**Deployment:**

1. Deploy the contracts to hype-mainnet:
   ```bash
   yarn deploy --network hype-mainnet
   ```

   This will deploy the following contracts:
   - WhitelistRegistry
   - Neura-Vault
   - AIAgent

2. The deployment script will automatically:
   - Set up the initial configuration
   - Link the contracts together
   - Whitelist the initial lending pools

**Contract Verification:**

After deployment, verify the contracts on hyperevmscan.io:

1. Get the contract addresses from the deployment output or from the `deployments/hype-mainnet/` directory

2. Manually verify each contract on hyperevmscan.io by uploading the source code and ABI

### Post-Deployment Configuration

After deploying the contracts, you need to perform several configuration steps to ensure the protocol operates correctly.

**Role Assignment:**

1. Assign the EXECUTOR role to the executor wallet:
   ```bash
   yarn deploy --tags AssignExecutorRole --network hype-mainnet
   ```

2. Assign the GOVERNOR role to the governance wallet (if different from deployer):
   ```bash
   yarn deploy --tags AssignGovernorRole --network hype-mainnet
   ```

**Whitelist Management:**

1. Add lending pools to the whitelist:
   ```bash
   yarn deploy --tags AddToWhitelist --network hype-mainnet
   ```

2. The current whitelisted pools are:
   - Hyperrfi USDe Pool: `0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b`
   - Hyperlend USDe Pool: `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b`

### Automated Operations

The protocol includes several automated operations that can be run as scheduled tasks using GitHub Actions or Kubernetes CronJobs.

**GitHub Actions Setup:**

1. The repository includes two GitHub Actions workflows:
   - `fulfill-withdrawals.yaml`: Runs every 5 minutes to check and fulfill withdrawal requests
   - `allocate-assets.yaml`: Can be scheduled to allocate idle assets to lending pools

2. Configure the GitHub repository secrets:
   ```
   EXECUTOR_PRIVATE_KEY=executor_private_key_here
   YIELD_ALLOCATOR_VAULT_ADDRESS=vault_address_here
   AI_AGENT_ADDRESS=ai_agent_address_here
   WHITELIST_REGISTRY_ADDRESS=whitelist_registry_address_here
   ```

3. The workflows will automatically run according to their schedules or can be triggered manually from the GitHub Actions tab.

### Kubernetes Deployment

For more robust automation, the protocol can be deployed as Kubernetes CronJobs.

**Kubernetes Setup:**

1. Create a Kubernetes secret with the required environment variables:
   ```bash
   kubectl create secret generic yield-allocator-secrets \
     --from-literal=EXECUTOR_PRIVATE_KEY=executor_private_key_here \
     --from-literal=YIELD_ALLOCATOR_VAULT_ADDRESS=vault_address_here \
     --from-literal=AI_AGENT_ADDRESS=ai_agent_address_here \
     --from-literal=WHITELIST_REGISTRY_ADDRESS=whitelist_registry_address_here
   ```

2. Create a ConfigMap from the source code directory:
   ```bash
   kubectl create configmap yield-allocator-scripts --from-file=./packages/hardhat/scripts
   ```

3. Apply the CronJob configuration:
   ```bash
   kubectl apply -f kubernetes/cron-job.yaml
   ```

4. The CronJob will run hourly to check and deposit idle assets, and fulfill withdrawal requests.

## User Guide

This section provides instructions for users to interact with the Neura-Vault protocol.

### Depositing Assets

Users can deposit USDe assets into the vault using either the provided scripts or by directly interacting with the contract.

**Using Scripts:**

1. Set up your environment:
   ```bash
   cd packages/hardhat
   cp .env.example .env
   ```

2. Edit the `.env` file to include your private key and the contract addresses:
   ```
   PRIVATE_KEY=your_private_key_here
   YIELD_ALLOCATOR_VAULT_ADDRESS=vault_address_here
   ```

3. Run the deposit script:
   ```bash
   yarn deploy --tags UserDeposit --network hype-mainnet
   ```

4. Follow the prompts to specify the amount to deposit.

**Direct Contract Interaction:**

1. Approve the Neura-Vault contract to spend your USDe tokens:
   ```solidity
   // Using ethers.js v6
   const usdeContract = await ethers.getContractAt("IERC20", usdeAddress);
   await usdeContract.approve(vaultAddress, amountToDeposit);
   ```

2. Call the deposit function on the Neura-Vault contract:
   ```solidity
   const vaultContract = await ethers.getContractAt("Neura-Vault", vaultAddress);
   await vaultContract.deposit(amountToDeposit, receiverAddress);
   ```

### Withdrawing Assets

The withdrawal process depends on the availability of idle assets in the vault.

**Using Scripts:**

1. To request a withdrawal:
   ```bash
   yarn deploy --tags UserWithdraw --network hype-mainnet
   ```

2. To check and claim a fulfilled withdrawal:
   ```bash
   yarn deploy --tags ClaimWithdrawal --network hype-mainnet
   ```

**Direct Contract Interaction:**

1. For immediate withdrawals (if idle assets are sufficient):
   ```solidity
   const vaultContract = await ethers.getContractAt("Neura-Vault", vaultAddress);
   await vaultContract.withdraw(assetsToWithdraw, receiverAddress, ownerAddress);
   ```

2. For queued withdrawals (if idle assets are insufficient):
   ```solidity
   // First, approve the vault to transfer your shares to escrow
   const vaultContract = await ethers.getContractAt("Neura-Vault", vaultAddress);
   await vaultContract.approve(vaultAddress, sharesToRedeem);
   
   // Then request the withdrawal
   await vaultContract.requestWithdrawal(sharesToRedeem);
   ```

3. To check if your withdrawal has been fulfilled:
   ```solidity
   const withdrawalRequest = await vaultContract.withdrawalRequests(userAddress);
   const isFulfilled = withdrawalRequest.fulfilled;
   ```

4. To claim a fulfilled withdrawal:
   ```solidity
   await vaultContract.claimWithdrawal();
   ```

### Checking Share Price and Balance

Users can check their share balance, asset balance, and the current share price.

**Using Scripts:**

```bash
cd packages/hardhat
yarn deploy --tags CheckBalance --network hype-mainnet
```

**Direct Contract Interaction:**

1. To check your share balance:
   ```solidity
   const vaultContract = await ethers.getContractAt("Neura-Vault", vaultAddress);
   const shareBalance = await vaultContract.balanceOf(userAddress);
   ```

2. To check the asset value of your shares:
   ```solidity
   const assetValue = await vaultContract.convertToAssets(shareBalance);
   ```

3. To check the current share price:
   ```solidity
   const totalAssets = await vaultContract.totalAssets();
   const totalSupply = await vaultContract.totalSupply();
   const sharePrice = totalAssets / totalSupply;
   ```

### Monitoring Protocol Status

Users can monitor the overall status of the protocol using the provided scripts.

```bash
cd packages/hardhat
yarn hardhat run scripts/check-protocol-status.ts --network hype-mainnet
```

This will display information about:
- Total assets in the vault
- Idle assets
- Assets allocated to each pool
- Current share price
- Pending withdrawal requests

### Web Interface

A web interface is available for users to interact with the protocol in a more user-friendly way.

1. Access the web interface at: `https://yield-allocator.example.com`

2. Connect your wallet using the "Connect Wallet" button

3. Use the interface to:
   - Deposit assets
   - Withdraw assets
   - Check your balance and share price
   - Monitor protocol status
   - View historical performance

## Executor Operations

This section provides detailed instructions for protocol executors who are responsible for managing the Neura-Vault's operations.

### Executor Role Assignment

Before performing any executor operations, ensure that your wallet has been granted the EXECUTOR role on both the Neura-Vault and AIAgent contracts.

1. Check if your address has the EXECUTOR role:
   ```bash
   cd packages/hardhat
   yarn hardhat run scripts/check-executor-role.ts --network hype-mainnet
   ```

2. If you don't have the role, request it from the protocol governor:
   ```bash
   # To be run by the governor
   yarn deploy --tags AssignExecutorRole --network hype-mainnet
   ```

### Depositing Idle Assets to Pools

One of the primary responsibilities of the executor is to allocate idle assets in the vault to whitelisted lending pools to generate yield.

**Using Scripts:**

1. Set up your environment:
   ```bash
   cd packages/hardhat
   cp .env.example .env
   ```

2. Edit the `.env` file to include your executor private key and the contract addresses:
   ```
   EXECUTOR_PRIVATE_KEY=your_executor_private_key_here
   YIELD_ALLOCATOR_VAULT_ADDRESS=vault_address_here
   AI_AGENT_ADDRESS=ai_agent_address_here
   WHITELIST_REGISTRY_ADDRESS=whitelist_registry_address_here
   ```

3. Run the check-and-deposit-idle-assets script:
   ```bash
   yarn hardhat run scripts/check-and-deposit-idle-assets.ts --network hype-mainnet
   ```

   This script will:
   - Check for pending withdrawal requests
   - If there are requests, ensure there are sufficient idle assets to fulfill them
   - If there are excess idle assets, deposit them into whitelisted pools

**Direct Contract Interaction:**

1. To deposit idle assets to a specific pool:
   ```solidity
   const aiAgentContract = await ethers.getContractAt("AIAgent", aiAgentAddress);
   await aiAgentContract.depositToPool(poolAddress, amountToDeposit);
   ```

### Fulfilling Withdrawal Requests

Executors are responsible for fulfilling withdrawal requests when users want to withdraw assets from the vault.

**Using Scripts:**

1. Run the fulfill-pending-withdrawals script:
   ```bash
   yarn hardhat run scripts/fulfill-pending-withdrawals.ts --network hype-mainnet
   ```

   This script will:
   - Check for pending withdrawal requests
   - Calculate the total assets needed to fulfill the requests
   - If necessary, withdraw assets from pools to cover the shortfall
   - Call the fulfillWithdrawalRequests function on the vault

**Direct Contract Interaction:**

1. To fulfill withdrawal requests manually:
   ```solidity
   const vaultContract = await ethers.getContractAt("Neura-Vault", vaultAddress);
   await vaultContract.fulfillWithdrawalRequests(maxRequestsToFulfill);
   ```

2. If you need to withdraw from pools first:
   ```solidity
   const aiAgentContract = await ethers.getContractAt("AIAgent", aiAgentAddress);
   await aiAgentContract.withdrawFromPool(poolAddress, amountToWithdraw);
   ```

### Calculating and Reinvesting Yield

Executors should periodically calculate and reinvest yield to maximize returns for users.

**Using Scripts:**

1. Run the calculate-and-reinvest-yield script:
   ```bash
   yarn hardhat run scripts/calculate-and-reinvest-yield.ts --network hype-mainnet
   ```

   This script will:
   - Calculate the total yield generated by the protocol
   - Withdraw a portion of the yield from each pool
   - Reinvest the yield according to the current allocation strategy

**Direct Contract Interaction:**

1. To calculate and reinvest yield manually:
   ```solidity
   const aiAgentContract = await ethers.getContractAt("AIAgent", aiAgentAddress);
   
   // First, withdraw yield from pools
   for (const pool of whitelistedPools) {
     const yieldAmount = calculateYieldForPool(pool);
     await aiAgentContract.withdrawFromPool(pool, yieldAmount);
   }
   
   // Then, reinvest the yield
   for (const pool of targetPools) {
     await aiAgentContract.depositToPool(pool, amountToDeposit);
   }
   ```

### Monitoring Protocol Health

Executors should regularly monitor the health of the protocol to ensure it's operating correctly.

**Using Scripts:**

1. Run the check-protocol-status script:
   ```bash
   yarn hardhat run scripts/check-protocol-status.ts --network hype-mainnet
   ```

   This script will display comprehensive information about:
   - Total assets in the vault
   - Idle assets
   - Assets allocated to each pool
   - Current share price
   - Pending withdrawal requests
   - Historical yield performance

### Automated Operations

Many executor operations can be automated using GitHub Actions or Kubernetes CronJobs as described in the Deployment and Operation Procedures section.

1. GitHub Actions workflows:
   - `fulfill-withdrawals.yaml`: Runs every 5 minutes
   - `allocate-assets.yaml`: Can be scheduled as needed

2. Kubernetes CronJobs:
   - Hourly job to check and deposit idle assets
   - Daily job to fulfill withdrawal requests

These automated operations ensure that the protocol runs efficiently without requiring constant manual intervention.

## Best Practices

This section outlines best practices for operating and interacting with the Neura-Vault protocol.

### For Users

**Deposit Strategies:**

1. **Dollar-Cost Averaging**: Consider making regular, smaller deposits rather than a single large deposit to average out share price fluctuations.

2. **Monitor Share Price**: Check the share price trend before making large deposits to optimize entry points.

3. **Gas Optimization**: Batch multiple small deposits into a single larger deposit to save on gas costs.

**Withdrawal Strategies:**

1. **Plan Ahead**: If you anticipate needing to withdraw a large amount, submit your withdrawal request well in advance to ensure it can be fulfilled in a timely manner.

2. **Check Idle Assets**: Before requesting a withdrawal, check the vault's idle assets to determine if your withdrawal is likely to be processed immediately or queued.

3. **Partial Withdrawals**: Consider making partial withdrawals over time rather than a single large withdrawal to minimize impact on the protocol and potentially avoid queuing.

**Security Practices:**

1. **Verify Contracts**: Always verify the contract addresses before interacting with the protocol.

2. **Start Small**: When first using the protocol, start with a small amount to ensure everything works as expected.

3. **Check Approvals**: Be mindful of the token approvals you grant and revoke unnecessary approvals when they're no longer needed.

### For Executors

**Operational Efficiency:**

1. **Regular Monitoring**: Check the protocol status at least daily to ensure it's operating correctly.

2. **Maintain Sufficient Idle Assets**: Keep enough idle assets in the vault to handle expected withdrawal requests without having to withdraw from pools frequently.

3. **Optimize Pool Allocation**: Distribute assets across whitelisted pools based on their yield performance and risk profile.

**Risk Management:**

1. **Diversification**: Avoid allocating too many assets to a single pool to minimize concentration risk.

2. **Withdrawal Testing**: Regularly test the withdrawal process to ensure it works correctly.

3. **Monitor Pool Health**: Keep track of the health and performance of whitelisted pools to identify any potential issues early.

**Automation Best Practices:**

1. **Redundancy**: Set up multiple automation methods (e.g., both GitHub Actions and Kubernetes CronJobs) to ensure critical operations continue even if one system fails.

2. **Alerting**: Implement alerts for critical events such as failed transactions or large withdrawal requests.

3. **Transaction Monitoring**: Regularly check that automated transactions are being executed successfully.

### For Governors

**Protocol Management:**

1. **Careful Pool Selection**: Thoroughly vet lending pools before adding them to the whitelist, considering factors such as security, yield, and liquidity.

2. **Regular Audits**: Schedule regular audits of the protocol and its operations to identify and address potential issues.

3. **Transparent Communication**: Maintain clear communication with users about protocol changes, performance, and any incidents.

**Parameter Optimization:**

1. **Yield Strategy**: Regularly review and optimize the yield generation and reinvestment strategy based on market conditions.

2. **Buffer Size**: Adjust the idle asset buffer based on withdrawal patterns and market volatility.

3. **Fee Structure**: If fees are implemented, ensure they are competitive and sustainable for long-term protocol health.

## Technical Reference

This section provides detailed technical information about the Neura-Vault protocol for developers and auditors.

### Pyth Oracle Integration

The Neura-Vault protocol integrates with the Pyth Oracle to obtain accurate price data for assets, enabling precise USD valuation of the vault's holdings.

**Key Features:**

1. **Real-time Price Data**: Obtains up-to-date price information for assets from Pyth's decentralized oracle network
2. **Price Feed Configuration**: Supports configuration of price feed IDs for different assets
3. **AUM Calculation**: Uses price data to calculate Assets Under Management (AUM) in USD
4. **Confidence Intervals**: Provides confidence metrics for price data reliability
5. **Stale Price Protection**: Includes maximum age parameters to prevent using outdated price data

**Integration Components:**

```solidity
// Pyth Oracle interface
interface IPyth {
    struct Price {
        int64 price;      // Price value with 8 decimals
        uint64 conf;      // Confidence interval with 8 decimals
        int32 expo;       // Price exponent
        uint64 publishTime; // Unix timestamp of the publication time
    }
    
    function getPriceNoOlderThan(bytes32 priceId, uint256 maxAge) external view returns (Price memory price);
}
```

**Vault Functions for Pyth Integration:**

```solidity
// Set the Pyth oracle address
function setPythAddress(IPyth _pyth) external onlyRole(DEFAULT_ADMIN_ROLE);

// Set the price ID for a specific asset
function setPriceIdForAsset(address asset, bytes32 priceId) external onlyRole(DEFAULT_ADMIN_ROLE);

// Check if a price ID is set for an asset
function hasAssetPriceId(address asset) external view returns (bool);

// Get the latest USD price for a specific asset
function getAssetPriceUsd(address asset, uint256 maxPriceAge) external view returns (
    uint256 priceUsd_1e18,
    uint64 publishTime,
    uint256 confidence_1e18
);

// Calculate total AUM in USD
function totalAumUsd(uint256 maxPriceAge) external view returns (uint256);
```

**Configuration Process:**

1. Set the Pyth oracle address using `setPythAddress`
2. Configure price feed IDs for each asset using `setPriceIdForAsset`
3. Use `getAssetPriceUsd` to retrieve the latest price data
4. Use `totalAumUsd` to get the total value of all assets in USD

**Usage Example:**

```typescript
// Configure Pyth oracle
const pythOracleAddress = "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc";
const assetAddress = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"; // USDe
const priceId = "0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d";

// Set Pyth oracle address
await yieldAllocatorVault.setPythAddress(pythOracleAddress);

// Set price ID for asset
await yieldAllocatorVault.setPriceIdForAsset(assetAddress, priceId);

// Get latest price
const maxPriceAge = 86400; // 24 hours
const [priceUsd, publishTime, confidence] = await yieldAllocatorVault.getAssetPriceUsd(assetAddress, maxPriceAge);

// Get total AUM in USD
const totalAumUsd = await yieldAllocatorVault.totalAumUsd(maxPriceAge);
```

**Monitoring Tools:**

The protocol includes a script to monitor Pyth oracle integration:

```bash
yarn hardhat run scripts/check-protocol-status.ts --network hype-mainnet
```

This displays information about:
- Pyth oracle configuration
- Price feed IDs for assets
- Latest price data with confidence intervals
- Total AUM in USD

### Contract Interfaces

**Neura-Vault Interface:

```solidity
interface INeuraVault is IERC4626 {
    // Withdrawal request functions
    function requestWithdrawal(uint256 shares) external;
    function claimWithdrawal() external returns (uint256);
    function fulfillWithdrawalRequests(uint256 maxRequestsToFulfill) external;
    
    // Pool management functions
    function depositToPool(address pool, uint256 amount) external;
    function withdrawFromPool(address pool, uint256 amount) external returns (uint256);
    
    // View functions
    function getWithdrawalRequest(address owner) external view returns (
        uint256 shares,
        uint256 assetsAtRequest,
        bool fulfilled,
        uint256 requestTime
    );
    function getIdleAssets() external view returns (uint256);
    function getPendingWithdrawers() external view returns (address[] memory);
}
```

**AIAgent Interface:**

```solidity
interface IAIAgent {
    function depositToPool(address pool, uint256 amount) external;
    function withdrawFromPool(address pool, uint256 amount) external returns (uint256);
    function calculateAndReinvestYield() external;
}
```

**WhitelistRegistry Interface:**

```solidity
interface IWhitelistRegistry {
    function addToWhitelist(address pool) external;
    function removeFromWhitelist(address pool) external;
    function isWhitelisted(address pool) external view returns (bool);
    function getWhitelist() external view returns (address[] memory);
}
```

### Events

**Neura-Vault Events:**

```solidity
event WithdrawalRequested(address indexed owner, uint256 shares, uint256 assetsAtRequest);
event WithdrawalFulfilled(address indexed owner, uint256 shares, uint256 assets);
event WithdrawalClaimed(address indexed owner, uint256 assets);
event PoolDeposit(address indexed pool, uint256 amount);
event PoolWithdrawal(address indexed pool, uint256 requestedAmount, uint256 receivedAmount);
```

**AIAgent Events:**

```solidity
event YieldCalculated(uint256 totalYield);
event YieldReinvested(address indexed pool, uint256 amount);
```

**WhitelistRegistry Events:**

```solidity
event PoolAdded(address indexed pool);
event PoolRemoved(address indexed pool);
```

### Error Codes

```solidity
// Neura-Vault errors
error InsufficientIdleAssets(uint256 requested, uint256 available);
error WithdrawalRequestNotFound();
error WithdrawalRequestNotFulfilled();
error WithdrawalAlreadyRequested();
error PoolNotWhitelisted(address pool);

// AIAgent errors
error OnlyExecutor();
error FailedToWithdraw(address pool, uint256 amount);

// WhitelistRegistry errors
error OnlyGovernor();
error PoolAlreadyWhitelisted(address pool);
error PoolNotWhitelisted(address pool);
```

### Access Control

The protocol uses OpenZeppelin's AccessControl for role-based permissions:

```solidity
bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
```

**Role Permissions:**

1. **DEFAULT_ADMIN_ROLE**: Can grant and revoke all roles
   - Typically assigned to the deployer initially
   - Should be transferred to a secure multisig wallet after deployment

2. **GOVERNOR_ROLE**: Can modify protocol parameters and whitelist
   - Can add/remove pools from the whitelist
   - Can update protocol parameters
   - Can grant/revoke EXECUTOR_ROLE

3. **EXECUTOR_ROLE**: Can perform operational tasks
   - Can deposit idle assets to pools
   - Can withdraw assets from pools
   - Can fulfill withdrawal requests
   - Can calculate and reinvest yield

### Pool Interface Requirements

Whitelisted pools must conform to the following interface requirements:

1. **Deposit Function**: Must accept deposits of the underlying asset
   ```solidity
   function deposit(uint256 amount) external returns (uint256); // Returns aToken amount
   ```
   or
   ```solidity
   function deposit(uint256 amount, address onBehalfOf) external;
   ```

2. **Withdrawal Function**: Must allow withdrawals of the underlying asset
   ```solidity
   function withdraw(uint256 amount) external returns (uint256); // Returns actual withdrawn amount
   ```
   or
   ```solidity
   function withdraw(uint256 amount, address to) external returns (uint256);
   ```

3. **Balance Function**: Must provide a way to check the current balance
   ```solidity
   function balanceOf(address account) external view returns (uint256);
   ```

### Gas Optimization

The protocol includes several gas optimization techniques:

1. **Storage Packing**: Related variables are packed into the same storage slot when possible

2. **Minimal Storage Updates**: State variables are updated only when necessary

3. **Batch Processing**: Withdrawal requests can be fulfilled in batches

4. **Efficient Loops**: Loops are designed to minimize gas usage

5. **View Functions**: Complex calculations are performed in view functions when possible

### Security Considerations

1. **Reentrancy Protection**: All state-changing functions use OpenZeppelin's ReentrancyGuard

2. **Input Validation**: All function inputs are validated before use

3. **Access Control**: Sensitive functions are protected by role-based access control

4. **Safe Math**: The contract uses Solidity 0.8.x's built-in overflow/underflow protection

5. **Pull over Push**: The withdrawal process follows the pull pattern for security

### Appendix

**Contract Addresses:**

- Neura-Vault: `0x3c297523DE2aF8210368b09c24aAD823718a2baA`
- AIAgent: `0xd52d7a54Bb0CE313c316D46a6Eafc79b2C52E8B9`
- WhitelistRegistry: `0x9dB8a2C1aD1554eF15e9036cc695aBaa096609B6`
- USDe Token: `0xc2a4c5a8b8ab5d2b6a9a8a14e9e0b2e9572446d2`

**Whitelisted Pools:**

- Hyperrfi USDe Pool: `0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b`
- Hyperlend USDe Pool: `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b`

**Useful Links:**

- GitHub Repository: [https://github.com/your-org/neura-vault](https://github.com/your-org/neura-vault)
- Documentation: [https://docs.yield-allocator.example.com](https://docs.yield-allocator.example.com)
- Web Interface: [https://yield-allocator.example.com](https://yield-allocator.example.com)
- Block Explorer: [https://hyperevmscan.io](https://hyperevmscan.io)