import { ethers } from "hardhat";
import { ContractTransaction, Wallet } from "ethers";
import { expect } from "chai";
import { RPMStaking } from "../typechain/RPMStaking.d";
import { BigNumber } from "ethers";

export enum TX_TYPE {
  STAKE,
  UNSTAKE,
  CLAIM,
  EMERGENCY,
}

export const mineNBlocks = async (n: number): Promise<number> => {
  const hexNumber = Number(n).toString(16).toUpperCase();
  await ethers.provider.send("hardhat_mine", [`0x${hexNumber}`]);

  const currentBlockNumber = await ethers.provider.getBlockNumber();
  return currentBlockNumber;
};
export const expectStake = (
  staking: RPMStaking,
  variable: ContractTransaction,
  user: Wallet,
  amount: string | BigNumber | number,
  pendingRewards: string | BigNumber | number,
) => expect(variable).to.emit(staking, "Stake").withArgs(user.address, amount, pendingRewards);

export const expectClaim = (
  staking: RPMStaking,
  variable: ContractTransaction,
  user: Wallet,
  pendingRewards: string | BigNumber | number,
) => expect(variable).to.emit(staking, "Claim").withArgs(user.address, pendingRewards);

export const expectUnstake = (
  staking: RPMStaking,
  variable: ContractTransaction,
  user: Wallet,
  amount: string | BigNumber | number,
  pendingRewards: string | BigNumber | number,
  isEmergency?: boolean,
) => expect(variable).to.emit(staking, "Unstake").withArgs(user.address, amount, pendingRewards, isEmergency);

export const expectEventForAll = (
  staking: RPMStaking,
  variable: ContractTransaction | Promise<ContractTransaction>,
  user: Wallet,
  amount: string | BigNumber | number,
  pendingRewards: string | BigNumber | number,
  txType: TX_TYPE,
) => expect(variable).to.emit(staking, "StakeOrUnstakeOrClaim").withArgs(user.address, amount, pendingRewards, txType);

export const delay = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
