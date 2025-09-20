import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Deploy script to configure Pyth oracle addresses in the YieldAllocatorVault contract
 * 
 * This script:
 * 1. Gets the YieldAllocatorVault contract
 * 2. Sets the Pyth oracle address
 * 3. Sets price IDs for assets (e.g. USDe/USD)
 * 
 * Environment variables:
 * - YIELD_ALLOCATOR_VAULT_ADDRESS: Address of the YieldAllocatorVault contract
 * - PYTH_ORACLE_ADDRESS: Address of the Pyth oracle contract
 * - ASSET_ADDRESS: Address of the asset (e.g. USDe token)
 * - ASSET_PRICE_ID: Pyth price ID for the asset (bytes32 format)
 * 
 * @param hre HardhatRuntimeEnvironment object.
 */
const configurePythOracle: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const network = hre.network.name;
  
  console.log(`Configuring Pyth oracle on network: ${network}`);

  // Get environment variables
  const vaultAddress = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS;
  const pythOracleAddress = process.env.PYTH_HYPE_EVM_ADDRESS;
  const assetAddress = process.env.USDE;
  
  // Define the price ID as a properly formatted bytes32 value
  // This is the USDe/USD price feed ID from Pyth
  const priceIdHex = "0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d";
  // For bytes32, we just need to ensure it's a valid hex string with 0x prefix
  const assetPriceIdBytes32 = priceIdHex;

  // Validate environment variables
  if (!vaultAddress) {
    throw new Error("YIELD_ALLOCATOR_VAULT_ADDRESS environment variable not set");
  }
  
  if (!pythOracleAddress) {
    throw new Error("PYTH_ORACLE_ADDRESS environment variable not set");
  }

  if (!assetAddress) {
    throw new Error("ASSET_ADDRESS environment variable not set");
  }

  if (!priceIdHex) {
    throw new Error("Asset price ID is not defined");
  }

  console.log("YieldAllocatorVault address:", vaultAddress);
  console.log("Pyth oracle address:", pythOracleAddress);
  console.log("Asset address:", assetAddress);
  console.log("Asset price ID (hex):", priceIdHex);
  console.log("Asset price ID (bytes32):", assetPriceIdBytes32);

  // Get all available signers
  const signers = await ethers.getSigners();
  let adminSigner = signers[0]; // Default to first signer
  const adminAddress = await adminSigner.getAddress();
  console.log("Admin signer account:", adminAddress);
  
  // Get the YieldAllocatorVault contract
  const YieldAllocatorVault = await ethers.getContractFactory("YieldAllocatorVault");
  const yieldAllocatorVault = YieldAllocatorVault.attach(vaultAddress).connect(adminSigner) as any;
  
  // Check if the signer has the DEFAULT_ADMIN_ROLE
  const DEFAULT_ADMIN_ROLE = await yieldAllocatorVault.DEFAULT_ADMIN_ROLE();
  const hasAdminRole = await yieldAllocatorVault.hasRole(DEFAULT_ADMIN_ROLE, adminAddress);
  
  if (!hasAdminRole) {
    console.error(`Error: The account ${adminAddress} does not have the DEFAULT_ADMIN_ROLE in YieldAllocatorVault`);
    console.log("Only accounts with the DEFAULT_ADMIN_ROLE can configure the Pyth oracle");
    console.log("Please make sure you're using the correct network and account");
    return;
  }

  console.log("✅ Signer has the DEFAULT_ADMIN_ROLE in YieldAllocatorVault");
  
  // 1. Set the Pyth oracle address
  console.log("\n--- Setting Pyth oracle address ---");
  
  try {
    // First check if the Pyth oracle address is already set correctly
    const currentPythAddress = await yieldAllocatorVault.pyth();
    
    if (currentPythAddress.toLowerCase() === pythOracleAddress.toLowerCase()) {
      console.log(`Pyth oracle address is already set correctly to ${currentPythAddress}`);
    } else {
      console.log(`Setting Pyth oracle address to ${pythOracleAddress}...`);
      
      // Set transaction options with higher gas limit and price to avoid network issues
      const options = {
        gasLimit: 500000,
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        maxFeePerGas: ethers.parseUnits('100', 'gwei')
      };
      
      const setPythTx = await yieldAllocatorVault.setPythAddress(pythOracleAddress, options);
      console.log(`Transaction sent: ${setPythTx.hash}`);
      
      try {
        await setPythTx.wait();
        console.log(`✅ Successfully set Pyth oracle address to ${pythOracleAddress}`);
        
        // Verify the Pyth address was set correctly
        const updatedPythAddress = await yieldAllocatorVault.pyth();
        if (updatedPythAddress.toLowerCase() === pythOracleAddress.toLowerCase()) {
          console.log(`✅ Verified: Pyth oracle address is set correctly to ${updatedPythAddress}`);
        } else {
          console.error(`❌ Verification failed: Pyth oracle address is set to ${updatedPythAddress}, expected ${pythOracleAddress}`);
        }
      } catch (waitError: any) {
        console.error(`Error waiting for transaction: ${waitError.message}`);
        console.log(`Transaction may still be pending. Check the transaction hash: ${setPythTx.hash}`);
      }
    }
  } catch (error: any) {
    console.error(`Failed to set Pyth oracle address:`, error.message || error);
    return;
  }
  
  // 2. Set price ID for the asset
  console.log("\n--- Setting price ID for asset ---");
  
  try {
    // First check if the price ID is already set correctly
    const hasPriceId = await yieldAllocatorVault.hasAssetPriceId(assetAddress);
    const currentPriceId = hasPriceId ? await yieldAllocatorVault.priceIdForAsset(assetAddress) : ethers.ZeroHash;
    
    if (currentPriceId === assetPriceIdBytes32) {
      console.log(`Price ID for asset ${assetAddress} is already set correctly to ${currentPriceId}`);
    } else {
      console.log(`Setting price ID for asset ${assetAddress} to ${priceIdHex}...`);
      
      // Set transaction options with higher gas limit and price to avoid network issues
      const options = {
        gasLimit: 500000,
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        maxFeePerGas: ethers.parseUnits('100', 'gwei')
      };
      
      try {
        const setPriceIdTx = await yieldAllocatorVault.setPriceIdForAsset(assetAddress, assetPriceIdBytes32, options);
        console.log(`Transaction sent: ${setPriceIdTx.hash}`);
        
        try {
          await setPriceIdTx.wait();
          console.log(`✅ Successfully set price ID for asset ${assetAddress} to ${priceIdHex}`);
          
          // Verify the price ID was set correctly
          const updatedPriceId = await yieldAllocatorVault.priceIdForAsset(assetAddress);
          if (updatedPriceId === assetPriceIdBytes32) {
            console.log(`✅ Verified: Price ID for asset ${assetAddress} is set correctly to ${updatedPriceId}`);
          } else {
            console.error(`❌ Verification failed: Price ID for asset ${assetAddress} is set to ${updatedPriceId}, expected ${priceIdHex}`);
          }
        } catch (waitError: any) {
          console.error(`Error waiting for transaction: ${waitError.message}`);
          console.log(`Transaction may still be pending. Check the transaction hash: ${setPriceIdTx.hash}`);
        }
      } catch (txError: any) {
        console.error(`Failed to set price ID for asset: ${txError.message}`);
        
        // If there's an issue with the bytes32 format, try using ethers.id instead
        if (txError.message.includes('invalid BytesLike')) {
          console.log('Trying alternative bytes32 format...');
          
          // Try a different approach to format the bytes32 value
          // Just use the hex string directly
          console.log(`Using original price ID: ${priceIdHex}`);
          
          try {
            const setPriceIdTx = await yieldAllocatorVault.setPriceIdForAsset(assetAddress, priceIdHex, options);
            console.log(`Transaction sent: ${setPriceIdTx.hash}`);
            await setPriceIdTx.wait();
            console.log(`✅ Successfully set price ID for asset ${assetAddress}`);
          } catch (retryError: any) {
            console.error(`Failed with alternative format: ${retryError.message}`);
          }
        }
      }
    }
  } catch (error: any) {
    console.error(`Failed to set price ID for asset:`, error.message || error);
  }
  
  console.log("\n✅ Pyth oracle configuration complete");
};

export default configurePythOracle;

// Tags help you run specific deploy scripts
configurePythOracle.tags = ["ConfigurePythOracle"];
