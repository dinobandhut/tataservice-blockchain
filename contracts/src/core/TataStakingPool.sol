// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDepositContract} from "./DepositContract.sol";

/// @title TataStakingPool
/// @notice Non-custodial native TATA delegated staking pool & validator operator bond manager.
///         - Preserves the 1,000,000,000 TATA fixed cap (no minting; rewards funded from reserve/fees).
///         - Bridges delegation (any >= 1 TATA) with canonical Beacon DepositContract validator stakes.
///         - Enforces 32,000 TATA operator bond capacity per validator cohort and slashing accounting.
contract TataStakingPool is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant REWARDS_DISTRIBUTOR_ROLE = keccak256("REWARDS_DISTRIBUTOR_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant VIRTUAL_ASSETS = 1e6;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    IDepositContract public immutable depositContract;
    address public withdrawalVault;

    // Economic configuration (adjustable via governance within safe bounds)
    uint256 public minDelegation = 1 ether; // 1 TATA
    uint256 public beaconDepositAmount = 32 ether; // Canonical Lighthouse mainnet preset deposit
    uint256 public requiredOperatorBond = 32_000 ether; // 32,000 TATA operator bond
    uint256 public operatorFeeBps = 500; // 5.00% commission on rewards
    uint256 public unbondingPeriod = 7 days;

    // Pool accounting (explicit tracking prevents forced ETH/TATA balance manipulation)
    uint256 public totalShares;
    uint256 public liquidReserve; // Native TATA held in this contract ready for claims or validator deposits
    uint256 public activeValidatorPrincipal; // Native TATA currently staked in Beacon DepositContract
    uint256 public pendingWithdrawalsLocked; // Native TATA reserved for unbonding requests
    uint256 public accumulatedProtocolFees;

    struct ValidatorOperator {
        bool registered;
        uint256 bondBalance;
        uint256 activeDepositsCount;
        uint256 accruedCommission;
    }

    struct WithdrawalRequest {
        address owner;
        uint256 amount;
        uint256 unlockTime;
        bool claimed;
    }

    mapping(address => uint256) public sharesOf;
    mapping(address => ValidatorOperator) public operators;
    mapping(bytes32 => address) public validatorOwnerByPubkeyHash;
    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;
    uint256 public nextRequestId;

    event WithdrawalVaultUpdated(address indexed vault);
    event Delegated(address indexed delegator, uint256 assets, uint256 shares);
    event UnstakeRequested(uint256 indexed requestId, address indexed delegator, uint256 shares, uint256 assets, uint256 unlockTime);
    event UnstakeClaimed(uint256 indexed requestId, address indexed delegator, uint256 assets);
    event OperatorBondDeposited(address indexed operator, uint256 amount, uint256 newBond);
    event OperatorBondWithdrawn(address indexed operator, uint256 amount, uint256 newBond);
    event ValidatorLaunched(address indexed operator, bytes pubkey, uint256 depositAmount);
    event RewardsDistributed(address indexed distributor, uint256 totalRewards, uint256 netToDelegators, uint256 feeAmount);
    event VaultProceedsReceived(uint256 principalReturned, uint256 rewardsEarned);
    event SlashingRecorded(address indexed operator, uint256 validatorLoss, uint256 operatorBondSlashed);
    event ParametersUpdated(uint256 minDelegation, uint256 requiredOperatorBond, uint256 operatorFeeBps, uint256 unbondingPeriod);

    constructor(
        address admin,
        address _depositContract
    ) {
        require(admin != address(0), "TataStakingPool: zero admin");
        require(_depositContract != address(0), "TataStakingPool: zero depositContract");

        depositContract = IDepositContract(_depositContract);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REWARDS_DISTRIBUTOR_ROLE, admin);
        _grantRole(SLASHER_ROLE, admin);
    }

    /// @notice Total managed native TATA backing delegator shares.
    function totalManagedAssets() public view returns (uint256) {
        return liquidReserve + activeValidatorPrincipal;
    }

    /// @notice Converts a TATA amount to pool shares using virtual offset protection against inflation attacks.
    function previewDeposit(uint256 assets) public view returns (uint256) {
        return (assets * (totalShares + VIRTUAL_SHARES)) / (totalManagedAssets() + VIRTUAL_ASSETS);
    }

    /// @notice Converts pool shares back to native TATA value.
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return (shares * (totalManagedAssets() + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
    }

    function setWithdrawalVault(address _vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_vault != address(0), "TataStakingPool: zero vault");
        withdrawalVault = _vault;
        _grantRole(VAULT_ROLE, _vault);
        emit WithdrawalVaultUpdated(_vault);
    }

    function updateParameters(
        uint256 _minDelegation,
        uint256 _requiredOperatorBond,
        uint256 _operatorFeeBps,
        uint256 _unbondingPeriod
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minDelegation >= 0.01 ether, "TataStakingPool: minDelegation too low");
        require(_operatorFeeBps <= 2_500, "TataStakingPool: fee > 25%");
        require(_unbondingPeriod <= 30 days, "TataStakingPool: unbonding > 30d");

        minDelegation = _minDelegation;
        requiredOperatorBond = _requiredOperatorBond;
        operatorFeeBps = _operatorFeeBps;
        unbondingPeriod = _unbondingPeriod;

        emit ParametersUpdated(_minDelegation, _requiredOperatorBond, _operatorFeeBps, _unbondingPeriod);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Delegate native TATA into the staking pool and receive proportional shares.
    function delegate() external payable whenNotPaused nonReentrant returns (uint256 shares) {
        require(msg.value >= minDelegation, "TataStakingPool: below minimum delegation");
        shares = previewDeposit(msg.value);
        require(shares > 0, "TataStakingPool: zero shares");

        sharesOf[msg.sender] += shares;
        totalShares += shares;
        liquidReserve += msg.value;

        emit Delegated(msg.sender, msg.value, shares);
    }

    /// @notice Burn shares and queue native TATA withdrawal after the unbonding period.
    function requestUnstake(uint256 shares) external whenNotPaused nonReentrant returns (uint256 requestId) {
        require(shares > 0, "TataStakingPool: zero shares");
        require(sharesOf[msg.sender] >= shares, "TataStakingPool: insufficient shares");

        uint256 assets = previewRedeem(shares);
        require(assets > 0, "TataStakingPool: zero assets");
        require(liquidReserve >= assets, "TataStakingPool: insufficient liquid reserve; wait for validator exit");

        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        liquidReserve -= assets;
        pendingWithdrawalsLocked += assets;

        requestId = nextRequestId++;
        uint256 unlockTime = block.timestamp + unbondingPeriod;
        withdrawalRequests[requestId] = WithdrawalRequest({
            owner: msg.sender,
            amount: assets,
            unlockTime: unlockTime,
            claimed: false
        });

        emit UnstakeRequested(requestId, msg.sender, shares, assets, unlockTime);
    }

    /// @notice Claim matured native TATA after unbondingPeriod elapses.
    function claimUnstake(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage req = withdrawalRequests[requestId];
        require(req.owner == msg.sender, "TataStakingPool: not request owner");
        require(!req.claimed, "TataStakingPool: already claimed");
        require(block.timestamp >= req.unlockTime, "TataStakingPool: unbonding period active");

        uint256 amount = req.amount;
        req.claimed = true;
        pendingWithdrawalsLocked -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TataStakingPool: withdrawal transfer failed");

        emit UnstakeClaimed(requestId, msg.sender, amount);
    }

    /// @notice Deposit operator bond (default 32,000 TATA threshold per validator cohort).
    function depositOperatorBond() external payable onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        require(msg.value > 0, "TataStakingPool: zero bond");
        ValidatorOperator storage op = operators[msg.sender];
        op.registered = true;
        op.bondBalance += msg.value;

        emit OperatorBondDeposited(msg.sender, msg.value, op.bondBalance);
    }

    /// @notice Withdraw excess operator bond above active validator requirements.
    function withdrawOperatorBond(uint256 amount) external onlyRole(OPERATOR_ROLE) nonReentrant {
        ValidatorOperator storage op = operators[msg.sender];
        require(op.bondBalance >= amount, "TataStakingPool: insufficient bond");
        uint256 minRequired = op.activeDepositsCount > 0 ? requiredOperatorBond : 0;
        require(op.bondBalance - amount >= minRequired, "TataStakingPool: bond locked by active validators");

        op.bondBalance -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TataStakingPool: bond transfer failed");

        emit OperatorBondWithdrawn(msg.sender, amount, op.bondBalance);
    }

    /// @notice Fund a canonical Beacon Chain validator deposit using pooled TATA, enforcing 0x01 vault credentials.
    function launchValidator(
        bytes calldata pubkey,
        bytes calldata withdrawalCredentials,
        bytes calldata signature,
        bytes32 depositDataRoot
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        require(withdrawalVault != address(0), "TataStakingPool: withdrawal vault unset");
        require(pubkey.length == 48, "TataStakingPool: invalid pubkey");
        require(withdrawalCredentials.length == 32, "TataStakingPool: invalid credentials");

        // Verify 0x01 execution withdrawal credentials match our immutable TataWithdrawalVault
        bytes32 expectedCreds = bytes32(uint256(0x01) << 248 | uint256(uint160(withdrawalVault)));
        require(bytes32(withdrawalCredentials) == expectedCreds, "TataStakingPool: credentials must point to withdrawalVault");

        bytes32 pkHash = keccak256(pubkey);
        require(validatorOwnerByPubkeyHash[pkHash] == address(0), "TataStakingPool: pubkey already registered");

        ValidatorOperator storage op = operators[msg.sender];
        require(op.bondBalance >= requiredOperatorBond, "TataStakingPool: insufficient 32,000 TATA operator bond");
        require(liquidReserve >= beaconDepositAmount, "TataStakingPool: insufficient pooled liquidity");

        validatorOwnerByPubkeyHash[pkHash] = msg.sender;
        op.activeDepositsCount += 1;
        liquidReserve -= beaconDepositAmount;
        activeValidatorPrincipal += beaconDepositAmount;

        depositContract.deposit{value: beaconDepositAmount}(
            pubkey,
            withdrawalCredentials,
            signature,
            depositDataRoot
        );

        emit ValidatorLaunched(msg.sender, pubkey, beaconDepositAmount);
    }

    /// @notice Fund staking rewards from the pre-allocated 240M TATA Staking Reserve.
    function distributeRewards() external payable onlyRole(REWARDS_DISTRIBUTOR_ROLE) whenNotPaused nonReentrant {
        require(msg.value > 0, "TataStakingPool: zero reward");
        _creditRewards(msg.value);
    }

    /// @notice Receive swept validator exits and execution rewards from TataWithdrawalVault.
    function receiveVaultProceeds(uint256 principalReturned, uint256 rewardsEarned)
        external
        payable
        onlyRole(VAULT_ROLE)
        nonReentrant
    {
        require(msg.value == principalReturned + rewardsEarned, "TataStakingPool: value mismatch");
        require(principalReturned <= activeValidatorPrincipal, "TataStakingPool: principal exceeds active");

        if (principalReturned > 0) {
            activeValidatorPrincipal -= principalReturned;
            liquidReserve += principalReturned;
        }
        if (rewardsEarned > 0) {
            _creditRewards(rewardsEarned);
        }

        emit VaultProceedsReceived(principalReturned, rewardsEarned);
    }

    /// @notice Record verified consensus slashing loss: slashes operator bond first, then pool principal if exceeded.
    function recordSlashing(address operator, uint256 totalLoss)
        external
        onlyRole(SLASHER_ROLE)
        nonReentrant
    {
        require(totalLoss > 0, "TataStakingPool: zero loss");
        ValidatorOperator storage op = operators[operator];
        uint256 bondSlashed = totalLoss <= op.bondBalance ? totalLoss : op.bondBalance;
        op.bondBalance -= bondSlashed;

        uint256 remainingPoolLoss = totalLoss - bondSlashed;
        if (remainingPoolLoss > activeValidatorPrincipal) {
            remainingPoolLoss = activeValidatorPrincipal;
        }
        activeValidatorPrincipal -= remainingPoolLoss;

        // Slashed operator bond stays in the pool reserve to protect delegators against operator misconduct
        liquidReserve += bondSlashed;

        emit SlashingRecorded(operator, remainingPoolLoss, bondSlashed);
    }

    function withdrawProtocolFees(address recipient, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "TataStakingPool: zero recipient");
        require(amount <= accumulatedProtocolFees, "TataStakingPool: exceeds fees");
        accumulatedProtocolFees -= amount;
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "TataStakingPool: fee transfer failed");
    }

    function _creditRewards(uint256 amount) internal {
        uint256 fee = (amount * operatorFeeBps) / BPS_DENOMINATOR;
        uint256 netToPool = amount - fee;
        accumulatedProtocolFees += fee;
        liquidReserve += netToPool;
        emit RewardsDistributed(msg.sender, amount, netToPool, fee);
    }
}
