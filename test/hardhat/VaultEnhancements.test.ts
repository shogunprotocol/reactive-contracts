import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Vault, MockUSDC } from "../typechain-types";

describe("Vault Enhancements", function () {
  let vault: Vault;
  let underlyingToken: MockUSDC;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let agent: SignerWithAddress;
  let treasury: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const INITIAL_BALANCE = ethers.parseUnits("10000", 6); // 10,000 USDC

  beforeEach(async function () {
    // Get signers
    [owner, manager, agent, treasury, alice, bob] = await ethers.getSigners();

    // Deploy underlying token (USDC)
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    underlyingToken = await MockUSDCFactory.deploy();

    // Deploy vault with 1% withdrawal fee and 5% yield rate
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      await underlyingToken.getAddress(),
      "Enhanced Vault Token",
      "eVUSDC",
      manager.address,
      agent.address,
      100, // 1% withdrawal fee
      500, // 5% annual yield rate
      treasury.address // treasury address
    );

    // Setup test accounts with tokens
    await underlyingToken.transfer(alice.address, INITIAL_BALANCE);
    await underlyingToken.transfer(bob.address, INITIAL_BALANCE);
  });

  describe("Pausable Functionality", function () {
    it("Should allow owner to pause and unpause the vault", async function () {
      // Check initial state (not paused)
      expect(await vault.paused()).to.be.false;

      // Owner can pause
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;

      // Owner can unpause
      await vault.connect(owner).unpause();
      expect(await vault.paused()).to.be.false;
    });

    it("Should check pauser role correctly", async function () {
      expect(await vault.hasPauserRole(owner.address)).to.be.true;
      expect(await vault.hasPauserRole(alice.address)).to.be.false;
    });

    it("Should prevent deposits when paused", async function () {
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), INITIAL_BALANCE);

      // Pause the vault
      await vault.connect(owner).pause();

      // Deposits should revert when paused
      await expect(
        vault
          .connect(alice)
          .deposit(ethers.parseUnits("1000", 6), alice.address)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should prevent withdrawals when paused", async function () {
      // First make a deposit when not paused
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), INITIAL_BALANCE);
      await vault
        .connect(alice)
        .deposit(ethers.parseUnits("1000", 6), alice.address);

      // Pause the vault
      await vault.connect(owner).pause();

      // Withdrawals should revert when paused
      await expect(
        vault
          .connect(alice)
          .withdraw(ethers.parseUnits("500", 6), alice.address, alice.address)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should revert pause if not pauser", async function () {
      await expect(vault.connect(alice).pause()).to.be.revertedWith(
        "Vault: caller is not a pauser"
      );
    });
  });

  describe("Fee Collection Functionality", function () {
    beforeEach(async function () {
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), INITIAL_BALANCE);
      await underlyingToken
        .connect(bob)
        .approve(await vault.getAddress(), INITIAL_BALANCE);
    });

    it("Should collect withdrawal fees to treasury", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const withdrawAmount = ethers.parseUnits("500", 6); // 500 USDC
      const expectedFee = ethers.parseUnits("5", 6); // 1% of 500 USDC = 5 USDC

      // Alice deposits
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Alice withdraws (creating fee)
      await vault
        .connect(alice)
        .withdraw(withdrawAmount, alice.address, alice.address);

      // Check collectable fees
      const collectableFees = await vault.getCollectableFees();
      expect(collectableFees).to.be.closeTo(
        expectedFee,
        ethers.parseUnits("0.1", 6)
      );

      // Collect fees
      const treasuryBalanceBefore = await underlyingToken.balanceOf(
        treasury.address
      );

      await expect(vault.connect(owner).collectFees())
        .to.emit(vault, "FeesCollected")
        .withArgs(treasury.address, collectableFees);

      const treasuryBalanceAfter = await underlyingToken.balanceOf(
        treasury.address
      );

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
        collectableFees
      );
    });

    it("Should allow manager to collect fees", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(alice).deposit(depositAmount, alice.address);
      await vault
        .connect(alice)
        .withdraw(ethers.parseUnits("100", 6), alice.address, alice.address);

      // Manager should be able to collect fees
      await expect(vault.connect(manager).collectFees()).to.emit(
        vault,
        "FeesCollected"
      );
    });

    it("Should revert fee collection if not owner or manager", async function () {
      await expect(vault.connect(alice).collectFees()).to.be.revertedWith(
        "Vault: not owner/manager"
      );
    });

    it("Should allow owner to set new treasury", async function () {
      const newTreasury = bob.address;

      await expect(vault.connect(owner).setTreasury(newTreasury))
        .to.emit(vault, "TreasuryUpdated")
        .withArgs(treasury.address, newTreasury);

      expect(await vault.treasury()).to.equal(newTreasury);
    });

    it("Should revert setting zero address as treasury", async function () {
      await expect(
        vault.connect(owner).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "InvalidTreasury");
    });

    it("Should calculate collectable fees correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Initially no fees
      expect(await vault.getCollectableFees()).to.equal(0);

      // After withdrawal, should have fees
      await vault
        .connect(alice)
        .withdraw(ethers.parseUnits("200", 6), alice.address, alice.address);

      const collectableFees = await vault.getCollectableFees();
      expect(collectableFees).to.be.gt(0);
      expect(collectableFees).to.be.closeTo(
        ethers.parseUnits("2", 6), // 1% of 200 = 2 USDC
        ethers.parseUnits("0.1", 6)
      );
    });
  });

  describe("EnumerableSet Strategy Management", function () {
    it("Should get strategies count correctly", async function () {
      expect(await vault.getStrategiesCount()).to.equal(0);

      await vault.connect(manager).addStrategy(alice.address);
      expect(await vault.getStrategiesCount()).to.equal(1);

      await vault.connect(manager).addStrategy(bob.address);
      expect(await vault.getStrategiesCount()).to.equal(2);
    });

    it("Should get strategies array correctly", async function () {
      await vault.connect(manager).addStrategy(alice.address);
      await vault.connect(manager).addStrategy(bob.address);

      const strategies = await vault.getStrategies();
      expect(strategies).to.have.length(2);
      expect(strategies).to.include(alice.address);
      expect(strategies).to.include(bob.address);
    });

    it("Should access strategy by index", async function () {
      await vault.connect(manager).addStrategy(alice.address);
      await vault.connect(manager).addStrategy(bob.address);

      expect(await vault.strategies(0)).to.equal(alice.address);
      expect(await vault.strategies(1)).to.equal(bob.address);
    });

    it("Should check strategy existence correctly", async function () {
      expect(await vault.isStrategy(alice.address)).to.be.false;

      await vault.connect(manager).addStrategy(alice.address);
      expect(await vault.isStrategy(alice.address)).to.be.true;

      await vault.connect(manager).removeStrategy(alice.address);
      expect(await vault.isStrategy(alice.address)).to.be.false;
    });
  });

  describe("DRY Yield Calculation", function () {
    it("Should yield calculations be consistent", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      // Deposit
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine", []);

      // Calculate pending yield
      const pendingYield1 = await vault.calculatePendingYield();

      // Update yield and check consistency
      await vault.updateYield();
      const accruedYield = await vault.getTotalAccruedYield();

      // The accrued yield should match what was pending
      expect(accruedYield).to.be.closeTo(
        pendingYield1,
        ethers.parseUnits("0.001", 6) // 0.001 USDC tolerance
      );
    });
  });
});
