import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// Define interfaces for contract interactions
interface WithdrawalRequest {
  shares: bigint;
  assetsAtRequest: bigint;
  receiver: string;
  exists: boolean;
}

interface YieldAllocatorVaultInterface {
  EXECUTOR(): Promise<string>;
  hasRole(role: string, address: string): Promise<boolean>;
  asset(): Promise<string>;
  redeemQueueLength(): Promise<bigint>;
  redeemQueueAt(index: number): Promise<[string, bigint]>;
  withdrawalRequests(controller: string): Promise<WithdrawalRequest>;
  poolPrincipal(pool: string): Promise<bigint>;
  totalAssets(): Promise<bigint>;
  totalSupply(): Promise<bigint>;
  convertToAssets(shares: bigint): Promise<bigint>;
  fulfillNextBatch(batchSize: bigint): Promise<any>;
}

interface AIAgentInterface {
  EXECUTOR(): Promise<string>;
  hasRole(role: string, address: string): Promise<boolean>;
  withdrawFromPool(pool: string, amount: bigint): Promise<any>;
  fulfillBatch(batchSize: bigint): Promise<any>;
}

interface WhitelistRegistryInterface {
  getWhitelistedPools(): Promise<string[]>;
  getPoolKind(pool: string): Promise<number>;
  isWhitelisted(pool: string): Promise<boolean>;
}

interface IPool {
  withdraw(asset: string, amount: bigint, to: string): Promise<bigint>;
}

interface IERC4626Like {
  withdraw(amount: bigint, receiver: string, owner: string): Promise<bigint>;
}

/**
 * Script to fulfill pending withdrawal requests using the ERC-7540 async withdrawal pattern
 * This script:
 * 1. Connects to contracts using a specific wallet (via private key)
 * 2. Checks for pending withdrawal requests in the FIFO queue
 * 3. Withdraws required funds from pools back to vault if needed
 * 4. Calls AIAgent's fulfillBatch method to process the next batch of withdrawal requests
 * 
 * Usage:
 * EXECUTOR_PRIVATE_KEY=your_private_key BATCH_SIZE=10 npx hardhat run scripts/fulfill-pending-withdrawals.ts --network hype-mainnet
 * 
 * Environment variables:
 * - YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract
 * - WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract
 * - AI_AGENT_ADDRESS: Address of the AIAgent contract
 * - EXECUTOR_PRIVATE_KEY: Private key for the executor wallet
 * - BATCH_SIZE: Number of withdrawal requests to fulfill in one batch (default: 10)
 */

const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS;
const WHITELIST_REGISTRY_ADDRESS = process.env.WHITELIST_REGISTRY_ADDRESS;
const AI_AGENT_ADDRESS = process.env.AI_AGENT_ADDRESS;

async function main() {
  const network = process.env.HARDHAT_NETWORK || "hype-mainnet";
  console.log(`Fulfilling pending withdrawals on network: ${network}`);

  // Check required environment variables
  if (!YIELD_ALLOCATOR_VAULT_ADDRESS || !WHITELIST_REGISTRY_ADDRESS || !AI_AGENT_ADDRESS) {
    console.error("Error: Required environment variables not set");
    console.log("Please set the following environment variables:");
    console.log("- YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract");
    console.log("- WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract");
    console.log("- AI_AGENT_ADDRESS: Address of the AIAgent contract");
    return;
  }
  
  // Get batch size from environment or use default
  // // const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 5;
  // console.log(`Batch size for fulfillment: ${batchSize}`);
  
  // if (isNaN(batchSize) || batchSize <= 0) {
  //   console.error("Error: BATCH_SIZE must be a positive number");
  //   return;
  // }

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

  const hasExecVault = await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, AI_AGENT_ADDRESS);
  if (!hasExecVault) {
    console.error("Error: AIAgent does not have the EXECUTOR role on YieldAllocatorVault");
    return;
  }
  console.log("✅ AIAgent has the EXECUTOR role on YieldAllocatorVault");


  // Get asset token details
  const assetAddress = await yieldAllocatorVault.asset();
  const assetToken = await ethers.getContractAt("USDTEST", assetAddress);
  

  let batchSize;
  try {
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

    // Check current idle asset balance in vault
    const idleAssetBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
    console.log(`\nIdle asset balance in vault: ${ethers.formatUnits(idleAssetBalance, assetDecimals)} ${assetSymbol}`);

    // Check the redeem queue for pending withdrawal requests
    let queueLength = 0n;
    let totalAssetsNeeded = 0n;
    
    try {
      // Get the length of the redeem queue
      queueLength = await yieldAllocatorVault.redeemQueueLength();
      console.log(`\n📊 Redeem queue length: ${queueLength}`);
      
      if (queueLength === 0n) {
        console.log("\n✅ No pending withdrawal requests in the queue");
        return;
      }

      batchSize = queueLength;
      
      // Examine the first few items in the queue (up to batch size)
      const itemsToExamine = Math.min(Number(queueLength), Number(batchSize));
      console.log(`\nExamining first ${itemsToExamine} items in the queue:`);
      
      for (let i = 0; i < itemsToExamine; i++) {
        try {
          // Get the redeem request at index i
          const [controller, shares] = await yieldAllocatorVault.redeemQueueAt(i);
          
          // Get withdrawal request details from the mapping
          const withdrawalRequest = await yieldAllocatorVault.withdrawalRequests(controller);
          
          // Use the stored assetsAtRequest value instead of calculating with convertToAssets
          const assetsNeeded = withdrawalRequest.assetsAtRequest;
          
          console.log(`\n📝 Queue position ${i + 1}:`);
          console.log(`  Controller: ${controller}`);
          console.log(`  Pending shares: ${ethers.formatUnits(withdrawalRequest.shares, assetDecimals)}`);
          console.log(`  Assets needed: ${ethers.formatUnits(assetsNeeded, assetDecimals)} ${assetSymbol}`);
          console.log(`  Receiver: ${withdrawalRequest.receiver}`);
          
          totalAssetsNeeded += BigInt(assetsNeeded.toString());
        } catch (error: any) {
          console.error(`Error examining queue item ${i}:`, error.message || error);
          break;
        }
      }
      
      // Debug vault state
      console.log(`\n🔍 Debugging vault state:`);
      const totalAssets = await yieldAllocatorVault.totalAssets();
      const totalSupply = await yieldAllocatorVault.totalSupply();
      console.log(`  Total assets: ${ethers.formatUnits(totalAssets, assetDecimals)} ${assetSymbol}`);
      console.log(`  Total supply: ${ethers.formatUnits(totalSupply, assetDecimals)} shares`);
      
    } catch (error: any) {
      console.error("Error checking redeem queue:", error.message || error);
      return;
    }
    
    if (queueLength === 0n) {
      console.log("\n✅ No pending withdrawal requests found");
      return;
    }

    console.log(`\n📊 Summary:`);
    console.log(`Total pending requests in queue: ${queueLength}`);
    console.log(`Batch size for processing: ${batchSize}`);
    console.log(`Total assets needed for batch: ${ethers.formatUnits(totalAssetsNeeded, assetDecimals)} ${assetSymbol}`);
    console.log(`Current idle assets: ${ethers.formatUnits(idleAssetBalance, assetDecimals)} ${assetSymbol}`);

    const idleAssetBalanceBigInt = BigInt(idleAssetBalance.toString());
    const shortfall = totalAssetsNeeded > idleAssetBalanceBigInt ? totalAssetsNeeded - idleAssetBalanceBigInt : 0n;

    if (shortfall > 0n) {
      console.log(`\n⚠️ Shortfall: ${ethers.formatUnits(shortfall, assetDecimals)} ${assetSymbol}`);
      console.log("Need to withdraw from pools to cover withdrawal requests...");

      // Get whitelisted pools using the getWhitelistedPools function
      let whitelistedPools: string[] = [];
      try {
        whitelistedPools = await whitelistRegistry.getWhitelistedPools();
        console.log(`\nFound ${whitelistedPools.length} whitelisted pools`);
      } catch (error: any) {
        console.error("Error fetching whitelisted pools:", error.message || error);
      }

      console.log(`\nTotal whitelisted pools found: ${whitelistedPools.length}`);

      // Check pool balances and get pool kinds
      const poolBalances = [];
      for (const pool of whitelistedPools) {
        const balance = await yieldAllocatorVault.poolPrincipal(pool);
        
        // Get pool kind from WhitelistRegistry
        const poolKindValue = await whitelistRegistry.getPoolKind(pool);
        const poolKindName = poolKindValue === 0 ? "AAVE" : "ERC4626";
        
        // Calculate the actual assets that can be withdrawn based on shares
        let withdrawableAssets;
        try {
          // Use poolPrincipal as withdrawable assets
          withdrawableAssets = await yieldAllocatorVault.poolPrincipal(pool);
          // We're using principal directly since we don't have access to shares
          console.log(`Pool ${pool} [${poolKindName}]: ${ethers.formatUnits(balance, assetDecimals)} ${assetSymbol} (principal), ${ethers.formatUnits(withdrawableAssets, assetDecimals)} ${assetSymbol} (withdrawable)`);
        } catch (error: any) {
          // Fallback to principal if convertToAssets fails
          withdrawableAssets = balance;
          console.log(`Pool ${pool} [${poolKindName}]: ${ethers.formatUnits(balance, assetDecimals)} ${assetSymbol} (principal, using as fallback)`);
          console.log(`  Error getting withdrawable assets: ${error.message || error}`);
        }
        
        poolBalances.push({ 
          pool, 
          poolKind: poolKindValue,
          balance: balance,
          withdrawableAssets: withdrawableAssets
        });
      }

      // Sort pools by withdrawable assets (largest first)
      poolBalances.sort((a, b) => b.withdrawableAssets > a.withdrawableAssets ? 1 : -1);

      console.log("\nPools sorted by liquidity (highest first):");
      for (const { pool, poolKind, withdrawableAssets } of poolBalances) {
        const poolKindName = poolKind === 0 ? "AAVE" : "ERC4626";
        console.log(`  Pool ${pool} [${poolKindName}]: ${ethers.formatUnits(withdrawableAssets, assetDecimals)} ${assetSymbol}`);
      }

      // Withdraw from pools to cover shortfall
      let remainingShortfall = shortfall;
      for (const { pool, withdrawableAssets } of poolBalances) {
        if (remainingShortfall <= 0n) break;
        if (withdrawableAssets === 0n) continue;

        const withdrawAmount = remainingShortfall > withdrawableAssets ? withdrawableAssets : remainingShortfall;
        
        console.log(`\n🔄 Withdrawing ${ethers.formatUnits(withdrawAmount, assetDecimals)} ${assetSymbol} from pool ${pool}...`);
        
        try {
          const tx = await aiAgent.withdrawFromPool(pool, withdrawAmount);
          console.log(`Transaction sent: ${tx.hash}`);
          await tx.wait();
          console.log(`✅ Successfully withdrew from pool`);
          
          remainingShortfall -= withdrawAmount;
        } catch (error: any) {
          console.error(`Failed to withdraw from pool ${pool}:`, error.message || error);
        }
      }

      if (remainingShortfall > 0n) {
        console.error(`\n❌ Could not withdraw enough assets. Still need ${ethers.formatUnits(remainingShortfall, assetDecimals)} ${assetSymbol}`);
        console.log("Some withdrawal requests may not be fulfilled.");
      }

      // Check updated idle balance after withdrawals
      const updatedIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      console.log(`\nUpdated idle asset balance: ${ethers.formatUnits(updatedIdleBalance, assetDecimals)} ${assetSymbol}`);
    } else {
      console.log("\n✅ Sufficient idle assets available to fulfill all requests");
    }

    // Now fulfill withdrawal requests using AIAgent's fulfillNextBatch method
    console.log(`\n🔄 Fulfilling next batch of withdrawal requests...`);
    
    try {
      // Call AIAgent to fulfill the next batch of withdrawal requests
      // console.log(`Calling AIAgent to fulfill next batch with size: ${batchSize}`);
      
      // First check if AIAgent has the EXECUTOR role on the vault
      const EXECUTOR_ROLE = await yieldAllocatorVault.EXECUTOR();
      const hasExecutorRole = await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, AI_AGENT_ADDRESS);
      
      if (!hasExecutorRole) {
        console.error(`\n❌ Error: AIAgent does not have the EXECUTOR role on YieldAllocatorVault`);
        return;
      }
      
      // Check if there are any pending requests in the queue
      const currentQueueLength = await yieldAllocatorVault.redeemQueueLength();
      if (currentQueueLength === 0n) {
        console.log(`\n✅ No pending requests in the queue to fulfill`);
        return;
      }
      
      // Check if we have enough idle assets to fulfill at least some requests
      const currentIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      if (BigInt(currentIdleBalance.toString()) === 0n) {
        console.error(`\n❌ Error: No idle assets available in the vault to fulfill requests`);
        return;
      }

      // batchSize is total withdraw requests in queue
      // const batchSize = Number(currentQueueLength.toString());
      
      // Call AIAgent to fulfill the next batch
      console.log(`Executing fulfillBatchWithdrawals(${batchSize}) on AIAgent at ${AI_AGENT_ADDRESS}`);
      try {
        const fulfillTx = await aiAgent.fulfillBatchWithdrawals(batchSize);
        console.log(`Fulfill transaction sent: ${fulfillTx.hash}`);
        await fulfillTx.wait();
        console.log(`✅ Successfully fulfilled next batch of withdrawal requests`);
      } catch (fulfillError: any) {
        console.error(`\n❌ Error calling fulfillBatchWithdrawals: ${fulfillError.message || fulfillError}`);
        
        // Try with a smaller batch size if the transaction failed
        if (batchSize > 1n) {
          const smallerBatch = BigInt(Math.max(1, Math.floor(Number(batchSize) / 2)));
          console.log(`\n⚠️ Trying again with smaller batch size: ${smallerBatch}`);
          try {
            const retryTx = await aiAgent.fulfillBatchWithdrawals(smallerBatch);
            console.log(`Retry transaction sent: ${retryTx.hash}`);
            await retryTx.wait();
            console.log(`✅ Successfully fulfilled batch with reduced size`);
          } catch (retryError: any) {
            console.error(`\n❌ Error on retry: ${retryError.message || retryError}`);
            return;
          }
        } else {
          return;
        }
      }

      // Check final status
      const finalIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      console.log(`\nFinal idle asset balance: ${ethers.formatUnits(finalIdleBalance, assetDecimals)} ${assetSymbol}`);

      // Check updated queue length
      const updatedQueueLength = await yieldAllocatorVault.redeemQueueLength();
      console.log(`\nUpdated redeem queue length: ${updatedQueueLength}`);
      
      const processedCount = Number(queueLength.toString()) - Number(updatedQueueLength.toString());
      console.log(`Processed ${processedCount} withdrawal requests`);

      if (updatedQueueLength === 0n) {
        console.log(`✅ All withdrawal requests have been fulfilled!`);
        console.log(`Users can now claim their withdrawals using the claim script.`);
      } else {
        console.log(`⚠️ ${updatedQueueLength} withdrawal requests are still pending in the queue`);
        if (updatedQueueLength > 0n && processedCount > 0) {
          console.log(`Run this script again to process more batches.`);
        } else if (processedCount === 0) {
          console.log(`No requests were processed. Check for sufficient liquidity or other issues.`);
        }
      }

    } catch (error: any) {
      console.error("Failed to fulfill withdrawal requests:", error.message || error);
    }

  } catch (error: any) {
    console.error("Error during withdrawal fulfillment process:", error.message || error);
    console.error("Stack trace:", error.stack || "No stack trace available");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
