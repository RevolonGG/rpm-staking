import { BigNumber, Wallet } from "ethers";
import { ethers } from "hardhat";
import { Fixture } from "ethereum-waffle";
import { TestERC20 } from "../../typechain/TestERC20";
import { waffle } from "hardhat";
import { RPMStaking } from "../../typechain/RPMStaking";
import { TestERC206D } from "../../typechain/TestERC206D.d";

interface TokensFixture {
  rpm: TestERC20;
  WETH: TestERC20;
  testToken: TestERC20;
  WETH6D: TestERC206D; //6 decimals token
}

async function tokensFixture(): Promise<TokensFixture> {
  const sixDecimalToken = await ethers.getContractFactory("TestERC206D");
  const tokenFactory = await ethers.getContractFactory("TestERC20");

  const rpm = (await tokenFactory.deploy(BigNumber.from(1).pow(255))) as TestERC20;
  const WETH = (await tokenFactory.deploy(BigNumber.from(1).pow(255))) as TestERC20;
  const testToken = (await tokenFactory.deploy(BigNumber.from(1).pow(255))) as TestERC20;
  const WETH6D = (await sixDecimalToken.deploy(BigNumber.from(1).pow(255))) as TestERC206D; //6 decimals token

  return { rpm, WETH, testToken, WETH6D };
}

interface StakingFixture {
  staking: RPMStaking;
}

async function stakingFixture(wallet: Wallet, WETH: TestERC20, rpm: TestERC20): Promise<StakingFixture> {
  const stakingStaking = await ethers.getContractFactory("RPMStaking");
  const staking = (await stakingStaking.deploy(wallet.address, WETH.address, rpm.address)) as RPMStaking;

  return { staking };
}

type TokensAndStakingFixture = StakingFixture & TokensFixture;

export const stakingConfigFixture: Fixture<TokensAndStakingFixture> =
  async function (): Promise<TokensAndStakingFixture> {
    const [wallet] = waffle.provider.getWallets();
    const { rpm, WETH, testToken, WETH6D } = await tokensFixture();
    const { staking } = await stakingFixture(wallet, WETH, rpm);
    return { staking, rpm, WETH, testToken, WETH6D };
  };
