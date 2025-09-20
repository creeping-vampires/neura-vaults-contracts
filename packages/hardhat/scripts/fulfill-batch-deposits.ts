import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import axios from "axios";
dotenv.config();
import whitelistPools from "../scripts/pools.json";

// Define interfaces for contract interactions
interface DepositRequest {
  assets: bigint;
  receiver: string;
  exists: boolean;
}

interface YieldAllocatorVaultInterface {
  EXECUTOR(): Promise<string>;
  hasRole(role: string, address: string): Promise<boolean>;
  asset(): Promise<string>;
  depositQueueLength(): Promise<bigint>;
  depositQueueAt(index: number): Promise<[string, bigint]>;
  depositRequests(controller: string): Promise<DepositRequest>;
  totalAssets(): Promise<bigint>;
  fulfillNextDeposits(batchSize: bigint, bestPool: string): Promise<any>;
}

interface AIAgentInterface {
  EXECUTOR(): Promise<string>;
  hasRole(role: string, address: string): Promise<boolean>;
  fullfillBatchDeposits(batchSize: bigint, bestPool: string): Promise<any>;
}

interface WhitelistRegistryInterface {
  getWhitelistedPools(): Promise<string[]>;
  getPoolKind(pool: string): Promise<number>;
  isWhitelisted(pool: string): Promise<boolean>;
}

/**
 * Script to fulfill pending deposit requests using the async deposit pattern
 * This script:
 * 1. Connects to contracts using a specific wallet (via private key)
 * 2. Checks for pending deposit requests in the FIFO queue
 * 3. Calls AIAgent's fulfillBatchDeposits method to process the next batch of deposit requests
 * 
 * Usage:
 * EXECUTOR_PRIVATE_KEY=your_private_key BATCH_SIZE=10 npx hardhat run scripts/fulfill-batch-deposits.ts --network hype-mainnet
 * 
 * Environment variables:
 * - YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract
 * - WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract
 * - AI_AGENT_ADDRESS: Address of the AIAgent contract
 * - EXECUTOR_PRIVATE_KEY: Private key for the executor wallet
 * - BATCH_SIZE: Number of deposit requests to fulfill in one batch (default: 10)
 */

const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS;
const WHITELIST_REGISTRY_ADDRESS = process.env.WHITELIST_REGISTRY_ADDRESS;
const AI_AGENT_ADDRESS = process.env.AI_AGENT_ADDRESS;
const API_URL = "https://yield-allocator-backend-production.up.railway.app/api/vault/price/?format=json";


async function main() {
  const network = process.env.HARDHAT_NETWORK || "hype-mainnet";
  console.log(`Fulfilling pending deposits on network: ${network}`);

  // Check required environment variables
  if (!YIELD_ALLOCATOR_VAULT_ADDRESS || !WHITELIST_REGISTRY_ADDRESS || !AI_AGENT_ADDRESS) {
    console.error("Error: Required environment variables not set");
    console.log("Please set the following environment variables:");
    console.log("- YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract");
    console.log("- WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract");
    console.log("- AI_AGENT_ADDRESS: Address of the AIAgent contract");
    return;
  }
  
  // Get max batch size from environment or use default
  const maxBatchSize = process.env.BATCH_SIZE ? BigInt(process.env.BATCH_SIZE) : 5n;
  console.log(`Maximum batch size for fulfillment: ${maxBatchSize}`);
  
  if (maxBatchSize <= 0n) {
    console.error("Error: BATCH_SIZE must be a positive number");
    return;
  }

 
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
  
   // Get best pool address from environment or use a known whitelisted pool
   let bestPool;
   const response = await axios.get(API_URL);
   const pools: any = response.data;

   const token = 'USDe';
   const pool = pools.find((pool: any) =>  pool.token === token);

   const protocol = pool.protocol;

//    // check if whitelisted pool name contains protocol name
//    const whitelistPool = whitelistPools.pools.find((pool: any) => pool.name.toLowerCase().includes(protocol.toLowerCase()) && pool.name.toLowerCase().includes(token.toLowerCase()));


//    console.log('Pool ', pool);
//    console.log('Protocol ', protocol);

//    console.log('Whitelist Pool ', whitelistPool);
//    if(!whitelistPool) {
//     console.error("Error: No best pool found");
//     return;
//    }
   // convert it to checksum address
   bestPool = "0x835FEBF893c6DdDee5CF762B0f8e31C5B06938ab" //ethers.getAddress(whitelistPool?.address);

   if (!bestPool) {
    console.error("Error: No best pool found");
    return;
   }

  
  console.log("Best pool address:", bestPool);

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

  // At this point bestPool should be defined, but let's add a safety check
  if (!bestPool) {
    console.error("Error: Failed to determine a valid pool address");
    return;
  }

  // Verify the best pool is whitelisted
  const isWhitelisted = await whitelistRegistry.isWhitelisted(bestPool);
  if (!isWhitelisted) {
    console.error("Error: The specified best pool is not whitelisted");
    return;
  }
  console.log("✅ Best pool is whitelisted");

  // Get asset token details
  const assetAddress = await yieldAllocatorVault.asset();
  const assetToken = await ethers.getContractAt("USDTEST", assetAddress);
  
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

    // Check the deposit queue for pending deposit requests
    let queueLength = 0n;
    let totalAssetsToDeposit = 0n;
    
    try {
      // Get the length of the deposit queue
      queueLength = await yieldAllocatorVault.depositQueueLength();
      console.log(`\n📊 Deposit queue length: ${queueLength}`);
      
      if (queueLength === 0n) {
        console.log("\n✅ No pending deposit requests in the queue");
        return;
      }

      // Examine the first few items in the queue (up to max batch size)
      const itemsToExamine = Math.min(Number(queueLength), Number(maxBatchSize));
      console.log(`\nExamining first ${itemsToExamine} items in the queue:`);
      
      for (let i = 0; i < itemsToExamine; i++) {
        try {
          // Get the deposit request at index i
          const [controller, assets] = await yieldAllocatorVault.depositQueueAt(i);
          
          // Get deposit request details from the mapping
          const depositRequest = await yieldAllocatorVault.depositRequests(controller);
          
          console.log(`\n📝 Queue position ${i + 1}:`);
          console.log(`  Controller: ${controller}`);
          console.log(`  Pending assets: ${ethers.formatUnits(depositRequest.assets, assetDecimals)} ${assetSymbol}`);
          console.log(`  Receiver: ${depositRequest.receiver}`);
          
          totalAssetsToDeposit += BigInt(depositRequest.assets.toString());
        } catch (error: any) {
          console.error(`Error examining queue item ${i}:`, error.message || error);
          break;
        }
      }
      
      // Debug vault state
      console.log(`\n🔍 Debugging vault state:`);
      const totalAssets = await yieldAllocatorVault.totalAssets();
      console.log(`  Total assets: ${ethers.formatUnits(totalAssets, assetDecimals)} ${assetSymbol}`);
      
    } catch (error: any) {
      console.error("Error checking deposit queue:", error.message || error);
      return;
    }
    
    if (queueLength === 0n) {
      console.log("\n✅ No pending deposit requests found");
      return;
    }

    console.log(`\n📊 Summary:`);
    console.log(`Total pending requests in queue: ${queueLength}`);
    console.log(`Maximum batch size: ${maxBatchSize}`);
    console.log(`Total assets to deposit in batch: ${ethers.formatUnits(totalAssetsToDeposit, assetDecimals)} ${assetSymbol}`);

    // Now fulfill deposit requests using AIAgent's fulfillBatchDeposits method
    console.log(`\n🔄 Fulfilling next batch of deposit requests...`);
    
    try {
      // Check if there are any pending requests in the queue
      const currentQueueLength = await yieldAllocatorVault.depositQueueLength();
      if (currentQueueLength === 0n) {
        console.log(`\n✅ No pending requests in the queue to fulfill`);
        return;
      }
      
      // Determine the batch size based on queue length
      // If there are more than 5 requests, process in batches of 5
      const batchSize = 5n;
      const totalBatches = Math.ceil(Number(currentQueueLength) / Number(batchSize));
      
      console.log(`Processing ${currentQueueLength} requests in ${totalBatches} batch(es) of ${batchSize}`);
      
      let batchesProcessed = 0;
      let totalProcessed = 0;
      
      // Process deposits in batches of 5
      while (batchesProcessed < totalBatches) {
        // Check if there are still pending requests
        const remainingRequests = await yieldAllocatorVault.depositQueueLength();
        if (remainingRequests === 0n) {
          console.log(`\n✅ All deposit requests have been processed`);
          break;
        }
        
        // Calculate the size for this batch (min of batch size and remaining requests)
        const currentBatchSize = remainingRequests < batchSize ? remainingRequests : batchSize;
        
        console.log(`\n🔄 Processing batch ${batchesProcessed + 1}/${totalBatches} with ${currentBatchSize} requests...`);
        
        // Ensure bestPool is defined (TypeScript safety check)
        if (!bestPool) {
          console.error("Error: Pool address is undefined");
          break;
        }
        
        // Call AIAgent to fulfill the next batch
        console.log(`Executing fullfillBatchDeposits(${currentBatchSize}, ${bestPool}) on AIAgent at ${AI_AGENT_ADDRESS}`);
        try {
          const fulfillTx = await aiAgent.fullfillBatchDeposits(currentBatchSize, bestPool);
          console.log(`Fulfill transaction sent: ${fulfillTx.hash}`);
          await fulfillTx.wait();
          console.log(`✅ Successfully fulfilled batch ${batchesProcessed + 1}`);
          
          totalProcessed += Number(currentBatchSize);
          batchesProcessed++;
        } catch (fulfillError: any) {
          console.error(`\n❌ Error calling fullfillBatchDeposits: ${fulfillError.message || fulfillError}`);
          
          // Try with a smaller batch size if the transaction failed
          if (currentBatchSize > 1n) {
            const smallerBatch = BigInt(Math.max(1, Math.floor(Number(currentBatchSize) / 2)));
            console.log(`\n⚠️ Trying again with smaller batch size: ${smallerBatch}`);
            try {
              // Ensure bestPool is still defined
              if (!bestPool) {
                console.error("Error: Pool address is undefined during retry");
                break;
              }
              
              const retryTx = await aiAgent.fullfillBatchDeposits(smallerBatch, bestPool);
              console.log(`Retry transaction sent: ${retryTx.hash}`);
              await retryTx.wait();
              console.log(`✅ Successfully fulfilled batch with reduced size`);
              
              totalProcessed += Number(smallerBatch);
              batchesProcessed++;
            } catch (retryError: any) {
              console.error(`\n❌ Error on retry: ${retryError.message || retryError}`);
              break;
            }
          } else {
            break;
          }
        }
      }

      // Check final status
      const finalIdleBalance = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      console.log(`\nFinal idle asset balance: ${ethers.formatUnits(finalIdleBalance, assetDecimals)} ${assetSymbol}`);

      // Check updated queue length
      const updatedQueueLength = await yieldAllocatorVault.depositQueueLength();
      console.log(`\nUpdated deposit queue length: ${updatedQueueLength}`);
      
      const processedCount = Number(queueLength.toString()) - Number(updatedQueueLength.toString());
      console.log(`Processed ${processedCount} deposit requests in ${batchesProcessed} batch(es)`);

      if (updatedQueueLength === 0n) {
        console.log(`✅ All deposit requests have been fulfilled!`);
      } else {
        console.log(`⚠️ ${updatedQueueLength} deposit requests are still pending in the queue`);
        if (updatedQueueLength > 0n && processedCount > 0) {
          console.log(`Run this script again to process the remaining batches.`);
        } else if (processedCount === 0) {
          console.log(`No requests were processed. Check for sufficient liquidity or other issues.`);
        }
      }

    } catch (error: any) {
      console.error("Failed to fulfill deposit requests:", error.message || error);
    }

  } catch (error: any) {
    console.error("Error during deposit fulfillment process:", error.message || error);
    console.error("Stack trace:", error.stack || "No stack trace available");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
