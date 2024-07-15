/* eslint-disable @typescript-eslint/no-floating-promises */
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { stakingConfigFixture } from "../shared/fixtures";
import { MaxUint256 } from "@ethersproject/constants";
import { ethers, waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC20 } from "../../typechain/TestERC20.d";
import { mineNBlocks, expectEventForAll, TX_TYPE } from "./../common.setup";
import { BigNumber } from "ethers";

const createFixtureLoader = waffle.createFixtureLoader;

export async function shouldBehaveLikeUnstake(): Promise<void> {
  let staking: RPMStaking;
  let rpm: TestERC20;
  let WETH: TestERC20;

  const HUNDRED = parseUnits("100", "18");

  const [wallet, alice, bob, carol] = waffle.provider.getWallets();

  let loadFixture: ReturnType<typeof createFixtureLoader>;

  before("fixtures deployer", async () => {
    loadFixture = createFixtureLoader([wallet]);
    const res = await loadFixture(stakingConfigFixture);
    staking = res.staking;
    rpm = res.rpm;
    WETH = res.WETH;

    await rpm.mint(wallet.address, parseUnits("2000000", "18"));
    await WETH.mint(wallet.address, parseUnits("2000000", "18"));

    await rpm.connect(wallet).approve(staking.address, MaxUint256);
    await WETH.connect(wallet).approve(staking.address, MaxUint256);

    await rpm.connect(alice).mint(alice.address, parseUnits("2000000", "18"));
    await rpm.connect(bob).mint(bob.address, parseUnits("2000000", "18"));
    await rpm.connect(carol).mint(carol.address, parseUnits("2000000", "18"));
    await rpm.connect(alice).approve(staking.address, MaxUint256);
    await rpm.connect(bob).approve(staking.address, MaxUint256);
    await rpm.connect(carol).approve(staking.address, MaxUint256);
  });

  beforeEach("fixtures", async () => {
    await WETH.transfer(staking.address, parseUnits("100", "18"));
    await staking.updateRewards(HUNDRED, 3000);
    await staking.stake(wallet.address, parseUnits("1", "18"));
  });

  describe("#Unstake", () => {
    it("user can't unstake 0 OR greater than staked", async () => {
      await expect(staking.connect(alice).unstake(0)).to.be.revertedWith("AmountLessThanStakedAmountOrZero");
      await staking.stake(alice.address, parseUnits("10", "18"));

      await expect(staking.connect(alice).unstake(0)).to.be.revertedWith("AmountLessThanStakedAmountOrZero");
      await expect(staking.connect(alice).unstake(parseUnits("11", "18"))).to.be.revertedWith(
        "AmountLessThanStakedAmountOrZero",
      );
      await expect(staking.connect(alice).unstake(parseUnits("10", "18"))).to.not.reverted;
    });

    // NOTICE: this test was emitting events when running independently, not with stake and claim.
    // but not when running in series with stake and claim
    it("user can emergency unstake after reward duration has ended", async () => {
      const stake1 = await staking.stake(alice.address, parseUnits("10", "18"));
      await expectEventForAll(staking, stake1, alice, parseUnits("10", "18"), "0", TX_TYPE.STAKE);

      await mineNBlocks(3000);

      const emergencyUnstake = await staking.connect(alice).emergencyUnstake();
      await expectEventForAll(staking, emergencyUnstake, alice, parseUnits("10", "18"), "0", TX_TYPE.EMERGENCY);

      await expect(staking.connect(alice).emergencyUnstake()).to.be.revertedWith("NoStakeFound");
      await expect(staking.connect(alice).unstake(1000000000000)).to.be.revertedWith(
        "AmountLessThanStakedAmountOrZero",
      );
      await expect(staking.connect(alice).unstake(1)).to.be.revertedWith("AmountLessThanStakedAmountOrZero");
    });

    it("single stake then 2 rewardUpdates, passed 100blocks => unstaking => monitor rewards", async () => {
      const TEN = parseUnits("10", "18");
      const HundredWETH = parseUnits("100", "18");
      //stake
      await staking.connect(alice).stake(alice.address, TEN);
      //1st update
      await mineNBlocks(30);
      await WETH.transfer(staking.address, HundredWETH);
      await staking.updateRewards(HUNDRED, "1000");

      //2nd update
      await mineNBlocks(30);
      await WETH.transfer(staking.address, HundredWETH);
      await staking.updateRewards(HUNDRED, "1000");

      //unstake
      await mineNBlocks(30);
      const unstake1 = await staking.connect(alice).unstake(TEN); //12690762256410256290
      await expectEventForAll(staking, unstake1, alice, TEN, "12690762256410256290", TX_TYPE.UNSTAKE);
    });

    it("two users stake at same time, one unstake at periodEnd, 2nd way after it", async () => {
      const TEN = parseUnits("10", "18");
      await ethers.provider.send("evm_setAutomine", [false]);
      await staking.stake(alice.address, TEN);
      await staking.stake(bob.address, TEN);

      await ethers.provider.send("evm_setAutomine", [true]);
      await mineNBlocks(3000);
      const unstak1 = await staking.connect(alice).unstake(TEN);
      await mineNBlocks(100);
      const unstak2 = await staking.connect(bob).unstake(TEN);
      await expectEventForAll(staking, unstak1, alice, TEN, "159414626239851850040", TX_TYPE.UNSTAKE);
      await expectEventForAll(staking, unstak2, bob, TEN, "159414626239851850040", TX_TYPE.UNSTAKE);
    });

    it("user can't normal unstake if there's no reward balance in contract", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const aliceStake = await staking.stake(alice.address, parseUnits("10", "18"));

      const contractRewardBalance = await WETH.balanceOf(staking.address);
      await staking.connect(wallet).migrateFunds(wallet.address, [WETH.address], [contractRewardBalance], false);

      await expect(staking.connect(alice).unstake(parseUnits("10", "18"))).to.be.revertedWith("InsufficientFunds");

      const emergencyUnstake = await staking.connect(alice).emergencyUnstake();

      await expectEventForAll(staking, emergencyUnstake, alice, parseUnits("10", "18"), "0", TX_TYPE.EMERGENCY);
    });

    it("should show correct balances of contract ($RPM & $TOKEN) after unstaking", async () => {
      //after this emergency unstake of wallet, rewards after this tx will be completely rewarded to alice
      //and all those rewards that are not claimed by wallet will be left unclaimed in the contract
      //and can be withdrawn by governance using migrateFunds.
      await staking.connect(wallet).emergencyUnstake();

      const HUNDRED = parseUnits("100", "18");
      const contractRPMBalanceBefore = await rpm.balanceOf(staking.address);
      const contractWETHBalanceBefore = await WETH.balanceOf(staking.address);
      // console.log("staking startttt")
      await staking.stake(alice.address, HUNDRED);

      await mineNBlocks(100);
      const unstakeWithClaim = await staking.connect(alice).unstake(HUNDRED);
      const expectedReward = BigNumber.from("6725477777777777600");
      expectEventForAll(staking, unstakeWithClaim, alice, HUNDRED, expectedReward, TX_TYPE.UNSTAKE);

      const contractRPMBalanceAfter = await rpm.balanceOf(staking.address);
      const contractWETHBalanceAfter = await WETH.balanceOf(staking.address);

      expect(contractWETHBalanceBefore).to.equal(contractWETHBalanceAfter.add(expectedReward));
      expect(contractRPMBalanceBefore).to.equal(contractRPMBalanceAfter);
    });
  });
}
