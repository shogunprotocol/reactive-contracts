import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Vault, MockUSDC } from "../typechain-types";

describe("🔢 DECIMALS AND PRECISION TESTS", function () {
  let vault: Vault;
  let underlyingToken: MockUSDC;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let agent: SignerWithAddress;
  let treasury: SignerWithAddress;
  let user: SignerWithAddress;

  const INITIAL_BALANCE = ethers.parseUnits("10000", 6); // 10,000 USDC

  beforeEach(async function () {
    [owner, manager, agent, treasury, user] = await ethers.getSigners();

    // Deploy USDC with 6 decimals
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    underlyingToken = await MockUSDCFactory.deploy();

    // Deploy vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      await underlyingToken.getAddress(),
      "USDC Vault",
      "vUSDC",
      manager.address,
      agent.address,
      0, // 0% withdrawal fee for cleaner tests
      0, // 0% yield rate for cleaner tests
      treasury.address
    );

    // Setup user with tokens
    await underlyingToken.transfer(user.address, INITIAL_BALANCE);
    await underlyingToken
      .connect(user)
      .approve(await vault.getAddress(), ethers.MaxUint256);
  });

  describe("📊 DECIMAL VERIFICATION", function () {
    it("Should have correct decimals configuration", async function () {
      console.log("🔍 Checking decimal configuration...");

      const usdcDecimals = await underlyingToken.decimals();
      const vaultDecimals = await vault.decimals();

      console.log(`  USDC decimals: ${usdcDecimals}`);
      console.log(`  Vault decimals: ${vaultDecimals}`);

      expect(usdcDecimals).to.equal(6, "USDC should have 6 decimals");
      expect(vaultDecimals).to.equal(
        6,
        "Vault shares should have same decimals as underlying asset"
      );
    });

    it("Should maintain 1:1 ratio for initial deposits (no yield)", async function () {
      console.log("🔍 Testing 1:1 ratio for deposits...");

      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      console.log(`  Depositing: ${ethers.formatUnits(depositAmount, 6)} USDC`);

      await vault.connect(user).deposit(depositAmount, user.address);

      const userShares = await vault.balanceOf(user.address);
      const totalAssets = await vault.totalAssets();
      const totalSupply = await vault.totalSupply();

      console.log(
        `  User shares received: ${ethers.formatUnits(userShares, 6)}`
      );
      console.log(`  Total assets: ${ethers.formatUnits(totalAssets, 6)} USDC`);
      console.log(
        `  Total supply: ${ethers.formatUnits(totalSupply, 6)} shares`
      );

      // Should be 1:1 ratio
      expect(userShares).to.equal(
        depositAmount,
        "Shares should equal deposited assets"
      );
      expect(totalAssets).to.equal(
        depositAmount,
        "Total assets should equal deposited amount"
      );
      expect(totalSupply).to.equal(
        depositAmount,
        "Total supply should equal deposited amount"
      );
    });

    it("Should handle small amounts correctly (dust test)", async function () {
      console.log("🔍 Testing dust amounts...");

      const dustAmount = 1; // 1 wei (0.000001 USDC)

      console.log(
        `  Depositing: ${dustAmount} wei (${ethers.formatUnits(
          dustAmount,
          6
        )} USDC)`
      );

      await vault.connect(user).deposit(dustAmount, user.address);

      const userShares = await vault.balanceOf(user.address);
      const totalAssets = await vault.totalAssets();

      console.log(`  User shares: ${userShares} wei`);
      console.log(`  Total assets: ${totalAssets} wei`);

      expect(userShares).to.equal(
        dustAmount,
        "Even dust amounts should maintain 1:1 ratio"
      );
      expect(totalAssets).to.equal(
        dustAmount,
        "Total assets should match dust deposit"
      );
    });

    it("Should handle maximum precision correctly", async function () {
      console.log("🔍 Testing maximum precision...");

      // Test with 1 wei less than 1 USDC
      const maxPrecisionAmount = ethers.parseUnits("1", 6) - 1n; // 999999 wei

      console.log(
        `  Depositing: ${maxPrecisionAmount} wei (${ethers.formatUnits(
          maxPrecisionAmount,
          6
        )} USDC)`
      );

      await vault.connect(user).deposit(maxPrecisionAmount, user.address);

      const userShares = await vault.balanceOf(user.address);

      console.log(
        `  User shares: ${userShares} wei (${ethers.formatUnits(
          userShares,
          6
        )} shares)`
      );

      expect(userShares).to.equal(
        maxPrecisionAmount,
        "Maximum precision should be preserved"
      );
    });
  });

  describe("💰 EXCHANGE RATE VERIFICATION", function () {
    it("Should maintain correct exchange rate with multiple users", async function () {
      console.log("🔍 Testing exchange rates with multiple users...");

      const [user1, user2] = await ethers.getSigners();

      // Setup users
      await underlyingToken.transfer(
        user1.address,
        ethers.parseUnits("2000", 6)
      );
      await underlyingToken.transfer(
        user2.address,
        ethers.parseUnits("3000", 6)
      );
      await underlyingToken
        .connect(user1)
        .approve(await vault.getAddress(), ethers.MaxUint256);
      await underlyingToken
        .connect(user2)
        .approve(await vault.getAddress(), ethers.MaxUint256);

      // User1 deposits 1000 USDC
      const deposit1 = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(deposit1, user1.address);

      const shares1 = await vault.balanceOf(user1.address);
      console.log(`  User1 deposited: ${ethers.formatUnits(deposit1, 6)} USDC`);
      console.log(`  User1 received: ${ethers.formatUnits(shares1, 6)} shares`);

      // User2 deposits 2000 USDC
      const deposit2 = ethers.parseUnits("2000", 6);
      await vault.connect(user2).deposit(deposit2, user2.address);

      const shares2 = await vault.balanceOf(user2.address);
      console.log(`  User2 deposited: ${ethers.formatUnits(deposit2, 6)} USDC`);
      console.log(`  User2 received: ${ethers.formatUnits(shares2, 6)} shares`);

      // Verify ratios
      expect(shares1).to.equal(deposit1, "User1 should have 1:1 ratio");
      expect(shares2).to.equal(deposit2, "User2 should have 1:1 ratio");

      // User2 should have exactly 2x User1's shares
      expect(shares2).to.equal(
        shares1 * 2n,
        "User2 should have 2x User1's shares"
      );

      const totalAssets = await vault.totalAssets();
      const totalSupply = await vault.totalSupply();

      console.log(`  Total assets: ${ethers.formatUnits(totalAssets, 6)} USDC`);
      console.log(
        `  Total supply: ${ethers.formatUnits(totalSupply, 6)} shares`
      );

      expect(totalAssets).to.equal(
        deposit1 + deposit2,
        "Total assets should equal sum of deposits"
      );
      expect(totalSupply).to.equal(
        deposit1 + deposit2,
        "Total supply should equal sum of deposits"
      );
    });

    it("Should handle withdrawal precision correctly", async function () {
      console.log("🔍 Testing withdrawal precision...");

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user).deposit(depositAmount, user.address);

      const userShares = await vault.balanceOf(user.address);
      console.log(`  Initial shares: ${ethers.formatUnits(userShares, 6)}`);

      // Withdraw half
      const withdrawShares = userShares / 2n;
      const balanceBefore = await underlyingToken.balanceOf(user.address);

      console.log(
        `  Withdrawing: ${ethers.formatUnits(withdrawShares, 6)} shares`
      );

      const assetsReceived = await vault
        .connect(user)
        .redeem.staticCall(withdrawShares, user.address, user.address);
      await vault
        .connect(user)
        .redeem(withdrawShares, user.address, user.address);

      const balanceAfter = await underlyingToken.balanceOf(user.address);
      const actualReceived = balanceAfter - balanceBefore;

      console.log(
        `  Assets received: ${ethers.formatUnits(actualReceived, 6)} USDC`
      );
      console.log(`  Expected: ${ethers.formatUnits(assetsReceived, 6)} USDC`);

      // Should receive exactly half of original deposit (no fees, no yield)
      const expectedReceived = depositAmount / 2n;
      expect(actualReceived).to.equal(
        expectedReceived,
        "Should receive exactly half of deposit"
      );

      // Remaining shares should be exactly half
      const remainingShares = await vault.balanceOf(user.address);
      expect(remainingShares).to.equal(
        withdrawShares,
        "Should have exactly half shares remaining"
      );
    });
  });

  describe("🧮 PRECISION EDGE CASES", function () {
    it("Should handle rounding in share calculations", async function () {
      console.log("🔍 Testing rounding edge cases...");

      // Deposit odd amount
      const oddAmount = ethers.parseUnits("1000", 6) + 1n; // 1000.000001 USDC
      await vault.connect(user).deposit(oddAmount, user.address);

      const shares = await vault.balanceOf(user.address);
      console.log(`  Deposited: ${oddAmount} wei`);
      console.log(`  Shares received: ${shares} wei`);

      expect(shares).to.equal(oddAmount, "Should preserve exact precision");

      // Try to redeem exactly half (should handle odd division)
      const halfShares = shares / 2n; // This will truncate
      const assetsReceived = await vault
        .connect(user)
        .redeem.staticCall(halfShares, user.address, user.address);

      console.log(`  Redeeming: ${halfShares} shares`);
      console.log(`  Will receive: ${assetsReceived} wei`);

      // Should be exactly half (truncated)
      expect(assetsReceived).to.equal(
        oddAmount / 2n,
        "Should handle truncation correctly"
      );
    });

    it("Should prevent precision loss attacks", async function () {
      console.log("🔍 Testing precision loss attack prevention...");

      // Attacker deposits 1 wei
      await vault.connect(user).deposit(1, user.address);

      // Attacker tries to donate large amount to inflate share price
      const donationAmount = ethers.parseUnits("1000", 6);
      await underlyingToken
        .connect(user)
        .transfer(await vault.getAddress(), donationAmount);

      // New user deposits
      const [newUser] = await ethers.getSigners();
      await underlyingToken.transfer(
        newUser.address,
        ethers.parseUnits("1000", 6)
      );
      await underlyingToken
        .connect(newUser)
        .approve(await vault.getAddress(), ethers.MaxUint256);

      const newUserDeposit = ethers.parseUnits("1000", 6);
      const sharesBefore = await vault.previewDeposit(newUserDeposit);

      await vault.connect(newUser).deposit(newUserDeposit, newUser.address);
      const actualShares = await vault.balanceOf(newUser.address);

      console.log(
        `  New user deposit: ${ethers.formatUnits(newUserDeposit, 6)} USDC`
      );
      console.log(`  Expected shares: ${ethers.formatUnits(sharesBefore, 6)}`);
      console.log(`  Actual shares: ${ethers.formatUnits(actualShares, 6)}`);

      // Should still get reasonable shares (ERC4626 handles this)
      expect(actualShares).to.be.gt(0, "Should receive some shares");
      expect(actualShares).to.be.closeTo(
        sharesBefore,
        ethers.parseUnits("1", 6),
        "Should be close to expected"
      );
    });
  });
});
