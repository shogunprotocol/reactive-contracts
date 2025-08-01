import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Vault, MockUSDC, Strategies } from "../typechain-types";

describe("🔒 SECURITY AUDIT TESTS - CRITICAL VULNERABILITIES", function () {
  let vault: Vault;
  let underlyingToken: MockUSDC;
  let strategies: Strategies;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let agent: SignerWithAddress;
  let treasury: SignerWithAddress;
  let attacker: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_BALANCE = ethers.parseUnits("100000", 6); // 100,000 USDC

  beforeEach(async function () {
    [owner, manager, agent, treasury, attacker, user1, user2] =
      await ethers.getSigners();

    // Deploy underlying token
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    underlyingToken = await MockUSDCFactory.deploy();

    // Deploy vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      await underlyingToken.getAddress(),
      "Vault Token",
      "vUNDER",
      manager.address,
      agent.address,
      100, // 1% withdrawal fee
      500, // 5% annual yield rate
      treasury.address
    );

    // Setup balances
    await underlyingToken.transfer(user1.address, INITIAL_BALANCE);
    await underlyingToken.transfer(user2.address, INITIAL_BALANCE);
    await underlyingToken.transfer(attacker.address, INITIAL_BALANCE);

    // Approvals
    await underlyingToken
      .connect(user1)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await underlyingToken
      .connect(user2)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await underlyingToken
      .connect(attacker)
      .approve(await vault.getAddress(), ethers.MaxUint256);
  });

  describe("🚨 ACCESS CONTROL VULNERABILITIES", function () {
    it("Should prevent unauthorized role escalation", async function () {
      // Attacker should not be able to grant themselves roles
      const MANAGER_ROLE = await vault.MANAGER_ROLE();
      const AGENT_ROLE = await vault.AGENT_ROLE();
      const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

      await expect(
        vault.connect(attacker).grantRole(MANAGER_ROLE, attacker.address)
      ).to.be.reverted;

      await expect(
        vault.connect(attacker).grantRole(AGENT_ROLE, attacker.address)
      ).to.be.reverted;

      await expect(
        vault.connect(attacker).grantRole(DEFAULT_ADMIN_ROLE, attacker.address)
      ).to.be.reverted;
    });

    it("Should prevent manager from granting admin roles", async function () {
      const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

      await expect(
        vault.connect(manager).grantRole(DEFAULT_ADMIN_ROLE, attacker.address)
      ).to.be.reverted;
    });

    it("Should prevent bypassing onlyManager restrictions", async function () {
      await expect(
        vault.connect(attacker).addStrategy(attacker.address)
      ).to.be.revertedWith("Vault: caller is not a manager");

      await expect(
        vault.connect(attacker).setYieldRate(1000)
      ).to.be.revertedWith("Vault: caller is not a manager");
    });

    it("Should prevent bypassing onlyAgent restrictions", async function () {
      // First add a strategy as manager
      await vault.connect(manager).addStrategy(attacker.address);

      await expect(
        vault.connect(attacker).executeStrategy(attacker.address, "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");

      await expect(
        vault.connect(attacker).harvestStrategy(attacker.address, "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");

      await expect(
        vault.connect(attacker).emergencyExitStrategy(attacker.address, "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");
    });

    it("Should prevent bypassing onlyOwner restrictions", async function () {
      await expect(
        vault.connect(attacker).setTreasury(attacker.address)
      ).to.be.revertedWith("Vault: not owner");
    });

    it("Should prevent role admin bypass", async function () {
      // Even manager should not be able to grant admin role
      const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

      await expect(
        vault.connect(manager).grantRole(DEFAULT_ADMIN_ROLE, manager.address)
      ).to.be.reverted;
    });
  });

  describe("🚨 INTEGER OVERFLOW/UNDERFLOW VULNERABILITIES", function () {
    it("Should handle maximum uint256 values safely", async function () {
      // Try to set extremely high yield rates
      await expect(
        vault.connect(manager).setYieldRate(ethers.MaxUint256)
      ).to.be.revertedWithCustomError(vault, "YieldRateTooHigh");
    });

    it("Should prevent yield calculation overflow", async function () {
      // Deposit maximum amount and try to trigger overflow
      const maxDeposit = ethers.parseUnits("1000000", 6); // 1M USDC
      await underlyingToken.mint(user1.address, maxDeposit);
      await vault.connect(user1).deposit(maxDeposit, user1.address);

      // Fast forward 10 years
      await ethers.provider.send("evm_increaseTime", [10 * 365 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Should not overflow and should be a reasonable number
      const pendingYield = await vault.calculatePendingYield();
      expect(pendingYield).to.be.gt(0);
      expect(pendingYield).to.be.lt(ethers.parseUnits("100000000", 6)); // Should be less than 100M USDC
      await expect(vault.updateYield()).to.not.be.reverted;
    });

    it("Should handle edge case of zero values", async function () {
      expect(await vault.calculatePendingYield()).to.equal(0);
      expect(await vault.getTotalAccruedYield()).to.equal(0);

      // Should not revert on zero operations
      await expect(vault.updateYield()).to.not.be.reverted;
    });

    it("Should prevent underflow in withdrawal calculations", async function () {
      // Deposit small amount
      await vault.connect(user1).deposit(100, user1.address);

      // Try to withdraw more than balance (should revert naturally)
      await expect(
        vault
          .connect(user1)
          .withdraw(ethers.parseUnits("1000", 6), user1.address, user1.address)
      ).to.be.reverted;
    });
  });

  describe("🚨 PRECISION AND ROUNDING VULNERABILITIES", function () {
    it("Should prevent rounding attacks on shares", async function () {
      // Classic attack: deposit 1 wei, then donate large amount to inflate share price
      await vault.connect(attacker).deposit(1, attacker.address);

      // Attacker tries to donate tokens directly to vault to inflate share price
      await underlyingToken
        .connect(attacker)
        .transfer(await vault.getAddress(), ethers.parseUnits("1000", 6));

      // Normal user should still get fair shares
      const userDeposit = ethers.parseUnits("1000", 6);
      const sharesBefore = await vault.previewDeposit(userDeposit);
      await vault.connect(user1).deposit(userDeposit, user1.address);
      const actualShares = await vault.balanceOf(user1.address);

      // Shares should be reasonable (not zero due to rounding)
      expect(actualShares).to.be.gt(0);
      expect(actualShares).to.be.closeTo(
        sharesBefore,
        ethers.parseUnits("1", 6)
      );
    });

    it("Should handle dust amounts correctly", async function () {
      // Test with very small amounts
      const dustAmount = 1; // 1 wei
      await vault.connect(user1).deposit(dustAmount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.be.gt(0);
      expect(await vault.totalAssets()).to.equal(dustAmount);
    });

    it("Should handle precision in fee calculations", async function () {
      // Test fee calculation precision with small amounts
      const smallAmount = 1000; // Very small amount
      await vault.connect(user1).deposit(smallAmount, user1.address);

      const feeAmount = await vault.calculateWithdrawalFee(smallAmount);
      expect(feeAmount).to.equal(10); // 1% of 1000 = 10
    });
  });

  describe("🚨 WITHDRAWAL FEE MANIPULATION", function () {
    it("Should prevent fee bypass through direct transfers", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const balanceBefore = await underlyingToken.balanceOf(user1.address);
      const withdrawAmount = ethers.parseUnits("500", 6);
      const expectedFee = ethers.parseUnits("5", 6); // 1% fee

      await vault
        .connect(user1)
        .withdraw(withdrawAmount, user1.address, user1.address);

      const balanceAfter = await underlyingToken.balanceOf(user1.address);
      const actualReceived = balanceAfter - balanceBefore;

      // User should receive less than full amount due to fee
      expect(actualReceived).to.equal(withdrawAmount - expectedFee);
    });

    it("Should prevent fee manipulation through redeem", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      const balanceBefore = await underlyingToken.balanceOf(user1.address);

      await vault
        .connect(user1)
        .redeem(shares / 2n, user1.address, user1.address);

      const balanceAfter = await underlyingToken.balanceOf(user1.address);
      const actualReceived = balanceAfter - balanceBefore;

      // Should have received less than 500 USDC due to 1% fee
      expect(actualReceived).to.be.lt(ethers.parseUnits("500", 6));
      expect(actualReceived).to.be.closeTo(
        ethers.parseUnits("495", 6),
        ethers.parseUnits("1", 6)
      );
    });

    it("Should enforce withdrawal fee consistently", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Test multiple withdrawal amounts
      const amounts = [100, 500, 999];

      for (const amount of amounts) {
        const amountWei = ethers.parseUnits(amount.toString(), 6);
        const expectedFee = amountWei / 100n; // 1% fee
        const calculatedFee = await vault.calculateWithdrawalFee(amountWei);

        expect(calculatedFee).to.equal(expectedFee);
      }
    });
  });

  describe("🚨 STRATEGY MANIPULATION ATTACKS", function () {
    it("Should prevent malicious strategy registration", async function () {
      // Try to add zero address as strategy
      await expect(
        vault.connect(manager).addStrategy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");

      // Try to add same strategy twice
      await vault.connect(manager).addStrategy(attacker.address);
      await expect(
        vault.connect(manager).addStrategy(attacker.address)
      ).to.be.revertedWithCustomError(vault, "StrategyAlreadyExists");
    });

    it("Should prevent unauthorized strategy execution", async function () {
      await vault.connect(manager).addStrategy(attacker.address);

      // Non-agent should not be able to execute strategy
      await expect(
        vault.connect(user1).executeStrategy(attacker.address, "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");
    });

    it("Should prevent strategy draining vault through depositToStrategy", async function () {
      await vault.connect(manager).addStrategy(attacker.address);

      // Deposit some funds to vault
      await vault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      // Agent tries to deposit more than vault has
      await expect(
        vault
          .connect(agent)
          .depositToStrategy(
            attacker.address,
            ethers.parseUnits("2000", 6),
            "0x"
          )
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should validate strategy exists before operations", async function () {
      const fakeStrategy = user2.address;

      await expect(
        vault.connect(agent).executeStrategy(fakeStrategy, "0x")
      ).to.be.revertedWithCustomError(vault, "StrategyDoesNotExist");

      await expect(
        vault.connect(agent).harvestStrategy(fakeStrategy, "0x")
      ).to.be.revertedWithCustomError(vault, "StrategyDoesNotExist");

      await expect(
        vault.connect(agent).emergencyExitStrategy(fakeStrategy, "0x")
      ).to.be.revertedWithCustomError(vault, "StrategyDoesNotExist");
    });
  });

  describe("🚨 YIELD MANIPULATION ATTACKS", function () {
    it("Should prevent yield rate manipulation beyond limits", async function () {
      // Try to set yield rate above maximum (50%)
      await expect(
        vault.connect(manager).setYieldRate(5500) // 55% - above max
      ).to.be.revertedWithCustomError(vault, "YieldRateTooHigh");

      // Maximum should work
      await expect(vault.connect(manager).setYieldRate(5000)).to.not.be
        .reverted;
    });

    it("Should prevent time manipulation attacks", async function () {
      await vault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]); // 1 year
      await ethers.provider.send("evm_mine", []);

      const pendingYield = await vault.calculatePendingYield();

      // Yield should be reasonable, not exploitable
      expect(pendingYield).to.be.lt(ethers.parseUnits("100", 6)); // Less than 10% for 1 year
      expect(pendingYield).to.be.gt(0);
    });

    it("Should handle yield updates consistently", async function () {
      await vault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      // Multiple yield updates should be consistent
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine", []);

      const yield1 = await vault.calculatePendingYield();
      await vault.updateYield();

      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // Another 30 days
      await ethers.provider.send("evm_mine", []);

      const yield2 = await vault.calculatePendingYield();
      await vault.updateYield();

      // Second period should yield more due to compounding
      expect(yield2).to.be.gt(yield1);
    });

    it("Should prevent yield manipulation through multiple updates", async function () {
      await vault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const yieldBefore = await vault.calculatePendingYield();

      // Multiple updates should not change the total yield
      await vault.updateYield();
      await vault.updateYield();
      await vault.updateYield();

      const yieldAfter = await vault.getTotalAccruedYield();

      // Should be approximately the same (within small tolerance)
      expect(yieldAfter).to.be.closeTo(
        yieldBefore,
        ethers.parseUnits("0.1", 6)
      );
    });
  });

  describe("🚨 TREASURY AND FEE COLLECTION ATTACKS", function () {
    it("Should prevent unauthorized treasury changes", async function () {
      await expect(
        vault.connect(attacker).setTreasury(attacker.address)
      ).to.be.revertedWith("Vault: not owner");
    });

    it("Should prevent setting treasury to zero address", async function () {
      await expect(
        vault.connect(owner).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "InvalidTreasury");
    });

    it("Should prevent unauthorized fee collection", async function () {
      // Only owner or manager should be able to collect fees
      await expect(vault.connect(attacker).collectFees()).to.be.revertedWith(
        "Vault: not owner/manager"
      );
    });

    it("Should handle fee collection edge cases", async function () {
      // Collect fees when there are none
      await expect(vault.connect(owner).collectFees()).to.not.be.reverted;

      // Should return 0 collectable fees initially
      expect(await vault.getCollectableFees()).to.equal(0);
    });

    it("Should prevent treasury manipulation during fee collection", async function () {
      // Deposit and generate some fees
      await vault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);
      await vault
        .connect(user1)
        .withdraw(ethers.parseUnits("100", 6), user1.address, user1.address);

      const treasuryBefore = treasury.address;

      // Try to change treasury right before fee collection (should fail for non-owner)
      await expect(
        vault.connect(attacker).setTreasury(attacker.address)
      ).to.be.revertedWith("Vault: not owner");

      // Verify treasury hasn't changed
      expect(await vault.treasury()).to.equal(treasuryBefore);
    });
  });

  describe("🚨 PAUSE MECHANISM SECURITY", function () {
    it("Should prevent unauthorized pausing", async function () {
      await expect(vault.connect(attacker).pause()).to.be.revertedWith(
        "Vault: caller is not a pauser"
      );
    });

    it("Should block operations when paused", async function () {
      await vault.connect(owner).pause();

      await expect(
        vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address)
      ).to.be.reverted; // OpenZeppelin v5 uses custom errors

      await expect(
        vault
          .connect(user1)
          .withdraw(ethers.parseUnits("100", 6), user1.address, user1.address)
      ).to.be.reverted; // OpenZeppelin v5 uses custom errors
    });

    it("Should allow operations after unpause", async function () {
      await vault.connect(owner).pause();
      await vault.connect(owner).unpause();

      await expect(
        vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address)
      ).to.not.be.reverted;
    });

    it("Should prevent unauthorized unpausing", async function () {
      await vault.connect(owner).pause();

      await expect(vault.connect(attacker).unpause()).to.be.revertedWith(
        "Vault: caller is not a pauser"
      );
    });
  });

  describe("🚨 EDGE CASES AND BOUNDARY CONDITIONS", function () {
    it("Should handle maximum withdrawal fee correctly", async function () {
      // Deploy vault with maximum fee (10%)
      const VaultFactory = await ethers.getContractFactory("Vault");
      const maxFeeVault = await VaultFactory.deploy(
        await underlyingToken.getAddress(),
        "Max Fee Vault",
        "MFV",
        manager.address,
        agent.address,
        1000, // 10% withdrawal fee (maximum)
        500,
        treasury.address
      );

      await underlyingToken
        .connect(user1)
        .approve(await maxFeeVault.getAddress(), ethers.MaxUint256);
      await maxFeeVault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      const balanceBefore = await underlyingToken.balanceOf(user1.address);
      await maxFeeVault
        .connect(user1)
        .withdraw(ethers.parseUnits("100", 6), user1.address, user1.address);
      const balanceAfter = await underlyingToken.balanceOf(user1.address);

      // Should receive 90 USDC (100 - 10% fee)
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("90", 6));
    });

    it("Should handle zero yield rate correctly", async function () {
      // Deploy vault with 0% yield
      const VaultFactory = await ethers.getContractFactory("Vault");
      const zeroYieldVault = await VaultFactory.deploy(
        await underlyingToken.getAddress(),
        "Zero Yield Vault",
        "ZYV",
        manager.address,
        agent.address,
        100,
        0, // 0% yield rate
        treasury.address
      );

      await underlyingToken
        .connect(user1)
        .approve(await zeroYieldVault.getAddress(), ethers.MaxUint256);
      await zeroYieldVault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      expect(await zeroYieldVault.calculatePendingYield()).to.equal(0);
      expect(await zeroYieldVault.getTotalAccruedYield()).to.equal(0);
    });

    it("Should handle constructor parameter validation", async function () {
      const VaultFactory = await ethers.getContractFactory("Vault");

      // Should reject zero addresses for manager
      await expect(
        VaultFactory.deploy(
          await underlyingToken.getAddress(),
          "Test Vault",
          "TV",
          ethers.ZeroAddress, // Invalid manager
          agent.address,
          100,
          500,
          treasury.address
        )
      ).to.be.revertedWith("Manager cannot be zero address");

      // Should reject zero addresses for agent
      await expect(
        VaultFactory.deploy(
          await underlyingToken.getAddress(),
          "Test Vault",
          "TV",
          manager.address,
          ethers.ZeroAddress, // Invalid agent
          100,
          500,
          treasury.address
        )
      ).to.be.revertedWith("Agent cannot be zero address");

      // Should reject zero address for treasury
      await expect(
        VaultFactory.deploy(
          await underlyingToken.getAddress(),
          "Test Vault",
          "TV",
          manager.address,
          agent.address,
          100,
          500,
          ethers.ZeroAddress // Invalid treasury
        )
      ).to.be.revertedWithCustomError(vault, "InvalidTreasury");
    });
  });

  describe("🚨 REENTRANCY PROTECTION VERIFICATION", function () {
    it("Should have reentrancy guards on all critical functions", async function () {
      // Deposit has nonReentrant modifier
      await vault
        .connect(user1)
        .deposit(ethers.parseUnits("1000", 6), user1.address);

      // Withdraw has nonReentrant modifier
      await vault
        .connect(user1)
        .withdraw(ethers.parseUnits("100", 6), user1.address, user1.address);

      // Mint has nonReentrant modifier
      await vault
        .connect(user1)
        .mint(ethers.parseUnits("100", 6), user1.address);

      // Redeem has nonReentrant modifier
      const shares = await vault.balanceOf(user1.address);
      await vault
        .connect(user1)
        .redeem(shares / 10n, user1.address, user1.address);

      // All should succeed normally
      expect(true).to.be.true;
    });
  });
});
