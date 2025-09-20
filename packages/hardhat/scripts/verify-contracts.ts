import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Import hardhat config to get access to network configurations
import * as hre from "hardhat";

/**
 * Script to verify deployed contracts on block explorers
 * 
 * Usage:
 * npx hardhat run scripts/verify-contracts.ts --network <network-name>
 * 
 * This script reads deployment information from the deployments directory
 * and attempts to verify each contract on the appropriate block explorer.
 */
async function main() {
  const network = hre.network.name;
  console.log(`Verifying contracts on ${network}...`);

  // Path to deployments directory
  const deploymentsDir = path.join(__dirname, "../deployments", network);
  
  if (!fs.existsSync(deploymentsDir)) {
    console.error(`No deployments found for network ${network}`);
    return;
  }

  // Get all contract deployments
  const files = fs.readdirSync(deploymentsDir).filter(file => file.endsWith('.json'));

  // Track verification results
  const results = {
    success: [] as string[],
    failed: [] as {name: string, error: string}[]
  };

  // Process each contract
  for (const file of files) {
    const contractName = path.basename(file, '.json');
    const deploymentPath = path.join(deploymentsDir, file);
    
    try {
      // Read deployment data
      const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      const address = deploymentData.address;
      
      if (!address) {
        console.log(`⚠️ No address found for ${contractName}, skipping verification`);
        continue;
      }

      // Get constructor arguments
      const constructorArgs = deploymentData.args || [];
      
      console.log(`🔍 Verifying ${contractName} at ${address}...`);
      
      try {
        // Attempt to verify the contract
        await hre.run("verify:verify", {
          address: address,
          constructorArguments: constructorArgs,
          contract: getContractPath(contractName),
        });
        
        console.log(`✅ ${contractName} verified successfully`);
        results.success.push(contractName);
      } catch (error: any) {
        // Check if it's already verified
        if (error.message.includes("Already Verified") || 
            error.message.includes("already verified")) {
          console.log(`✅ ${contractName} already verified`);
          results.success.push(contractName);
        } else {
          console.error(`❌ Error verifying ${contractName}:`, error.message);
          results.failed.push({name: contractName, error: error.message});
        }
      }
    } catch (error: any) {
      console.error(`❌ Error processing ${contractName}:`, error.message);
      results.failed.push({name: contractName, error: error.message});
    }
    
    // Add a small delay between verification attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log("\n📋 Verification Summary:");
  console.log("=======================");
  console.log(`✅ Successfully verified: ${results.success.length} contracts`);
  results.success.forEach(name => console.log(`  - ${name}`));
  
  console.log(`\n❌ Failed to verify: ${results.failed.length} contracts`);
  results.failed.forEach(({name, error}) => console.log(`  - ${name}: ${error}`));
}

/**
 * Helper function to get the contract path for verification
 */
function getContractPath(contractName: string): string {
  // Map contract names to their file paths
  const contractPaths: Record<string, string> = {
    "WhitelistRegistry": "contracts/WhitelistRegistry.sol:WhitelistRegistry",
    "YieldAllocatorVault": "contracts/YieldAllocatorVault.sol:YieldAllocatorVault",
    "AIAgent": "contracts/AIAgent.sol:AIAgent",
    "MockPool": "contracts/test/MockPool.sol:MockPool",
    "USDTEST": "contracts/test/USDTEST.sol:USDTEST"
  };

  return contractPaths[contractName] || "";
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
