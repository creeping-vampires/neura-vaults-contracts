import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploy script to deposit assets into the YieldAllocatorVault
 * 
 * This script:
 * 1. Gets the YieldAllocatorVault contract
 * 2. Gets the asset token (USDe)
 * 3. Checks user balance of the asset
 * 4. Approves the vault to spend the asset
 * 5. Deposits the specified amount into the vault
 * 6. Verifies the deposit by checking the user's share balance
 * 
 * @param hre HardhatRuntimeEnvironment object.
 */
const userDepositToVault: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre;
  const network = hre.network.name;
  
  console.log(`Depositing assets to YieldAllocatorVault on network: ${network}`);

  // Get the named accounts
  const { deployer } = await getNamedAccounts();
  
  // Get all available signers
  const signers = await ethers.getSigners();
  const userSigner = signers[0]; // Default to first signer as the user
  const userAddress = await userSigner.getAddress();
  
  console.log("User account:", userAddress);
  
  // Get the YieldAllocatorVault contract
  const yieldAllocatorVault = await ethers.getContract<Contract>("YieldAllocatorVault");
  console.log("YieldAllocatorVault address:", await yieldAllocatorVault.getAddress());
  
  // Get the asset token address
  const assetAddress = await yieldAllocatorVault.asset();
  console.log("Asset token address:", assetAddress);
  
  // Create an instance of the asset token
  const assetToken = await ethers.getContractAt("USDTEST", assetAddress);
  
  try {
    // Get token details
    const assetSymbol = await assetToken.symbol();
    const assetDecimals = await assetToken.decimals();
    console.log(`Asset token: ${assetSymbol} (${assetDecimals} decimals)`);
    
    // Check user's asset balance
    const userBalance = await assetToken.balanceOf(userAddress);
    console.log(`User ${assetSymbol} balance: ${ethers.formatUnits(userBalance, assetDecimals)}`);
    
    if (Number(userBalance) === 0) {
      console.error(`Error: User has no ${assetSymbol} balance. Please fund the account first.`);
      return;
    }
    
    // Define deposit amount - default to 10% of user's balance or the full balance if it's very small
    // You can adjust this or make it configurable via command line arguments
    let depositAmount;
    const minDepositAmount = ethers.parseUnits("0.01", assetDecimals); // 1 token minimum
    depositAmount = minDepositAmount;
    
    // Check current allowance
    const currentAllowance = await assetToken.allowance(userAddress, await yieldAllocatorVault.getAddress());
    console.log(`Current allowance: ${ethers.formatUnits(currentAllowance, assetDecimals)} ${assetSymbol}`);
    
    // Approve the vault to spend the asset if needed
    if (Number(currentAllowance) < Number(depositAmount)) {
      console.log(`Approving ${ethers.formatUnits(depositAmount, assetDecimals)} ${assetSymbol} to be spent by the vault...`);
      const approveTx = await assetToken.connect(userSigner).approve(
        await yieldAllocatorVault.getAddress(),
        depositAmount
      );
      console.log(`Approval transaction sent: ${approveTx.hash}`);
      await approveTx.wait();
      console.log("✅ Approval successful");
    } else {
      console.log("✅ Sufficient allowance already approved");
    }
    
    // Get user's current share balance
    const userSharesBefore = await yieldAllocatorVault.balanceOf(userAddress);
    console.log(`User vault shares before deposit: ${ethers.formatUnits(userSharesBefore, assetDecimals)}`);
    
    // Calculate expected shares to receive (preview)
    const expectedShares = await yieldAllocatorVault.previewDeposit(depositAmount);
    console.log(`Expected shares to receive: ${ethers.formatUnits(expectedShares, assetDecimals)}`);
    
    // Deposit assets into the vault
    console.log(`Depositing ${ethers.formatUnits(depositAmount, assetDecimals)} ${assetSymbol} into the vault...`);
    const depositTx = await yieldAllocatorVault.connect(userSigner).requestDeposit(
      depositAmount,
      userAddress
    );
    console.log(`Deposit transaction sent: ${depositTx.hash}`);
    await depositTx.wait();
    console.log("✅ Deposit successful");
    
    // Verify deposit by checking user's new share balance
    const userSharesAfter = await yieldAllocatorVault.balanceOf(userAddress);
    console.log(`User vault shares after deposit: ${ethers.formatUnits(userSharesAfter, assetDecimals)}`);
    
    const sharesReceived = userSharesAfter.sub(userSharesBefore);
    console.log(`Shares received: ${ethers.formatUnits(sharesReceived, assetDecimals)}`);
    
    // Calculate assets that can be redeemed with these shares
    const assetsRedeemable = await yieldAllocatorVault.previewRedeem(sharesReceived);
    console.log(`Assets redeemable with new shares: ${ethers.formatUnits(assetsRedeemable, assetDecimals)} ${assetSymbol}`);
    
    // Check vault's total assets and supply after deposit
    const totalAssets = await yieldAllocatorVault.totalAssets();
    const totalSupply = await yieldAllocatorVault.totalSupply();
    console.log(`\nVault total assets: ${ethers.formatUnits(totalAssets, assetDecimals)} ${assetSymbol}`);
    console.log(`Vault total supply: ${ethers.formatUnits(totalSupply, assetDecimals)} shares`);
    
    // Calculate and display the vault's exchange rate
    if (!totalSupply.isZero()) {
      const exchangeRate = totalAssets.mul(ethers.parseUnits("1", assetDecimals)).div(totalSupply);
      console.log(`Current exchange rate: 1 share = ${ethers.formatUnits(exchangeRate, assetDecimals)} ${assetSymbol}`);
    }
    
  } catch (error: any) {
    console.error("Error during deposit process:", error.message || error);
  }
};

export default userDepositToVault;

// Tags help you run specific deploy scripts
userDepositToVault.tags = ["UserDeposit"];
