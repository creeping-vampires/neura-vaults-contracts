import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { parseUnits } from "ethers";
dotenv.config();
import poolsConfig from "./pools.json";

/**
 * Script to withdraw assets from one pool and deposit them into another pool
 * This script:
 * 1. Connects to contracts using a specific wallet (via private key)
 * 2. Withdraws a specified amount from the source pool (Felix USDe Pool)
 * 3. Deposits the withdrawn amount to the target pool (Hyperrfi USDe Pool)
 * 
 * Usage:
 * AMOUNT=1.5 npx hardhat run scripts/rebalance-pools.ts --network hype-mainnet
 * PERCENTAGE=50 npx hardhat run scripts/rebalance-pools.ts --network hype-mainnet
 * 
 * Environment variables:
 * - YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract
 * - WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract
 * - AI_AGENT_ADDRESS: Address of the AIAgent contract
 * - EXECUTOR_PRIVATE_KEY: Private key for the executor wallet
 * - AMOUNT: Amount to withdraw and deposit (in token units, e.g., 1.5)
 * - PERCENTAGE: Alternative to AMOUNT, percentage of source pool to withdraw (e.g., 50 for 50%)
 * - GAS_LIMIT: Optional gas limit for transactions (default: auto)
 * - GAS_PRICE: Optional gas price in gwei (default: auto)
 * - FELIX_ETH_VALUE: Optional ETH value to send with Felix pool withdrawals (default: 0.6)
 */

// Define interfaces for contract interactions
interface YieldAllocatorVaultInterface {
  EXECUTOR(): Promise<string>;
  hasRole(role: string, address: string): Promise<boolean>;
  asset(): Promise<string>;
  withdrawFromPool(pool: string, amount: bigint, options?: any): Promise<any>;
  transferToPool(pool: string, amount: bigint, options?: any): Promise<any>;
  poolPrincipal(pool: string): Promise<bigint>;
  totalAssets(): Promise<bigint>;
}

interface AIAgentInterface {
  EXECUTOR(): Promise<string>;
  hasRole(role: string, address: string): Promise<boolean>;
  withdrawFromPool(pool: string, amount: bigint, options?: any): Promise<any>;
  depositToPool(pool: string, amount: bigint, options?: any): Promise<any>;
  withdrawSharesFromPool?(pool: string, shares: bigint, options?: any): Promise<any>;
}

interface WhitelistRegistryInterface {
  getWhitelistedPools(): Promise<string[]>;
  getPoolKind(pool: string): Promise<number>;
  isWhitelisted(pool: string): Promise<boolean>;
}

interface IERC4626Like {
  asset(): Promise<string>;
  balanceOf(account: string): Promise<bigint>;
  convertToAssets(shares: bigint): Promise<bigint>;
  deposit(assets: bigint, receiver: string): Promise<bigint>;
  withdraw(assets: bigint, receiver: string, owner: string): Promise<bigint>;
  totalAssets(): Promise<bigint>;
  totalSupply(): Promise<bigint>;
  previewWithdraw(assets: bigint): Promise<bigint>;
  previewRedeem(shares: bigint): Promise<bigint>;
}

const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS;
const WHITELIST_REGISTRY_ADDRESS = process.env.WHITELIST_REGISTRY_ADDRESS;
const AI_AGENT_ADDRESS = process.env.AI_AGENT_ADDRESS;

// Hardcoded pool addresses
const SOURCE_POOL_ADDRESS = "0x835FEBF893c6DdDee5CF762B0f8e31C5B06938ab"; // Felix USDe Pool
const SOURCE_POOL_NAME = "Felix USDe Pool";
const SOURCE_POOL_KIND = "ERC4626";

const TARGET_POOL_ADDRESS = "0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b"; // Hyperrfi USDe Pool
const TARGET_POOL_NAME = "Hyperrfi USDe Pool";
const TARGET_POOL_KIND = "AAVE";

// Helper function to check if a pool is a Felix pool
function isFelixPool(poolAddress: string): boolean {
  return poolAddress.toLowerCase() === SOURCE_POOL_ADDRESS.toLowerCase();
}

async function main() {
  const network = process.env.HARDHAT_NETWORK || "hype-mainnet";
  console.log(`Rebalancing pools on network: ${network}`);

  // Check required environment variables
  if (!YIELD_ALLOCATOR_VAULT_ADDRESS || !WHITELIST_REGISTRY_ADDRESS || !AI_AGENT_ADDRESS) {
    console.error("Error: Required environment variables not set");
    console.log("Please set the following environment variables:");
    console.log("- YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract");
    console.log("- WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract");
    console.log("- AI_AGENT_ADDRESS: Address of the AIAgent contract");
    return;
  }

  // Using hardcoded source and target pools
  console.log(`Source pool: ${SOURCE_POOL_NAME} (${SOURCE_POOL_ADDRESS})`);
  console.log(`Target pool: ${TARGET_POOL_NAME} (${TARGET_POOL_ADDRESS})`);


  // Get amount or percentage from environment
  const amountStr = process.env.AMOUNT;
  const percentageStr = '100'//process.env.PERCENTAGE;
  
  if (!amountStr && !percentageStr) {
    console.error("Error: Either AMOUNT or PERCENTAGE environment variable must be set");
    console.log("Example with amount: AMOUNT=1.5 npx hardhat run scripts/rebalance-pools.ts --network hype-mainnet");
    console.log("Example with percentage: PERCENTAGE=50 npx hardhat run scripts/rebalance-pools.ts --network hype-mainnet");
    return;
  }

  // Get gas options from environment
  const gasLimit = process.env.GAS_LIMIT ? BigInt(process.env.GAS_LIMIT) : undefined;
  const gasPriceGwei = process.env.GAS_PRICE;
  const gasPrice = gasPriceGwei ? parseUnits(gasPriceGwei, "gwei") : undefined;

  // Get executor private key from environment
  const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!executorPrivateKey) {
    console.error("Error: EXECUTOR_PRIVATE_KEY environment variable not set");
    return;
  }

  // Create executor wallet
  const provider = ethers.provider;
  const executorWallet = new ethers.Wallet(executorPrivateKey, provider);
  console.log("Executor account:", await executorWallet.getAddress());

  // Check executor wallet balance
  const executorBalance = await provider.getBalance(await executorWallet.getAddress());
  console.log(`Executor wallet balance: ${ethers.formatEther(executorBalance)} ETH`);

  // Get contract instances
  const YieldAllocatorVault = await ethers.getContractFactory("YieldAllocatorVault");
  const WhitelistRegistry = await ethers.getContractFactory("WhitelistRegistry");
  const AIAgent = await ethers.getContractFactory("AIAgent");

  const yieldAllocatorVault = YieldAllocatorVault.attach(YIELD_ALLOCATOR_VAULT_ADDRESS).connect(executorWallet) as unknown as YieldAllocatorVaultInterface;
  const whitelistRegistry = WhitelistRegistry.attach(WHITELIST_REGISTRY_ADDRESS) as unknown as WhitelistRegistryInterface;
  const aiAgent = AIAgent.attach(AI_AGENT_ADDRESS).connect(executorWallet) as unknown as AIAgentInterface;

  console.log("YieldAllocatorVault address:", YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log("WhitelistRegistry address:", WHITELIST_REGISTRY_ADDRESS);
  console.log("AIAgent address:", AI_AGENT_ADDRESS);

  // Verify executor has the EXECUTOR role on AIAgent
  const EXECUTOR_ROLE = await aiAgent.EXECUTOR();
  const hasExecutorRole = await aiAgent.hasRole(EXECUTOR_ROLE, await executorWallet.getAddress());
  
  if (!hasExecutorRole) {
    console.error("Error: Executor wallet does not have the EXECUTOR role on AIAgent");
    return;
  }
  console.log("✅ Executor wallet has the EXECUTOR role on AIAgent");

  // Verify AIAgent has the EXECUTOR role on YieldAllocatorVault
  const hasExecVault = await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, AI_AGENT_ADDRESS);
  if (!hasExecVault) {
    console.error("Error: AIAgent does not have the EXECUTOR role on YieldAllocatorVault");
    return;
  }
  console.log("✅ AIAgent has the EXECUTOR role on YieldAllocatorVault");

  // Get asset token details
  const assetAddress = await yieldAllocatorVault.asset();
  const assetToken = await ethers.getContractAt("USDTEST", assetAddress);
  
  // Try to get symbol and decimals, with fallback for non-standard tokens
  let assetSymbol = "USDe";
  let assetDecimals = 18;
  
  try {
    const symbolContract = await ethers.getContractAt("USDTEST", assetAddress);
    assetSymbol = await symbolContract.symbol();
    assetDecimals = Number(await symbolContract.decimals());
  } catch (error: any) {
    console.log("Using default symbol and decimals for asset token:", error.message || error);
  }
  
  console.log("Asset token address:", assetAddress);
  console.log(`Asset token: ${assetSymbol} (${assetDecimals} decimals)`);

  // Use hardcoded pool addresses
  const sourcePoolAddress = SOURCE_POOL_ADDRESS;
  const targetPoolAddress = TARGET_POOL_ADDRESS;

  // Verify pools are whitelisted
  const isSourceWhitelisted = await whitelistRegistry.isWhitelisted(sourcePoolAddress);
  const isTargetWhitelisted = await whitelistRegistry.isWhitelisted(targetPoolAddress);

  if (!isSourceWhitelisted) {
    console.error(`Error: Source pool ${sourcePoolAddress} is not whitelisted`);
    return;
  }

  if (!isTargetWhitelisted) {
    console.error(`Error: Target pool ${targetPoolAddress} is not whitelisted`);
    return;
  }

  console.log(`\nSource pool: ${SOURCE_POOL_NAME} (${sourcePoolAddress}) [${SOURCE_POOL_KIND}]`);
  console.log(`Target pool: ${TARGET_POOL_NAME} (${targetPoolAddress}) [${TARGET_POOL_KIND}]`);

  // Display pool information
  console.log(`\nReady to withdraw from source pool and deposit to target pool...`);

  // Get source pool balance
  const sourcePoolPrincipal = await yieldAllocatorVault.poolPrincipal(sourcePoolAddress);
  console.log(`Source pool principal: ${ethers.formatUnits(sourcePoolPrincipal, assetDecimals)} ${assetSymbol}`);

  // Calculate amount to withdraw
  let withdrawAmount: bigint;
  
  if (amountStr) {
    // Use specified amount
    withdrawAmount = parseUnits(amountStr, assetDecimals);
  } else if (percentageStr) {
    // Calculate amount based on percentage of source pool balance
    const percentage = parseInt(percentageStr);
    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
      console.error("Error: PERCENTAGE must be a number between 1 and 100");
      return;
    }
    withdrawAmount = (sourcePoolPrincipal * BigInt(percentage)) / 100n;
  } else {
    console.error("Error: Either AMOUNT or PERCENTAGE must be specified");
    return;
  }
  
  // For Felix pool, use maxWithdraw to determine the maximum amount that can be withdrawn
  if (isFelixPool(sourcePoolAddress)) {
    console.log("Source is Felix pool (ERC4626). Using maxWithdraw to determine withdrawal limit...");
    
    try {
      // Get Felix pool contract instance
      const felixPool = await ethers.getContractAt([
        "function maxWithdraw(address owner) view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function convertToAssets(uint256 shares) view returns (uint256)"
      ], sourcePoolAddress);
      
      // Get vault's share balance in Felix pool
      const shareBalance = await felixPool.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      console.log(`Vault's share balance in Felix: ${ethers.formatUnits(shareBalance, assetDecimals)}`);
      
      // Get asset value of shares
      const assetValue = await felixPool.convertToAssets(shareBalance);
      console.log(`Asset value of shares: ${ethers.formatUnits(assetValue, assetDecimals)} ${assetSymbol}`);
      
      // Get max withdraw amount
      const maxWithdrawAmount = await felixPool.maxWithdraw(YIELD_ALLOCATOR_VAULT_ADDRESS);
      console.log(`Max withdraw amount: ${ethers.formatUnits(maxWithdrawAmount, assetDecimals)} ${assetSymbol}`);
      
      // Compare with requested withdrawal amount
      if (withdrawAmount > maxWithdrawAmount) {
        console.log(`⚠️ Requested withdrawal (${ethers.formatUnits(withdrawAmount, assetDecimals)} ${assetSymbol}) exceeds max withdraw limit`);
        console.log(`⚠️ Limiting withdrawal to max withdraw amount: ${ethers.formatUnits(maxWithdrawAmount, assetDecimals)} ${assetSymbol}`);
        withdrawAmount = maxWithdrawAmount;
      }
      
      // Compare with recorded principal
      console.log(`\nFelix Pool Analysis:`);
      console.log(`- Recorded Principal: ${ethers.formatUnits(sourcePoolPrincipal, assetDecimals)} ${assetSymbol}`);
      console.log(`- Actual Asset Value: ${ethers.formatUnits(assetValue, assetDecimals)} ${assetSymbol}`);
      console.log(`- Max Withdraw Amount: ${ethers.formatUnits(maxWithdrawAmount, assetDecimals)} ${assetSymbol}`);
      console.log(`- Amount to Withdraw: ${ethers.formatUnits(withdrawAmount, assetDecimals)} ${assetSymbol}`);
      
      if (sourcePoolPrincipal > assetValue) {
        console.log(`⚠️ Warning: Recorded principal (${ethers.formatUnits(sourcePoolPrincipal, assetDecimals)}) exceeds actual asset value (${ethers.formatUnits(assetValue, assetDecimals)})`);
        console.log(`This indicates a discrepancy in the vault's principal tracking.`);
      }
    } catch (error: any) {
      console.log(`Warning: Could not query Felix pool directly: ${error.message}`);
      console.log(`Proceeding with standard withdrawal method...`);
      
      // Fallback to using recorded principal
      if (withdrawAmount > sourcePoolPrincipal) {
        console.log(`⚠️ Limiting withdrawal to principal amount: ${ethers.formatUnits(sourcePoolPrincipal, assetDecimals)} ${assetSymbol}`);
        withdrawAmount = sourcePoolPrincipal;
      }
    }
  }

  // Check if withdraw amount is valid
  if (withdrawAmount <= 0n) {
    console.error("Error: Withdraw amount must be greater than 0");
    return;
  }

  console.log(`\nWithdrawing ${ethers.formatUnits(withdrawAmount, assetDecimals)} ${assetSymbol} from ${SOURCE_POOL_NAME}...`);

  try {
    // Get idle balance before withdrawal
    const idleBalanceBefore = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
    console.log(`Idle balance before withdrawal: ${ethers.formatUnits(idleBalanceBefore, assetDecimals)} ${assetSymbol}`);

    // Prepare transaction options
    const txOptions: any = {};
    if (gasLimit) txOptions.gasLimit = gasLimit;
    if (gasPrice) txOptions.gasPrice = gasPrice;
    
    // Handle withdrawal based on pool type with retry logic
    let withdrawTx;
    let retries = 3;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        if (isFelixPool(sourcePoolAddress)) {
          // For Felix pool, we've already limited the amount to the maxWithdraw value
          console.log(`Executing withdrawFromPool(${sourcePoolAddress}, ${withdrawAmount}) on AIAgent...`);
          withdrawTx = await aiAgent.withdrawFromPool(sourcePoolAddress, withdrawAmount, txOptions);
        } else {
          // For other pools, use standard withdrawal
          console.log(`Executing withdrawFromPool(${sourcePoolAddress}, ${withdrawAmount}) on AIAgent...`);
          withdrawTx = await aiAgent.withdrawFromPool(sourcePoolAddress, withdrawAmount, txOptions);
        }
        success = true;
      } catch (error: any) {
        if (error.message && error.message.includes("invalid block height")) {
          retries--;
          console.log(`Network error: invalid block height. Retries left: ${retries}`);
          if (retries > 0) {
            console.log("Waiting 5 seconds before retrying...");
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            throw new Error("Max retries exceeded for network errors");
          }
        } else {
          throw error;
        }
      }
    }
    
    if (!withdrawTx) {
      throw new Error("Failed to execute withdrawal transaction");
    }
    
    console.log(`Withdrawal transaction sent: ${withdrawTx.hash}`);
    await withdrawTx.wait();
    console.log(`✅ Successfully withdrawn from source pool`);

    // Get idle balance after withdrawal
    const idleBalanceAfter = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
    console.log(`Idle balance after withdrawal: ${ethers.formatUnits(idleBalanceAfter, assetDecimals)} ${assetSymbol}`);

    // Calculate actual withdrawn amount
    const actualWithdrawn = idleBalanceAfter - idleBalanceBefore;
    console.log(`Actual withdrawn amount: ${ethers.formatUnits(actualWithdrawn, assetDecimals)} ${assetSymbol}`);

    // Check if we actually received any assets
    if (actualWithdrawn <= 0n) {
      console.error(`❌ Error: No assets were withdrawn from the source pool.`);
      return;
    }

    // Deposit to target pool
    console.log(`\nDepositing ${ethers.formatUnits(actualWithdrawn, assetDecimals)} ${assetSymbol} to ${TARGET_POOL_NAME}...`);
    console.log(`Executing depositToPool(${targetPoolAddress}, ${actualWithdrawn}) on AIAgent...`);
    
    // Reset transaction options for deposit (no ETH value needed)
    const depositTxOptions: any = {};
    if (gasLimit) depositTxOptions.gasLimit = gasLimit;
    if (gasPrice) depositTxOptions.gasPrice = gasPrice;
    
    const depositTx = await aiAgent.depositToPool(targetPoolAddress, actualWithdrawn, depositTxOptions);
    console.log(`Deposit transaction sent: ${depositTx.hash}`);
    await depositTx.wait();
    console.log(`✅ Successfully deposited to target pool`);

    // Get final idle balance
    const finalIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
    console.log(`Final idle balance: ${ethers.formatUnits(finalIdleBalance, assetDecimals)} ${assetSymbol}`);

    // Get updated pool principals
    const updatedSourcePrincipal = await yieldAllocatorVault.poolPrincipal(sourcePoolAddress);
    const updatedTargetPrincipal = await yieldAllocatorVault.poolPrincipal(targetPoolAddress);
    
    console.log(`\nUpdated source pool principal: ${ethers.formatUnits(updatedSourcePrincipal, assetDecimals)} ${assetSymbol}`);
    console.log(`Updated target pool principal: ${ethers.formatUnits(updatedTargetPrincipal, assetDecimals)} ${assetSymbol}`);
    
    // Calculate and display yield information for Felix pool
    if (isFelixPool(sourcePoolAddress)) {
      try {
        // For ERC4626 pools, we need to check the actual value vs principal
        // Use a direct contract instance to avoid TypeScript errors
        const felixPool = await ethers.getContractAt([
          "function balanceOf(address) view returns (uint256)",
          "function convertToAssets(uint256) view returns (uint256)"
        ], sourcePoolAddress);
        
        const shareBalance = await felixPool.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
        
        if (shareBalance > 0n) {
          const actualAssetValue = await felixPool.convertToAssets(shareBalance);
          const yieldAmount = actualAssetValue > updatedSourcePrincipal ? actualAssetValue - updatedSourcePrincipal : 0n;
          
          console.log(`\nFelix Pool Analysis:`);
          console.log(`- Share Balance: ${ethers.formatUnits(shareBalance, assetDecimals)}`);
          console.log(`- Actual Asset Value: ${ethers.formatUnits(actualAssetValue, assetDecimals)} ${assetSymbol}`);
          console.log(`- Principal: ${ethers.formatUnits(updatedSourcePrincipal, assetDecimals)} ${assetSymbol}`);
          console.log(`- Yield Remaining: ${ethers.formatUnits(yieldAmount, assetDecimals)} ${assetSymbol}`);
          
          if (yieldAmount > 0n) {
            console.log(`\n✅ Successfully preserved ${ethers.formatUnits(yieldAmount, assetDecimals)} ${assetSymbol} yield in Felix pool`);
          }
        }
      } catch (error: any) {
        console.log(`Could not calculate Felix pool yield: ${error.message}`);
      }
    }

    console.log(`\n✅ Successfully rebalanced pools: ${SOURCE_POOL_NAME} → ${TARGET_POOL_NAME}`);

  } catch (error: any) {
    console.error("Error during rebalancing:", error.message || error);
    
    // Check for common errors
    if (error.message && error.message.includes("insufficient funds")) {
      console.error("\n❌ Insufficient funds error detected!");
      console.error("Make sure your executor wallet has enough ETH to cover gas costs.");
    }
    
    console.error("Stack trace:", error.stack || "No stack trace available");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
