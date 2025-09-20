import { ethers } from "hardhat";
import { Contract } from "ethers";

/**
 * Script to check the current status of the YieldAllocatorVault protocol
 * 
 * This script provides information about:
 * - Idle asset balance in the vault
 * - Total assets (including those in pools)
 * - Pending deposit and withdrawal requests (count and amounts)
 * - Pool balances
 * 
 * Usage:
 * npx hardhat run scripts/check-protocol-status.ts --network <network-name>
 * 
 * Required environment variables:
 * - YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract
 * - WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract
 * - START_EPOCH: Optional timestamp for APY calculation
 */

// Get environment variables
const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS;
const WHITELIST_REGISTRY_ADDRESS = process.env.WHITELIST_REGISTRY_ADDRESS;
const START_EPOCH = process.env.START_EPOCH;


async function main() {
  console.log("Checking protocol status...");
  
  // Validate environment variables
  if (!YIELD_ALLOCATOR_VAULT_ADDRESS) {
    throw new Error("YIELD_ALLOCATOR_VAULT_ADDRESS environment variable is not set");
  }
  if (!WHITELIST_REGISTRY_ADDRESS) {
    throw new Error("WHITELIST_REGISTRY_ADDRESS environment variable is not set");
  }
  
  // Initialize variables for tracking withdrawal assets
  let totalWithdrawalAssetsNeeded = 0n;
  
  // Get the YieldAllocatorVault contract
  const yieldAllocatorVault = await ethers.getContractAt("YieldAllocatorVault", YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log("YieldAllocatorVault address:", await yieldAllocatorVault.getAddress());
  
  // Get the WhitelistRegistry contract
  const whitelistRegistry = await ethers.getContractAt("WhitelistRegistry", WHITELIST_REGISTRY_ADDRESS);
  console.log("WhitelistRegistry address:", await whitelistRegistry.getAddress());

  // Get the asset token address
  const assetAddress = await yieldAllocatorVault.asset();
  console.log("Asset token address:", assetAddress);
  
  // Create an instance of the asset token
  const assetToken = await ethers.getContractAt("USDTEST", assetAddress);
  const assetSymbol = await assetToken.symbol();
  const assetDecimals = await assetToken.decimals();
  
  console.log(`Asset token: ${assetSymbol} (${assetDecimals} decimals)`);
  
  // Get the vault's idle asset balance
  const idleAssetBalance = await assetToken.balanceOf(await yieldAllocatorVault.getAddress());
  console.log(`Idle asset balance in vault: ${ethers.formatUnits(idleAssetBalance, assetDecimals)} ${assetSymbol}`);
  
  // Get the total assets in the vault (including those in pools)
  const totalAssets = await yieldAllocatorVault.totalAssets();
  console.log(`Total assets in vault: ${ethers.formatUnits(totalAssets, assetDecimals)} ${assetSymbol}`);
  
  // Calculate and display share price
  const totalSupply = await yieldAllocatorVault.totalSupply();
  console.log(`Total supply of shares: ${ethers.formatUnits(totalSupply, 18)} shares`);
  
  // Calculate price per share (handle division by zero case)
  const pricePerShare = totalSupply > 0n ? 
    (totalAssets * BigInt(10**18)) / totalSupply : 
    BigInt(10**18); // Default to 1:1 if no shares
  
  console.log(`Share price: ${ethers.formatUnits(pricePerShare, 18)} ${assetSymbol} per share`);
  
  // Alternative method using the contract's built-in conversion function
  try {
    const oneShare = ethers.parseUnits("1", 18);
    const assetsPerShare = await yieldAllocatorVault.convertToAssets(oneShare);
    console.log(`Share price (via convertToAssets): ${ethers.formatUnits(assetsPerShare, assetDecimals)} ${assetSymbol} per share`);
  } catch (error: any) {
    console.log(`Could not calculate share price via convertToAssets: ${error.message}`);
  }

  // Projected APR
  if (START_EPOCH) {
    try {
      // calculate days elapsed from a given epoch timestamp
      const startTimeEpoch = parseInt(START_EPOCH);
      const daysElapsed = (Date.now() - startTimeEpoch) / 1000 / 60 / 60 / 24;
      
      if (daysElapsed > 0) {
        console.log(`Days elapsed: ${daysElapsed.toFixed(2)}`);
        const exponential = 365 / (daysElapsed/2);  
        const apy = Math.pow(parseFloat(ethers.formatUnits(pricePerShare, 18)), exponential) - 1;
        console.log(`Projected APY: ${(apy*100).toFixed(2)}%`);
      } else {
        console.log("Cannot calculate APY: Invalid or too recent START_EPOCH");
      }
    } catch (error: any) {
      console.log(`Error calculating APY: ${error.message}`);
    }
  } else {
    console.log("APY calculation skipped: START_EPOCH not provided");
  }
  
  // Calculate allocated assets (total - idle)
  const allocatedAssets = totalAssets - idleAssetBalance;
  console.log(`Allocated assets in pools: ${ethers.formatUnits(allocatedAssets, assetDecimals)} ${assetSymbol}`);
  
  // Get all whitelisted pools
  const whitelistedPools = await whitelistRegistry.getWhitelistedPools();
  console.log(`\nNumber of whitelisted pools: ${whitelistedPools.length}`);
  
  if (whitelistedPools.length === 0) {
    console.log("No whitelisted pools available.");
    return;
  }
  
  // Check balances in each pool
  console.log("\nPool balances:");
  for (let i = 0; i < whitelistedPools.length; i++) {
    const poolAddress = whitelistedPools[i];
    const poolBalance = await yieldAllocatorVault.poolPrincipal(poolAddress);
    
    // Get pool kind from WhitelistRegistry
    const poolKindValue = await whitelistRegistry.getPoolKind(poolAddress);
    const poolKindName = poolKindValue.toString() === "0" ? "AAVE" : "ERC4626";
    
    // Try to get pool name/info if possible
    let poolName = `Pool ${i+1}`;
    try {
      const poolContract = await ethers.getContractAt("USDTEST", poolAddress);
      try {
        const name = await poolContract.name();
        if (name) poolName = name;
      } catch (e: any) {
        // If name() fails, try symbol()
        try {
          const symbol = await poolContract.symbol();
          if (symbol) poolName = symbol;
        } catch (e2: any) {
          // Keep default name
        }
      }
    } catch (e: any) {
      // Keep default name if contract interaction fails
    }
    
    const poolBalanceBigInt = BigInt(poolBalance.toString());
    const percentage = totalAssets > 0n ? Number((poolBalanceBigInt * 10000n) / BigInt(totalAssets.toString())) / 100 : 0;
    
    console.log(`  ${poolName} (${poolAddress}) [${poolKindName}]: ${ethers.formatUnits(poolBalance, assetDecimals)} ${assetSymbol} (${percentage.toFixed(2)}%)`);
  }
  
  // Get pending deposit requests
  console.log("\n===== Pending Deposits =====");
  try {
    // Use the contract's depositQueueLength function to get the number of pending deposits
    const pendingDepositorsLength = await yieldAllocatorVault.depositQueueLength();
    console.log(`Number of pending deposits: ${pendingDepositorsLength}`);
    
    // Get total pending deposit assets
    const pendingDepositAssets = await yieldAllocatorVault.pendingDepositAssets();
    console.log(`Total pending deposit assets: ${ethers.formatUnits(pendingDepositAssets, assetDecimals)} ${assetSymbol}`);
    
    // Display individual deposit requests if there are any
    if (pendingDepositorsLength > 0) {
      console.log("\nIndividual deposit requests:");
      for (let i = 0; i < Math.min(Number(pendingDepositorsLength), 10); i++) { // Limit to 10 to avoid excessive output
        try {
          const [depositor, assets] = await yieldAllocatorVault.depositQueueAt(i);
          console.log(`  Deposit #${i+1}: ${depositor} - ${ethers.formatUnits(assets, assetDecimals)} ${assetSymbol}`);
        } catch (error: any) {
          console.log(`  Error reading deposit request at index ${i}: ${error.message}`);
        }
      }
      
      if (Number(pendingDepositorsLength) > 10) {
        console.log(`  ... and ${Number(pendingDepositorsLength) - 10} more deposits`);
      }
    }
  } catch (error: any) {
    console.log(`Error getting deposit information: ${error.message}`);
    console.log(`Number of pending deposits: 0`);
    console.log(`Total pending deposit assets: 0.0 ${assetSymbol}`);
  }

  // Get pending withdrawal requests
  console.log("\n===== Pending Withdrawals =====");
  try {
    // Use the contract's redeemQueueLength function to get the number of pending withdrawals
    const pendingWithdrawersLength = await yieldAllocatorVault.redeemQueueLength();
    console.log(`Number of pending withdrawals: ${pendingWithdrawersLength}`);
    
    // Reset the withdrawal assets counter
    totalWithdrawalAssetsNeeded = 0n;
    
    // Display individual withdrawal requests if there are any
    if (pendingWithdrawersLength > 0) {
      console.log("\nIndividual withdrawal requests:");
      for (let i = 0; i < Math.min(Number(pendingWithdrawersLength), 10); i++) { // Limit to 10 to avoid excessive output
        try {
          const [withdrawer, shares] = await yieldAllocatorVault.redeemQueueAt(i);
          const request = await yieldAllocatorVault.withdrawalRequests(withdrawer);
          if (request.exists) {
            totalWithdrawalAssetsNeeded += BigInt(request.assetsAtRequest.toString());
            console.log(`  Withdrawal #${i+1}: ${withdrawer} - ${ethers.formatUnits(request.assetsAtRequest, assetDecimals)} ${assetSymbol} (${ethers.formatUnits(shares, 18)} shares)`);
          }
        } catch (error: any) {
          console.log(`  Error reading withdrawal request at index ${i}: ${error.message}`);
        }
      }
      
      if (Number(pendingWithdrawersLength) > 10) {
        console.log(`  ... and ${Number(pendingWithdrawersLength) - 10} more withdrawals`);
      }
    }
    
    console.log(`\nTotal withdrawal assets needed: ${ethers.formatUnits(totalWithdrawalAssetsNeeded, assetDecimals)} ${assetSymbol}`);
  } catch (error: any) {
    // If we can't read pendingWithdrawers, show no pending withdrawals
    console.log(`Error getting withdrawal information: ${error.message}`);
    console.log(`Number of pending withdrawals: 0`);
    console.log(`Total withdrawal assets needed: 0.0 ${assetSymbol}`);
  }
  
  // Calculate liquidity ratio (idle assets / total assets)
  if (totalAssets > 0) {
    const liquidityRatio = Number(idleAssetBalance) * 10000 / Number(totalAssets);
    console.log(`\nLiquidity ratio: ${liquidityRatio}%`);
    
    if (liquidityRatio < 5) {
      console.log("⚠️ Warning: Low liquidity ratio. Consider withdrawing from pools to handle potential redemptions.");
    } else if (liquidityRatio > 50) {
      console.log("ℹ️ Note: High liquidity ratio. Consider depositing idle assets into pools to generate yield.");
    } else {
      console.log("✅ Healthy liquidity ratio.");
    }
  }
  
  // Calculate withdrawal coverage (idle assets / total withdrawal needs)
  if (totalWithdrawalAssetsNeeded && totalWithdrawalAssetsNeeded > 0n) {
    const withdrawalCoverage = Number(idleAssetBalance) * 10000 / Number(totalWithdrawalAssetsNeeded);
    console.log(`Withdrawal coverage: ${withdrawalCoverage}%`);
    
    if (withdrawalCoverage < 100) {
      console.log("⚠️ Warning: Insufficient idle assets to cover all withdrawal requests.");
    } else {
      console.log("✅ Sufficient idle assets to cover all withdrawal requests.");
    }
  } else {
    console.log("✅ No pending withdrawal requests.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });