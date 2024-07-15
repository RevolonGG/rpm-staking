/* eslint-disable prefer-const */
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { stakingConfigFixture } from "../shared/fixtures";
import { MaxUint256 } from "@ethersproject/constants";
import { ethers, waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC20 } from "../../typechain/TestERC20";
import { mineNBlocks, TX_TYPE, expectEventForAll } from "../common.setup";

const createFixtureLoader = waffle.createFixtureLoader;

export async function shouldBehaveLikeViewRewards(): Promise<void> {
  let staking: RPMStaking;
  let rpm: TestERC20;
  let WETH: TestERC20;

  const [wallet, alice, bob] = waffle.provider.getWallets();

  let ONE = parseUnits("1", "18");
  let TEN = parseUnits("10", "18");
  let HUNDRED = parseUnits("100", "18");

  let loadFixture: ReturnType<typeof createFixtureLoader>;

  before("fixtures deployer", async () => {
    loadFixture = createFixtureLoader([wallet]);
  });
  beforeEach("fixtures", async () => {
    const res = await loadFixture(stakingConfigFixture);
    staking = res.staking;
    rpm = res.rpm;
    WETH = res.WETH;

    await rpm.mint(wallet.address, parseUnits("2000000", "18"));
    await WETH.mint(wallet.address, parseUnits("2000000", "18"));

    await WETH.transfer(staking.address, HUNDRED);
    await staking.updateRewards(HUNDRED, 100);

    await rpm.connect(alice).mint(alice.address, parseUnits("2000000", "18"));
    await rpm.connect(bob).mint(bob.address, parseUnits("2000000", "18"));

    await rpm.connect(alice).approve(staking.address, MaxUint256);
    await rpm.connect(bob).approve(staking.address, MaxUint256);
  });

  describe("#RewardsLookup", () => {
    it("should view reward/block", async () => {
      const result = await staking.currentRewardPerBlock();
      let isTrue: boolean = HUNDRED.div("100").eq(result) ? true : false;
      await expect(isTrue).to.be.true;
    });

    it("should stake 10 tokens and after 10 blocks, see rewards", async () => {
      let aliceStake = await staking.connect(alice).stake(alice.address, TEN);
      await expectEventForAll(staking, aliceStake, alice, TEN, 0, TX_TYPE.STAKE);
      await mineNBlocks(10);
      let aliceReward = await staking.calculatePendingRewards(alice.address);
      expect(aliceReward).to.equal(TEN);
    });

    it("2 users stake at same time, one view for 10 blocks, 2nd view for 20 blocks, should be double", async () => {
      await ethers.provider.send("evm_setAutomine", [false]);
      let aliceStake = await staking.connect(alice).stake(alice.address, TEN); //block number = 16
      let bobStake = await staking.connect(bob).stake(bob.address, TEN); //block number = 16
      await ethers.provider.send("evm_setAutomine", [true]);

      await mineNBlocks(10);
      let aliceReward = await staking.calculatePendingRewards(alice.address);
      await mineNBlocks(10);
      let bobReward = await staking.calculatePendingRewards(bob.address);

      await expectEventForAll(staking, aliceStake, alice, TEN, 0, TX_TYPE.STAKE);
      await expectEventForAll(staking, bobStake, bob, TEN, 0, TX_TYPE.STAKE);

      expect(aliceReward).to.equal("4500000000000000000"); //4.5
      expect(bobReward).to.equal("9500000000000000000"); //9.5
    });

    it("should stake and claim all reward, then only view the reward for 1 block", async () => {
      let aliceStake = await staking.connect(alice).stake(alice.address, TEN);
      await mineNBlocks(10);
      let aliceClaim = await staking.connect(alice).claim();
      let aliceVieww = await staking.calculatePendingRewards(alice.address);

      await expectEventForAll(staking, aliceStake, alice, TEN, 0, TX_TYPE.STAKE);
      await expectEventForAll(staking, aliceClaim, alice, TEN, TEN.add(ONE), TX_TYPE.CLAIM);
      // console.log("alice view reward", aliceVieww.toString());
      expect(aliceVieww).to.equal(0);
    });
  });
}
