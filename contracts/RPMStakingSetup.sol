// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

interface IRPMStaking {
    function stake(address _to, uint256 _amount) external;

    function setGovernance(address _newGovernance) external;

    function updateRewards(uint256 _reward, uint256 _rewardDurationInBlocks) external;
}

interface IRPM {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract RPMStakingSetup {
    IRPMStaking public rpmStaking;
    IRPM public rpmToken;

    constructor(IRPM _rpmToken) {
        rpmToken = _rpmToken;
    }

    function setStakingAddress(IRPMStaking _rpmStaking) external {
        rpmStaking = _rpmStaking;
    }

    function doSetup(
        address _stakeAddr,
        address _governance,
        uint256 _amount,
        uint256 _rewardToDistribute,
        uint256 _rewardDuration
    ) external {
        // approve RPM
        rpmToken.approve(address(rpmStaking), type(uint256).max);

        // update rewards
        rpmStaking.updateRewards(_rewardToDistribute, _rewardDuration);

        // stake RPM
        rpmStaking.stake(_stakeAddr, _amount);

        // set governance
        rpmStaking.setGovernance(_governance);
    }
}
