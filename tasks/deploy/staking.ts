/* eslint-disable @typescript-eslint/no-unused-vars */
import { deployContract } from "./utils";
import { formatEther } from "ethers/lib/utils";
import { task } from "hardhat/config";

//RPM: 0xA5AFE7a1aA62C2fA192896E0387bbB1A8708bb67
//STAKING SETUP: 0xB1FD10feB9561dEDDb00690dd01378EAEa7903Ed
//STAKING: 0xc05803E4b87b9DE6B56B4829DccF46455e5F41E9
//GOVERNANCE: 0xc1484D30EF37Aca50Fba3Da58b4C774C20E7d783
//DISTRIBUTION BLOCKS: 175200
//REWARDS TO DISTRIBUTE: 1000000000000000000000

task("deployStakingSetup", "Deploy Staking Setup Contract")
  .addParam("tokenAddress", "Staking token address")
  .setAction(async (args, { ethers, run, network }) => {
    await run("compile");

    const [signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    const signerBalance = await signer.getBalance();

    console.log("\nSigner Address =>", signerAddress);
    console.log("Signer Balance =>", formatEther(signerBalance));
    console.log("\nNetwork =>", network.name);
    console.log("\nArguments =>\n", args, "\n");

    const rpmStakingSetup = await deployContract(
      "RPMStakingSetup",
      await ethers.getContractFactory("RPMStakingSetup"),
      signer,
      [args.tokenAddress],
    );

    await rpmStakingSetup.deployTransaction.wait(5);
    await delay(60000);

    console.log("\nVerifying Smart Contract ...\n");

    await run("verify:verify", {
      address: rpmStakingSetup.address,
      constructorArguments: [args.tokenAddress],
    });
  });

task("deployStaking", "Deploy Staking Contract")
  .addParam("stakeTokenAddress", "Staking token address")
  .addParam("rewardTokenAddress", "Reward token address")
  .addParam("setupContractAddress", "Setup Contract address")
  .setAction(async (args, { ethers, run, network }) => {
    await run("compile");

    const [signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    const signerBalance = await signer.getBalance();

    console.log("\nSigner Address =>", signerAddress);
    console.log("Signer Balance =>", formatEther(signerBalance));
    console.log("\nNetwork =>", network.name);
    console.log("\nArguments =>\n", args, "\n");

    const rpmStaking = await deployContract("RPMStaking", await ethers.getContractFactory("RPMStaking"), signer, [
      args.setupContractAddress,
      args.rewardTokenAddress,
      args.stakeTokenAddress,
    ]);

    await rpmStaking.deployTransaction.wait(5);
    await delay(60000);

    console.log("\nVerifying Smart Contract ...\n");

    await run("verify:verify", {
      address: rpmStaking.address,
      constructorArguments: [args.setupContractAddress, args.rewardTokenAddress, args.stakeTokenAddress],
    });
  });

task("setupStaking", "Setup Staking")
  .addParam("stakingContractAddress", "Staking Contract address")
  .addParam("setupContractAddress", "Setup Contract address")
  .addParam("stakeTokenAddress", "Staking token address")
  .addParam("distributionBlocks", "Number of blocks to distribute reward")
  .addParam("rewardAmount", "Reward amount")
  .addParam("governance", "Governance address")
  .setAction(async (args, { ethers, run, network }) => {
    const [signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    const signerBalance = await signer.getBalance();

    console.log("\nSigner Address =>", signerAddress);
    console.log("Signer Balance =>", formatEther(signerBalance));
    console.log("\nNetwork =>", network.name);
    console.log("\nArguments =>\n", args, "\n");

    const tokenContract = await ethers.getContractAt("RPM", args.stakeTokenAddress, signer);
    const stakingSetupContract = await ethers.getContractAt("RPMStakingSetup", args.setupContractAddress, signer);

    const stakeAmount = ethers.utils.parseUnits("1", 18);

    // Transfer stake tokens
    const stakeTokensTransferTx = await tokenContract.transfer(args.setupContractAddress, stakeAmount);
    const stakeTokensTransferReceipt = await stakeTokensTransferTx.wait();
    console.log("\nTransfer stake tokens:", stakeTokensTransferReceipt.logs);

    // Transfer reward tokens
    const rewardTokensTransferTx = await tokenContract.transfer(args.stakingContractAddress, args.rewardAmount);
    const rewardTokensTransferReceipt = await rewardTokensTransferTx.wait();
    console.log("\nTransfer reward tokens:", rewardTokensTransferReceipt.logs);

    // Set staking contract
    const setStakingTx = await stakingSetupContract.setStakingAddress(args.stakingContractAddress);
    const setStakingReceipt = await setStakingTx.wait();
    console.log("\nSet staking contract:", setStakingReceipt.logs);

    // Setup transaction
    const setupTx = await stakingSetupContract.doSetup(
      args.governance,
      args.governance,
      stakeAmount,
      args.rewardAmount,
      args.distributionBlocks,
    );
    const setupReceipt = await setupTx.wait();
    console.log("\nSetup transaction:", setupReceipt.logs);
  });

task("verify-contract", "Verify Contract").setAction(async (args, { ethers, run, network }) => {
  console.log("Verifying Smart Contract ...");

  await run("verify:verify", {
    address: "...",
    constructorArguments: ["..."],
  });
});

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
