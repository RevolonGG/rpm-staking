/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { stakingConfigFixture } from "../shared/fixtures";
import { MaxUint256 } from "@ethersproject/constants";
import { ethers, waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC20 } from "../../typechain/TestERC20";
import { TestERC206D } from "../../typechain/TestERC206D.d";
import { mineNBlocks, TX_TYPE, expectEventForAll } from "../common.setup";

const createFixtureLoader = waffle.createFixtureLoader;

export async function shouldBehaveLikeSixDecimalsToken(): Promise<void> {
  let staking: RPMStaking;
  let rpm: TestERC20;
  let WETH: TestERC20;
  const HUNDRED = parseUnits("100", "6");
  const TEN = parseUnits("10", "6");
  const ONE = parseUnits("1", "6");
  let SIX_DECIMALS: TestERC206D; // 6 Decimals reward token
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  let loadFixture: ReturnType<typeof createFixtureLoader>;

  const updateTokenWithUpdateRewards = async () => {
    //changing reward token to 6 deicmals token
    await SIX_DECIMALS.transfer(staking.address, HUNDRED);
    await staking.updateRewardToken(SIX_DECIMALS.address);
    //always pass value of rewards in wei notation, regardless of token decimals
    await staking.updateRewards(parseUnits("100", "18"), 100); //1 token / block
  };

  const [wallet, alice, bob, carol] = waffle.provider.getWallets();

  before("fixtures deployer", async () => {
    loadFixture = createFixtureLoader([wallet]);
  });
  beforeEach("fixtures", async () => {
    const res = await loadFixture(stakingConfigFixture);
    staking = res.staking;
    rpm = res.rpm;
    WETH = res.WETH;
    SIX_DECIMALS = res.WETH6D;

    await rpm.mint(wallet.address, parseUnits("2000000", "18"));
    await WETH.mint(wallet.address, parseUnits("2000000", "18"));
    await SIX_DECIMALS.mint(wallet.address, parseUnits("2000000", "6"));

    // 1 token per block
    await WETH.transfer(staking.address, HUNDRED);
    //always pass value of rewards in wei notation, regardless of token decimals
    await staking.updateRewards(parseUnits("100", "18"), 100);

    await rpm.connect(wallet).approve(staking.address, MaxUint256);
    await WETH.connect(wallet).approve(staking.address, MaxUint256);
    await SIX_DECIMALS.connect(wallet).approve(staking.address, MaxUint256);

    //minting to users
    await rpm.connect(alice).mint(alice.address, parseUnits("2000000", "18"));
    await rpm.connect(bob).mint(bob.address, parseUnits("2000000", "18"));
    await rpm.connect(carol).mint(carol.address, parseUnits("2000000", "18"));

    //approvals from users to staking contract
    await rpm.connect(alice).approve(staking.address, MaxUint256);
    await rpm.connect(bob).approve(staking.address, MaxUint256);
    await rpm.connect(carol).approve(staking.address, MaxUint256);
  });
  describe("#SixDecimalsRewardToken", () => {
    it("should return 0", async () => {
      const result = await staking.totalRPMStaked();
      expect(result).to.equal(0);
    });

    it("should let reward token to shift to 6 decimals where pending should be correct", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const aliceStake = await staking.connect(alice).stake(alice.address, TEN);
      //block at which user 1 staked 10 tokens
      const currentBlock = await ethers.provider.getBlockNumber();
      // console.log("rew/block:", await staking.currentRewardPerBlock());

      //mine blocks to reach periodEnd block
      const periodEnd = await staking.periodEndBlock();
      // console.log("period ends", +periodEnd);

      //here reward period ended
      const jumedBlocks = +periodEnd.sub(currentBlock);
      await mineNBlocks(jumedBlocks + 10);
      const user1Pendings = await staking.calculatePendingRewards(alice.address);
      expect(user1Pendings).to.eq(parseUnits(jumedBlocks.toString(), "18"));

      await updateTokenWithUpdateRewards();
      // await staking.stake(wallet.address, 1)
      //jumping to 40 blocks to see pendings
      const miningPeriod = 40;
      await mineNBlocks(miningPeriod);
      const user1PendingsAt6Decimals = await staking.calculatePendingRewards(alice.address);

      expect(user1PendingsAt6Decimals).to.eq(parseUnits(miningPeriod.toString(), "6"));
    });

    it("should change token to 6 decimals and stake and claim for multiple users", async () => {
      // console.log("periodEnd", +(await staking.periodEndBlock()));
      await ethers.provider.send("evm_setAutomine", [false]);

      // console.log("currentBlock", await ethers.provider.getBlockNumber());
      await staking.connect(alice).stake(alice.address, HUNDRED);
      await staking.connect(bob).stake(bob.address, HUNDRED);
      await staking.connect(carol).stake(carol.address, HUNDRED);

      await ethers.provider.send("evm_setAutomine", [true]);

      await mineNBlocks(20); //20 + 3(hardhat blocks mined) = 23

      //token change with updateRewards and funds transfer
      // 1 token / block
      await updateTokenWithUpdateRewards();
      await ethers.provider.send("evm_setAutomine", [false]);

      //having some issues with alice claim, not sure why, for the time being, ignoring this
      const alicePending = await staking.calculatePendingRewards(alice.address);
      const bobPending = await staking.calculatePendingRewards(bob.address);
      const carolPending = await staking.calculatePendingRewards(carol.address);

      const aliceActualClaim = await staking.connect(alice).claim();
      const bobActualClaim = await staking.connect(bob).claim();
      const carolActualClaim = await staking.connect(carol).claim();

      await ethers.provider.send("evm_setAutomine", [true]);

      //expecting values
      expect(alicePending).to.eq(bobPending).to.eq(carolPending);

      expectEventForAll(staking, aliceActualClaim, alice, HUNDRED, alicePending, TX_TYPE.CLAIM);

      expectEventForAll(staking, bobActualClaim, bob, HUNDRED, bobPending, TX_TYPE.CLAIM);

      expectEventForAll(staking, carolActualClaim, carol, HUNDRED, carolPending, TX_TYPE.CLAIM);
    });
  });
}
