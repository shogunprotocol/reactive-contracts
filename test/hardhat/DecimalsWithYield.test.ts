import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Vault, MockUSDC } from "../typechain-types";

describe("🎯 DECIMALS WITH YIELD TESTS", function () {
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
    [owner, manager, agent, treasury, alice, bob] = await ethers.getSigners();

    // Deploy USDC with 6 decimals
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    underlyingToken = await MockUSDCFactory.deploy();

    // Deploy vault with 5% yield rate
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      await underlyingToken.getAddress(),
      "USDC Vault",
      "vUSDC",
      manager.address,
      agent.address,
      0, // 0% withdrawal fee for cleaner tests
      500, // 5% annual yield rate
      treasury.address
    );

    // Setup users with tokens
    await underlyingToken.transfer(alice.address, INITIAL_BALANCE);
    await underlyingToken.transfer(bob.address, INITIAL_BALANCE);
    await underlyingToken
      .connect(alice)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await underlyingToken
      .connect(bob)
      .approve(await vault.getAddress(), ethers.MaxUint256);
  });

  describe("📈 YIELD IMPACT ON EXCHANGE RATES", function () {
    it("Should maintain proper exchange rates when yield accrues", async function () {
      console.log("🔍 Testing exchange rates with yield...");

      // Alice deposits first
      const aliceDeposit = ethers.parseUnits("1000", 6); // 1,000 USDC
      await vault.connect(alice).deposit(aliceDeposit, alice.address);

      const aliceShares = await vault.balanceOf(alice.address);
      console.log(
        `  Alice deposited: ${ethers.formatUnits(aliceDeposit, 6)} USDC`
      );
      console.log(
        `  Alice received: ${ethers.formatUnits(aliceShares, 6)} shares`
      );

      // Fast forward 30 days to accrue yield
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const totalAssetsBeforeBob = await vault.totalAssets();
      const totalSupplyBeforeBob = await vault.totalSupply();
      const exchangeRateBeforeBob =
        (totalAssetsBeforeBob * 1000000n) / totalSupplyBeforeBob;

      console.log(`  After 30 days:`);
      console.log(
        `    Total assets: ${ethers.formatUnits(totalAssetsBeforeBob, 6)} USDC`
      );
      console.log(
        `    Total supply: ${ethers.formatUnits(
          totalSupplyBeforeBob,
          6
        )} shares`
      );
      console.log(
        `    Exchange rate: 1 share = ${ethers.formatUnits(
          exchangeRateBeforeBob,
          6
        )} USDC`
      );

      // Bob deposits same amount after yield has accrued
      const bobDeposit = ethers.parseUnits("1000", 6); // 1,000 USDC
      await vault.connect(bob).deposit(bobDeposit, bob.address);

      const bobShares = await vault.balanceOf(bob.address);
      console.log(`  Bob deposited: ${ethers.formatUnits(bobDeposit, 6)} USDC`);
      console.log(`  Bob received: ${ethers.formatUnits(bobShares, 6)} shares`);

      // Bob should get fewer shares because share price increased due to yield
      expect(bobShares).to.be.lt(
        aliceShares,
        "Bob should get fewer shares due to yield appreciation"
      );

      // Verify Alice can redeem more than she deposited (due to yield)
      const aliceRedeemable = await vault.previewRedeem(aliceShares);
      console.log(
        `  Alice can redeem: ${ethers.formatUnits(aliceRedeemable, 6)} USDC`
      );

      expect(aliceRedeemable).to.be.gt(
        aliceDeposit,
        "Alice should be able to redeem more than she deposited"
      );

      // Verify Bob can redeem approximately what he deposited
      const bobRedeemable = await vault.previewRedeem(bobShares);
      console.log(
        `  Bob can redeem: ${ethers.formatUnits(bobRedeemable, 6)} USDC`
      );

      expect(bobRedeemable).to.be.closeTo(
        bobDeposit,
        ethers.parseUnits("1", 6),
        "Bob should redeem close to what he deposited"
      );
    });

    it("Should handle precision correctly with small yield amounts", async function () {
      console.log("🔍 Testing precision with small yield amounts...");

      // Deposit small amount
      const smallDeposit = ethers.parseUnits("1", 6); // 1 USDC
      await vault.connect(alice).deposit(smallDeposit, alice.address);

      console.log(`  Deposited: ${ethers.formatUnits(smallDeposit, 6)} USDC`);

      // Fast forward 1 day (should generate very small yield)
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const totalAssets = await vault.totalAssets();
      const pendingYield = await vault.calculatePendingYield();

      console.log(
        `  Total assets after 1 day: ${totalAssets} wei (${ethers.formatUnits(
          totalAssets,
          6
        )} USDC)`
      );
      console.log(
        `  Pending yield: ${pendingYield} wei (${ethers.formatUnits(
          pendingYield,
          6
        )} USDC)`
      );

      // Yield should be very small but non-zero
      expect(pendingYield).to.be.gt(
        0,
        "Should have some yield even for small amounts"
      );
      expect(pendingYield).to.be.lt(
        ethers.parseUnits("0.01", 6),
        "Yield should be very small for 1 day"
      );

      // Should maintain precision
      expect(totalAssets).to.equal(
        smallDeposit + pendingYield,
        "Total assets should equal deposit plus yield"
      );
    });

    it("Should handle multiple users with different entry points", async function () {
      console.log("🔍 Testing multiple users with different entry points...");

      // Alice deposits at start
      const aliceDeposit = ethers.parseUnits("1000", 6);
      await vault.connect(alice).deposit(aliceDeposit, alice.address);
      console.log(
        `  Alice deposits: ${ethers.formatUnits(aliceDeposit, 6)} USDC at T=0`
      );

      // Wait 15 days
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Bob deposits after 15 days
      const bobDeposit = ethers.parseUnits("1000", 6);
      await vault.connect(bob).deposit(bobDeposit, bob.address);
      console.log(
        `  Bob deposits: ${ethers.formatUnits(bobDeposit, 6)} USDC at T=15 days`
      );

      // Wait another 15 days (total 30 days)
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const aliceShares = await vault.balanceOf(alice.address);
      const bobShares = await vault.balanceOf(bob.address);

      const aliceRedeemable = await vault.previewRedeem(aliceShares);
      const bobRedeemable = await vault.previewRedeem(bobShares);

      console.log(`  After 30 days total:`);
      console.log(`    Alice shares: ${ethers.formatUnits(aliceShares, 6)}`);
      console.log(
        `    Alice redeemable: ${ethers.formatUnits(aliceRedeemable, 6)} USDC`
      );
      console.log(`    Bob shares: ${ethers.formatUnits(bobShares, 6)}`);
      console.log(
        `    Bob redeemable: ${ethers.formatUnits(bobRedeemable, 6)} USDC`
      );

      // Alice should have more redeemable value (she was in for full 30 days)
      expect(aliceRedeemable).to.be.gt(
        bobRedeemable,
        "Alice should have more redeemable value"
      );

      // Both should have more than they deposited
      expect(aliceRedeemable).to.be.gt(aliceDeposit, "Alice should have yield");
      expect(bobRedeemable).to.be.gt(
        bobDeposit,
        "Bob should have some yield too"
      );

      // Verify precision is maintained
      const totalAssets = await vault.totalAssets();
      const totalSupply = await vault.totalSupply();

      console.log(
        `    Total assets: ${ethers.formatUnits(totalAssets, 6)} USDC`
      );
      console.log(
        `    Total supply: ${ethers.formatUnits(totalSupply, 6)} shares`
      );

      // Total redeemable should equal total assets
      expect(aliceRedeemable + bobRedeemable).to.be.closeTo(
        totalAssets,
        1, // 1 wei tolerance for rounding
        "Sum of individual redeemable amounts should equal total assets"
      );
    });
  });

  describe("🔄 WITHDRAWAL PRECISION WITH YIELD", function () {
    it("Should maintain precision when withdrawing with accrued yield", async function () {
      console.log("🔍 Testing withdrawal precision with yield...");

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      // Accrue yield for 60 days
      await ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const totalAssetsBefore = await vault.totalAssets();
      const sharesBefore = await vault.balanceOf(alice.address);

      console.log(`  Before withdrawal:`);
      console.log(
        `    Total assets: ${ethers.formatUnits(totalAssetsBefore, 6)} USDC`
      );
      console.log(`    Alice shares: ${ethers.formatUnits(sharesBefore, 6)}`);

      // Withdraw half
      const sharesToWithdraw = sharesBefore / 2n;
      const expectedAssets = await vault.previewRedeem(sharesToWithdraw);

      const balanceBefore = await underlyingToken.balanceOf(alice.address);
      await vault
        .connect(alice)
        .redeem(sharesToWithdraw, alice.address, alice.address);
      const balanceAfter = await underlyingToken.balanceOf(alice.address);

      const actualReceived = balanceAfter - balanceBefore;

      console.log(`  Withdrawal:`);
      console.log(
        `    Shares withdrawn: ${ethers.formatUnits(sharesToWithdraw, 6)}`
      );
      console.log(
        `    Expected assets: ${ethers.formatUnits(expectedAssets, 6)} USDC`
      );
      console.log(
        `    Actual received: ${ethers.formatUnits(actualReceived, 6)} USDC`
      );

      // Should receive expected amount (within 1 wei tolerance for rounding)
      expect(actualReceived).to.be.closeTo(
        expectedAssets,
        1,
        "Should receive expected amount"
      );

      // Should have received more than half of original deposit due to yield
      expect(actualReceived).to.be.gt(
        depositAmount / 2n,
        "Should receive more than half due to yield"
      );

      // Remaining shares should be exactly half
      const remainingShares = await vault.balanceOf(alice.address);
      expect(remainingShares).to.equal(
        sharesToWithdraw,
        "Should have exactly half shares remaining"
      );
    });
  });
});
