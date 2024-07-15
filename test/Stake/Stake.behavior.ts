import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { stakingConfigFixture } from "../shared/fixtures";
import { MaxUint256 } from "@ethersproject/constants";
import { ethers, waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC20 } from "../../typechain/TestERC20";
import { mineNBlocks, TX_TYPE, expectEventForAll } from "../common.setup";

const createFixtureLoader = waffle.createFixtureLoader;

export async function shouldBehaveLikeStake(): Promise<void> {
  let staking: RPMStaking;
  let rpm: TestERC20;
  let WETH: TestERC20;
  let testToken: TestERC20;
  const HUNDRED = parseUnits("100", "18");

  const [wallet, alice, bob, carol] = waffle.provider.getWallets();

  let loadFixture: ReturnType<typeof createFixtureLoader>;

  before("fixtures deployer", async () => {
    loadFixture = createFixtureLoader([wallet]);
  });

  beforeEach("fixtures", async () => {
    const res = await loadFixture(stakingConfigFixture);
    staking = res.staking;
    rpm = res.rpm;
    WETH = res.WETH;
    testToken = res.testToken;

    const HundredWETH = parseUnits("100", "18");

    await rpm.connect(wallet).mint(wallet.address, parseUnits("2000000", "18"));
    await WETH.connect(wallet).mint(wallet.address, parseUnits("2000000", "18"));

    await WETH.transfer(staking.address, HundredWETH);
    await staking.updateRewards(HUNDRED, "3000");

    await rpm.connect(wallet).approve(staking.address, MaxUint256);
    await WETH.connect(wallet).approve(staking.address, MaxUint256);

    await rpm.connect(alice).mint(alice.address, parseUnits("2000000", "18"));
    await rpm.connect(bob).mint(bob.address, parseUnits("2000000", "18"));
    await rpm.connect(carol).mint(carol.address, parseUnits("2000000", "18"));

    await rpm.connect(alice).approve(staking.address, MaxUint256);
    await rpm.connect(bob).approve(staking.address, MaxUint256);
    await rpm.connect(carol).approve(staking.address, MaxUint256);
  });

  describe("#Stake", () => {
    it("should validate governance", async () => {
      const governance = await staking.governance();
      expect(governance).to.equal(wallet.address);
    });

    it("should revert on 0 amount stake", async () => {
      await expect(staking.stake(wallet.address, 0)).to.be.revertedWith("ZeroInput");
    });

    it("should deposit 100 rewards for 3000 blocks and stake and claim periodically", async () => {
      const HundredWETH = parseUnits("100", "18");

      //get rewardPerBlock
      expect(await staking.currentRewardPerBlock()).to.equal(HundredWETH.div(3000));

      //stake 50 rpm from alice
      await staking.stake(alice.address, HundredWETH);
      await mineNBlocks(10);

      const claimed = await staking.connect(alice).claim();
      /**
       * hundred=100000000000000000000
       * one=1000000000000000000
       * reward/block = hundred/3000 = 33333333333333333
       * acc += ((11 * (hundred/3000)) * one) / hundred = 3666666666666666
       * pending = ((3666666666666666 * hundred) / one)- 0 = 366666666666666600
       */
      await expectEventForAll(staking, claimed, alice, HundredWETH, "366666666666666600", TX_TYPE.CLAIM);

      await mineNBlocks(1);
      const claim2 = await staking.connect(alice).claim();
      await expectEventForAll(staking, claim2, alice, HundredWETH, "66666666666666600", TX_TYPE.CLAIM);

      await mineNBlocks(1);
      const claim3 = await staking.connect(alice).claim();
      await expectEventForAll(staking, claim3, alice, HundredWETH, "66666666666666600", TX_TYPE.CLAIM);
    });

    it("should not stake after rewardDistribution end", async () => {
      const HundredWETH = parseUnits("100", "18");
      // await WETH.connect(wallet).transfer(staking.address, HundredWETH);
      // await staking.connect(wallet).updateRewards(HUNDRED, "3");
      await mineNBlocks(4000);
      await expect(staking.stake(alice.address, HundredWETH)).to.be.revertedWith("RewardDistributionPeriodHasExpired");
    });

    it("two user accumulation calculation", async () => {
      await mineNBlocks(3000);

      let blocksPassed = 10;

      await ethers.provider.send("evm_setAutomine", [false]);

      await staking.updateRewards(parseUnits("30", "18"), 30);
      await staking.stake(wallet.address, parseUnits("100", "18"));

      await ethers.provider.send("evm_setAutomine", [true]);

      await mineNBlocks(blocksPassed);

      /**
       * User 1 Accumulated reward upto 10 block will be now: 1*10 = 10 (AccumuatedUser1Reward)
       * Now On block 10, User 2 deposits 400 tokens
       *
       * Now on block 15 User 1 is harvesting its rewards.
       * While they got 100% rewards from blocks 0 to 10 i.e 10
       */

      await ethers.provider.send("evm_setAutomine", [false]);
      await staking.stake(alice.address, parseUnits("400", "18"));

      await ethers.provider.send("evm_setAutomine", [true]);
      blocksPassed = 5;

      await mineNBlocks(blocksPassed);

      /**
       * User 1 share from From Block 10 to 15:
       * user1Share = 100/500 => 1/5
       *
       * user2Share = 400/500 => 4/5
       *
       * user1AccumulatedReward = (5 * 1/5) + 10 => 11
       *
       * user2AccumulatedReward = (5 * 4/5) => 4
       *
       * user1 should harvests 11 and user1AccumulatedRewards resets to 0.
       * user2 has accumulated 4 for these last 5 blocks.
       */

      const user1BalanceBefore = await WETH.balanceOf(wallet.address);
      const user1PendingRewards = await staking.calculatePendingRewards(wallet.address);
      await staking.claim();
      const user1BalanceAfter = await WETH.balanceOf(wallet.address);

      // pendingRewards is not equal to user balance because hardhat not including both txs in single block
      expect(user1PendingRewards.add("200000000000000000")).to.be.eq(user1BalanceAfter.sub(user1BalanceBefore));
      expect(await staking.currentRewardPerBlock()).to.be.eq(parseUnits("1", "18"));
      expect(await staking.totalRPMStaked()).to.be.eq(parseUnits("500", "18"));
      expect(await staking.rewardToken()).to.be.eq(WETH.address);
      expect(await staking.rpmToken()).to.be.eq(rpm.address);

      blocksPassed = 10;
      await mineNBlocks(blocksPassed);

      /**
       * Then 10 more blocks pass and user2 decides to harvest as well.
       * From Block 15 to 25:
       *
       * user1AccumulatedReward = (10 * 1/5) = > 2
       *
       * user2AccumulatedReward = (10 * 4/5) + 4 => 12
       *
       * User2 harvests 12 and StakerBAccumulatedRewards resets to 0.
       */

      const user2BalanceBefore = await WETH.balanceOf(alice.address);
      const user2PendingRewards = await staking.calculatePendingRewards(alice.address);
      await staking.connect(alice).claim();
      const user2BalanceAfter = await WETH.balanceOf(alice.address);

      // pendingRewards is not equal to user balance because hardhat not including both txs in single block
      expect(user2PendingRewards.add("800000000000000000")).to.be.eq(user2BalanceAfter.sub(user2BalanceBefore));
    });

    it("changing reward token multiple times to verify user's share", async () => {
      // await mineNBlocks(3000);
      await ethers.provider.send("hardhat_mine", ["0xBB8"]);

      // making alice rich now ^_^
      await WETH.transfer(alice.address, await WETH.balanceOf(wallet.address));
      await WETH.connect(carol).transfer(alice.address, await WETH.balanceOf(carol.address));

      await staking.updateRewards(HUNDRED, 100);
      await staking.stake(wallet.address, parseUnits("600", "18"));
      await staking.connect(carol).stake(carol.address, parseUnits("600", "18"));

      await mineNBlocks(100);

      let user1PendingRewards = await staking.calculatePendingRewards(wallet.address);
      let user2PendingRewards = await staking.calculatePendingRewards(carol.address);

      // console.log("usr1,2", user1PendingRewards, user2PendingRewards);

      await staking.claim();
      await staking.connect(carol).claim();

      expect(user1PendingRewards).to.be.eq(await WETH.balanceOf(wallet.address));
      expect(user2PendingRewards).to.be.eq(await WETH.balanceOf(carol.address));

      await testToken.mint(staking.address, parseUnits("100", "18"));

      await staking.updateRewardToken(testToken.address);
      await staking.updateRewards(HUNDRED, 100);

      await mineNBlocks(100);

      user1PendingRewards = await staking.calculatePendingRewards(wallet.address);
      user2PendingRewards = await staking.calculatePendingRewards(carol.address);

      await staking.claim();
      await staking.connect(carol).claim();

      expect(user2PendingRewards).to.be.eq(await testToken.balanceOf(carol.address));
      expect(user1PendingRewards).to.be.eq((await testToken.balanceOf(wallet.address)).sub(1));

      // console.log("usr1,2", user1PendingRewards, user2PendingRewards);

      await WETH.mint(staking.address, parseUnits("500", "18"));

      await staking.updateRewardToken(WETH.address);
      await staking.updateRewards(HUNDRED.mul(5), 100);

      await mineNBlocks(100);

      user1PendingRewards = await staking.calculatePendingRewards(wallet.address);
      user2PendingRewards = await staking.calculatePendingRewards(carol.address);

      // await staking.claim();
      // await staking.connect(carol).claim();

      // console.log("usr1,2", user1PendingRewards, user2PendingRewards);

      await testToken.mint(staking.address, parseUnits("100", "18"));

      await staking.updateRewardToken(testToken.address);
      await staking.updateRewards(HUNDRED, 100);

      await mineNBlocks(100);

      user1PendingRewards = await staking.calculatePendingRewards(wallet.address);
      user2PendingRewards = await staking.calculatePendingRewards(carol.address);

      // console.log("usr1,2", user1PendingRewards, user2PendingRewards);

      await WETH.mint(staking.address, parseUnits("500", "18"));

      await staking.updateRewardToken(WETH.address);
      await staking.updateRewards(HUNDRED, 100);

      await mineNBlocks(100);

      user1PendingRewards = await staking.calculatePendingRewards(wallet.address);
      user2PendingRewards = await staking.calculatePendingRewards(carol.address);

      // await staking.claim();
      // await staking.connect(carol).claim();

      // console.log("usr1,2", user1PendingRewards, user2PendingRewards);
    });
  });
}
