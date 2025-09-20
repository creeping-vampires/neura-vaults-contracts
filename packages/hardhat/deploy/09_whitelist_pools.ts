import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * Whitelists pools in the WhitelistRegistry contract
 * Uses pools.json in the deploy directory for pool addresses
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const whitelistPools: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre;
  const network = hre.network.name;
  
  console.log(`Whitelisting pools on network: ${network}`);

  // Get the named accounts
  const { deployer, governor: configuredGovernor } = await getNamedAccounts();
  
  // Use governor if available, otherwise fall back to deployer
  const governorAddress = configuredGovernor || deployer;
  
  console.log("Deployer account:", deployer);
  console.log("Governor account:", governorAddress, configuredGovernor ? "" : "(using deployer as fallback)");

  // Get all available signers
  const signers = await ethers.getSigners();
  let governorSigner = signers[0]; // Default to first signer
  
  // Find the signer that matches the governor address
  for (const signer of signers) {
    if (await signer.getAddress() === governorAddress) {
      governorSigner = signer;
      break;
    }
  }
  
  console.log("Using signer:", await governorSigner.getAddress());

  // Get the WhitelistRegistry contract with the governor signer
  const whitelistRegistry = await ethers.getContract("WhitelistRegistry");
  const whitelistRegistryWithSigner = whitelistRegistry.connect(governorSigner);
  console.log("WhitelistRegistry address:", await whitelistRegistry.getAddress());

  // Check if the signer has the GOVERNOR role
  const GOVERNOR_ROLE = await (whitelistRegistry as any).GOVERNOR();
  const hasRole = await (whitelistRegistry as any).hasRole(GOVERNOR_ROLE, await governorSigner.getAddress());
  
  if (!hasRole) {
    console.error(`Error: The account ${await governorSigner.getAddress()} does not have the GOVERNOR role`);
    console.log("Only accounts with the GOVERNOR role can whitelist pools");
    console.log("Please make sure you're using the correct network and account");
    return;
  }

  console.log("✅ Signer has the GOVERNOR role");

  // Check if the pools file exists - first look in deploy directory, then in scripts
  const scriptsDirPoolsPath = path.join(__dirname, "../scripts/pools.json");
  
  let poolsFilePath: string;
  
  if (fs.existsSync(scriptsDirPoolsPath)) {
    poolsFilePath = scriptsDirPoolsPath;
  } else if (fs.existsSync(scriptsDirPoolsPath)) {
    poolsFilePath = scriptsDirPoolsPath;
  } else {
    console.error(`Error: Pools file not found at ${scriptsDirPoolsPath}`);
    console.log("Please create a pools.json file with the following format:");
    console.log(`
    {
      "pools": [
        {
          "address": "0x1234567890123456789012345678901234567890",
          "name": "Mainnet Pool",
          "kind": "AAVE" // or "ERC4626"
        }
      ]
    }
    `);
    return;
  }

  console.log(`Using pools file at: ${poolsFilePath}`);

  // Read the pools file
  const poolsData = JSON.parse(fs.readFileSync(poolsFilePath, "utf8"));
  const pools = poolsData.pools || [];

  if (pools.length === 0) {
    console.log("No pools found in the pools.json file");
    return;
  }

  console.log(`Found ${pools.length} pools to whitelist`);

  // Whitelist each pool
  for (const pool of pools) {
    const { address, name, kind } = pool;
    
    // Validate the address
    if (!ethers.isAddress(address)) {
      console.error(`Error: Invalid address for pool ${name}: ${address}`);
      continue;
    }

    // Validate the kind
    if (!kind || (kind !== "AAVE" && kind !== "ERC4626")) {
      console.error(`Error: Invalid or missing kind for pool ${name}. Must be either "AAVE" or "ERC4626"`);
      continue;
    }

    console.log(`Whitelisting pool ${name} at address ${address} with kind ${kind}...`);
    
    // Check if the pool is already whitelisted
    const isWhitelisted = await (whitelistRegistry as any).isWhitelisted(address);
    if (isWhitelisted) {
      console.log(`Pool ${name} is already whitelisted`);
      continue;
    }

    // Convert kind string to enum value (0 for AAVE, 1 for ERC4626)
    const kindValue = kind === "AAVE" ? 0 : 1;

    // Whitelist the pool
    try {
      // Use function call syntax to avoid TypeScript errors
      const tx = await (whitelistRegistryWithSigner as any).setPool(address, true, kindValue);
      console.log(`Transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Successfully whitelisted pool ${name} as ${kind}`);
    } catch (error: any) {
      console.error(`Failed to whitelist pool ${name}:`, error.message || error);
    }
  }

  // Get all whitelisted pools
  const whitelistedPools = await (whitelistRegistry as any).getWhitelistedPools();
  console.log("\nAll whitelisted pools:");
  for (const poolAddress of whitelistedPools) {
    console.log(`- ${poolAddress}`);
  }
};

export default whitelistPools;

// Tags help you run specific deploy scripts
whitelistPools.tags = ["WhitelistPools"];
