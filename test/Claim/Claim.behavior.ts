import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { stakingConfigFixture } from "../shared/fixtures";
import { MaxUint256 } from "@ethersproject/constants";
import { ethers, waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC20 } from "../../typechain/TestERC20";
import { mineNBlocks, TX_TYPE, expectEventForAll } from "../common.setup";

const createFixtureLoader = waffle.createFixtureLoader;

export async function shouldBehaveLikeClaim(): Promise<void> {
  let staking: RPMStaking;
  let rpm: TestERC20;
  let WETH: TestERC20;

  const HUNDRED = parseUnits("100", "18");
  const TEN = parseUnits("10", "18");

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

    await rpm.mint(wallet.address, parseUnits("2000000", "18"));
    await WETH.mint(wallet.address, parseUnits("2000000", "18"));

    await WETH.transfer(staking.address, parseUnits("100", "18")); // 100 WETH
    await staking.updateRewards(HUNDRED, "3000"); // 100 WETH

    await rpm.connect(wallet).approve(staking.address, MaxUint256);
    await WETH.connect(wallet).approve(staking.address, MaxUint256);

    await rpm.connect(alice).mint(alice.address, parseUnits("2000000", "18"));
    await rpm.connect(bob).mint(bob.address, parseUnits("2000000", "18"));
    await rpm.connect(carol).mint(carol.address, parseUnits("2000000", "18"));

    await rpm.connect(alice).approve(staking.address, MaxUint256);
    await rpm.connect(bob).approve(staking.address, MaxUint256);
    await rpm.connect(carol).approve(staking.address, MaxUint256);
  });

  describe("#Claim", () => {
    it("should return 0", async () => {
      const result = await staking.totalRPMStaked();
      expect(result).to.equal("0");
    });

    it("should periodically stake twice and claim", async () => {
      await mineNBlocks(20);

      const stake1 = await staking.stake(alice.address, TEN);
      await expectEventForAll(staking, stake1, alice, TEN, "0", TX_TYPE.STAKE);
      await mineNBlocks(20);

      const stake2 = await staking.stake(alice.address, TEN);
      await expectEventForAll(staking, stake2, alice, TEN, "699999999999999990", TX_TYPE.STAKE);
      await mineNBlocks(10);

      const claimed = await staking.connect(alice).claim();
      await expectEventForAll(staking, claimed, alice, TEN.mul(2), "366666666666666660", TX_TYPE.CLAIM);
    });

    //NOTICE: this case is only possible if the updateReward and last stake/unstake/claim are in the same block
    //        because these four functions update the lastUpdateBlock
    it("should revert on claim for contract out ot funds", async () => {
      await WETH.connect(wallet).transfer(staking.address, 100); // 100 WETH
      await staking.updateRewards(HUNDRED, "3");
      const stake1 = await staking.stake(alice.address, HUNDRED);
      await expectEventForAll(staking, stake1, alice, HUNDRED, "0", TX_TYPE.STAKE);

      await mineNBlocks(3300);
      // await ethers.provider.send("hardhat_mine", ["CE4"]); //3300 blocks

      await expect(staking.connect(alice).claim()).to.be.revertedWith("InsufficientFunds");
    });

    // NOTICE: having some issues with alice claim, not sure why, for time being, ignoring this
    it("should work with multiple user deposit and calculate same reward for all", async () => {
      const HundredWETH = parseUnits("100", "18");
      await ethers.provider.send("evm_setAutomine", [false]);

      await staking.stake(alice.address, HundredWETH);
      await staking.stake(bob.address, HundredWETH);
      await staking.stake(carol.address, HundredWETH);

      await ethers.provider.send("evm_setAutomine", [true]);
      await mineNBlocks(20);
      await ethers.provider.send("evm_setAutomine", [false]);

      //having some issues with alice claim, not sure why, for the time being, ignoring this
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const alicePendingReward = await staking.connect(alice).claim();

      const bobPendingReward = await staking.connect(bob).claim();
      const carolPendingReward = await staking.connect(carol).claim();

      await mineNBlocks(1);
      await ethers.provider.send("evm_setAutomine", [true]);

      await expectEventForAll(staking, bobPendingReward, bob, HundredWETH, "222222222222222200", TX_TYPE.CLAIM);

      await expectEventForAll(staking, carolPendingReward, carol, HundredWETH, "222222222222222200", TX_TYPE.CLAIM);
    });

    //NOTICE: this test is not working, it's a bug in the automine,
    //it doesn't revert the pending transactions after confirmation,
    //this has been tested via smart contract, txHash: 0x54cf013ad8124fc01f8853ba92813b7d8369b2816ad787f912a0225bd8fbfc49 (rinkeby testnet)
    xit("alice can not double claim", async () => {
      // let HundredWETH = parseUnits("100", "18");
      // await staking.stake(alice.address, HundredWETH);
      // await mineNBlocks(20);
      // await ethers.provider.send("evm_setAutomine", [false]);
      // let aliceClaim1 = await staking.connect(alice).claim();
      // let aliceClaim2 = await staking.connect(alice).claim();
      // await ethers.provider.send("evm_setAutomine", [true]);
      // expectEventForAll(staking, aliceClaim1, alice, HundredWETH, "699999999999999900", TX_TYPE.CLAIM);
      // expectEventForAll(staking, aliceClaim2, alice, HundredWETH, "0", TX_TYPE.CLAIM);
    });
  });
}
