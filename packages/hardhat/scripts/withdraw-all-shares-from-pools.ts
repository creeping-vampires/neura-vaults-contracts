import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { Contract } from "ethers";
dotenv.config();

/**
 * Script to withdraw all shares from a specific pool identified by share token address
 * This script:
 * 1. Connects to contracts using a specific wallet (via private key)
 * 2. Finds the pool associated with the provided share token address
 * 3. Withdraws all shares from that specific pool back to the vault
 *
 * Usage:
 * EXECUTOR_PRIVATE_KEY=your_private_key SHARE_TOKEN_ADDRESS=0x... npx hardhat run scripts/withdraw-all-shares-from-pools.ts --network hype-mainnet
 */

const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS;
const WHITELIST_REGISTRY_ADDRESS = process.env.WHITELIST_REGISTRY_ADDRESS;
const SHARE_TOKEN_ADDRESS = '0x333819c04975554260AaC119948562a0E24C2bd6'//process.env.SHARE_TOKEN_ADDRESS;

async function main() {
  const network = process.env.HARDHAT_NETWORK || "hype-mainnet";
  console.log(`Withdrawing all shares from pools on network: ${network}`);

  // Check required environment variables
  if (!YIELD_ALLOCATOR_VAULT_ADDRESS || !WHITELIST_REGISTRY_ADDRESS || !SHARE_TOKEN_ADDRESS) {
    console.error("Error: Required environment variables not set");
    console.log("Please set the following environment variables:");
    console.log("- YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract");
    console.log("- WHITELIST_REGISTRY_ADDRESS: Address of the WhitelistRegistry contract");
    console.log("- SHARE_TOKEN_ADDRESS: Address of the share token to withdraw (aToken for AAVE pools or the pool itself for ERC4626)");
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
  const yieldAllocatorVault = await ethers.getContractAt("YieldAllocatorVault", YIELD_ALLOCATOR_VAULT_ADDRESS, executorWallet);
  console.log("YieldAllocatorVault address:", YIELD_ALLOCATOR_VAULT_ADDRESS);

  // Get the WhitelistRegistry contract
  const whitelistRegistry = await ethers.getContractAt("WhitelistRegistry", WHITELIST_REGISTRY_ADDRESS, executorWallet);
  console.log("WhitelistRegistry address:", WHITELIST_REGISTRY_ADDRESS);

  // Check if the wallet has the EXECUTOR role on YieldAllocatorVault
  const EXECUTOR_ROLE = await yieldAllocatorVault.EXECUTOR();
  const hasExecutorRole = await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, executorAddress);

  if (!hasExecutorRole) {
    console.log(`⚠️ The account ${executorAddress} does not have the EXECUTOR role on YieldAllocatorVault`);
    console.log("Only accounts with the EXECUTOR role can withdraw assets from pools");
    console.log("This script will exit as it cannot perform any withdrawals");
    return;
  } else {
    console.log("✅ Executor wallet has the EXECUTOR role on YieldAllocatorVault");
  }

  // Get the asset token address
  const assetAddress = await yieldAllocatorVault.asset();
  console.log("Asset token address:", assetAddress);

  // Create an instance of the asset token
  const assetToken = await ethers.getContractAt("IERC20", assetAddress, executorWallet);
  
  // Get token details - using ERC20 interface which has symbol and decimals
  const erc20Token = await ethers.getContractAt("ERC20", assetAddress, executorWallet);
  const assetSymbol = await erc20Token.symbol();
  const assetDecimals = await erc20Token.decimals();
  console.log(`Asset token: ${assetSymbol} (${assetDecimals} decimals)`);

  // Get all whitelisted pools
  const whitelistedPools = await whitelistRegistry.getWhitelistedPools();
  console.log(`Number of whitelisted pools: ${whitelistedPools.length}`);

  if (whitelistedPools.length === 0) {
    console.log("No whitelisted pools available. Nothing to withdraw.");
    return;
  }

  // Get the total assets before withdrawals
  const totalAssetsBefore = await yieldAllocatorVault.totalAssets();
  console.log(`Total vault assets before withdrawals: ${ethers.formatUnits(totalAssetsBefore, assetDecimals)} ${assetSymbol}`);

  // Get the idle assets before withdrawals
  const idleAssetsBefore = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log(`Idle assets before withdrawals: ${ethers.formatUnits(idleAssetsBefore, assetDecimals)} ${assetSymbol}`);

  // Find the pool that matches the share token address
  console.log(`\n--- Looking for pool with share token address: ${SHARE_TOKEN_ADDRESS} ---`);
  
  let targetPoolAddress: string | null = null;
  let targetPoolKind: number | null = null;
  let sharesInPool = 0n;
  let assetsInPool = 0n;
  
  // First, check if the share token is directly a whitelisted pool (ERC4626 case)
  if (await whitelistRegistry.isWhitelisted(SHARE_TOKEN_ADDRESS)) {
    targetPoolAddress = SHARE_TOKEN_ADDRESS;
    const poolKindValue = await whitelistRegistry.getPoolKind(SHARE_TOKEN_ADDRESS);
    targetPoolKind = Number(poolKindValue);
    console.log(`Found direct match: ${SHARE_TOKEN_ADDRESS} is a whitelisted pool`);
  } else {
    // If not, check all AAVE pools to see if any has this as its aToken
    for (let i = 0; i < whitelistedPools.length; i++) {
      const poolAddress = whitelistedPools[i];
      const poolKindValue = await whitelistRegistry.getPoolKind(poolAddress);
      const poolKind = Number(poolKindValue);
      
      if (poolKind === 0) { // AAVE
        try {
          const pool = await ethers.getContractAt("IPool", poolAddress);
          
          // Get the reserve data to find the aToken address
          const reserveData = await pool.getReserveData(assetAddress);
          const aTokenAddress = reserveData.aTokenAddress;
          
          if (aTokenAddress.toLowerCase() === SHARE_TOKEN_ADDRESS.toLowerCase()) {
            targetPoolAddress = poolAddress;
            targetPoolKind = 0; // AAVE
            console.log(`Found AAVE pool ${poolAddress} with matching aToken: ${aTokenAddress}`);
            break;
          }
        } catch (error: any) {
          console.log(`Error checking AAVE pool ${poolAddress}: ${error.message}`);
        }
      }
    }
  }
  
  if (!targetPoolAddress) {
    console.error(`No whitelisted pool found with share token address: ${SHARE_TOKEN_ADDRESS}`);
    return;
  }
  
  console.log(`\n--- Processing pool: ${targetPoolAddress} ---`);
  
  try {
    // Get the pool kind name for display
    const poolKindName = targetPoolKind === 0 ? "AAVE" : "ERC4626";
    console.log(`Pool kind: ${poolKindName}`);
    
    // Get the principal amount in the pool
    const poolPrincipal = await yieldAllocatorVault.poolPrincipal(targetPoolAddress);
    console.log(`Pool principal: ${ethers.formatUnits(poolPrincipal, assetDecimals)} ${assetSymbol}`);
    
    // Check if there are any shares in the pool
    if (targetPoolKind === 0) { // AAVE
      // For AAVE-style pools, the share token is the aToken
      const aToken = await ethers.getContractAt("IERC20", SHARE_TOKEN_ADDRESS);
      sharesInPool = await aToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      assetsInPool = sharesInPool; // For AAVE, 1 aToken = 1 underlying asset
      
      console.log(`aToken address: ${SHARE_TOKEN_ADDRESS}`);
      console.log(`aToken balance: ${ethers.formatUnits(sharesInPool, assetDecimals)}`);
    } else if (targetPoolKind === 1) { // ERC4626
      // For ERC4626 pools, the pool itself is the share token
      const pool = await ethers.getContractAt("IERC4626Like", targetPoolAddress);
      
      sharesInPool = await pool.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
      
      if (sharesInPool > 0n) {
        // Convert shares to assets
        assetsInPool = await pool.convertToAssets(sharesInPool);
        
        console.log(`ERC4626 shares: ${ethers.formatUnits(sharesInPool, assetDecimals)}`);
        console.log(`Equivalent assets: ${ethers.formatUnits(assetsInPool, assetDecimals)} ${assetSymbol}`);
      } else {
        console.log("No shares in this ERC4626 pool");
      }
    }
    
    // If there are assets in the pool, withdraw them
    if (assetsInPool > 0n) {
      console.log(`Withdrawing ${ethers.formatUnits(assetsInPool, assetDecimals)} ${assetSymbol} from pool...`);
      
      try {
        // Withdraw all assets from the pool
        const tx = await yieldAllocatorVault.withdrawFromPool(targetPoolAddress, assetsInPool);
        console.log(`Transaction sent: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Successfully withdrawn assets from pool`);
      } catch (error: any) {
        console.error(`Failed to withdraw assets from pool:`, error.message);
        
        // If the first attempt fails, try with a slightly lower amount (99.5%)
        try {
          console.log("Trying with 99.5% of the assets...");
          const reducedAmount = (assetsInPool * 995n) / 1000n;
          const tx = await yieldAllocatorVault.withdrawFromPool(targetPoolAddress, reducedAmount);
          console.log(`Transaction sent: ${tx.hash}`);
          await tx.wait();
          console.log(`✅ Successfully withdrawn reduced amount from pool`);
        } catch (retryError: any) {
          console.error(`Failed to withdraw reduced amount:`, retryError.message);
        }
      }
    } else {
      console.log("No assets to withdraw from this pool");
    }
  } catch (error: any) {
    console.error(`Error processing pool ${targetPoolAddress}:`, error.message);
  }

  // Get the total assets after withdrawals
  const totalAssetsAfter = await yieldAllocatorVault.totalAssets();
  console.log(`\nTotal vault assets after withdrawals: ${ethers.formatUnits(totalAssetsAfter, assetDecimals)} ${assetSymbol}`);

  // Get the idle assets after withdrawals
  const idleAssetsAfter = await assetToken.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log(`Idle assets after withdrawals: ${ethers.formatUnits(idleAssetsAfter, assetDecimals)} ${assetSymbol}`);

  // Calculate the difference
  const idleAssetsDiff = idleAssetsAfter - idleAssetsBefore;
  console.log(`Total assets withdrawn: ${ethers.formatUnits(idleAssetsDiff, assetDecimals)} ${assetSymbol}`);
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
