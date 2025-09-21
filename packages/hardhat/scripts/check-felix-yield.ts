import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// Standard ERC4626 interface
const ERC4626_ABI = [
  "function asset() external view returns (address)",
  "function totalAssets() external view returns (uint256)",
  "function convertToShares(uint256 assets) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function maxDeposit(address) external view returns (uint256)",
  "function previewDeposit(uint256 assets) external view returns (uint256)",
  "function deposit(uint256 assets, address receiver) external returns (uint256)",
  "function maxMint(address) external view returns (uint256)",
  "function previewMint(uint256 shares) external view returns (uint256)",
  "function mint(uint256 shares, address receiver) external returns (uint256)",
  "function maxWithdraw(address owner) external view returns (uint256)",
  "function previewWithdraw(uint256 assets) external view returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256)",
  "function maxRedeem(address owner) external view returns (uint256)",
  "function previewRedeem(uint256 shares) external view returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) external returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)"
];

// Felix USDe Pool address
const FELIX_POOL_ADDRESS = "0x835FEBF893c6DdDee5CF762B0f8e31C5B06938ab";
const YIELD_ALLOCATOR_VAULT_ADDRESS = process.env.YIELD_ALLOCATOR_VAULT_ADDRESS || "0x8D79772CCAf2C18969Ec5c6Ca54c07aCb036DC9a";

async function main() {
  console.log("Checking Felix Pool yield...");
  
  // Get contract instances
  const felixPool = await ethers.getContractAt(ERC4626_ABI, FELIX_POOL_ADDRESS);
  const vault = await ethers.getContractAt(
    ["function poolPrincipal(address) view returns (uint256)"],
    YIELD_ALLOCATOR_VAULT_ADDRESS
  );
  
  // Get asset token
  const assetAddress = await felixPool.asset();
  const assetToken = await ethers.getContractAt(["function decimals() view returns (uint8)", "function symbol() view returns (string)"], assetAddress);
  const decimals = await assetToken.decimals();
  const symbol = await assetToken.symbol();
  
  console.log(`Felix Pool Asset: ${symbol} (${assetAddress})`);
  
  // Get vault's share balance in Felix pool
  const shareBalance = await felixPool.balanceOf(YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log(`Vault's share balance in Felix: ${ethers.formatUnits(shareBalance, decimals)}`);
  
  // Get asset value of shares
  const assetValue = await felixPool.convertToAssets(shareBalance);
  console.log(`Asset value of shares: ${ethers.formatUnits(assetValue, decimals)} ${symbol}`);
  
  // Get pool principal from vault
  const poolPrincipal = await vault.poolPrincipal(FELIX_POOL_ADDRESS);
  console.log(`Recorded principal in vault: ${ethers.formatUnits(poolPrincipal, decimals)} ${symbol}`);
  
  // Calculate yield
  const yieldAmount = assetValue > poolPrincipal ? assetValue - poolPrincipal : 0n;
  console.log(`Yield in Felix pool: ${ethers.formatUnits(yieldAmount, decimals)} ${symbol}`);
  
  // Calculate yield percentage
  if (poolPrincipal > 0n) {
    // Convert BigInt to string first, then to Number to avoid precision issues
    const yieldPercentageBasis = Number(((yieldAmount * BigInt(10000)) / poolPrincipal).toString());
    const yieldPercentage = yieldPercentageBasis / 100;
    console.log(`Yield percentage: ${yieldPercentage}%`);
  }
  
  // Get total pool stats
  const totalAssets = await felixPool.totalAssets();
  const totalSupply = await felixPool.totalSupply();
  
  console.log("\nFelix Pool Stats:");
  console.log(`Total assets: ${ethers.formatUnits(totalAssets, decimals)} ${symbol}`);
  console.log(`Total supply: ${ethers.formatUnits(totalSupply, decimals)} shares`);
  
  if (totalSupply > 0n) {
    const pricePerShare = (totalAssets * BigInt(10 ** Number(decimals))) / totalSupply;
    console.log(`Price per share: ${ethers.formatUnits(pricePerShare, decimals)} ${symbol}`);
  }
  
  // Check maxRedeem for vault
  const maxRedeemShares = await felixPool.maxRedeem(YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log(`\nMax Redeem (shares): ${ethers.formatUnits(maxRedeemShares, decimals)}`);
  
  // Convert maxRedeem shares to assets
  const maxRedeemAssets = await felixPool.convertToAssets(maxRedeemShares);
  console.log(`Max Redeem (assets): ${ethers.formatUnits(maxRedeemAssets, decimals)} ${symbol}`);
  
  // Check if maxRedeem is limited by share balance
  if (maxRedeemShares < shareBalance) {
    console.log(`⚠️ Max redeem is limited! (${ethers.formatUnits(maxRedeemShares, decimals)} < ${ethers.formatUnits(shareBalance, decimals)} shares)`);
  } else {
    console.log(`✅ Max redeem equals full share balance`);
  }
  
  // Check maxWithdraw for vault
  const maxWithdrawAssets = await felixPool.maxWithdraw(YIELD_ALLOCATOR_VAULT_ADDRESS);
  console.log(`\nMax Withdraw (assets): ${ethers.formatUnits(maxWithdrawAssets, decimals)} ${symbol}`);
  
  // Convert maxWithdraw assets to shares
  const maxWithdrawShares = await felixPool.convertToShares(maxWithdrawAssets);
  console.log(`Max Withdraw (shares): ${ethers.formatUnits(maxWithdrawShares, decimals)}`);
  
  // Compare with asset value
  if (maxWithdrawAssets < assetValue) {
    console.log(`⚠️ Max withdraw is limited! (${ethers.formatUnits(maxWithdrawAssets, decimals)} < ${ethers.formatUnits(assetValue, decimals)} ${symbol})`);
  } else {
    console.log(`✅ Max withdraw equals full asset value`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
