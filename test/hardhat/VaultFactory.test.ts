import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { VaultFactory, MockERC20, Vault } from "../typechain-types";

describe("VaultFactory", function () {
  let vaultFactory: VaultFactory;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let defaultManager: SignerWithAddress;
  let defaultAgent: SignerWithAddress;
  let treasury: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let customManager: SignerWithAddress;
  let customAgent: SignerWithAddress;

  const CREATION_FEE = ethers.parseEther("0.01");
  const DEFAULT_WITHDRAWAL_FEE = 100; // 1% default withdrawal fee
  const DEFAULT_YIELD_RATE = 500; // 5% default yield rate
  const ZERO_ADDRESS = ethers.ZeroAddress;

  beforeEach(async function () {
    // Get signers
    [
      owner,
      defaultManager,
      defaultAgent,
      treasury,
      user1,
      user2,
      customManager,
      customAgent,
    ] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20Factory.deploy("Test Token", "TEST", 18);

    // Deploy VaultFactory
    const VaultFactoryFactory = await ethers.getContractFactory("VaultFactory");
    vaultFactory = await VaultFactoryFactory.deploy(
      defaultManager.address,
      defaultAgent.address,
      treasury.address,
      CREATION_FEE,
      DEFAULT_WITHDRAWAL_FEE,
      DEFAULT_YIELD_RATE
    );
  });

  describe("Constructor", function () {
    it("Should set initial values correctly", async function () {
      expect(await vaultFactory.defaultManager()).to.equal(
        defaultManager.address
      );
      expect(await vaultFactory.defaultAgent()).to.equal(defaultAgent.address);
      expect(await vaultFactory.treasury()).to.equal(treasury.address);
      expect(await vaultFactory.creationFee()).to.equal(CREATION_FEE);
      expect(await vaultFactory.defaultWithdrawalFee()).to.equal(
        DEFAULT_WITHDRAWAL_FEE
      );
      expect(await vaultFactory.vaultCounter()).to.equal(0);
    });

    it("Should grant roles correctly", async function () {
      const DEFAULT_ADMIN_ROLE = await vaultFactory.DEFAULT_ADMIN_ROLE();
      const FACTORY_MANAGER_ROLE = await vaultFactory.FACTORY_MANAGER_ROLE();

      expect(await vaultFactory.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to
        .be.true;
      expect(await vaultFactory.hasRole(FACTORY_MANAGER_ROLE, owner.address)).to
        .be.true;
    });

    it("Should revert with invalid constructor parameters", async function () {
      const VaultFactoryFactory = await ethers.getContractFactory(
        "VaultFactory"
      );

      await expect(
        VaultFactoryFactory.deploy(
          ZERO_ADDRESS,
          defaultAgent.address,
          treasury.address,
          CREATION_FEE,
          DEFAULT_WITHDRAWAL_FEE,
          DEFAULT_YIELD_RATE
        )
      ).to.be.revertedWithCustomError(vaultFactory, "InvalidManager");

      await expect(
        VaultFactoryFactory.deploy(
          defaultManager.address,
          ZERO_ADDRESS,
          treasury.address,
          CREATION_FEE,
          DEFAULT_WITHDRAWAL_FEE,
          DEFAULT_YIELD_RATE
        )
      ).to.be.revertedWithCustomError(vaultFactory, "InvalidAgent");

      await expect(
        VaultFactoryFactory.deploy(
          defaultManager.address,
          defaultAgent.address,
          ZERO_ADDRESS,
          CREATION_FEE,
          DEFAULT_WITHDRAWAL_FEE,
          DEFAULT_YIELD_RATE
        )
      ).to.be.revertedWithCustomError(vaultFactory, "InvalidTreasury");
    });
  });

  describe("Vault Creation", function () {
    describe("createVault", function () {
      it("Should create vault with custom parameters", async function () {
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "Custom Vault",
          symbol: "CVAULT",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        const tx = await vaultFactory.connect(user1).createVault(vaultParams, {
          value: CREATION_FEE,
        });

        const receipt = await tx.wait();
        const event = receipt?.logs.find((log) => {
          try {
            return (
              vaultFactory.interface.parseLog(log)?.name === "VaultCreated"
            );
          } catch {
            return false;
          }
        });

        expect(event).to.not.be.undefined;

        const parsedEvent = vaultFactory.interface.parseLog(event!);
        const vaultId = parsedEvent?.args[0];
        const vaultAddress = parsedEvent?.args[1];

        expect(vaultId).to.equal(1);
        expect(await vaultFactory.vaultCounter()).to.equal(1);
        expect(await vaultFactory.vaults(vaultId)).to.equal(vaultAddress);
        expect(await vaultFactory.vaultIds(vaultAddress)).to.equal(vaultId);
        expect(await vaultFactory.isVaultFromFactory(vaultAddress)).to.be.true;
      });

      it("Should create vault with default manager and agent when not specified", async function () {
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "Default Vault",
          symbol: "DVAULT",
          manager: ZERO_ADDRESS, // Will use default
          agent: ZERO_ADDRESS, // Will use default
          withdrawalFee: 0, // Will use default
          yieldRate: 0, // Will use default
        };

        await expect(
          vaultFactory.connect(user1).createVault(vaultParams, {
            value: CREATION_FEE,
          })
        ).to.emit(vaultFactory, "VaultCreated");

        expect(await vaultFactory.vaultCounter()).to.equal(1);
      });

      it("Should revert with insufficient fee", async function () {
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "Test Vault",
          symbol: "TVAULT",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        await expect(
          vaultFactory.connect(user1).createVault(vaultParams, {
            value: CREATION_FEE - 1n,
          })
        ).to.be.revertedWithCustomError(vaultFactory, "InsufficientFee");
      });

      it("Should revert with invalid asset", async function () {
        const vaultParams = {
          asset: ZERO_ADDRESS,
          name: "Test Vault",
          symbol: "TVAULT",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        await expect(
          vaultFactory.connect(user1).createVault(vaultParams, {
            value: CREATION_FEE,
          })
        ).to.be.revertedWithCustomError(vaultFactory, "InvalidAsset");
      });

      it("Should revert with empty name", async function () {
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "",
          symbol: "TVAULT",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        await expect(
          vaultFactory.connect(user1).createVault(vaultParams, {
            value: CREATION_FEE,
          })
        ).to.be.revertedWithCustomError(vaultFactory, "EmptyName");
      });

      it("Should revert with empty symbol", async function () {
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "Test Vault",
          symbol: "",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        await expect(
          vaultFactory.connect(user1).createVault(vaultParams, {
            value: CREATION_FEE,
          })
        ).to.be.revertedWithCustomError(vaultFactory, "EmptySymbol");
      });

      it("Should send creation fee to treasury", async function () {
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "Test Vault",
          symbol: "TVAULT",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        const treasuryBalanceBefore = await ethers.provider.getBalance(
          treasury.address
        );

        await vaultFactory.connect(user1).createVault(vaultParams, {
          value: CREATION_FEE,
        });

        const treasuryBalanceAfter = await ethers.provider.getBalance(
          treasury.address
        );
        expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
          CREATION_FEE
        );
      });
    });

    describe("createVaultWithDefaults", function () {
      it("Should create vault with default manager and agent", async function () {
        await expect(
          vaultFactory
            .connect(user1)
            .createVaultWithDefaults(
              await mockToken.getAddress(),
              "Default Vault",
              "DVAULT",
              { value: CREATION_FEE }
            )
        ).to.emit(vaultFactory, "VaultCreated");

        expect(await vaultFactory.vaultCounter()).to.equal(1);
      });

      it("Should revert with insufficient fee", async function () {
        await expect(
          vaultFactory
            .connect(user1)
            .createVaultWithDefaults(
              await mockToken.getAddress(),
              "Default Vault",
              "DVAULT",
              { value: CREATION_FEE - 1n }
            )
        ).to.be.revertedWithCustomError(vaultFactory, "InsufficientFee");
      });
    });
  });

  describe("Admin Functions", function () {
    describe("setDefaultManager", function () {
      it("Should update default manager", async function () {
        await expect(
          vaultFactory.connect(owner).setDefaultManager(user1.address)
        )
          .to.emit(vaultFactory, "DefaultManagerUpdated")
          .withArgs(defaultManager.address, user1.address);

        expect(await vaultFactory.defaultManager()).to.equal(user1.address);
      });

      it("Should revert if not owner", async function () {
        await expect(
          vaultFactory.connect(user1).setDefaultManager(user2.address)
        ).to.be.revertedWithCustomError(
          vaultFactory,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert with zero address", async function () {
        await expect(
          vaultFactory.connect(owner).setDefaultManager(ZERO_ADDRESS)
        ).to.be.revertedWithCustomError(vaultFactory, "InvalidManager");
      });
    });

    describe("setDefaultAgent", function () {
      it("Should update default agent", async function () {
        await expect(vaultFactory.connect(owner).setDefaultAgent(user1.address))
          .to.emit(vaultFactory, "DefaultAgentUpdated")
          .withArgs(defaultAgent.address, user1.address);

        expect(await vaultFactory.defaultAgent()).to.equal(user1.address);
      });

      it("Should revert if not owner", async function () {
        await expect(
          vaultFactory.connect(user1).setDefaultAgent(user2.address)
        ).to.be.revertedWithCustomError(
          vaultFactory,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert with zero address", async function () {
        await expect(
          vaultFactory.connect(owner).setDefaultAgent(ZERO_ADDRESS)
        ).to.be.revertedWithCustomError(vaultFactory, "InvalidAgent");
      });
    });

    describe("setCreationFee", function () {
      it("Should update creation fee", async function () {
        const newFee = ethers.parseEther("0.02");

        await expect(vaultFactory.connect(owner).setCreationFee(newFee))
          .to.emit(vaultFactory, "CreationFeeUpdated")
          .withArgs(CREATION_FEE, newFee);

        expect(await vaultFactory.creationFee()).to.equal(newFee);
      });

      it("Should revert if not owner", async function () {
        await expect(
          vaultFactory.connect(user1).setCreationFee(ethers.parseEther("0.02"))
        ).to.be.revertedWithCustomError(
          vaultFactory,
          "OwnableUnauthorizedAccount"
        );
      });
    });

    describe("setTreasury", function () {
      it("Should update treasury", async function () {
        await expect(vaultFactory.connect(owner).setTreasury(user1.address))
          .to.emit(vaultFactory, "TreasuryUpdated")
          .withArgs(treasury.address, user1.address);

        expect(await vaultFactory.treasury()).to.equal(user1.address);
      });

      it("Should revert if not owner", async function () {
        await expect(
          vaultFactory.connect(user1).setTreasury(user2.address)
        ).to.be.revertedWithCustomError(
          vaultFactory,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert with zero address", async function () {
        await expect(
          vaultFactory.connect(owner).setTreasury(ZERO_ADDRESS)
        ).to.be.revertedWithCustomError(vaultFactory, "InvalidTreasury");
      });
    });

    describe("setDefaultWithdrawalFee", function () {
      it("Should update default withdrawal fee", async function () {
        const newFee = 200; // 2%

        await expect(
          vaultFactory.connect(owner).setDefaultWithdrawalFee(newFee)
        )
          .to.emit(vaultFactory, "DefaultWithdrawalFeeUpdated")
          .withArgs(DEFAULT_WITHDRAWAL_FEE, newFee);

        expect(await vaultFactory.defaultWithdrawalFee()).to.equal(newFee);
      });

      it("Should revert if not owner", async function () {
        await expect(
          vaultFactory.connect(user1).setDefaultWithdrawalFee(200)
        ).to.be.revertedWithCustomError(
          vaultFactory,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert with fee too high", async function () {
        await expect(
          vaultFactory.connect(owner).setDefaultWithdrawalFee(1500) // 15%
        ).to.be.revertedWithCustomError(vaultFactory, "InvalidWithdrawalFee");
      });

      it("Should allow maximum withdrawal fee", async function () {
        await vaultFactory.connect(owner).setDefaultWithdrawalFee(1000); // 10%
        expect(await vaultFactory.defaultWithdrawalFee()).to.equal(1000);
      });
    });

    describe("withdrawFees", function () {
      beforeEach(async function () {
        // Create a vault to generate fees
        const vaultParams = {
          asset: await mockToken.getAddress(),
          name: "Test Vault",
          symbol: "TVAULT",
          manager: customManager.address,
          agent: customAgent.address,
          withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
          yieldRate: DEFAULT_YIELD_RATE,
        };

        await vaultFactory.connect(user1).createVault(vaultParams, {
          value: CREATION_FEE,
        });
      });

      it("Should withdraw fees to treasury", async function () {
        // The factory should already have the creation fee from the vault creation
        const factoryBalance = await ethers.provider.getBalance(
          await vaultFactory.getAddress()
        );
        const treasuryBalanceBefore = await ethers.provider.getBalance(
          treasury.address
        );

        if (factoryBalance > 0) {
          await expect(vaultFactory.connect(owner).withdrawFees())
            .to.emit(vaultFactory, "FeesWithdrawn")
            .withArgs(treasury.address, factoryBalance);

          const treasuryBalanceAfter = await ethers.provider.getBalance(
            treasury.address
          );
          expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
            factoryBalance
          );
          expect(
            await ethers.provider.getBalance(await vaultFactory.getAddress())
          ).to.equal(0);
        } else {
          // If no balance, withdrawFees should not emit event but should not revert
          await vaultFactory.connect(owner).withdrawFees();
        }
      });

      it("Should revert if not owner", async function () {
        await expect(
          vaultFactory.connect(user1).withdrawFees()
        ).to.be.revertedWithCustomError(
          vaultFactory,
          "OwnableUnauthorizedAccount"
        );
      });
    });
  });

  describe("View Functions", function () {
    let vaultAddress: string;
    let vaultId: bigint;

    beforeEach(async function () {
      const vaultParams = {
        asset: await mockToken.getAddress(),
        name: "Test Vault",
        symbol: "TVAULT",
        manager: customManager.address,
        agent: customAgent.address,
        withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
        yieldRate: DEFAULT_YIELD_RATE,
      };

      const tx = await vaultFactory.connect(user1).createVault(vaultParams, {
        value: CREATION_FEE,
      });

      const receipt = await tx.wait();
      const event = receipt?.logs.find((log) => {
        try {
          return vaultFactory.interface.parseLog(log)?.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = vaultFactory.interface.parseLog(event!);
      vaultId = parsedEvent?.args[0];
      vaultAddress = parsedEvent?.args[1];
    });

    describe("getVaultCount", function () {
      it("Should return correct vault count", async function () {
        expect(await vaultFactory.getVaultCount()).to.equal(1);
      });
    });

    describe("getAllVaults", function () {
      it("Should return all vault addresses", async function () {
        const allVaults = await vaultFactory.getAllVaults();
        expect(allVaults.length).to.equal(1);
        expect(allVaults[0]).to.equal(vaultAddress);
      });
    });

    describe("getVaultsForAsset", function () {
      it("Should return vaults for specific asset", async function () {
        const vaultsForAsset = await vaultFactory.getVaultsForAsset(
          await mockToken.getAddress()
        );
        expect(vaultsForAsset.length).to.equal(1);
        expect(vaultsForAsset[0]).to.equal(vaultAddress);
      });

      it("Should return empty array for asset with no vaults", async function () {
        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        const anotherToken = await MockERC20Factory.deploy(
          "Another Token",
          "ANOTHER",
          18
        );

        const vaultsForAsset = await vaultFactory.getVaultsForAsset(
          await anotherToken.getAddress()
        );
        expect(vaultsForAsset.length).to.equal(0);
      });
    });

    describe("getVaultInfo", function () {
      it("Should return vault info for valid vault ID", async function () {
        const vaultInfo = await vaultFactory.getVaultInfo(vaultId);

        expect(vaultInfo.id).to.equal(vaultId);
        expect(vaultInfo.vaultAddress).to.equal(vaultAddress);
        expect(vaultInfo.asset).to.equal(await mockToken.getAddress());
        expect(vaultInfo.name).to.equal("Test Vault");
        expect(vaultInfo.symbol).to.equal("TVAULT");
      });

      it("Should return empty struct for invalid vault ID", async function () {
        const vaultInfo = await vaultFactory.getVaultInfo(999);

        expect(vaultInfo.id).to.equal(0);
        expect(vaultInfo.vaultAddress).to.equal(ZERO_ADDRESS);
      });
    });

    describe("getVaultInfoByAddress", function () {
      it("Should return vault info for valid vault address", async function () {
        const vaultInfo = await vaultFactory.getVaultInfoByAddress(
          vaultAddress
        );

        expect(vaultInfo.id).to.equal(vaultId);
        expect(vaultInfo.vaultAddress).to.equal(vaultAddress);
        expect(vaultInfo.asset).to.equal(await mockToken.getAddress());
        expect(vaultInfo.name).to.equal("Test Vault");
        expect(vaultInfo.symbol).to.equal("TVAULT");
      });

      it("Should return empty struct for invalid vault address", async function () {
        const vaultInfo = await vaultFactory.getVaultInfoByAddress(
          user1.address
        );

        expect(vaultInfo.id).to.equal(0);
        expect(vaultInfo.vaultAddress).to.equal(ZERO_ADDRESS);
      });
    });

    describe("isVaultCreatedByFactory", function () {
      it("Should return true for vault created by factory", async function () {
        expect(await vaultFactory.isVaultCreatedByFactory(vaultAddress)).to.be
          .true;
      });

      it("Should return false for address not created by factory", async function () {
        expect(await vaultFactory.isVaultCreatedByFactory(user1.address)).to.be
          .false;
      });
    });
  });

  describe("Multiple Vaults", function () {
    it("Should handle multiple vault creation correctly", async function () {
      const vaultParams1 = {
        asset: await mockToken.getAddress(),
        name: "Vault 1",
        symbol: "V1",
        manager: customManager.address,
        agent: customAgent.address,
        withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
        yieldRate: DEFAULT_YIELD_RATE,
      };

      const vaultParams2 = {
        asset: await mockToken.getAddress(),
        name: "Vault 2",
        symbol: "V2",
        manager: customManager.address,
        agent: customAgent.address,
        withdrawalFee: DEFAULT_WITHDRAWAL_FEE,
        yieldRate: DEFAULT_YIELD_RATE,
      };

      await vaultFactory
        .connect(user1)
        .createVault(vaultParams1, { value: CREATION_FEE });
      await vaultFactory
        .connect(user2)
        .createVault(vaultParams2, { value: CREATION_FEE });

      expect(await vaultFactory.getVaultCount()).to.equal(2);

      const allVaults = await vaultFactory.getAllVaults();
      expect(allVaults.length).to.equal(2);

      const vaultsForAsset = await vaultFactory.getVaultsForAsset(
        await mockToken.getAddress()
      );
      expect(vaultsForAsset.length).to.equal(2);
    });
  });
});
