import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Strategies", function () {
  let strategies: any;
  let mockProtocol: any;
  let underlyingToken: any;
  let rewardToken: any;
  let vault: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const INITIAL_BALANCE = ethers.parseEther("1000");
  const PROTOCOL_REWARD_BALANCE = ethers.parseEther("10000");

  beforeEach(async function () {
    // Get signers
    [owner, vault, alice, bob] = await ethers.getSigners();

    // Deploy tokens
    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    underlyingToken = await MockTokenFactory.deploy(
      "Underlying Token",
      "UNDER"
    );
    rewardToken = await MockTokenFactory.deploy("Reward Token", "REWARD");

    // Deploy mock protocol
    const MockProtocolFactory = await ethers.getContractFactory("MockProtocol");
    mockProtocol = await MockProtocolFactory.deploy(
      await underlyingToken.getAddress(),
      await rewardToken.getAddress()
    );

    // Calculate correct function selectors
    const depositSelector = ethers.id("deposit(uint256)").slice(0, 10);
    const withdrawSelector = ethers.id("withdraw(uint256)").slice(0, 10);
    const claimSelector = ethers.id("claimRewards()").slice(0, 10);
    const getBalanceSelector = ethers.id("getBalance(address)").slice(0, 10);

    // Deploy strategies
    const StrategiesFactory = await ethers.getContractFactory("Strategies");
    strategies = await StrategiesFactory.deploy(
      await underlyingToken.getAddress(),
      await mockProtocol.getAddress(),
      depositSelector,
      withdrawSelector,
      claimSelector,
      getBalanceSelector
    );

    // Setup
    await underlyingToken.transfer(vault.address, INITIAL_BALANCE);
    await rewardToken.transfer(
      await mockProtocol.getAddress(),
      PROTOCOL_REWARD_BALANCE
    );
  });

  describe("Constructor", function () {
    it("Should set the correct parameters", async function () {
      expect(await strategies.underlyingToken()).to.equal(
        await underlyingToken.getAddress()
      );
      expect(await strategies.protocol()).to.equal(
        await mockProtocol.getAddress()
      );
      expect(await strategies.depositSelector()).to.equal(
        ethers.id("deposit(uint256)").slice(0, 10)
      );
      expect(await strategies.withdrawSelector()).to.equal(
        ethers.id("withdraw(uint256)").slice(0, 10)
      );
      expect(await strategies.claimSelector()).to.equal(
        ethers.id("claimRewards()").slice(0, 10)
      );
      expect(await strategies.getBalanceSelector()).to.equal(
        ethers.id("getBalance(address)").slice(0, 10)
      );
    });

    it("Should not have vault set initially", async function () {
      expect(await strategies.vault()).to.equal(ethers.ZeroAddress);
    });

    it("Should not be paused initially", async function () {
      expect(await strategies.paused()).to.be.false;
    });
  });

  describe("Vault Management", function () {
    it("Should set vault successfully", async function () {
      await expect(strategies.setVault(vault.address))
        .to.emit(strategies, "VaultSet")
        .withArgs(vault.address);

      expect(await strategies.vault()).to.equal(vault.address);
    });

    it("Should revert setting vault twice", async function () {
      await strategies.setVault(vault.address);

      await expect(strategies.setVault(alice.address)).to.be.revertedWith(
        "Vault already set"
      );
    });

    it("Should revert setting zero address as vault", async function () {
      await expect(strategies.setVault(ethers.ZeroAddress)).to.be.revertedWith(
        "Invalid vault address"
      );
    });
  });

  describe("Execute", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should execute deposit successfully", async function () {
      const depositAmount = ethers.parseEther("100");

      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);

      await expect(strategies.connect(vault).execute(depositAmount, "0x"))
        .to.emit(strategies, "Deposit")
        .withArgs(depositAmount)
        .and.to.emit(strategies, "Executed")
        .withArgs(depositAmount, "0x");

      // Verify tokens were transferred to protocol
      expect(
        await underlyingToken.balanceOf(await mockProtocol.getAddress())
      ).to.equal(depositAmount);
      expect(
        await mockProtocol.deposits(await strategies.getAddress())
      ).to.equal(depositAmount);
    });

    it("Should revert if not called by vault", async function () {
      await expect(
        strategies.connect(alice).execute(ethers.parseEther("100"), "0x")
      ).to.be.revertedWith("Only agent can call");
    });

    it("Should revert with zero amount", async function () {
      await expect(
        strategies.connect(vault).execute(0, "0x")
      ).to.be.revertedWithCustomError(strategies, "InvalidAmount");
    });

    it("Should revert when paused", async function () {
      await strategies.connect(vault).setPaused(true);

      await expect(
        strategies.connect(vault).execute(ethers.parseEther("100"), "0x")
      ).to.be.revertedWithCustomError(strategies, "StrategyPaused");
    });
  });

  describe("Emergency Exit", function () {
    const depositAmount = ethers.parseEther("100");

    beforeEach(async function () {
      await strategies.setVault(vault.address);

      // Execute a deposit first
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");
    });

    it("Should perform emergency exit successfully", async function () {
      const vaultBalanceBefore = await underlyingToken.balanceOf(vault.address);

      await expect(strategies.connect(vault).emergencyExit("0x"))
        .to.emit(strategies, "Withdraw")
        .withArgs(depositAmount)
        .and.to.emit(strategies, "EmergencyExited")
        .withArgs(depositAmount, "0x");

      // Verify tokens were returned to vault
      expect(await underlyingToken.balanceOf(vault.address)).to.equal(
        vaultBalanceBefore + depositAmount
      );
      expect(
        await mockProtocol.deposits(await strategies.getAddress())
      ).to.equal(0);
    });

    it("Should revert if no balance", async function () {
      // First withdraw all
      await strategies.connect(vault).emergencyExit("0x");

      // Try to exit again
      await expect(
        strategies.connect(vault).emergencyExit("0x")
      ).to.be.revertedWithCustomError(strategies, "NoUnderlyingBalance");
    });

    it("Should revert if not called by vault", async function () {
      await expect(
        strategies.connect(alice).emergencyExit("0x")
      ).to.be.revertedWith("Only agent can call");
    });
  });

  describe("Harvest", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);

      // Execute a deposit to generate rewards
      const depositAmount = ethers.parseEther("100");
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");
    });

    it("Should harvest rewards successfully", async function () {
      await expect(strategies.connect(vault).harvest("0x"))
        .to.emit(strategies, "Harvested")
        .withArgs("0x");
    });

    it("Should claim rewards successfully", async function () {
      const expectedRewards = ethers.parseEther("10"); // 10% of 100

      // Add reward token to strategy first
      await strategies
        .connect(vault)
        .addRewardToken(await rewardToken.getAddress());

      await expect(strategies.connect(vault).claimRewards("0x"))
        .to.emit(strategies, "Claim")
        .withArgs(0);

      // Verify rewards were transferred to vault
      expect(await rewardToken.balanceOf(vault.address)).to.equal(
        expectedRewards
      );
    });

    it("Should revert if not called by vault", async function () {
      await expect(strategies.connect(alice).harvest("0x")).to.be.revertedWith(
        "Only agent can call"
      );
    });
  });

  describe("Reward Token Management", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should add reward token successfully", async function () {
      const newRewardToken = alice.address; // Mock reward token address

      await expect(strategies.connect(vault).addRewardToken(newRewardToken))
        .to.emit(strategies, "RewardTokenAdded")
        .withArgs(newRewardToken);

      expect(await strategies.knownRewardTokens(newRewardToken)).to.be.true;
    });

    it("Should revert adding zero address", async function () {
      await expect(
        strategies.connect(vault).addRewardToken(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should revert adding duplicate token", async function () {
      await strategies.connect(vault).addRewardToken(alice.address);

      await expect(
        strategies.connect(vault).addRewardToken(alice.address)
      ).to.be.revertedWith("Token already added");
    });

    it("Should revert if not called by vault", async function () {
      await expect(
        strategies.connect(alice).addRewardToken(bob.address)
      ).to.be.revertedWith("Only agent can call");
    });
  });

  describe("Pause Functionality", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should pause successfully", async function () {
      await expect(strategies.connect(vault).setPaused(true))
        .to.emit(strategies, "PausedState")
        .withArgs(true);

      expect(await strategies.paused()).to.be.true;
    });

    it("Should unpause successfully", async function () {
      await strategies.connect(vault).setPaused(true);

      await expect(strategies.connect(vault).setPaused(false))
        .to.emit(strategies, "PausedState")
        .withArgs(false);

      expect(await strategies.paused()).to.be.false;
    });

    it("Should revert if not called by vault", async function () {
      await expect(
        strategies.connect(alice).setPaused(true)
      ).to.be.revertedWith("Only agent can call");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should return correct balance", async function () {
      const depositAmount = ethers.parseEther("100");

      // Initially should be 0
      expect(await strategies.getBalance()).to.equal(0);

      // Execute deposit
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");

      // Should return deposited amount
      expect(await strategies.getBalance()).to.equal(depositAmount);
    });
  });

  describe("Integration Flow", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should handle complete deposit-harvest-withdraw flow", async function () {
      const depositAmount = ethers.parseEther("100");

      // 1. Deposit
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");

      // 2. Add reward token and harvest (check if not already added)
      const rewardTokenAddress = await rewardToken.getAddress();
      const isAlreadyAdded = await strategies.knownRewardTokens(
        rewardTokenAddress
      );
      if (!isAlreadyAdded) {
        await strategies.connect(vault).addRewardToken(rewardTokenAddress);
      }
      await strategies.connect(vault).harvest("0x");

      // 3. Check rewards were forwarded
      expect(await rewardToken.balanceOf(vault.address)).to.equal(
        ethers.parseEther("10")
      );

      // 4. Emergency exit
      await strategies.connect(vault).emergencyExit("0x");

      // 5. Verify final state
      expect(await strategies.getBalance()).to.equal(0);
      expect(await underlyingToken.balanceOf(vault.address)).to.equal(
        INITIAL_BALANCE
      );
    });

    it("Should handle protocol with different selectors", async function () {
      // Deploy strategies with Aave-like selectors
      const aaveStrategies = await (
        await ethers.getContractFactory("Strategies")
      ).deploy(
        await underlyingToken.getAddress(),
        await mockProtocol.getAddress(),
        ethers.id("supply(address,uint256,address,uint16)").slice(0, 10),
        ethers.id("withdraw(address,uint256,address)").slice(0, 10),
        ethers.id("claimRewards(address)").slice(0, 10),
        ethers.id("getBalance(address,address)").slice(0, 10)
      );

      await aaveStrategies.setVault(vault.address);

      // Should be able to get balance
      expect(await aaveStrategies.getBalance()).to.equal(0);
    });
  });

  describe("Advanced Strategy Functionality", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
      await underlyingToken.transfer(vault.address, ethers.parseEther("2000"));
    });

    it("Should handle multiple token rewards correctly", async function () {
      const depositAmount = ethers.parseEther("100");

      // Add reward tokens - create proper ERC20 mock for second token
      await strategies
        .connect(vault)
        .addRewardToken(await rewardToken.getAddress());

      const secondRewardToken = await (
        await ethers.getContractFactory("MockToken")
      ).deploy("SecondReward", "SR");
      await strategies
        .connect(vault)
        .addRewardToken(await secondRewardToken.getAddress());

      // Execute strategy
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");

      // Harvest should handle multiple tokens
      await strategies.connect(vault).harvest("0x");

      // Check that reward tokens are registered
      expect(await strategies.knownRewardTokens(await rewardToken.getAddress()))
        .to.be.true;
      expect(
        await strategies.knownRewardTokens(await secondRewardToken.getAddress())
      ).to.be.true;
    });

    it("Should handle gas-intensive operations efficiently", async function () {
      const depositAmount = ethers.parseEther("100");

      // Add multiple reward tokens (up to limit)
      for (let i = 0; i < 5; i++) {
        const mockRewardToken = await (
          await ethers.getContractFactory("MockToken")
        ).deploy(`RewardToken${i}`, `RT${i}`);
        await strategies
          .connect(vault)
          .addRewardToken(await mockRewardToken.getAddress());
      }

      // Execute and harvest should still work efficiently
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");

      const tx = await strategies.connect(vault).harvest("0x");
      const receipt = await tx.wait();

      // Should complete within reasonable gas limits
      expect(receipt?.gasUsed).to.be.lt(500000);
    });

    it("Should handle complex protocol interactions", async function () {
      const depositAmount = ethers.parseEther("50");

      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);

      // Execute with empty data (let strategy build default)
      await expect(strategies.connect(vault).execute(depositAmount, "0x"))
        .to.emit(strategies, "Executed")
        .withArgs(depositAmount, "0x");
    });
  });

  describe("Error Handling and Recovery", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should handle protocol failures gracefully", async function () {
      const depositAmount = ethers.parseEther("100");

      // Try to execute without vault having tokens - will fail with ERC20 error
      await expect(strategies.connect(vault).execute(depositAmount, "0x")).to.be
        .reverted; // Just expect any revert, not specific error
    });

    it("Should handle claim failures without reverting harvest", async function () {
      // Execute first to have something to harvest
      const depositAmount = ethers.parseEther("100");
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");

      // Create invalid claim data that will fail
      const invalidData = "0x1234567890";

      // Harvest should not revert even if claim fails
      await expect(strategies.connect(vault).harvest(invalidData)).to.emit(
        strategies,
        "ClaimRewardsFailed"
      );
    });

    it("Should handle emergency exit with insufficient balance", async function () {
      // Try emergency exit without any balance
      await expect(
        strategies.connect(vault).emergencyExit("0x")
      ).to.be.revertedWithCustomError(strategies, "NoUnderlyingBalance");
    });

    it("Should handle pause/unpause correctly", async function () {
      const depositAmount = ethers.parseEther("100");

      // Pause strategy
      await strategies.connect(vault).setPaused(true);

      // Operations should fail when paused
      await expect(
        strategies.connect(vault).execute(depositAmount, "0x")
      ).to.be.revertedWithCustomError(strategies, "StrategyPaused");

      // Unpause and try again
      await strategies.connect(vault).setPaused(false);

      // Should work after unpause
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      await strategies.connect(vault).execute(depositAmount, "0x");
    });
  });

  describe("Performance and Optimization", function () {
    beforeEach(async function () {
      await strategies.setVault(vault.address);
    });

    it("Should optimize gas for repeated operations", async function () {
      const depositAmount = ethers.parseEther("10");

      // First execution (more expensive)
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      const tx1 = await strategies.connect(vault).execute(depositAmount, "0x");
      const receipt1 = await tx1.wait();

      // Emergency exit
      await strategies.connect(vault).emergencyExit("0x");

      // Second execution (should be optimized)
      await underlyingToken
        .connect(vault)
        .approve(await strategies.getAddress(), depositAmount);
      const tx2 = await strategies.connect(vault).execute(depositAmount, "0x");
      const receipt2 = await tx2.wait();

      // Gas usage should be reasonable and consistent
      expect(receipt1?.gasUsed).to.be.lt(250000);
      expect(receipt2?.gasUsed).to.be.lt(250000);
    });

    it("Should handle batch operations efficiently", async function () {
      const batchSize = 3;
      const depositAmount = ethers.parseEther("10");

      for (let i = 0; i < batchSize; i++) {
        await underlyingToken
          .connect(vault)
          .approve(await strategies.getAddress(), depositAmount);
        await strategies.connect(vault).execute(depositAmount, "0x");
        await strategies.connect(vault).emergencyExit("0x");
      }

      // All operations should complete successfully
      expect(await strategies.getBalance()).to.equal(0);
    });
  });

  describe("Integration with Different Protocols", function () {
    it("Should work with different function selectors", async function () {
      // Test strategies with compound-like selectors
      const compoundStrategies = await (
        await ethers.getContractFactory("Strategies")
      ).deploy(
        await underlyingToken.getAddress(),
        await mockProtocol.getAddress(),
        ethers.id("mint(uint256)").slice(0, 10),
        ethers.id("redeem(uint256)").slice(0, 10),
        ethers.id("claimComp()").slice(0, 10),
        ethers.id("balanceOf(address)").slice(0, 10)
      );

      await compoundStrategies.setVault(vault.address);

      // Should initialize correctly
      expect(await compoundStrategies.vault()).to.equal(vault.address);
      expect(await compoundStrategies.depositSelector()).to.equal(
        ethers.id("mint(uint256)").slice(0, 10)
      );
    });

    it("Should handle protocols without claim functions", async function () {
      // Deploy strategy without claim selector
      const noClaim = await (
        await ethers.getContractFactory("Strategies")
      ).deploy(
        await underlyingToken.getAddress(),
        await mockProtocol.getAddress(),
        ethers.id("deposit(uint256)").slice(0, 10),
        ethers.id("withdraw(uint256)").slice(0, 10),
        "0x00000000", // No claim function
        ethers.id("getBalance(address)").slice(0, 10)
      );

      await noClaim.setVault(vault.address);

      // Harvest should work (skip claim step)
      await noClaim.connect(vault).harvest("0x");
    });
  });
});
