import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the YieldAllocatorVault and AIAgent contracts on mainnet
 * This script is specifically designed for production deployment
 * with appropriate security measures and configuration
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployMainnet: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Ensure we're on mainnet or a production network
  const network = hre.network.name;
  if (network === "localhost" || network === "hardhat") {
    console.warn("⚠️ Warning: You are deploying to a local network. This script is intended for mainnet deployment.");
    // Uncomment the line below to prevent accidental local deployment
    // return;
  }

  console.log(`Deploying to network: ${network}`);

  const { deployer, governor: configuredGovernor, treasury: configuredTreasury } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Use deployer as fallback if governor or treasury is not configured
  const governor = configuredGovernor || deployer;
  const treasury = configuredTreasury || deployer;

  console.log("Deployer:", deployer);
  console.log("Governor:", governor, configuredGovernor ? "" : "(using deployer as fallback)");
  console.log("Treasury:", treasury, configuredTreasury ? "" : "(using deployer as fallback)");

  // Step 1: Deploy the WhitelistRegistry with the governor as the admin
  console.log("\n📝 Deploying WhitelistRegistry...");
  const whitelistRegistry = await deploy("WhitelistRegistry", {
    from: deployer,
    args: [governor], // Pass the governor as the admin
    log: true,
    autoMine: true,
  });

  console.log("✅ WhitelistRegistry deployed at:", whitelistRegistry.address);

  // Step 2: Configure the underlying asset
  // For hyperliquid mainnet, we use USDe
  // Replace with the correct address for the target network
  // USDe : 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34
  // USDT0 : 0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb
  let assetAddress = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34";

  // for USDT0 vault
  // let shareTokenName = 'AI Yield XYZ0';
  // let shareTokenSymbol = 'aiXYZ0';

  // for USDe vault
  let shareTokenName = 'AI Yield XYZ';
  let shareTokenSymbol = 'aiXYZ';

  console.log(`Using asset at address: ${assetAddress}`);

  // Step 3: Deploy YieldAllocatorVault
  console.log("\n📝 Deploying YieldAllocatorVault...");
  const yieldAllocatorVault = await deploy("YieldAllocatorVault", {
    from: deployer,
    args: [
      assetAddress, // IERC20 _asset (USDC)
      shareTokenName, // name_
      shareTokenSymbol, // symbol_
      whitelistRegistry.address, // WhitelistRegistry _registry
      governor, // admin
    ],
    log: true,
    autoMine: true,
  });

  console.log("✅ YieldAllocatorVault deployed at:", yieldAllocatorVault.address);

  // Step 4: Deploy AIAgent
  console.log("\n📝 Deploying AIAgent...");
  const aiAgent = await deploy("AIAgent", {
    from: deployer,
    args: [
      yieldAllocatorVault.address, // YieldAllocatorVault _vault
      whitelistRegistry.address, // WhitelistRegistry _registry
      governor, // executor - initially set to governor, can be transferred later
    ],
    log: true,
    autoMine: true,
  });

  console.log("✅ AIAgent deployed at:", aiAgent.address);

  // Step 5: Get contract instances to interact with them
  const whitelistRegistryContract = await hre.ethers.getContract<Contract>("WhitelistRegistry", deployer);
  const yieldAllocatorVaultContract = await hre.ethers.getContract<Contract>("YieldAllocatorVault", deployer);

  // Step 6: Grant EXECUTOR role to AIAgent in YieldAllocatorVault
  console.log("\n📝 Setting up roles and permissions...");
  const EXECUTOR_ROLE = await yieldAllocatorVaultContract.EXECUTOR();
  const grantRoleTx = await yieldAllocatorVaultContract.grantRole(EXECUTOR_ROLE, aiAgent.address);
  await grantRoleTx.wait();
  console.log("✅ Granted EXECUTOR role to AIAgent in YieldAllocatorVault");

  // Step 7: Set up initial whitelisted pools (if any)
  // This would typically be done after thorough security audits of each pool
  // Example of how to whitelist a production pool:
  /*
  const poolAddress = "0x..."; // Address of audited yield-generating protocol
  const setPoolTx = await whitelistRegistryContract.setPool(poolAddress, true);
  await setPoolTx.wait();
  console.log(`✅ Added ${poolAddress} to whitelist registry`);
  */

  // Step 8: Output deployment summary
  console.log("\n🚀 Deployment Summary:");
  console.log("====================");
  console.log(`Network: ${network}`);
  console.log(`WhitelistRegistry: ${whitelistRegistry.address}`);
  console.log(`YieldAllocatorVault: ${yieldAllocatorVault.address}`);
  console.log(`AIAgent: ${aiAgent.address}`);
  console.log(`Underlying Asset: ${assetAddress}`);
  console.log(`Governor: ${governor}`);
  console.log(`Treasury: ${treasury}`);
  console.log("====================");
  console.log("✅ Deployment complete!");
  console.log("\n📝 To verify contracts, run:");
  console.log(`npx hardhat run scripts/verify-contracts.ts --network ${network}`);
};

export default deployMainnet;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags MainnetDeploy
deployMainnet.tags = ["MainnetDeploy"];
