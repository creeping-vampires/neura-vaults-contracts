import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract, BaseContract } from "ethers";

// Define interface for YieldAllocatorVault to fix TypeScript errors
interface YieldAllocatorVaultInterface extends BaseContract {
  asset(): Promise<string>;
  balanceOf(account: string): Promise<bigint>;
  totalAssets(): Promise<bigint>;
  totalSupply(): Promise<bigint>;
  hasPendingRedeem(account: string): Promise<boolean>;
  pendingShares7540(account: string): Promise<bigint>;
  claimableShares7540(account: string): Promise<bigint>;
  claimableAssets7540(account: string): Promise<bigint>;
  escrowedShares7540(account: string): Promise<bigint>;
  redeemQueueLength(): Promise<bigint>;
  redeemQueueAt(index: number): Promise<[string, bigint]>;
  requestRedeem(shares: string | bigint, controller: string, owner: string): Promise<any>;
  redeem(shares: string | bigint, receiver: string, controller: string): Promise<any>;
}

/**
 * Deploy script to request and claim withdrawals from the YieldAllocatorVault
 * 
 * This script:
 * 1. Gets the YieldAllocatorVault contract
 * 2. Checks user's share balance in the vault
 * 3. Requests a withdrawal using the ERC-7540 async withdraw pattern
 * 4. Checks if the withdrawal has been fulfilled by the executor
 * 5. Claims the withdrawal if it's been fulfilled
 * 
 * @param hre HardhatRuntimeEnvironment object.
 */
const userWithdrawFromVault: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre;
  const network = hre.network.name;
  
  console.log(`Requesting withdrawal from YieldAllocatorVault on network: ${network}`);

  // Get the named accounts
  const { deployer } = await getNamedAccounts();
  
  // Get all available signers
  const signers = await ethers.getSigners();
  const userSigner = signers[0]; // Default to first signer as the user
  const userAddress = await userSigner.getAddress();
  
  console.log("User account:", userAddress);
  
  // Get the YieldAllocatorVault contract
  const yieldAllocatorVault = await ethers.getContract<YieldAllocatorVaultInterface>("YieldAllocatorVault");
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
    
    // Check user's share balance in the vault
    const userShares = await yieldAllocatorVault.balanceOf(userAddress);
    console.log(`User vault shares: ${ethers.formatUnits(userShares, assetDecimals)}`);
    
    // Convert to BigInt for comparison
    const userSharesBigInt = BigInt(userShares.toString());
    
    if (userSharesBigInt === 0n) {
      // testing cancel deposit
      // const cancelDepositTx = await yieldAllocatorVault.connect(userSigner).withdrawPendingDeposit(
      //   userAddress
      // );
      // console.log(`Cancel deposit transaction sent: ${cancelDepositTx.hash}`);
      // await cancelDepositTx.wait();
      // console.log("✅ Cancel deposit successful");

      console.error(`Error: User has no shares in the vault. Please deposit first.`);
      return;
    }
    
    // Check if user already has a pending redeem request
    // const hasPendingRedeem = await yieldAllocatorVault.hasPendingRedeem(userAddress);
    // const pendingShares = await yieldAllocatorVault.pendingShares7540(userAddress);
    // const claimableShares = await yieldAllocatorVault.claimableShares7540(userAddress);
    // const claimableAssets = await yieldAllocatorVault.claimableAssets7540(userAddress);
    // const escrowedShares = await yieldAllocatorVault.escrowedShares7540(userAddress);
    
    // if (hasPendingRedeem) {
    //   console.log("\n📝 User already has a pending redeem request:");
    //   console.log(`Pending shares: ${ethers.formatUnits(pendingShares, assetDecimals)}`);
    //   console.log(`Claimable shares: ${ethers.formatUnits(claimableShares, assetDecimals)}`);
    //   console.log(`Claimable assets: ${ethers.formatUnits(claimableAssets, assetDecimals)}`);
    //   console.log(`Escrowed shares: ${ethers.formatUnits(escrowedShares, assetDecimals)}`);
      
    //   // If there are claimable shares, claim them
    //   if (claimableShares > 0n) {
    //     console.log("\n🔄 Claiming fulfilled redeem request...");
    //     const claimTx = await yieldAllocatorVault.connect(userSigner as any).redeem(
    //       claimableShares,
    //       userAddress,
    //       userAddress
    //     );
    //     console.log(`Claim transaction sent: ${claimTx.hash}`);
    //     await claimTx.wait();
    //     console.log("✅ Withdrawal claimed successfully");
        
    //     // Check user's asset balance after claiming
    //     const userAssetBalance = await assetToken.balanceOf(userAddress);
    //     console.log(`User ${assetSymbol} balance after claim: ${ethers.formatUnits(userAssetBalance, assetDecimals)}`);
    //   } else {
    //     console.log("\n⏳ Withdrawal request is not yet fulfilled");
    //     console.log("Please wait for the executor to fulfill the request using fulfillNextBatch");
    //   }
      
    //   return;
    // }
    
    // Define withdrawal amount - default to 50% of user's shares
    // You can adjust this or make it configurable via command line arguments
    const withdrawalPercentage = 100; // 50%
    
    // Convert to BigInt for calculations
    const withdrawSharesBigInt = (userSharesBigInt * BigInt(withdrawalPercentage)) / 100n;
    const withdrawShares = withdrawSharesBigInt.toString();
    
    console.log(`\nRequesting withdrawal of ${withdrawalPercentage}% of shares: ${ethers.formatUnits(withdrawShares, assetDecimals)} shares`);
    
    // Note: previewRedeem is no longer available in the new contract as it uses async withdrawals
    // We can estimate assets by using the current share price
    const vaultTotalAssets = await yieldAllocatorVault.totalAssets();
    const vaultTotalSupply = await yieldAllocatorVault.totalSupply();
    
    let estimatedAssets = 0n;
    if (vaultTotalSupply > 0n) {
      estimatedAssets = (BigInt(withdrawShares) * BigInt(vaultTotalAssets)) / BigInt(vaultTotalSupply);
      console.log(`Estimated assets to receive: ${ethers.formatUnits(estimatedAssets, assetDecimals)} ${assetSymbol}`);
    }
    
    // Check vault's idle asset balance
    const vaultIdleBalance = await assetToken.balanceOf(await yieldAllocatorVault.getAddress());
    console.log(`Vault idle asset balance: ${ethers.formatUnits(vaultIdleBalance, assetDecimals)} ${assetSymbol}`);
    
    // Get user's asset balance before withdrawal
    const userAssetBalanceBefore = await assetToken.balanceOf(userAddress);
    console.log(`User ${assetSymbol} balance before withdrawal: ${ethers.formatUnits(userAssetBalanceBefore, assetDecimals)}`);
    
    // Request withdrawal using requestRedeem (ERC-7540 async withdraw pattern)
    console.log(`\n🔄 Requesting withdrawal...`);
    const requestRedeemTx = await yieldAllocatorVault.connect(userSigner as any).requestRedeem(
      withdrawShares,
      userAddress,
      userAddress
    );
    console.log(`Withdrawal request transaction sent: ${requestRedeemTx.hash}`);
    await requestRedeemTx.wait();
    console.log("✅ Withdrawal request submitted");
    
    // Check the status of the redeem request
    // const hasPendingRedeemAfter = await yieldAllocatorVault.hasPendingRedeem(userAddress);
    const pendingSharesAfter = await yieldAllocatorVault.pendingShares7540(userAddress);
    const escrowedSharesAfter = await yieldAllocatorVault.escrowedShares7540(userAddress);
    const userSharesAfter = await yieldAllocatorVault.balanceOf(userAddress);
    
    console.log(`\n📝 Withdrawal request queued`);
    console.log(`Pending shares: ${ethers.formatUnits(pendingSharesAfter, assetDecimals)}`);
    console.log(`Escrowed shares: ${ethers.formatUnits(escrowedSharesAfter, assetDecimals)}`);
    console.log(`Remaining shares in wallet: ${ethers.formatUnits(userSharesAfter, assetDecimals)}`);
    
    // Get the queue position
    const queueLength = await yieldAllocatorVault.redeemQueueLength();
    console.log(`\nCurrent queue length: ${queueLength}`);
    
    // Find the user's position in the queue
    let userQueuePosition = -1;
    for (let i = 0; i < Number(queueLength); i++) {
      const [controller, shares] = await yieldAllocatorVault.redeemQueueAt(i);
      if (controller === userAddress) {
        userQueuePosition = i;
        break;
      }
    }
    
    if (userQueuePosition !== -1) {
      console.log(`Your position in the queue: ${userQueuePosition + 1}`);
    }
    
    console.log("\nTo fulfill this request:");
    console.log("1. An EXECUTOR needs to call fulfillNextBatch to process the queue");
    console.log("2. After fulfillment, run this script again to claim the withdrawal");
    
    // Check vault's total assets and supply after withdrawal request
    const finalTotalAssets = await yieldAllocatorVault.totalAssets();
    const finalTotalSupply = await yieldAllocatorVault.totalSupply();
    console.log(`\nVault total assets: ${ethers.formatUnits(finalTotalAssets, assetDecimals)} ${assetSymbol}`);
    console.log(`Vault total supply: ${ethers.formatUnits(finalTotalSupply, assetDecimals)} shares`);
    
    // Calculate and display the vault's exchange rate
    const totalSupplyBigInt = BigInt(finalTotalSupply.toString());
    if (totalSupplyBigInt !== 0n) {
      const totalAssetsBigInt = BigInt(finalTotalAssets.toString());
      const oneToken = BigInt(10) ** BigInt(assetDecimals);
      const exchangeRate = (totalAssetsBigInt * oneToken) / totalSupplyBigInt;
      console.log(`Current exchange rate: 1 share = ${ethers.formatUnits(exchangeRate, assetDecimals)} ${assetSymbol}`);
    }
    
  } catch (error: any) {
    console.error("Error during withdrawal process:", error.message || error);
  }
};

export default userWithdrawFromVault;

// Tags help you run specific deploy scripts
userWithdrawFromVault.tags = ["UserWithdraw"];
