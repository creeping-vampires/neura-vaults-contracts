import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenPresale, HTEST } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TokenPresale", function () {
  // We define variables to use in our tests
  let tokenPresale: TokenPresale;
  let htest: HTEST;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let users: SignerWithAddress[];

  // Constants for presale parameters
  const tokenPrice = ethers.parseEther("0.0001"); // 0.0001 ETH per token
  const minDepositAmount = ethers.parseEther("0.01"); // 0.01 ETH
  const maxDepositAmount = ethers.parseEther("1"); // 1 ETH
  const totalRaiseGoal = ethers.parseEther("10"); // 10 ETH
  let startTime: number;
  let endTime: number;
  let tier1WhitelistEndTime: number;
  let tier2WhitelistEndTime: number;
  const presaleId = 1; // First presale ID

  // Setup before each test
  beforeEach(async function () {
    // Get signers
    [owner, user1, user2, user3, ...users] = await ethers.getSigners();

    // Deploy HTEST token
    const htestFactory = await ethers.getContractFactory("HTEST");
    htest = (await htestFactory.deploy()) as HTEST;
    await htest.waitForDeployment();

    // Deploy TokenPresale contract
    const tokenPresaleFactory = await ethers.getContractFactory("TokenPresale");
    tokenPresale = (await tokenPresaleFactory.deploy()) as TokenPresale;
    await tokenPresale.waitForDeployment();

    // Set up time parameters
    const currentTime = await time.latest();
    startTime = currentTime + 100; // Start in 100 seconds
    tier1WhitelistEndTime = startTime + 3600; // Tier 1 ends in 1 hour after start
    tier2WhitelistEndTime = tier1WhitelistEndTime + 3600; // Tier 2 ends in 2 hours after start
    endTime = startTime + 86400; // Ends in 24 hours

    // Create a presale
    await tokenPresale.createPresale(
      await htest.getAddress(),
      "HTEST",  // Token symbol
      tokenPrice,
      ethers.parseEther("10000000"),  // Valuation: 10 million USD (scaled by 1e18)
      ethers.parseEther("1000000"),   // Total allocation: 1 million tokens (scaled by 1e18)
      startTime,
      endTime,
      minDepositAmount,
      maxDepositAmount,
      totalRaiseGoal,
      tier1WhitelistEndTime,
      tier2WhitelistEndTime
    );

    // Mint tokens to the TokenPresale contract for distribution
    const tokensToMint = ethers.parseEther("100000"); // 100,000 tokens
    await htest.mint(await tokenPresale.getAddress(), tokensToMint);
  });

  describe("Deployment and Setup", function () {
    it("Should deploy successfully", async function () {
      expect(await tokenPresale.getAddress()).to.properAddress;
      expect(await htest.getAddress()).to.properAddress;
    });

    it("Should create a presale with correct parameters", async function () {
      const presale = await tokenPresale.presales(presaleId);
      expect(presale.presaleId).to.equal(presaleId);
      expect(presale.tokenAddress).to.equal(await htest.getAddress());
      expect(presale.tokenPrice).to.equal(tokenPrice);
      expect(presale.startTime).to.equal(startTime);
      expect(presale.endTime).to.equal(endTime);
      expect(presale.minDepositAmount).to.equal(minDepositAmount);
      expect(presale.maxDepositAmount).to.equal(maxDepositAmount);
      expect(presale.totalRaiseGoal).to.equal(totalRaiseGoal);
      expect(presale.tier1WhitelistEndTime).to.equal(tier1WhitelistEndTime);
      expect(presale.tier2WhitelistEndTime).to.equal(tier2WhitelistEndTime);
      expect(presale.isActive).to.be.true;
    });

    it("Should have correct token balance in the presale contract", async function () {
      const tokensToMint = ethers.parseEther("100000"); // 100,000 tokens
      expect(await htest.balanceOf(await tokenPresale.getAddress())).to.equal(tokensToMint);
    });
  });

  describe("Whitelisting", function () {
    it("Should add users to tier 1 whitelist", async function () {
      const tier1Amount = ethers.parseEther("0.5");
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        [user1.address, user2.address],
        [tier1Amount, tier1Amount]
      );

      const user1Whitelist = await tokenPresale.getUserWhitelistStatus(presaleId, user1.address);
      expect(user1Whitelist[0]).to.equal(tier1Amount); // tier1Amount
      expect(user1Whitelist[1]).to.equal(0); // tier2Amount

      const user2Whitelist = await tokenPresale.getUserWhitelistStatus(presaleId, user2.address);
      expect(user2Whitelist[0]).to.equal(tier1Amount); // tier1Amount
      expect(user2Whitelist[1]).to.equal(0); // tier2Amount
    });

    it("Should add users to tier 2 whitelist", async function () {
      const tier2Amount = ethers.parseEther("0.3");
      await tokenPresale.addToTier2Whitelist(
        presaleId,
        [user2.address, user3.address],
        [tier2Amount, tier2Amount]
      );

      const user2Whitelist = await tokenPresale.getUserWhitelistStatus(presaleId, user2.address);
      expect(user2Whitelist[0]).to.equal(0); // tier1Amount
      expect(user2Whitelist[1]).to.equal(tier2Amount); // tier2Amount

      const user3Whitelist = await tokenPresale.getUserWhitelistStatus(presaleId, user3.address);
      expect(user3Whitelist[0]).to.equal(0); // tier1Amount
      expect(user3Whitelist[1]).to.equal(tier2Amount); // tier2Amount
    });

    it("Should add users to both tier 1 and tier 2 whitelist", async function () {
      const tier1Amount = ethers.parseEther("0.5");
      const tier2Amount = ethers.parseEther("0.3");
      
      await tokenPresale.addToTier1Whitelist(presaleId, [user1.address], [tier1Amount]);
      await tokenPresale.addToTier2Whitelist(presaleId, [user1.address], [tier2Amount]);

      const user1Whitelist = await tokenPresale.getUserWhitelistStatus(presaleId, user1.address);
      expect(user1Whitelist[0]).to.equal(tier1Amount); // tier1Amount
      expect(user1Whitelist[1]).to.equal(tier2Amount); // tier2Amount
    });

    it("Should only allow owner to add to whitelist", async function () {
      const tier1Amount = ethers.parseEther("0.5");
      await expect(
        tokenPresale.connect(user1).addToTier1Whitelist(
          presaleId,
          [user2.address],
          [tier1Amount]
        )
      ).to.be.revertedWithCustomError(tokenPresale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Deposits", function () {
    beforeEach(async function () {
      // Add users to whitelists
      const tier1Amount = ethers.parseEther("0.5");
      const tier2Amount = ethers.parseEther("0.3");
      
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        [user1.address],
        [tier1Amount]
      );
      
      await tokenPresale.addToTier2Whitelist(
        presaleId,
        [user2.address],
        [tier2Amount]
      );

      // Advance time to start of presale
      await time.increaseTo(startTime);
    });

    it("Should allow tier 1 whitelisted user to deposit during tier 1 period", async function () {
      const depositAmount = ethers.parseEther("0.2");
      
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: depositAmount })
      ).to.emit(tokenPresale, "Deposit")
        .withArgs(presaleId, user1.address, depositAmount, depositAmount * BigInt(1e18) / tokenPrice);
      
      expect(await tokenPresale.getUserDeposit(presaleId, user1.address)).to.equal(depositAmount);
      
      const presale = await tokenPresale.presales(presaleId);
      expect(presale.totalRaised).to.equal(depositAmount);
    });

    it("Should not allow tier 2 whitelisted user to deposit during tier 1 period", async function () {
      const depositAmount = ethers.parseEther("0.2");
      
      await expect(
        tokenPresale.connect(user2).deposit(presaleId, { value: depositAmount })
      ).to.be.revertedWith("Not in tier 1 whitelist");
    });

    it("Should allow tier 1 and tier 2 whitelisted users to deposit during tier 2 period", async function () {
      // Advance time to tier 2 period
      await time.increaseTo(tier1WhitelistEndTime + 1);
      
      const depositAmount1 = ethers.parseEther("0.2");
      const depositAmount2 = ethers.parseEther("0.2");
      
      // Tier 1 user can still deposit
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: depositAmount1 })
      ).to.emit(tokenPresale, "Deposit");
      
      // Tier 2 user can now deposit
      await expect(
        tokenPresale.connect(user2).deposit(presaleId, { value: depositAmount2 })
      ).to.emit(tokenPresale, "Deposit");
      
      expect(await tokenPresale.getUserDeposit(presaleId, user1.address)).to.equal(depositAmount1);
      expect(await tokenPresale.getUserDeposit(presaleId, user2.address)).to.equal(depositAmount2);
      
      const presale = await tokenPresale.presales(presaleId);
      expect(presale.totalRaised).to.equal(depositAmount1 + depositAmount2);
    });

    it("Should allow anyone to deposit after tier 2 period", async function () {
      // Advance time to after tier 2 period
      await time.increaseTo(tier2WhitelistEndTime + 1);
      
      const depositAmount = ethers.parseEther("0.2");
      
      // Non-whitelisted user can now deposit
      await expect(
        tokenPresale.connect(user3).deposit(presaleId, { value: depositAmount })
      ).to.emit(tokenPresale, "Deposit");
      
      expect(await tokenPresale.getUserDeposit(presaleId, user3.address)).to.equal(depositAmount);
    });

    it("Should enforce minimum deposit amount", async function () {
      const tooSmallAmount = ethers.parseEther("0.005"); // Less than min (0.01 ETH)
      
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: tooSmallAmount })
      ).to.be.revertedWith("Deposit amount is less than minimum");
    });

    it("Should enforce maximum deposit amount", async function () {
      const tooLargeAmount = ethers.parseEther("1.1"); // More than max (1 ETH)
      
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: tooLargeAmount })
      ).to.be.revertedWith("Exceeds maximum deposit amount");
    });

    it("Should enforce whitelist amount limits", async function () {
      const tier1Amount = ethers.parseEther("0.5");
      const exceedAmount = ethers.parseEther("0.6"); // More than tier 1 limit
      
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: exceedAmount })
      ).to.be.revertedWith("Exceeds tier 1 whitelist amount");
    });

    it("Should enforce total raise goal", async function () {
      // Create multiple users to fill up the presale
      const depositAmount = ethers.parseEther("1"); // Max deposit amount
      const numUsers = 10; // We need 10 users to deposit 1 ETH each to reach the 10 ETH goal
      
      // Add all users to tier 1 whitelist with max amount
      const userAddresses = users.slice(0, numUsers).map(user => user.address);
      const whitelistAmounts = Array(numUsers).fill(depositAmount);
      
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        userAddresses,
        whitelistAmounts
      );
      
      // Fill up the presale with deposits from 9 users (9 ETH total)
      for (let i = 0; i < numUsers - 1; i++) {
        await tokenPresale.connect(users[i]).deposit(presaleId, { value: depositAmount });
      }
      
      // Verify that 9 ETH has been raised
      let presale = await tokenPresale.presales(presaleId);
      expect(presale.totalRaised).to.equal(depositAmount * BigInt(numUsers - 1));
      
      // Add another user who will try to deposit after the goal is reached
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        [user1.address],
        [depositAmount]
      );
      
      // Last user deposits to reach the goal
      await tokenPresale.connect(users[numUsers - 1]).deposit(presaleId, { value: depositAmount });
      
      // Now the presale should be full
      presale = await tokenPresale.presales(presaleId);
      expect(presale.totalRaised).to.equal(totalRaiseGoal);
      
      // Try to deposit more, should fail
      const smallAmount = ethers.parseEther("0.1");
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: smallAmount })
      ).to.be.revertedWith("Exceeds total raise goal");
    });

    it("Should not allow deposits before start time", async function () {
      // Create a new presale with future start time
      const futureStartTime = (await time.latest()) + 1000;
      const futureEndTime = futureStartTime + 86400;
      const futureTier1End = futureStartTime + 3600;
      const futureTier2End = futureTier1End + 3600;
      
      await tokenPresale.createPresale(
        await htest.getAddress(),
        "HTEST",  // Token symbol
        tokenPrice,
        ethers.parseEther("10000000"),  // Valuation: 10 million USD (scaled by 1e18)
        ethers.parseEther("1000000"),   // Total allocation: 1 million tokens (scaled by 1e18)
        futureStartTime,
        futureEndTime,
        minDepositAmount,
        maxDepositAmount,
        totalRaiseGoal,
        futureTier1End,
        futureTier2End
      );
      
      const newPresaleId = 2;
      
      // Add user to whitelist
      await tokenPresale.addToTier1Whitelist(
        newPresaleId,
        [user1.address],
        [ethers.parseEther("0.5")]
      );
      
      // Try to deposit before start time
      const depositAmount = ethers.parseEther("0.2");
      await expect(
        tokenPresale.connect(user1).deposit(newPresaleId, { value: depositAmount })
      ).to.be.revertedWith("Presale has not started yet");
    });

    it("Should not allow deposits after end time", async function () {
      // Advance time to after end time
      await time.increaseTo(endTime + 1);
      
      const depositAmount = ethers.parseEther("0.2");
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: depositAmount })
      ).to.be.revertedWith("Presale has ended");
    });
  });

  describe("Token Withdrawals", function () {
    beforeEach(async function () {
      // Add user to whitelist
      const tier1Amount = ethers.parseEther("0.5");
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        [user1.address],
        [tier1Amount]
      );
      
      // Advance time to start of presale
      await time.increaseTo(startTime);
      
      // User makes a deposit
      const depositAmount = ethers.parseEther("0.2");
      await tokenPresale.connect(user1).deposit(presaleId, { value: depositAmount });
      
      // Advance time to after presale end
      await time.increaseTo(endTime + 1);
    });

    it("Should allow user to withdraw tokens after presale ends", async function () {
      const depositAmount = ethers.parseEther("0.2");
      const expectedTokens = depositAmount * BigInt(1e18) / tokenPrice;
      
      await expect(
        tokenPresale.connect(user1).withdrawTokens(presaleId)
      ).to.emit(tokenPresale, "TokensWithdrawn")
        .withArgs(presaleId, user1.address, expectedTokens);
      
      // Check user's token balance
      expect(await htest.balanceOf(user1.address)).to.equal(expectedTokens);
      
      // Check that user's deposit is reset
      expect(await tokenPresale.getUserDeposit(presaleId, user1.address)).to.equal(0);
    });

    it("Should not allow withdrawing tokens before presale ends", async function () {
      // Create a new presale
      const newStartTime = (await time.latest()) + 100;
      const newEndTime = newStartTime + 86400;
      const newTier1End = newStartTime + 3600;
      const newTier2End = newTier1End + 3600;
      
      await tokenPresale.createPresale(
        await htest.getAddress(),
        "HTEST",  // Token symbol
        tokenPrice,
        ethers.parseEther("10000000"),  // Valuation: 10 million USD (scaled by 1e18)
        ethers.parseEther("1000000"),   // Total allocation: 1 million tokens (scaled by 1e18)
        newStartTime,
        newEndTime,
        minDepositAmount,
        maxDepositAmount,
        totalRaiseGoal,
        newTier1End,
        newTier2End
      );
      
      const newPresaleId = 2;
      
      // Add user to whitelist
      await tokenPresale.addToTier1Whitelist(
        newPresaleId,
        [user1.address],
        [ethers.parseEther("0.5")]
      );
      
      // Advance time to start of presale
      await time.increaseTo(newStartTime);
      
      // User makes a deposit
      const depositAmount = ethers.parseEther("0.2");
      await tokenPresale.connect(user1).deposit(newPresaleId, { value: depositAmount });
      
      // Try to withdraw before presale ends
      await expect(
        tokenPresale.connect(user1).withdrawTokens(newPresaleId)
      ).to.be.revertedWith("Presale has not ended yet");
    });

    it("Should not allow withdrawing tokens if user has no deposits", async function () {
      await expect(
        tokenPresale.connect(user2).withdrawTokens(presaleId)
      ).to.be.revertedWith("No deposits found");
    });

    it("Should not allow withdrawing tokens twice", async function () {
      // First withdrawal should succeed
      await tokenPresale.connect(user1).withdrawTokens(presaleId);
      
      // Second withdrawal should fail
      await expect(
        tokenPresale.connect(user1).withdrawTokens(presaleId)
      ).to.be.revertedWith("No deposits found");
    });
  });

  describe("Fund Withdrawals", function () {
    beforeEach(async function () {
      // Add user to whitelist
      const tier1Amount = ethers.parseEther("0.5");
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        [user1.address],
        [tier1Amount]
      );
      
      // Advance time to start of presale
      await time.increaseTo(startTime);
      
      // User makes a deposit
      const depositAmount = ethers.parseEther("0.2");
      await tokenPresale.connect(user1).deposit(presaleId, { value: depositAmount });
      
      // Advance time to after presale end
      await time.increaseTo(endTime + 1);
    });

    it("Should allow owner to withdraw funds after presale ends", async function () {
      const depositAmount = ethers.parseEther("0.2");
      const initialBalance = await ethers.provider.getBalance(owner.address);
      
      await expect(
        tokenPresale.withdrawFunds(presaleId, owner.address)
      ).to.emit(tokenPresale, "FundsWithdrawn")
        .withArgs(presaleId, owner.address, depositAmount);
      
      // Check owner's balance increased (approximately, ignoring gas costs)
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance).to.be.gt(initialBalance);
      
      // Check that presale's totalRaised is reset
      const presale = await tokenPresale.presales(presaleId);
      expect(presale.totalRaised).to.equal(0);
    });

    it("Should not allow non-owner to withdraw funds", async function () {
      await expect(
        tokenPresale.connect(user1).withdrawFunds(presaleId, user1.address)
      ).to.be.revertedWithCustomError(tokenPresale, "OwnableUnauthorizedAccount");
    });

    it("Should not allow withdrawing funds before presale ends", async function () {
      // Create a new presale
      const newStartTime = (await time.latest()) + 100;
      const newEndTime = newStartTime + 86400;
      const newTier1End = newStartTime + 3600;
      const newTier2End = newTier1End + 3600;
      
      await tokenPresale.createPresale(
        await htest.getAddress(),
        "HTEST",  // Token symbol
        tokenPrice,
        ethers.parseEther("10000000"),  // Valuation: 10 million USD (scaled by 1e18)
        ethers.parseEther("1000000"),   // Total allocation: 1 million tokens (scaled by 1e18)
        newStartTime,
        newEndTime,
        minDepositAmount,
        maxDepositAmount,
        totalRaiseGoal,
        newTier1End,
        newTier2End
      );
      
      const newPresaleId = 2;
      
      // Add user to whitelist
      await tokenPresale.addToTier1Whitelist(
        newPresaleId,
        [user1.address],
        [ethers.parseEther("0.5")]
      );
      
      // Advance time to start of presale
      await time.increaseTo(newStartTime);
      
      // User makes a deposit
      const depositAmount = ethers.parseEther("0.2");
      await tokenPresale.connect(user1).deposit(newPresaleId, { value: depositAmount });
      
      // Try to withdraw funds before presale ends
      await expect(
        tokenPresale.withdrawFunds(newPresaleId, owner.address)
      ).to.be.revertedWith("Presale has not ended yet");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set presale status", async function () {
      // Advance time to start of presale
      await time.increaseTo(startTime);
      
      // Add user to whitelist first
      const tier1Amount = ethers.parseEther("0.5");
      await tokenPresale.addToTier1Whitelist(
        presaleId,
        [user1.address],
        [tier1Amount]
      );
      
      // Then set presale to inactive
      await tokenPresale.setPresaleStatus(presaleId, false);
      
      const presale = await tokenPresale.presales(presaleId);
      expect(presale.isActive).to.be.false;
      
      // Try to deposit to inactive presale
      const depositAmount = ethers.parseEther("0.2");
      await expect(
        tokenPresale.connect(user1).deposit(presaleId, { value: depositAmount })
      ).to.be.revertedWith("Presale is not active");
    });

    it("Should allow owner to recover ERC20 tokens", async function () {
      // Deploy another ERC20 token
      const anotherTokenFactory = await ethers.getContractFactory("HTEST");
      const anotherToken = (await anotherTokenFactory.deploy()) as HTEST;
      await anotherToken.waitForDeployment();
      
      // Mint tokens to the TokenPresale contract
      const tokensToRecover = ethers.parseEther("1000");
      await anotherToken.mint(await tokenPresale.getAddress(), tokensToRecover);
      
      // Recover tokens
      await expect(
        tokenPresale.recoverERC20(await anotherToken.getAddress(), owner.address)
      ).to.changeTokenBalances(
        anotherToken,
        [await tokenPresale.getAddress(), owner.address],
        [-tokensToRecover, tokensToRecover]
      );
    });

    it("Should not allow non-owner to recover ERC20 tokens", async function () {
      await expect(
        tokenPresale.connect(user1).recoverERC20(await htest.getAddress(), user1.address)
      ).to.be.revertedWithCustomError(tokenPresale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Utility Functions", function () {
    it("Should calculate token amount correctly", async function () {
      const ethAmount = ethers.parseEther("0.5");
      const expectedTokens = ethAmount * BigInt(1e18) / tokenPrice;
      
      expect(await tokenPresale.calculateTokenAmount(presaleId, ethAmount)).to.equal(expectedTokens);
    });
  });
});
