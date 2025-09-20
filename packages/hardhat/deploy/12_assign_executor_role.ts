import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploy script to assign the EXECUTOR role to another address
 * 
 * This script:
 * 1. Gets the YieldAllocatorVault contract and AIAgent contract
 * 2. Checks if the caller has the DEFAULT_ADMIN_ROLE
 * 3. Assigns the EXECUTOR role to the specified address in both contracts
 * 
 * @param hre HardhatRuntimeEnvironment object.
 */
const assignExecutorRole: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre;
  const network = hre.network.name;
  
  console.log(`Assigning EXECUTOR role on network: ${network}`);

  // Get the named accounts
  const { deployer, governor: configuredGovernor } = await getNamedAccounts();
  
  // Use governor if available, otherwise fall back to deployer
  const governorAddress = configuredGovernor || deployer;
  
  console.log("Deployer account:", deployer);
  console.log("Governor account:", governorAddress, configuredGovernor ? "" : "(using deployer as fallback)");

  // Get all available signers
  const signers = await ethers.getSigners();
  let adminSigner = signers[0]; // Default to first signer
  const adminAddress = await adminSigner.getAddress();
  console.log("Admin signer account:", adminAddress);
  
  // Get the YieldAllocatorVault contract
  const yieldAllocatorVault = await ethers.getContract<Contract>("YieldAllocatorVault");
  console.log("YieldAllocatorVault address:", await yieldAllocatorVault.getAddress());
  
  // Check if the signer has the DEFAULT_ADMIN_ROLE in YieldAllocatorVault
  const DEFAULT_ADMIN_ROLE = await yieldAllocatorVault.DEFAULT_ADMIN_ROLE();
  const hasAdminRole = await yieldAllocatorVault.hasRole(DEFAULT_ADMIN_ROLE, adminAddress);
  
  if (!hasAdminRole) {
    console.error(`Error: The account ${adminAddress} does not have the DEFAULT_ADMIN_ROLE in YieldAllocatorVault`);
    console.log("Only accounts with the DEFAULT_ADMIN_ROLE can assign the EXECUTOR role");
    console.log("Please make sure you're using the correct network and account");
    return;
  }

  console.log("✅ Signer has the DEFAULT_ADMIN_ROLE in YieldAllocatorVault");
  
  // Get the AIAgent contract
  const aiAgent = await ethers.getContract<Contract>("AIAgent");
  console.log("AIAgent address:", await aiAgent.getAddress());
  
  // Check if the signer has the DEFAULT_ADMIN_ROLE in AIAgent
  const hasAdminRoleInAIAgent = await aiAgent.hasRole(DEFAULT_ADMIN_ROLE, adminAddress);
  
  if (!hasAdminRoleInAIAgent) {
    console.error(`Error: The account ${adminAddress} does not have the DEFAULT_ADMIN_ROLE in AIAgent`);
    console.log("Only accounts with the DEFAULT_ADMIN_ROLE can assign the EXECUTOR role");
    console.log("Please make sure you're using the correct network and account");
    return;
  }

  console.log("✅ Signer has the DEFAULT_ADMIN_ROLE in AIAgent");
  
  // Get the EXECUTOR role
  const EXECUTOR_ROLE = await yieldAllocatorVault.EXECUTOR();
  console.log("EXECUTOR role hash:", EXECUTOR_ROLE);
  
  // The address to assign the EXECUTOR role to
  // This can be passed as a command-line argument or hardcoded
  // For this example, we'll use a command-line argument with a default value
  // rohan wallet : 0xA15e55079e01267676157869B1D0A3026aC280Ee
  // my wallet : 0x9E23Bf1Df1248929619022Fd8Ea74d490628a9D0
  const targetAddress = '0x9E23Bf1Df1248929619022Fd8Ea74d490628a9D0'//process.env.EXECUTOR_ADDRESS || adminAddress;
  console.log("Target address for EXECUTOR role:", targetAddress);
  
  // 1. Assign EXECUTOR role in YieldAllocatorVault
  console.log("\n--- Assigning EXECUTOR role in YieldAllocatorVault ---");
  
  // Check if the target address already has the EXECUTOR role in YieldAllocatorVault
  const alreadyHasRoleInVault = await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, targetAddress);
  
  if (alreadyHasRoleInVault) {
    console.log(`The address ${targetAddress} already has the EXECUTOR role in YieldAllocatorVault`);
  } else {
    try {
      console.log(`Granting EXECUTOR role in YieldAllocatorVault to ${targetAddress}...`);
      
      // Connect with the admin signer
      const vaultWithSigner = yieldAllocatorVault.connect(adminSigner);
      
      // Grant the EXECUTOR role
      const tx = await vaultWithSigner.grantRole(EXECUTOR_ROLE, targetAddress);
      console.log(`Transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Successfully granted EXECUTOR role in YieldAllocatorVault to ${targetAddress}`);
      
      // Verify the role was assigned
      const hasRole = await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, targetAddress);
      if (hasRole) {
        console.log(`✅ Verified: ${targetAddress} now has the EXECUTOR role in YieldAllocatorVault`);
      } else {
        console.error(`❌ Verification failed: ${targetAddress} does not have the EXECUTOR role in YieldAllocatorVault`);
      }
    } catch (error: any) {
      console.error(`Failed to grant EXECUTOR role in YieldAllocatorVault:`, error.message || error);
    }
  }
  
  // 2. Assign EXECUTOR role in AIAgent
  console.log("\n--- Assigning EXECUTOR role in AIAgent ---");
  
  // Check if the target address already has the EXECUTOR role in AIAgent
  const alreadyHasRoleInAIAgent = await aiAgent.hasRole(EXECUTOR_ROLE, targetAddress);
  
  if (alreadyHasRoleInAIAgent) {
    console.log(`The address ${targetAddress} already has the EXECUTOR role in AIAgent`);
  } else {
    try {
      console.log(`Granting EXECUTOR role in AIAgent to ${targetAddress}...`);
      
      // Connect with the admin signer
      const aiAgentWithSigner = aiAgent.connect(adminSigner);
      
      // Grant the EXECUTOR role
      const tx = await aiAgentWithSigner.grantRole(EXECUTOR_ROLE, targetAddress);
      console.log(`Transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Successfully granted EXECUTOR role in AIAgent to ${targetAddress}`);
      
      // Verify the role was assigned
      const hasRole = await aiAgent.hasRole(EXECUTOR_ROLE, targetAddress);
      if (hasRole) {
        console.log(`✅ Verified: ${targetAddress} now has the EXECUTOR role in AIAgent`);
      } else {
        console.error(`❌ Verification failed: ${targetAddress} does not have the EXECUTOR role in AIAgent`);
      }
    } catch (error: any) {
      console.error(`Failed to grant EXECUTOR role in AIAgent:`, error.message || error);
    }
  }

  // set performance fee recipient
  console.log("\n--- Setting performance fee recipient ---");
  const performanceFeeRecipient = '0x1e806e09889005457D95c05e91CE69edd053b217';
  const performanceFeeBps = 1000; // 10%
  console.log(`Performance fee recipient: ${performanceFeeRecipient}`);
  console.log(`Performance fee bps: ${performanceFeeBps}`);
  
  // Connect with the admin signer
  const yieldAllocatorVaultWithSigner = yieldAllocatorVault.connect(adminSigner);
  
  // Set the performance fee recipient
  const tx = await yieldAllocatorVaultWithSigner.setPerformanceFee(performanceFeeRecipient, performanceFeeBps);
  console.log(`Transaction sent: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ Successfully set performance fee recipient to ${performanceFeeRecipient}`);
};

export default assignExecutorRole;

// Tags help you run specific deploy scripts
assignExecutorRole.tags = ["AssignExecutorRole"];
