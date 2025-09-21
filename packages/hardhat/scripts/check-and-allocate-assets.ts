import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import axios from "axios";
import { parseUnits } from "ethers";
dotenv.config();

/**
 * Script to optimize yield allocation by:
 * 1. Checking the vault's idle asset balance
 * 2. Fetching APY data from the API to find the highest-yielding pool
 * 3. Depositing idle assets into the highest-yielding pool
 * 4. Reallocating assets from lower-yielding pools to the highest-yielding pool if beneficial
 * 
 * Usage:
 * EXECUTOR_PRIVATE_KEY=your_private_key npx hardhat run scripts/check-and-allocate-assets.ts --network hype-mainnet
 */

const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS
const WHITELIST_REGISTRY_ADDRESS = process.env.WHITELIST_REGISTRY_ADDRESS;
const AI_AGENT_ADDRESS = process.env.AI_AGENT_ADDRESS;
const API_URL = "https://yield-allocator-backend-production.up.railway.app/api/pool-apy/?format=json";

// Minimum APY difference to trigger reallocation (in percentage points)
const MIN_APY_DIFFERENCE_FOR_REALLOCATION = 0.5;

// Interface for the API response
interface PoolAPY {
  pool_address: string;
  apy: number;
  name: string;
}

// Interface for pool allocation data
interface PoolAllocation {
  address: string;
  principal: bigint;
  name?: string;
  apy?: number;
}

async function main() {
  const network = process.env.HARDHAT_NETWORK || "hype-mainnet";
  console.log(`Checking protocol status on network: ${network}`);

  // Check required environment variables
  if (!YIELD_ALLOCATOR_VAULT_ADDRESS || !WHITELIST_REGISTRY_ADDRESS || !AI_AGENT_ADDRESS) {
    console.error("Error: Required environment variables not set");
    console.log("Please set the following environment variables:");
    console.log("- YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract");
    console.log("- WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract");
    console.log("- AI_AGENT_ADDRESS: Address of the AIAgent contract");
    return;
  }

  // Get the executor wallet from private key
  const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!executorPrivateKey) {
    console.error("Error: EXECUTOR_PRIVATE_KEY environment variable not set");
    console.log("Please set the EXECUTOR_PRIVATE_KEY environment variable to the private key of your executor wallet");
    return;
  }

  // Create a wallet from the private key
  const executorWallet = new ethers.Wallet(executorPrivateKey, ethers.provider);
  const executorAddress = await executorWallet.getAddress();
  console.log("Executor account:", executorAddress);
  
  // Get the YieldAllocatorVault contract
  const YieldAllocatorVault = await ethers.getContractFactory("YieldAllocatorVault");
  const yieldAllocatorVault = YieldAllocatorVault.attach(YIELD_ALLOCATOR_VAULT_ADDRESS).connect(executorWallet);
  console.log("YieldAllocatorVault address:", YIELD_ALLOCATOR_VAULT_ADDRESS);
  
  // Get the WhitelistRegistry contract
  const WhitelistRegistry = await ethers.getContractFactory("WhitelistRegistry");
  const whitelistRegistry = WhitelistRegistry.attach(WHITELIST_REGISTRY_ADDRESS).connect(executorWallet);
  console.log("WhitelistRegistry address:", WHITELIST_REGISTRY_ADDRESS);
  
  // Get the AIAgent contract
  const AIAgent = await ethers.getContractFactory("AIAgent");
  const aiAgent = AIAgent.attach(AI_AGENT_ADDRESS).connect(executorWallet);
  console.log("AIAgent address:", AI_AGENT_ADDRESS);

  // Check if the wallet has the EXECUTOR role on AIAgent
  const EXECUTOR_ROLE = await aiAgent.EXECUTOR();
  const hasExecutorRole = await aiAgent.hasRole(EXECUTOR_ROLE, executorAddress);
  
  if (!hasExecutorRole) {
    console.log(`⚠️ The account ${executorAddress} does not have the EXECUTOR role on AIAgent`);
    console.log("Only accounts with the EXECUTOR role can instruct the AIAgent to transfer assets");
    console.log("This script will exit as it cannot perform any transfers");
    return;
  } else {
    console.log("✅ Executor wallet has the EXECUTOR role on AIAgent");
  }

  // Get the asset token address
  const assetAddress = await yieldAllocatorVault.asset();
  console.log("Asset token address:", assetAddress);
  
  // Create an instance of the asset token
  const USDTEST = await ethers.getContractFactory("USDTEST");
  const assetToken = USDTEST.attach(assetAddress).connect(executorWallet);
  
  // Get token details
  const assetSymbol = await assetToken.symbol();
  const assetDecimals = await assetToken.decimals();
  console.log(`Asset token: ${assetSymbol} (${assetDecimals} decimals)`);
  
  // Get the vault's idle asset balance
  const idleAssetBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log(`Idle asset balance in vault: ${ethers.formatUnits(idleAssetBalance, assetDecimals)} ${assetSymbol}`);
  
  // Convert to BigInt for calculations
  const idleAssetBalanceBigInt = BigInt(idleAssetBalance.toString());
  
  // Get all whitelisted pools
  const whitelistedPools = await whitelistRegistry.getWhitelistedPools();
  console.log(`Number of whitelisted pools: ${whitelistedPools.length}`);
  
  if (whitelistedPools.length === 0) {
    console.log("No whitelisted pools available. Cannot deposit or reallocate assets.");
    return;
  }

  // Fetch current pool allocations
  console.log("\nFetching current pool allocations...");
  const poolAllocations: PoolAllocation[] = [];
  let totalAllocated = 0n;
  
  for (const poolAddress of whitelistedPools) {
    const principal = await yieldAllocatorVault.poolPrincipal(poolAddress);
    if (principal > 0n) {
      poolAllocations.push({
        address: poolAddress,
        principal: BigInt(principal.toString())
      });
      totalAllocated += BigInt(principal.toString());
      console.log(`Pool ${poolAddress}: ${ethers.formatUnits(principal, assetDecimals)} ${assetSymbol}`);
    }
  }
  
  console.log(`Total allocated in pools: ${ethers.formatUnits(totalAllocated, assetDecimals)} ${assetSymbol}`);
  
  // Calculate available assets for deposit
  const availableForDeposit = idleAssetBalanceBigInt;
  console.log(`Available idle assets for deposit: ${ethers.formatUnits(availableForDeposit, assetDecimals)} ${assetSymbol}`);

  const bestPoolAddress = whitelistedPools[2];
  await depositToPool(bestPoolAddress, availableForDeposit);
  
  
  
  // STEP 1: Deposit idle assets if available
  // if (availableForDeposit > MIN_ALLOCATION_THRESHOLD) {
  //   console.log(`\nDepositing ${ethers.formatUnits(availableForDeposit, assetDecimals)} ${assetSymbol} idle assets into highest APY pool`);
  //   await depositToPool(highestApyPool.pool_address, availableForDeposit);
  // } else if (availableForDeposit > 0n) {
  //   console.log(`\nIdle assets (${ethers.formatUnits(availableForDeposit, assetDecimals)} ${assetSymbol}) below minimum threshold for allocation (${ethers.formatUnits(MIN_ALLOCATION_THRESHOLD, assetDecimals)} ${assetSymbol})`);
  // } else {
  //   console.log("\nNo idle assets available for deposit.");
  // }
  
  // STEP 2: Check if reallocation is needed
  console.log("\nAnalyzing if reallocation is beneficial...");
  
  // Only consider reallocation if we have assets allocated and APY data
  // if (poolAllocations.length > 0 && highestApyPool) {
  //   // Find pools with lower APY than the highest
  //   const lowerApyPools = poolAllocations.filter(pool => 
  //     pool.apy !== undefined && 
  //     pool.address.toLowerCase() !== highestApyPool.pool_address.toLowerCase() &&
  //     highestApyPool.apy - pool.apy > MIN_APY_DIFFERENCE_FOR_REALLOCATION
  //   );
    
  //   if (lowerApyPools.length > 0) {
  //     console.log(`Found ${lowerApyPools.length} pools with significantly lower APY than the highest (${highestApyPool.apy.toFixed(2)}%):`);
      
  //     for (const pool of lowerApyPools) {
  //       console.log(`- ${pool.name || pool.address}: ${pool.apy?.toFixed(2)}% APY, ${ethers.formatUnits(pool.principal, assetDecimals)} ${assetSymbol}`);
        
  //       console.log(`Reallocating assets from ${pool.name || pool.address} to ${highestApyPool.name}...`);
        
  //       try {
  //         // Withdraw from lower APY pool
  //         console.log(`Withdrawing ${ethers.formatUnits(pool.principal, assetDecimals)} ${assetSymbol} from ${pool.address}`);
  //         const withdrawTx = await aiAgent.withdrawFromPool(pool.address, pool.principal);
  //         console.log(`Withdrawal transaction sent: ${withdrawTx.hash}`);
  //         await withdrawTx.wait();
  //         console.log("✅ Successfully withdrawn assets from lower APY pool");
          
  //         // Check updated idle balance after withdrawal
  //         const updatedIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
  //         console.log(`Updated idle asset balance after withdrawal: ${ethers.formatUnits(updatedIdleBalance, assetDecimals)} ${assetSymbol}`);
          
  //         // Deposit withdrawn assets to highest APY pool
  //         console.log(`Depositing ${ethers.formatUnits(pool.principal, assetDecimals)} ${assetSymbol} to ${highestApyPool.pool_address}`);
  //         const depositTx = await aiAgent.depositToPool(highestApyPool.pool_address, pool.principal);
  //         console.log(`Deposit transaction sent: ${depositTx.hash}`);
  //         await depositTx.wait();
  //         console.log(`✅ Successfully reallocated assets to highest APY pool (${highestApyPool.name})`);
          
  //         // Check final balances
  //         const finalIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
  //         const finalSourcePoolBalance = await yieldAllocatorVault.poolPrincipal(pool.address);
  //         const finalTargetPoolBalance = await yieldAllocatorVault.poolPrincipal(highestApyPool.pool_address);
          
  //         console.log(`Final idle balance: ${ethers.formatUnits(finalIdleBalance, assetDecimals)} ${assetSymbol}`);
  //         console.log(`Final ${pool.name || pool.address} balance: ${ethers.formatUnits(finalSourcePoolBalance, assetDecimals)} ${assetSymbol}`);
  //         console.log(`Final ${highestApyPool.name} balance: ${ethers.formatUnits(finalTargetPoolBalance, assetDecimals)} ${assetSymbol}`);
          
  //       } catch (error: any) {
  //         console.error(`Failed to reallocate assets from ${pool.address}:`, error.message || error);
  //       }
  //     }
  //   } else {
  //     console.log("✅ Current allocation is optimal. No reallocation needed.");
  //   }
  // } else {
  //   console.log("No allocated assets or APY data available for reallocation analysis.");
  // }
  
  // Helper function to deposit to a specific pool
  async function depositToPool(poolAddress: string, amount: bigint) {
    console.log(`\nDepositing ${ethers.formatUnits(amount, assetDecimals)} ${assetSymbol} into pool (${poolAddress}) via AIAgent...`);
    
    try {
      // Transfer assets to the pool using AIAgent
      const tx = await aiAgent.depositToPool(poolAddress, amount);
      console.log(`Transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Successfully deposited assets into the pool via AIAgent`);
      
      // Check updated pool balance
      const poolBalance = await yieldAllocatorVault.poolPrincipal(poolAddress);
      console.log(`Updated pool principal: ${ethers.formatUnits(poolBalance, assetDecimals)} ${assetSymbol}`);
      
      // Check updated idle asset balance
      const updatedIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      console.log(`Updated idle asset balance: ${ethers.formatUnits(updatedIdleBalance, assetDecimals)} ${assetSymbol}`);
      
      return true;
    } catch (error: any) {
      console.error(`Failed to deposit assets:`, error.message || error);
      return false;
    }
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
