import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MockProtocol, MockToken } from "../typechain-types";

describe("MockProtocol", function () {
  let protocol: MockProtocol;
  let underlyingToken: MockToken;
  let rewardToken: MockToken;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const INITIAL_BALANCE = ethers.parseEther("1000");
  const PROTOCOL_REWARD_BALANCE = ethers.parseEther("100000");

  beforeEach(async function () {
    // Get signers
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy tokens
    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    underlyingToken = await MockTokenFactory.deploy("Underlying Token", "UNDER");
    rewardToken = await MockTokenFactory.deploy("Reward Token", "REWARD");

    // Deploy protocol
    const MockProtocolFactory = await ethers.getContractFactory("MockProtocol");
    protocol = await MockProtocolFactory.deploy(
      await underlyingToken.getAddress(),
      await rewardToken.getAddress()
    );

    // Setup test accounts
    await underlyingToken.transfer(alice.address, INITIAL_BALANCE);
    await underlyingToken.transfer(bob.address, INITIAL_BALANCE);

    // Fund protocol with reward tokens
    await rewardToken.transfer(await protocol.getAddress(), PROTOCOL_REWARD_BALANCE);
  });

  describe("Constructor", function () {
    it("Should set the correct underlying token", async function () {
      expect(await protocol.underlyingToken()).to.equal(await underlyingToken.getAddress());
    });

    it("Should set the correct reward token", async function () {
      expect(await protocol.rewardToken()).to.equal(await rewardToken.getAddress());
    });
  });

  describe("Deposit", function () {
    it("Should deposit tokens successfully", async function () {
      const depositAmount = ethers.parseEther("100");

      // Approve and deposit
      await underlyingToken.connect(alice).approve(await protocol.getAddress(), depositAmount);
      
      // Check event emission
      await expect(protocol.connect(alice).deposit(depositAmount))
        .to.emit(protocol, "Deposited")
        .withArgs(alice.address, depositAmount);

      // Verify balances
      expect(await protocol.deposits(alice.address)).to.equal(depositAmount);
      expect(await protocol.rewards(alice.address)).to.equal(depositAmount / 10n); // 10% rewards
      expect(await underlyingToken.balanceOf(alice.address)).to.equal(INITIAL_BALANCE - depositAmount);
      expect(await underlyingToken.balanceOf(await protocol.getAddress())).to.equal(depositAmount);
    });

    it("Should handle multiple deposits", async function () {
      const firstDeposit = ethers.parseEther("100");
      const secondDeposit = ethers.parseEther("50");
      const totalDeposit = firstDeposit + secondDeposit;

      await underlyingToken.connect(alice).approve(await protocol.getAddress(), totalDeposit);
      
      await protocol.connect(alice).deposit(firstDeposit);
      await protocol.connect(alice).deposit(secondDeposit);

      expect(await protocol.deposits(alice.address)).to.equal(totalDeposit);
      expect(await protocol.rewards(alice.address)).to.equal(totalDeposit / 10n);
    });

    it("Should revert with zero amount", async function () {
      await expect(protocol.connect(alice).deposit(0))
        .to.be.revertedWithCustomError(protocol, "ZeroAmount");
    });

    it("Should revert without approval", async function () {
      const depositAmount = ethers.parseEther("100");
      await expect(protocol.connect(alice).deposit(depositAmount))
        .to.be.reverted;
    });
  });

  describe("Withdraw", function () {
    const depositAmount = ethers.parseEther("100");

    beforeEach(async function () {
      await underlyingToken.connect(alice).approve(await protocol.getAddress(), depositAmount);
      await protocol.connect(alice).deposit(depositAmount);
    });

    it("Should withdraw tokens successfully", async function () {
      const withdrawAmount = ethers.parseEther("50");

      await expect(protocol.connect(alice).withdraw(withdrawAmount))
        .to.emit(protocol, "Withdrawn")
        .withArgs(alice.address, withdrawAmount);

      expect(await protocol.deposits(alice.address)).to.equal(depositAmount - withdrawAmount);
      expect(await underlyingToken.balanceOf(alice.address)).to.equal(
        INITIAL_BALANCE - depositAmount + withdrawAmount
      );
    });

    it("Should allow full withdrawal", async function () {
      await protocol.connect(alice).withdraw(depositAmount);

      expect(await protocol.deposits(alice.address)).to.equal(0);
      expect(await underlyingToken.balanceOf(alice.address)).to.equal(INITIAL_BALANCE);
    });

    it("Should revert with insufficient balance", async function () {
      await expect(protocol.connect(alice).withdraw(depositAmount + 1n))
        .to.be.revertedWithCustomError(protocol, "InsufficientBalance");
    });

    it("Should revert with zero amount", async function () {
      await expect(protocol.connect(alice).withdraw(0))
        .to.be.revertedWithCustomError(protocol, "ZeroAmount");
    });
  });

  describe("Claim Rewards", function () {
    it("Should claim rewards successfully", async function () {
      const depositAmount = ethers.parseEther("100");
      const expectedRewards = depositAmount / 10n;

      // Deposit to generate rewards
      await underlyingToken.connect(alice).approve(await protocol.getAddress(), depositAmount);
      await protocol.connect(alice).deposit(depositAmount);

      // Claim rewards
      await expect(protocol.connect(alice).claimRewards())
        .to.emit(protocol, "RewardsClaimed")
        .withArgs(alice.address, expectedRewards);

      // Verify balances
      expect(await protocol.rewards(alice.address)).to.equal(0);
      expect(await rewardToken.balanceOf(alice.address)).to.equal(expectedRewards);
    });

    it("Should revert with zero rewards", async function () {
      await expect(protocol.connect(alice).claimRewards())
        .to.be.revertedWithCustomError(protocol, "ZeroAmount");
    });

    it("Should handle multiple claims", async function () {
      const depositAmount = ethers.parseEther("100");
      const rewardsPerDeposit = depositAmount / 10n;

      await underlyingToken.connect(alice).approve(await protocol.getAddress(), depositAmount * 2n);

      // First deposit and claim
      await protocol.connect(alice).deposit(depositAmount);
      await protocol.connect(alice).claimRewards();

      // Second deposit and claim
      await protocol.connect(alice).deposit(depositAmount);
      await protocol.connect(alice).claimRewards();

      expect(await rewardToken.balanceOf(alice.address)).to.equal(rewardsPerDeposit * 2n);
    });
  });

  describe("View Functions", function () {
    it("Should return correct balance", async function () {
      const depositAmount = ethers.parseEther("100");

      await underlyingToken.connect(alice).approve(await protocol.getAddress(), depositAmount);
      await protocol.connect(alice).deposit(depositAmount);

      expect(await protocol.getBalance(alice.address)).to.equal(depositAmount);
      expect(await protocol.getBalance(bob.address)).to.equal(0);
    });

    it("Should return reward token address", async function () {
      expect(await protocol.getRewardToken()).to.equal(await rewardToken.getAddress());
    });
  });

  describe("Integration Tests", function () {
    it("Should handle multiple users correctly", async function () {
      const aliceDeposit = ethers.parseEther("100");
      const bobDeposit = ethers.parseEther("200");

      // Alice deposits
      await underlyingToken.connect(alice).approve(await protocol.getAddress(), aliceDeposit);
      await protocol.connect(alice).deposit(aliceDeposit);

      // Bob deposits
      await underlyingToken.connect(bob).approve(await protocol.getAddress(), bobDeposit);
      await protocol.connect(bob).deposit(bobDeposit);

      // Verify individual balances
      expect(await protocol.deposits(alice.address)).to.equal(aliceDeposit);
      expect(await protocol.deposits(bob.address)).to.equal(bobDeposit);
      expect(await protocol.rewards(alice.address)).to.equal(aliceDeposit / 10n);
      expect(await protocol.rewards(bob.address)).to.equal(bobDeposit / 10n);

      // Alice withdraws half
      await protocol.connect(alice).withdraw(aliceDeposit / 2n);

      // Bob claims rewards
      await protocol.connect(bob).claimRewards();

      // Final verification
      expect(await protocol.deposits(alice.address)).to.equal(aliceDeposit / 2n);
      expect(await protocol.deposits(bob.address)).to.equal(bobDeposit);
      expect(await protocol.rewards(bob.address)).to.equal(0);
      expect(await rewardToken.balanceOf(bob.address)).to.equal(bobDeposit / 10n);
    });

    it("Should handle complex flow", async function () {
      const amount = ethers.parseEther("100");

      // Alice: deposit -> partial withdraw -> claim -> deposit again
      await underlyingToken.connect(alice).approve(await protocol.getAddress(), amount * 2n);
      
      await protocol.connect(alice).deposit(amount);
      await protocol.connect(alice).withdraw(amount / 2n);
      await protocol.connect(alice).claimRewards();
      await protocol.connect(alice).deposit(amount / 2n);

      expect(await protocol.deposits(alice.address)).to.equal(amount);
      expect(await protocol.rewards(alice.address)).to.equal(amount / 20n); // 5% from second deposit
      expect(await rewardToken.balanceOf(alice.address)).to.equal(amount / 10n); // 10% from first deposit
    });
  });
}); 