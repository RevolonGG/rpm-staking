# RPM Staking

This repository contains RPM staking smart contract.

## RPMStaking.sol

`RPMStaking.sol` allows RPM holders to stake (`stake()`) RPM tokens to receive rewards (reward token could be RPM or any other ERC-20 token). Staker can claim rewards (`claim()`). Stakers may unstake their RPM tokens by calling `unstake()`, which will trigger the reward claim as well. For emergency unstake, stakers can call `emergencyUnstake()`, beaware that emergency unstake doesn't trigger reward claim and all your pending reward tokens are lost.

## Local deployment

### Pre Requisite

After cloning the repository, make sure to install dependencies:

```
$ yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```
$ yarn compile
```

Set the environment variables.
For example:

```
INFURA_API_KEY="Your infura API key"
PK1="Your private key"
ETHERSCAN_API_KEY="Your etherscan API key"
```

Execute the tasks in the following order with correct params to deploy RPM staking contract and to verify it.

```
1. deployStakingSetup
2. deployStaking
3. setupStaking
```

## Test cases

To run the test cases:

```
$ yarn test
```

## Security

Audit was performed by [Block Apex](https://blockapex.io/unipilot-staking-audit-report/)

## Licensing

RPM staking contract is licensed under the [MIT License](https://opensource.org/licenses/MIT)
