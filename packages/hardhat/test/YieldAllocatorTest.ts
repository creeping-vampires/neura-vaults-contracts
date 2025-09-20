import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("Yield Allocator System", function () {
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let mockPool: SignerWithAddress;

  let usdTest: Contract;
  let whitelistRegistry: Contract;
  let yieldAllocatorVault: Contract;
  let aiAgent: Contract;

  const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR"));
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR"));
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

  beforeEach(async function () {
    // Get signers
    [deployer, user1, user2, mockPool] = await ethers.getSigners();

    // Deploy USDTEST token
    const USDTest = await ethers.getContractFactory("USDTEST");
    usdTest = await USDTest.deploy();
    await usdTest.deployed();

    // Deploy WhitelistRegistry
    const WhitelistRegistry = await ethers.getContractFactory("WhitelistRegistry");
    whitelistRegistry = await WhitelistRegistry.deploy(deployer.address);
    await whitelistRegistry.deployed();

    // Deploy YieldAllocatorVault
    const YieldAllocatorVault = await ethers.getContractFactory("YieldAllocatorVault");
    yieldAllocatorVault = await YieldAllocatorVault.deploy(
      usdTest.address,
      "Yield Allocator Vault",
      "YAV",
      whitelistRegistry.address,
      deployer.address,
    );
    await yieldAllocatorVault.deployed();

    // Deploy AIAgent
    const AIAgent = await ethers.getContractFactory("AIAgent");
    aiAgent = await AIAgent.deploy(yieldAllocatorVault.address, whitelistRegistry.address, deployer.address);
    await aiAgent.deployed();

    // Grant EXECUTOR role to AIAgent in YieldAllocatorVault
    await yieldAllocatorVault.grantRole(EXECUTOR_ROLE, aiAgent.address);

    // Whitelist the mock pool
    await whitelistRegistry.setPool(mockPool.address, true);

    // Mint some tokens to the vault
    await usdTest.mint(yieldAllocatorVault.address, ethers.utils.parseEther("1000"));

    // Deploy a mock pool contract (for this test, we'll use a simple contract)
    const MockPool = await ethers.getContractFactory("MockPool");
    const mockPoolContract = await MockPool.deploy(usdTest.address);
    await mockPoolContract.deployed();

    // Whitelist the mock pool contract
    await whitelistRegistry.setPool(mockPoolContract.address, true);
  });

  describe("Deployment", function () {
    it("Should set the right owner and roles", async function () {
      expect(await yieldAllocatorVault.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(true);
      expect(await whitelistRegistry.hasRole(GOVERNOR_ROLE, deployer.address)).to.equal(true);
      expect(await aiAgent.hasRole(EXECUTOR_ROLE, deployer.address)).to.equal(true);
      expect(await yieldAllocatorVault.hasRole(EXECUTOR_ROLE, aiAgent.address)).to.equal(true);
    });

    it("Should have the correct asset", async function () {
      expect(await yieldAllocatorVault.asset()).to.equal(usdTest.address);
    });
  });

  describe("Vault Operations", function () {
    it("Should allow deposits and minting of shares", async function () {
      // Mint tokens to user1
      await usdTest.mint(user1.address, ethers.utils.parseEther("100"));

      // Approve vault to spend tokens
      await usdTest.connect(user1).approve(yieldAllocatorVault.address, ethers.utils.parseEther("50"));

      // Deposit tokens into vault
      await yieldAllocatorVault.connect(user1).deposit(ethers.utils.parseEther("50"), user1.address);

      // Check user1's share balance
      expect(await yieldAllocatorVault.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("50"));

      // Check vault's asset balance
      expect(await usdTest.balanceOf(yieldAllocatorVault.address)).to.equal(ethers.utils.parseEther("1050"));
    });

    it("Should allow withdrawals and burning of shares", async function () {
      // Mint tokens to user1 and deposit
      await usdTest.mint(user1.address, ethers.utils.parseEther("100"));
      await usdTest.connect(user1).approve(yieldAllocatorVault.address, ethers.utils.parseEther("50"));
      await yieldAllocatorVault.connect(user1).deposit(ethers.utils.parseEther("50"), user1.address);

      // Withdraw tokens
      await yieldAllocatorVault.connect(user1).withdraw(ethers.utils.parseEther("25"), user1.address, user1.address);

      // Check user1's share balance
      expect(await yieldAllocatorVault.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("25"));

      // Check user1's token balance
      expect(await usdTest.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("75"));
    });
  });

  describe("AIAgent Operations", function () {
    it("Should allow executor to deposit to whitelisted pools", async function () {
      // Create a mock transaction that simulates a pool deposit
      // In a real test, you would deploy a mock pool contract that implements the IPool interface

      // For now, we'll just check that the function doesn't revert
      await expect(aiAgent.depositToPool(mockPool.address, ethers.utils.parseEther("10"))).to.not.be.reverted;

      // Check pool balance in vault
      expect(await yieldAllocatorVault.poolBalances(mockPool.address)).to.equal(ethers.utils.parseEther("10"));
    });

    it("Should not allow non-executors to deposit to pools", async function () {
      await expect(
        aiAgent.connect(user1).depositToPool(mockPool.address, ethers.utils.parseEther("10")),
      ).to.be.revertedWith("Not executor");
    });

    it("Should not allow deposits to non-whitelisted pools", async function () {
      await expect(aiAgent.depositToPool(user2.address, ethers.utils.parseEther("10"))).to.be.revertedWith(
        "Pool not whitelisted",
      );
    });
  });
});
