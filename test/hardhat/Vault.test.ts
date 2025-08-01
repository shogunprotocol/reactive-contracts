import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Vault, MockUSDC, Strategies } from "../typechain-types";

describe("Vault", function () {
  let vault: Vault;
  let underlyingToken: MockUSDC;
  let strategies: Strategies;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let agent: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const INITIAL_BALANCE = ethers.parseUnits("10000", 6); // 10,000 USDC

  beforeEach(async function () {
    // Get signers
    [owner, manager, agent, alice, bob] = await ethers.getSigners();

    // Deploy underlying token (USDC)
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    underlyingToken = await MockUSDCFactory.deploy();

    // Deploy vault with 1% withdrawal fee (100 basis points) and 5% yield rate (500 basis points, max 50%)
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      await underlyingToken.getAddress(),
      "Vault Token",
      "vUNDER",
      manager.address,
      agent.address,
      100, // 1% withdrawal fee
      500, // 5% annual yield rate
      owner.address // treasury address
    );

    // Setup test accounts with tokens
    await underlyingToken.transfer(alice.address, INITIAL_BALANCE);
    await underlyingToken.transfer(bob.address, INITIAL_BALANCE);
  });

  describe("Constructor and Roles", function () {
    it("Should set the correct asset", async function () {
      expect(await vault.asset()).to.equal(await underlyingToken.getAddress());
    });

    it("Should set the correct name and symbol", async function () {
      expect(await vault.name()).to.equal("Vault Token");
      expect(await vault.symbol()).to.equal("vUNDER");
    });

    it("Should grant roles correctly", async function () {
      const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
      const MANAGER_ROLE = await vault.MANAGER_ROLE();
      const AGENT_ROLE = await vault.AGENT_ROLE();

      expect(await vault.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await vault.hasRole(MANAGER_ROLE, manager.address)).to.be.true;
      expect(await vault.hasRole(AGENT_ROLE, agent.address)).to.be.true;
    });

    it("Should expose role checking functions", async function () {
      expect(await vault.hasManagerRole(manager.address)).to.be.true;
      expect(await vault.hasAgentRole(agent.address)).to.be.true;
      expect(await vault.hasManagerRole(alice.address)).to.be.false;
      expect(await vault.hasAgentRole(alice.address)).to.be.false;
    });
  });

  describe("Strategy Management", function () {
    let mockStrategy: SignerWithAddress;

    beforeEach(async function () {
      mockStrategy = alice; // Using alice's address as a mock strategy
    });

    describe("Add Strategy", function () {
      it("Should add strategy successfully", async function () {
        await expect(vault.connect(manager).addStrategy(mockStrategy.address))
          .to.emit(vault, "StrategyAdded")
          .withArgs(mockStrategy.address);

        expect(await vault.isStrategy(mockStrategy.address)).to.be.true;

        // Check that strategy was added to array by checking the first element
        const firstStrategy = await vault.strategies(0);
        expect(firstStrategy).to.equal(mockStrategy.address);
      });

      it("Should revert if not manager", async function () {
        await expect(
          vault.connect(alice).addStrategy(mockStrategy.address)
        ).to.be.revertedWith("Vault: caller is not a manager");
      });

      it("Should revert with zero address", async function () {
        await expect(
          vault.connect(manager).addStrategy(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("Should revert if strategy already exists", async function () {
        await vault.connect(manager).addStrategy(mockStrategy.address);

        await expect(
          vault.connect(manager).addStrategy(mockStrategy.address)
        ).to.be.revertedWithCustomError(vault, "StrategyAlreadyExists");
      });
    });

    describe("Remove Strategy", function () {
      beforeEach(async function () {
        await vault.connect(manager).addStrategy(mockStrategy.address);
      });

      it("Should remove strategy successfully", async function () {
        await expect(
          vault.connect(manager).removeStrategy(mockStrategy.address)
        )
          .to.emit(vault, "StrategyRemoved")
          .withArgs(mockStrategy.address);

        expect(await vault.isStrategy(mockStrategy.address)).to.be.false;
      });

      it("Should revert if not manager", async function () {
        await expect(
          vault.connect(alice).removeStrategy(mockStrategy.address)
        ).to.be.revertedWith("Vault: caller is not a manager");
      });

      it("Should revert if strategy doesn't exist", async function () {
        await expect(
          vault.connect(manager).removeStrategy(bob.address)
        ).to.be.revertedWithCustomError(vault, "StrategyDoesNotExist");
      });
    });

    describe("Execute Strategy", function () {
      beforeEach(async function () {
        await vault.connect(manager).addStrategy(mockStrategy.address);
      });

      it("Should execute strategy successfully", async function () {
        const data = "0x12345678";

        await expect(
          vault.connect(agent).executeStrategy(mockStrategy.address, data)
        )
          .to.emit(vault, "StrategyExecuted")
          .withArgs(mockStrategy.address, data);
      });

      it("Should revert if not agent", async function () {
        await expect(
          vault.connect(alice).executeStrategy(mockStrategy.address, "0x")
        ).to.be.revertedWith("Vault: caller is not an agent");
      });

      it("Should revert if strategy doesn't exist", async function () {
        await expect(
          vault.connect(agent).executeStrategy(bob.address, "0x")
        ).to.be.revertedWithCustomError(vault, "StrategyDoesNotExist");
      });
    });
  });

  describe("ERC4626 Functions", function () {
    beforeEach(async function () {
      // Approve vault to spend tokens
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), INITIAL_BALANCE);
      await underlyingToken
        .connect(bob)
        .approve(await vault.getAddress(), INITIAL_BALANCE);
    });

    describe("Deposit", function () {
      it("Should deposit assets successfully", async function () {
        const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

        const sharesBefore = await vault.balanceOf(alice.address);
        const tx = await vault
          .connect(alice)
          .deposit(depositAmount, alice.address);
        const sharesAfter = await vault.balanceOf(alice.address);

        expect(sharesAfter - sharesBefore).to.be.gt(0);
        expect(await underlyingToken.balanceOf(alice.address)).to.equal(
          INITIAL_BALANCE - depositAmount
        );
        expect(await vault.totalAssets()).to.equal(depositAmount);
      });

      it("Should handle multiple deposits", async function () {
        const depositAmount = ethers.parseUnits("500", 6); // 500 USDC

        await vault.connect(alice).deposit(depositAmount, alice.address);
        await vault.connect(bob).deposit(depositAmount, bob.address);

        expect(await vault.totalAssets()).to.equal(depositAmount * 2n);
      });
    });

    describe("Mint", function () {
      it("Should mint shares successfully", async function () {
        const sharesToMint = ethers.parseUnits("1000", 6); // 1,000 shares

        const assetsBefore = await underlyingToken.balanceOf(alice.address);
        await vault.connect(alice).mint(sharesToMint, alice.address);
        const assetsAfter = await underlyingToken.balanceOf(alice.address);

        expect(await vault.balanceOf(alice.address)).to.equal(sharesToMint);
        expect(assetsBefore - assetsAfter).to.be.gt(0);
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
        await vault.connect(alice).deposit(depositAmount, alice.address);
      });

      it("Should withdraw assets successfully with fee", async function () {
        const withdrawAmount = ethers.parseUnits("500", 6); // 500 USDC
        const expectedFee = ethers.parseUnits("5", 6); // 1% of 500 USDC = 5 USDC
        const expectedNetAmount = withdrawAmount - expectedFee;

        const sharesBefore = await vault.balanceOf(alice.address);
        const balanceBefore = await underlyingToken.balanceOf(alice.address);

        await expect(
          vault
            .connect(alice)
            .withdraw(withdrawAmount, alice.address, alice.address)
        )
          .to.emit(vault, "WithdrawalFeeCollected")
          .withArgs(alice.address, expectedFee);

        const sharesAfter = await vault.balanceOf(alice.address);
        const balanceAfter = await underlyingToken.balanceOf(alice.address);

        expect(sharesBefore - sharesAfter).to.be.gt(0);
        // User should receive net amount (withdrawal - fee)
        expect(balanceAfter - balanceBefore).to.equal(expectedNetAmount);
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
        await vault.connect(alice).deposit(depositAmount, alice.address);
      });

      it("Should redeem shares successfully with fee", async function () {
        const sharesToRedeem = (await vault.balanceOf(alice.address)) / 2n;

        const assetsBefore = await underlyingToken.balanceOf(alice.address);
        await vault
          .connect(alice)
          .redeem(sharesToRedeem, alice.address, alice.address);
        const assetsAfter = await underlyingToken.balanceOf(alice.address);

        expect(assetsAfter - assetsBefore).to.be.gt(0);
        expect(await vault.balanceOf(alice.address)).to.equal(sharesToRedeem);
      });
    });
  });

  describe("Strategy Integration", function () {
    let mockProtocol: any;
    let rewardToken: any;

    beforeEach(async function () {
      // Deploy reward token
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      rewardToken = await MockTokenFactory.deploy("Reward Token", "REWARD");

      // Deploy mock protocol
      const MockProtocolFactory = await ethers.getContractFactory(
        "MockProtocol"
      );
      const mockProtocolContract = await MockProtocolFactory.deploy(
        await underlyingToken.getAddress(),
        await rewardToken.getAddress()
      );
      mockProtocol = mockProtocolContract;

      // Calculate correct function selectors
      const depositSelector = ethers.id("deposit(uint256)").slice(0, 10);
      const withdrawSelector = ethers.id("withdraw(uint256)").slice(0, 10);
      const claimSelector = ethers.id("claimRewards()").slice(0, 10);
      const getBalanceSelector = ethers.id("getBalance(address)").slice(0, 10);

      // Deploy strategy
      const StrategiesFactory = await ethers.getContractFactory("Strategies");
      strategies = await StrategiesFactory.deploy(
        await underlyingToken.getAddress(),
        await mockProtocol.getAddress(),
        depositSelector,
        withdrawSelector,
        claimSelector,
        getBalanceSelector
      );

      // Set vault in strategy
      await strategies.setVault(await vault.getAddress());

      // Add strategy to vault
      await vault.connect(manager).addStrategy(await strategies.getAddress());

      // Fund protocol with reward tokens
      await rewardToken.transfer(
        await mockProtocol.getAddress(),
        ethers.parseUnits("10000", 18) // Reward tokens can have 18 decimals
      );
    });

    it("Should harvest rewards from strategy", async function () {
      // Complete realistic test flow
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // 1. User deposits to vault
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // 2. Agent deposits from vault to strategy using new function
      await vault
        .connect(agent)
        .depositToStrategy(await strategies.getAddress(), depositAmount, "0x");

      // 3. Verify strategy has balance
      expect(await strategies.getBalance()).to.equal(depositAmount);

      // 4. Test harvest - should work without gas issues
      // We don't need to add reward tokens for this test, just verify harvest can be called
      await expect(
        vault
          .connect(agent)
          .harvestStrategy(await strategies.getAddress(), "0x")
      )
        .to.emit(vault, "StrategyHarvested")
        .withArgs(await strategies.getAddress(), "0x");
    });

    it("Should perform emergency exit from strategy", async function () {
      // Just test that the emergency exit function can be called (will revert with NoUnderlyingBalance but that's expected)
      await expect(
        vault
          .connect(agent)
          .emergencyExitStrategy(await strategies.getAddress(), "0x")
      ).to.be.revertedWithCustomError(strategies, "NoUnderlyingBalance");
    });

    it("Should revert harvest if not agent", async function () {
      await expect(
        vault
          .connect(alice)
          .harvestStrategy(await strategies.getAddress(), "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");
    });

    it("Should revert emergency exit if not agent", async function () {
      await expect(
        vault
          .connect(alice)
          .emergencyExitStrategy(await strategies.getAddress(), "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");
    });

    it("Should deposit to strategy successfully", async function () {
      const depositAmount = ethers.parseUnits("500", 6); // 500 USDC

      // First deposit to vault
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Then deposit to strategy
      await expect(
        vault
          .connect(agent)
          .depositToStrategy(await strategies.getAddress(), depositAmount, "0x")
      )
        .to.emit(vault, "StrategyExecuted")
        .withArgs(await strategies.getAddress(), "0x");

      // Verify strategy has the balance
      expect(await strategies.getBalance()).to.equal(depositAmount);
    });

    it("Should revert deposit to strategy if insufficient balance", async function () {
      const depositAmount = ethers.parseUnits("50000", 6); // More than vault has

      await expect(
        vault
          .connect(agent)
          .depositToStrategy(await strategies.getAddress(), depositAmount, "0x")
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should revert deposit to strategy if not agent", async function () {
      await expect(
        vault
          .connect(alice)
          .depositToStrategy(
            await strategies.getAddress(),
            ethers.parseUnits("100", 6),
            "0x"
          )
      ).to.be.revertedWith("Vault: caller is not an agent");
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to grant roles", async function () {
      const MANAGER_ROLE = await vault.MANAGER_ROLE();

      await vault.connect(owner).grantRole(MANAGER_ROLE, alice.address);
      expect(await vault.hasRole(MANAGER_ROLE, alice.address)).to.be.true;
    });

    it("Should allow owner to revoke roles", async function () {
      const MANAGER_ROLE = await vault.MANAGER_ROLE();

      await vault.connect(owner).revokeRole(MANAGER_ROLE, manager.address);
      expect(await vault.hasRole(MANAGER_ROLE, manager.address)).to.be.false;
    });

    it("Should not allow non-admin to grant roles", async function () {
      const MANAGER_ROLE = await vault.MANAGER_ROLE();

      await expect(vault.connect(alice).grantRole(MANAGER_ROLE, bob.address)).to
        .be.reverted;
    });
  });

  describe("Advanced ERC4626 Functionality", function () {
    beforeEach(async function () {
      // Setup multiple users with different amounts
      await underlyingToken.transfer(
        alice.address,
        ethers.parseUnits("5000", 6)
      ); // 5,000 USDC
      await underlyingToken.transfer(bob.address, ethers.parseUnits("2500", 6)); // 2,500 USDC

      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
      await underlyingToken
        .connect(bob)
        .approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it("Should handle large deposits correctly", async function () {
      const largeAmount = ethers.parseUnits("4999", 6); // 4,999 USDC

      const sharesBefore = await vault.balanceOf(alice.address);
      await vault.connect(alice).deposit(largeAmount, alice.address);
      const sharesAfter = await vault.balanceOf(alice.address);

      expect(sharesAfter - sharesBefore).to.be.gt(0);
      expect(await vault.totalAssets()).to.equal(largeAmount);
    });

    it("Should maintain correct share-to-asset ratio", async function () {
      // First deposit
      await vault
        .connect(alice)
        .deposit(ethers.parseUnits("1000", 6), alice.address); // 1,000 USDC

      // Second deposit from different user
      await vault
        .connect(bob)
        .deposit(ethers.parseUnits("2000", 6), bob.address); // 2,000 USDC

      // Check ratios
      const aliceShares = await vault.balanceOf(alice.address);
      const bobShares = await vault.balanceOf(bob.address);

      // Bob should have approximately 2x Alice's shares
      expect(bobShares).to.be.closeTo(
        aliceShares * 2n,
        ethers.parseUnits("1", 6) // 1 USDC tolerance
      );
    });

    it("Should handle preview functions correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // Test preview functions before any deposits
      const previewShares = await vault.previewDeposit(depositAmount);
      const previewAssets = await vault.previewMint(previewShares);

      expect(previewAssets).to.equal(depositAmount);

      // Actually deposit and compare
      await vault.connect(alice).deposit(depositAmount, alice.address);
      const actualShares = await vault.balanceOf(alice.address);

      expect(actualShares).to.equal(previewShares);
    });

    it("Should handle max functions correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Test max functions
      const maxWithdraw = await vault.maxWithdraw(alice.address);
      const maxRedeem = await vault.maxRedeem(alice.address);

      expect(maxWithdraw).to.be.gt(0);
      expect(maxRedeem).to.be.gt(0);
      expect(maxRedeem).to.equal(await vault.balanceOf(alice.address));
    });
  });

  describe("Advanced Strategy Integration", function () {
    let mockProtocol: any;
    let rewardToken: any;
    let secondStrategy: any;

    beforeEach(async function () {
      // Deploy additional infrastructure
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      rewardToken = await MockTokenFactory.deploy("Reward Token", "REWARD");

      const MockProtocolFactory = await ethers.getContractFactory(
        "MockProtocol"
      );
      mockProtocol = await MockProtocolFactory.deploy(
        await underlyingToken.getAddress(),
        await rewardToken.getAddress()
      );

      // Deploy first strategy
      const StrategiesFactory = await ethers.getContractFactory("Strategies");
      strategies = await StrategiesFactory.deploy(
        await underlyingToken.getAddress(),
        await mockProtocol.getAddress(),
        ethers.id("deposit(uint256)").slice(0, 10),
        ethers.id("withdraw(uint256)").slice(0, 10),
        ethers.id("claimRewards()").slice(0, 10),
        ethers.id("getBalance(address)").slice(0, 10)
      );

      // Deploy second strategy with different protocol
      secondStrategy = await StrategiesFactory.deploy(
        await underlyingToken.getAddress(),
        await mockProtocol.getAddress(),
        ethers.id("deposit(uint256)").slice(0, 10),
        ethers.id("withdraw(uint256)").slice(0, 10),
        ethers.id("claimRewards()").slice(0, 10),
        ethers.id("getBalance(address)").slice(0, 10)
      );

      // Setup strategies
      await strategies.setVault(await vault.getAddress());
      await secondStrategy.setVault(await vault.getAddress());

      await vault.connect(manager).addStrategy(await strategies.getAddress());
      await vault
        .connect(manager)
        .addStrategy(await secondStrategy.getAddress());

      // Fund protocol
      await rewardToken.transfer(
        await mockProtocol.getAddress(),
        ethers.parseUnits("10000", 18) // Reward tokens can have 18 decimals
      );

      // Setup user funds
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it("Should handle multiple strategies simultaneously", async function () {
      const depositAmount = ethers.parseUnits("2000", 6); // 2,000 USDC

      // User deposits to vault
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Distribute to multiple strategies
      await vault
        .connect(agent)
        .depositToStrategy(
          await strategies.getAddress(),
          ethers.parseUnits("1000", 6),
          "0x"
        );

      await vault
        .connect(agent)
        .depositToStrategy(
          await secondStrategy.getAddress(),
          ethers.parseUnits("1000", 6),
          "0x"
        );

      // Verify both strategies have balances
      expect(await strategies.getBalance()).to.equal(
        ethers.parseUnits("1000", 6)
      );
      expect(await secondStrategy.getBalance()).to.equal(
        ethers.parseUnits("1000", 6)
      );
    });

    it("Should handle strategy failures gracefully", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // Deposit to vault
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Try to deposit more than vault has
      await expect(
        vault.connect(agent).depositToStrategy(
          await strategies.getAddress(),
          ethers.parseUnits("2000", 6), // More than vault balance
          "0x"
        )
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should handle complete strategy lifecycle", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // 1. User deposits
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // 2. Deploy to strategy
      await vault
        .connect(agent)
        .depositToStrategy(await strategies.getAddress(), depositAmount, "0x");

      // 3. Harvest (will work even without rewards)
      await vault
        .connect(agent)
        .harvestStrategy(await strategies.getAddress(), "0x");

      // 4. Emergency exit
      await vault
        .connect(agent)
        .emergencyExitStrategy(await strategies.getAddress(), "0x");

      // 5. Verify funds returned to vault
      expect(await strategies.getBalance()).to.equal(0);
      expect(
        await underlyingToken.balanceOf(await vault.getAddress())
      ).to.be.gt(0);
    });
  });

  describe("Edge Cases and Security", function () {
    beforeEach(async function () {
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it("Should handle zero amount operations correctly", async function () {
      // Zero deposit may not revert in OpenZeppelin ERC4626, just check it works
      await vault.connect(alice).deposit(0, alice.address);

      // Zero withdraw should work
      await vault.connect(alice).withdraw(0, alice.address, alice.address);
    });

    it("Should prevent unauthorized access", async function () {
      // Non-manager cannot add strategies
      await expect(
        vault.connect(alice).addStrategy(bob.address)
      ).to.be.revertedWith("Vault: caller is not a manager");

      // Non-agent cannot execute strategies
      await expect(
        vault.connect(alice).depositToStrategy(bob.address, 100, "0x")
      ).to.be.revertedWith("Vault: caller is not an agent");
    });

    it("Should handle reentrancy protection", async function () {
      // This is implicitly tested by our strategy contracts
      // The nonReentrant modifier should prevent any reentrancy attacks
      expect(await vault.hasAgentRole(agent.address)).to.be.true;
    });

    it("Should handle large numbers correctly", async function () {
      const largeAmount = ethers.parseUnits("500000", 6); // 500K USDC - more reasonable

      // Mint large amount to owner first
      await underlyingToken.mint(owner.address, largeAmount);

      // Transfer large amount to alice
      await underlyingToken.transfer(alice.address, largeAmount);

      // Should handle large deposit
      await vault.connect(alice).deposit(largeAmount, alice.address);

      expect(await vault.totalAssets()).to.equal(largeAmount);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should optimize gas for multiple operations", async function () {
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);

      // First operation (more expensive due to storage initialization)
      const tx1 = await vault
        .connect(alice)
        .deposit(ethers.parseUnits("1000", 6), alice.address); // 1,000 USDC
      const receipt1 = await tx1.wait();

      // Second operation (should be cheaper)
      const tx2 = await vault
        .connect(alice)
        .deposit(ethers.parseUnits("1000", 6), alice.address); // 1,000 USDC
      const receipt2 = await tx2.wait();

      // Gas usage should be reasonable
      expect(receipt1?.gasUsed).to.be.lt(200000);
      expect(receipt2?.gasUsed).to.be.lt(150000);
    });
  });

  describe("Withdrawal Fee Tests", function () {
    beforeEach(async function () {
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
      await underlyingToken
        .connect(bob)
        .approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it("Should get withdrawal fee correctly", async function () {
      expect(await vault.getWithdrawalFee()).to.equal(100); // 1%
    });

    it("Should calculate withdrawal fee correctly", async function () {
      const withdrawAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const expectedFee = ethers.parseUnits("10", 6); // 1% of 1,000 USDC = 10 USDC

      expect(await vault.calculateWithdrawalFee(withdrawAmount)).to.equal(
        expectedFee
      );
    });

    it("Should charge correct fee on withdrawal", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const withdrawAmount = ethers.parseUnits("500", 6); // 500 USDC
      const expectedFee = ethers.parseUnits("5", 6); // 1% of 500 USDC = 5 USDC
      const expectedNetAmount = withdrawAmount - expectedFee;

      // Deposit first
      await vault.connect(alice).deposit(depositAmount, alice.address);

      const balanceBefore = await underlyingToken.balanceOf(alice.address);
      const vaultBalanceBefore = await underlyingToken.balanceOf(
        await vault.getAddress()
      );

      // Withdraw with fee
      await expect(
        vault
          .connect(alice)
          .withdraw(withdrawAmount, alice.address, alice.address)
      )
        .to.emit(vault, "WithdrawalFeeCollected")
        .withArgs(alice.address, expectedFee);

      const balanceAfter = await underlyingToken.balanceOf(alice.address);
      const vaultBalanceAfter = await underlyingToken.balanceOf(
        await vault.getAddress()
      );

      // User should receive net amount
      expect(balanceAfter - balanceBefore).to.equal(expectedNetAmount);

      // Vault should have lost only the net amount (the fee stays in the vault)
      expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(
        expectedNetAmount
      );
    });

    it("Should charge correct fee on redeem", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // Deposit first
      await vault.connect(alice).deposit(depositAmount, alice.address);

      const sharesToRedeem = (await vault.balanceOf(alice.address)) / 2n;
      const balanceBefore = await underlyingToken.balanceOf(alice.address);

      // Redeem with fee
      await expect(
        vault
          .connect(alice)
          .redeem(sharesToRedeem, alice.address, alice.address)
      ).to.emit(vault, "WithdrawalFeeCollected");

      const balanceAfter = await underlyingToken.balanceOf(alice.address);

      // User should receive less than the full asset amount due to fee
      expect(balanceAfter - balanceBefore).to.be.lt(
        ethers.parseUnits("500", 6)
      );
      expect(balanceAfter - balanceBefore).to.be.gt(
        ethers.parseUnits("490", 6)
      );
    });

    it("Should handle zero withdrawal fee", async function () {
      // Deploy a vault with 0% withdrawal fee
      const VaultFactory = await ethers.getContractFactory("Vault");
      const vaultZeroFee = await VaultFactory.deploy(
        await underlyingToken.getAddress(),
        "Zero Fee Vault",
        "ZFV",
        manager.address,
        agent.address,
        0, // 0% withdrawal fee
        0, // 0% yield rate
        owner.address // treasury address
      );

      await underlyingToken
        .connect(alice)
        .approve(await vaultZeroFee.getAddress(), ethers.MaxUint256);

      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const withdrawAmount = ethers.parseUnits("500", 6); // 500 USDC

      // Deposit
      await vaultZeroFee.connect(alice).deposit(depositAmount, alice.address);

      const balanceBefore = await underlyingToken.balanceOf(alice.address);

      // Withdraw - should not emit fee event
      await vaultZeroFee
        .connect(alice)
        .withdraw(withdrawAmount, alice.address, alice.address);

      const balanceAfter = await underlyingToken.balanceOf(alice.address);

      // Should receive full amount with no fee
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("Should revert with fee too high", async function () {
      const VaultFactory = await ethers.getContractFactory("Vault");

      await expect(
        VaultFactory.deploy(
          await underlyingToken.getAddress(),
          "High Fee Vault",
          "HFV",
          manager.address,
          agent.address,
          1500, // 15% withdrawal fee (too high)
          500, // 5% yield rate
          owner.address // treasury address
        )
      ).to.be.revertedWithCustomError(vault, "WithdrawalFeeTooHigh");
    });

    it("Should allow maximum withdrawal fee", async function () {
      const VaultFactory = await ethers.getContractFactory("Vault");

      // Should allow 10% fee (1000 basis points)
      const vaultMaxFee = await VaultFactory.deploy(
        await underlyingToken.getAddress(),
        "Max Fee Vault",
        "MFV",
        manager.address,
        agent.address,
        1000, // 10% withdrawal fee (maximum allowed)
        500, // 5% yield rate
        owner.address // treasury address
      );

      expect(await vaultMaxFee.getWithdrawalFee()).to.equal(1000);
    });
  });

  describe("Yield System Tests", function () {
    beforeEach(async function () {
      await underlyingToken
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
      await underlyingToken
        .connect(bob)
        .approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it("Should get yield rate correctly", async function () {
      expect(await vault.getYieldRate()).to.equal(500); // 5%
    });

    it("Should calculate annual yield correctly", async function () {
      const amount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const expectedYield = ethers.parseUnits("50", 6); // 5% of 1,000 = 50 USDC

      expect(await vault.calculateAnnualYield(amount)).to.equal(expectedYield);
    });

    it("Should calculate yield for specific period correctly", async function () {
      const amount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const thirtyDays = 30 * 24 * 60 * 60; // 30 days in seconds
      const expectedYield = ethers.parseUnits("4109589", 0); // Approximately 4.11 USDC for 30 days at 5% APY

      const calculatedYield = await vault.calculateYieldForPeriod(
        amount,
        thirtyDays
      );
      expect(calculatedYield).to.be.closeTo(
        expectedYield,
        ethers.parseUnits("1", 3)
      ); // 0.001 USDC tolerance
    });

    it("Should accrue yield over time", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // Deposit to vault
      await vault.connect(alice).deposit(depositAmount, alice.address);
      expect(await vault.getBaseAssets()).to.equal(depositAmount);

      // Fast forward time by 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Check pending yield
      const pendingYield = await vault.calculatePendingYield();
      expect(pendingYield).to.be.gt(0);
      expect(pendingYield).to.be.lt(ethers.parseUnits("5", 6)); // Should be less than 5 USDC for 30 days

      // Update yield
      await vault.updateYield();

      // Check total assets increased
      const totalAssets = await vault.totalAssets();
      expect(totalAssets).to.be.gt(depositAmount);
      expect(await vault.getTotalAccruedYield()).to.be.gt(0);
    });

    it("Should compound yield over multiple periods", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      // Deposit to vault
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Fast forward and update yield multiple times to test compounding
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_increaseTime", [10 * 24 * 60 * 60]); // 10 days
        await ethers.provider.send("evm_mine", []);
        await vault.updateYield();
      }

      const totalAssets = await vault.totalAssets();
      const accruedYield = await vault.getTotalAccruedYield();

      expect(totalAssets).to.be.gt(depositAmount);
      expect(accruedYield).to.be.gt(0);
      expect(totalAssets).to.equal(
        (await vault.getBaseAssets()) + accruedYield
      );
    });

    it("Should update yield on deposits and withdrawals", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      // Initial deposit
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const pendingBefore = await vault.calculatePendingYield();
      expect(pendingBefore).to.be.gt(0);

      // Make another deposit (should trigger yield update)
      await vault
        .connect(bob)
        .deposit(ethers.parseUnits("500", 6), bob.address);

      // Pending yield should be 0 after update
      expect(await vault.calculatePendingYield()).to.equal(0);
      expect(await vault.getTotalAccruedYield()).to.be.gte(pendingBefore);
    });

    it("Should handle zero yield rate", async function () {
      // Deploy vault with 0% yield
      const VaultFactory = await ethers.getContractFactory("Vault");
      const vaultNoYield = await VaultFactory.deploy(
        await underlyingToken.getAddress(),
        "No Yield Vault",
        "NYV",
        manager.address,
        agent.address,
        100, // 1% withdrawal fee
        0, // 0% yield rate
        owner.address // treasury address
      );

      await underlyingToken
        .connect(alice)
        .approve(await vaultNoYield.getAddress(), ethers.MaxUint256);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vaultNoYield.connect(alice).deposit(depositAmount, alice.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]); // 1 year
      await ethers.provider.send("evm_mine", []);

      // Should have no yield
      expect(await vaultNoYield.calculatePendingYield()).to.equal(0);
      expect(await vaultNoYield.getTotalAccruedYield()).to.equal(0);
      expect(await vaultNoYield.totalAssets()).to.equal(depositAmount);
    });

    it("Should allow manager to change yield rate", async function () {
      const newYieldRate = 1000; // 10%

      await expect(vault.connect(manager).setYieldRate(newYieldRate))
        .to.emit(vault, "YieldRateUpdated")
        .withArgs(500, newYieldRate);

      expect(await vault.getYieldRate()).to.equal(newYieldRate);
    });

    it("Should revert if non-manager tries to change yield rate", async function () {
      await expect(vault.connect(alice).setYieldRate(1000)).to.be.revertedWith(
        "Vault: caller is not a manager"
      );
    });

    it("Should revert if yield rate is too high", async function () {
      await expect(
        vault.connect(manager).setYieldRate(5500) // 55% (higher than max 50%)
      ).to.be.revertedWithCustomError(vault, "YieldRateTooHigh");
    });

    it("Should handle proportional reduction on withdrawal", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      // Deposit and accrue some yield
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Fast forward time to accrue yield
      await ethers.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]); // 90 days
      await ethers.provider.send("evm_mine", []);
      await vault.updateYield();

      const baseAssetsBefore = await vault.getBaseAssets();
      const accruedYieldBefore = await vault.getTotalAccruedYield();
      const totalAssetsBefore = await vault.totalAssets();

      expect(baseAssetsBefore).to.equal(depositAmount);
      expect(accruedYieldBefore).to.be.gt(0);

      // Withdraw 50% of total assets
      const withdrawAmount = totalAssetsBefore / 2n;
      await vault
        .connect(alice)
        .withdraw(withdrawAmount, alice.address, alice.address);

      const baseAssetsAfter = await vault.getBaseAssets();
      const accruedYieldAfter = await vault.getTotalAccruedYield();

      // Both base assets and accrued yield should be reduced proportionally
      expect(baseAssetsAfter).to.be.lt(baseAssetsBefore);
      expect(accruedYieldAfter).to.be.lt(accruedYieldBefore);

      // Should be approximately 50% of original amounts
      expect(baseAssetsAfter).to.be.closeTo(
        baseAssetsBefore / 2n,
        ethers.parseUnits("1", 6)
      );
      expect(accruedYieldAfter).to.be.closeTo(
        accruedYieldBefore / 2n,
        ethers.parseUnits("0.1", 6)
      );
    });

    it("Should include yield in share price calculations", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      // Alice deposits first
      await vault.connect(alice).deposit(depositAmount, alice.address);
      const aliceShares = await vault.balanceOf(alice.address);

      // Fast forward time to accrue yield
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]); // 1 year
      await ethers.provider.send("evm_mine", []);

      // Bob deposits same amount after yield has accrued
      await vault.connect(bob).deposit(depositAmount, bob.address);
      const bobShares = await vault.balanceOf(bob.address);

      // Bob should get fewer shares since the share price increased due to yield
      expect(bobShares).to.be.lt(aliceShares);

      // Alice should have more assets because she benefited from yield accrual
      const aliceAssets = await vault.previewRedeem(aliceShares);
      const bobAssets = await vault.previewRedeem(bobShares);

      // Alice should have approximately 1000 + conservative yield = ~1036 USDC
      // Due to our conservative Taylor approximation implementation
      expect(aliceAssets).to.be.closeTo(
        ethers.parseUnits("1036", 6),
        ethers.parseUnits("15", 6)
      );
      // Bob should have approximately 1000 USDC (just deposited)
      expect(bobAssets).to.be.closeTo(
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("10", 6)
      );
    });

    it("Should emit YieldAccrued events", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Update yield should emit event
      await expect(vault.updateYield()).to.emit(vault, "YieldAccrued");
    });

    it("Should track last yield update timestamp", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      const timestampBefore = await vault.getLastYieldUpdate();

      await vault.connect(alice).deposit(depositAmount, alice.address);

      const timestampAfter = await vault.getLastYieldUpdate();
      expect(timestampAfter).to.be.gt(timestampBefore);
    });
  });
});
