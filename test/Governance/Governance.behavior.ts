/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { stakingConfigFixture } from "../shared/fixtures";
import { MaxUint256 } from "@ethersproject/constants";
import { ethers, waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC20 } from "../../typechain/TestERC20";
import { mineNBlocks, TX_TYPE, expectEventForAll } from "../common.setup";

const createFixtureLoader = waffle.createFixtureLoader;

export async function shouldBehaveLikeGovernance(): Promise<void> {
  let staking: RPMStaking;
  let rpm: TestERC20;
  let WETH: TestERC20;
  const HUNDRED = parseUnits("100", "18");
  const TEN = parseUnits("10", "18");
  const ONE = parseUnits("1", "18");
  let SECONDARY_TOKEN: TestERC20;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  let loadFixture: ReturnType<typeof createFixtureLoader>;

  const [wallet, alice, bob, carol, newWallet] = waffle.provider.getWallets();

  before("fixtures deployer", async () => {
    loadFixture = createFixtureLoader([wallet]);
    const secondaryReward = await ethers.getContractFactory("TestERC20");
    SECONDARY_TOKEN = (await secondaryReward.deploy(1)) as TestERC20;
  });

  beforeEach("fixtures", async () => {
    const res = await loadFixture(stakingConfigFixture);
    staking = res.staking;
    rpm = res.rpm;
    WETH = res.WETH;

    await rpm.mint(wallet.address, parseUnits("2000000", "18"));
    await WETH.mint(wallet.address, parseUnits("2000000", "18"));
    await SECONDARY_TOKEN.mint(wallet.address, parseUnits("2000000", "18"));

    await WETH.transfer(staking.address, HUNDRED);
    await staking.updateRewards(HUNDRED, 100);

    await rpm.connect(wallet).approve(staking.address, MaxUint256);
    await WETH.connect(wallet).approve(staking.address, MaxUint256);
    await SECONDARY_TOKEN.connect(wallet).approve(staking.address, MaxUint256);

    await rpm.connect(alice).mint(alice.address, parseUnits("2000000", "18"));
    await rpm.connect(bob).mint(bob.address, parseUnits("2000000", "18"));
    await rpm.connect(carol).mint(carol.address, parseUnits("2000000", "18"));

    await rpm.connect(alice).approve(staking.address, MaxUint256);
    await rpm.connect(bob).approve(staking.address, MaxUint256);
    await rpm.connect(carol).approve(staking.address, MaxUint256);
  });

  describe("#RewardAndGovernance", () => {
    xit("should return 1 eth", async () => {
      const result = await staking.totalRPMStaked();
      expect(result).to.equal(ONE);
    });

    it("should let the governanec to change", async () => {
      // console.log("new", newWallet.address);
      const newGovernance = staking.setGovernance(newWallet.address);
      await expect(newGovernance).to.not.reverted;
      const resolvedNewGovernance = await newGovernance;

      await expect(resolvedNewGovernance)
        .to.emit(staking, "GovernanceChanged")
        .withArgs(wallet.address, newWallet.address);

      await staking.connect(newWallet).setGovernance(wallet.address);
    });

    it("should not let the governance to change on zero address and non-governance call", async () => {
      await expect(staking.connect(newWallet).setGovernance(newWallet.address)).to.be.revertedWith(
        "CallerNotGovernance",
      );

      await expect(staking.setGovernance(ZERO_ADDRESS)).to.be.revertedWith("ZeroAddress");
    });

    it("sohuld let stakes from users and update reward token with 0 reward to claim", async () => {
      const aliceStake = await staking.stake(alice.address, TEN);
      const bobStake = await staking.stake(bob.address, TEN);

      //rewardPeriod ended here
      await staking.updateRewardEndBlock(0);
      const tokenUpdate = await staking.updateRewardToken(SECONDARY_TOKEN.address);
      await staking.updateRewards(HUNDRED, 100);

      await mineNBlocks(8); //mining only 8 blocks bcz 2 blocks were mined during the above tx
      await ethers.provider.send("evm_setAutomine", [false]);
      const aliceClaim = await staking.connect(alice).claim();
      const bobClaim = await staking.connect(bob).claim();
      await ethers.provider.send("evm_setAutomine", [true]);
      /**
       * acc = 0.5
       * reward/block = 1
       * blocks passed = 11
       */
      expect(tokenUpdate).to.emit(staking, "RewardTokenChanged").withArgs(WETH.address, SECONDARY_TOKEN.address);

      expectEventForAll(staking, aliceClaim, alice, TEN, "5500000000000000000", TX_TYPE.CLAIM);

      expectEventForAll(staking, bobClaim, bob, TEN, "5500000000000000000", TX_TYPE.CLAIM);
    });

    it("should end the period of staking", async () => {
      await staking.updateRewardEndBlock(0);
      await expect(staking.stake(alice.address, ONE)).to.be.revertedWith("RewardDistributionPeriodHasExpired");
    });

    it("should halt the staking and let to resume again", async () => {
      await staking.updateRewardEndBlock(0);
      await expect(staking.stake(alice.address, ONE)).to.be.revertedWith("RewardDistributionPeriodHasExpired");
      await staking.updateRewardEndBlock(100);

      const aliceStake = await staking.stake(alice.address, ONE);
      await expectEventForAll(staking, aliceStake, alice, ONE, 0, TX_TYPE.STAKE);
    });

    it("should let to stake after reward token update", async () => {
      await SECONDARY_TOKEN.transfer(staking.address, HUNDRED);
      await staking.updateRewardEndBlock(0);
      await staking.updateRewardToken(SECONDARY_TOKEN.address);
      await staking.updateRewards(HUNDRED, 100);
      await mineNBlocks(8); //mining only 8 blocks bcz 2 blocks were mined during the above tx
      const aliceStake = await staking.stake(alice.address, ONE);
      await expectEventForAll(staking, aliceStake, alice, ONE, 0, TX_TYPE.STAKE);
    });

    it("should run out of funds then extendPeriod will handle this", async () => {
      // console.log("reward/block:", await staking.currentRewardPerBlock());
      let periodEnd = await staking.periodEndBlock();
      // console.log("periodEnd:", periodEnd);
      await mineNBlocks(50);

      //50 blocks gone unrewarded
      await staking.stake(alice.address, TEN);

      const currentBlock = await staking.lastUpdateBlock();
      // console.log("stake b#", currentBlock);
      const remainingBlocks: number = +periodEnd.sub(currentBlock); //109 - 69 = 40 block remains for distribution

      //period has been ended here
      await mineNBlocks(remainingBlocks);
      await staking.connect(alice).claim();

      //can't stake after reward period has ended
      await expect(staking.stake(alice.address, ONE)).to.be.revertedWith("RewardDistributionPeriodHasExpired");

      //extending undistributed period
      await staking.updateRewardEndBlock(100 - remainingBlocks);
      periodEnd = await staking.periodEndBlock();
      // console.log("current b#", await ethers.provider.getBlockNumber());
      // console.log("new periodEnd:", periodEnd);
      await mineNBlocks(100 - remainingBlocks);
      // console.log("jumped to b#", await ethers.provider.getBlockNumber());
      // console.log("alice pending:", await staking.calculatePendingRewards(alice.address));
      await staking.connect(alice).claim();
    });

    it("should increment the 'totalRewardAllocated' on 'updateRewards' and reset on 'updateRewardToken'", async () => {
      const totalRewardAllocatedBefore = await staking.totalRewardAllocated();

      expect(totalRewardAllocatedBefore).to.equal(HUNDRED);

      await staking.updateRewards(HUNDRED, 100);
      let totalRewardAllocatedAfter = await staking.totalRewardAllocated();

      expect(totalRewardAllocatedAfter).to.equal(totalRewardAllocatedBefore.add(HUNDRED));

      await staking.updateRewardToken(SECONDARY_TOKEN.address);
      totalRewardAllocatedAfter = await staking.totalRewardAllocated();

      expect(totalRewardAllocatedAfter).to.equal(0);
    });

    it("should increment 'userClaimedReward' on 'claim' and reset after 'updateRewardToken'", async () => {
      const HundredWETH = parseUnits("100", "18");

      await staking.connect(alice).stake(alice.address, HundredWETH);
      await mineNBlocks(30);

      const claimedRewardBefore = await staking.userClaimedReward(alice.address);
      // unstake also claims pending rewards.
      await staking.connect(alice).unstake(HundredWETH);
      const claimedRewardAfter = await staking.userClaimedReward(alice.address);

      expect(claimedRewardAfter).to.be.gt(claimedRewardBefore);

      await SECONDARY_TOKEN.transfer(staking.address, HUNDRED);
      await staking.updateRewardToken(SECONDARY_TOKEN.address);
      await staking.updateRewards(HUNDRED, 100);

      await staking.stake(alice.address, ONE);

      const claimedRewardAfterRewardTokenChange = await staking.userClaimedReward(alice.address);

      expect(claimedRewardAfterRewardTokenChange).to.equal(0);
    });
  });
}
