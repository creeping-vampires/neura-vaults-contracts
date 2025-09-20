// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./WhitelistRegistry.sol";

/**
 * @title YieldAllocatorVault (ERC-4626 + ERC-7540 async deposit/withdraw FIFO with performance fee)
 * @notice
 *  - Deposits: async (ERC-7540-style) → users request, executor batches & fulfills later (mint shares).
 *  - Withdrawals: async (ERC-7540-style) → users request, executor batches & fulfills later (burn shares).
 *  - Both maintained in FIFO queues.
 *  - Performance fee: charged on yields during withdrawals only.
 */
contract YieldAllocatorVault is ERC4626, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant EXECUTOR = keccak256("EXECUTOR");
    WhitelistRegistry public registry;

    // ===== Deposit Queue =====
    struct DepositRequest {
        uint256 assets;
        address receiver;
        bool exists;
    }

    mapping(address => DepositRequest) public depositRequests;
    address[] public pendingDepositors;
    mapping(address => uint256) public depositorIndex;
    mapping(address => bool) public hasPendingDeposit;
    uint256 public pendingDepositAssets; // sum of assets waiting to be minted into shares

    // ===== Withdrawal Queue =====
    struct WithdrawalRequest {
        uint256 shares;
        uint256 assetsAtRequest;
        address receiver;
        bool exists;
    }

    mapping(address => WithdrawalRequest) public withdrawalRequests;
    mapping(address => uint256) public withdrawerIndex; // Track indices for O(1) removal
    address[] public pendingWithdrawers;
    mapping(address => bool) public hasPendingWithdrawal;
    uint256 public totalWithdrawalSharesNeeded;
    uint256 public totalWithdrawalAssetsNeeded;
    uint256 public totalRequestedAssets;

    // ===== Telemetry =====
    mapping(address => uint256) public poolPrincipal;
    mapping(address => uint256) public userPrincipal;
    mapping(address => uint256) public userShares;

    // ===== Performance Fee =====
    address public feeRecipient;
    uint256 public performanceFeeBps = 1000; // 10%
    
    /**
     * @dev Sets the fee recipient address
     * @param _feeRecipient The address to receive performance fees
     */
    function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Fee recipient cannot be zero address");
        feeRecipient = _feeRecipient;
    }

    // ===== Events =====
    event DepositRequested(address indexed user, address indexed receiver, uint256 assets);
    event DepositFulfilled(address indexed user, address indexed receiver, uint256 assets, uint256 shares);

    event RedeemRequested(uint256 indexed requestId, address indexed controller, address indexed owner, uint256 shares);
    event WithdrawalFulfilled(address indexed controller, address indexed receiver, uint256 shares, uint256 assets);

    event OperatorSet(address indexed controller, address indexed operator, bool approved);
    event PoolSupplied(address indexed pool, uint256 amount);
    event PoolWithdrawn(address indexed pool, uint256 requested, uint256 received);

    event PerformanceFeeSet(address indexed recipient, uint256 feeBps);

    mapping(address => mapping(address => bool)) public isOperator;
    mapping(address => mapping(address => bool)) public isOperator7540;

    modifier onlyControllerOrOperator(address controller) {
        require(msg.sender == controller || isOperator7540[controller][msg.sender], "Not controller/operator");
        _;
    }

    constructor(
        IERC20 _asset,
        string memory name_,
        string memory symbol_,
        WhitelistRegistry _registry,
        address admin
    ) ERC20(name_, symbol_) ERC4626(_asset) {
        registry = _registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ===== Operator Management =====
    function setOperator(address operator, bool approved) external {
        isOperator7540[msg.sender][operator] = approved;
        emit OperatorSet(msg.sender, operator, approved);
    }

    // ===== Performance Fee Management =====
    function setPerformanceFee(address recipient, uint256 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(feeBps < 3000, "fee too high"); // max 30%
        feeRecipient = recipient;
        performanceFeeBps = feeBps;
        emit PerformanceFeeSet(recipient, feeBps);
    }

    // ===== Accounting =====
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 allocated = 0;
        address[] memory pools = registry.getWhitelistedPools();
        address underlying = asset();

        for (uint256 i = 0; i < pools.length; i++) {
            address pool = pools[i];
            // Aave
            try IPool(pool).getReserveData(underlying) returns (DataTypes.ReserveData memory rd) {
                address aToken = rd.aTokenAddress;
                if (aToken != address(0)) {
                    allocated += IERC20(aToken).balanceOf(address(this));
                    continue;
                }
            } catch {}
            // ERC4626
            try IERC4626Like(pool).asset() returns (address erc4626Asset) {
                if (erc4626Asset == underlying) {
                    uint256 shares = IERC4626Like(pool).balanceOf(address(this));
                    if (shares != 0) {
                        allocated += IERC4626Like(pool).convertToAssets(shares);
                    }
                }
            } catch {}
        }
        return idle + allocated;
    }

    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 backingAssets = totalAssets() - pendingDepositAssets;
        return supply == 0 ? 1e18 : (backingAssets * 1e18) / supply;
    }

    function _idleBalance() internal view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    // ===== Async Deposit Flow =====
    function requestDeposit(uint256 assets, address receiver) external nonReentrant {
        require(assets > 0, "zero");
        require(!hasPendingDeposit[msg.sender], "already pending");

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);

        depositRequests[msg.sender] = DepositRequest({ assets: assets, receiver: receiver, exists: true });

        pendingDepositors.push(msg.sender);
        depositorIndex[msg.sender] = pendingDepositors.length - 1;
        hasPendingDeposit[msg.sender] = true;
        pendingDepositAssets += assets;

        emit DepositRequested(msg.sender, receiver, assets);
    }

    function _convertToSharesAtFulfillment(uint256 assets) internal view returns (uint256 shares) {
        uint256 supply = totalSupply();
        uint256 backingAssets = totalAssets() - pendingDepositAssets; // exclude pending

        if (supply == 0) {
            shares = assets; // bootstrap 1:1
        } else {
            require(backingAssets > 0, "no backing assets");
            shares = (assets * supply) / backingAssets;
        }
        require(shares > 0, "zero shares minted");
    }

    function fulfillNextDeposits(uint256 batchSize, address bestPool) external onlyRole(EXECUTOR) nonReentrant {
        // Add safety constraints
        require(batchSize > 0 && batchSize <= 5, "Invalid batch size");
        require(registry.isWhitelisted(bestPool), "Pool not whitelisted");
        
        uint256 queueLength = pendingDepositors.length;
        // Early exit if queue is empty
        if (queueLength == 0) return;
        
        uint256 processed = 0;
        uint256 i = 0;
        uint256 totalToPool = 0;
        
        // Pre-calculate expensive values once for all deposits in batch
        uint256 supply = totalSupply();
        uint256 backingAssets = totalAssets() - pendingDepositAssets;
        
        // Only require backing assets if we have supply (not bootstrap case)
        if (supply > 0) {
            require(backingAssets > 0, "no backing assets");
        }
        
        // Store indexes to remove in batch
        uint256[] memory indexesToRemove = new uint256[](batchSize);
        uint256 removeCount = 0;

        while (i < queueLength && processed < batchSize) {
            address user = pendingDepositors[i];
            DepositRequest storage req = depositRequests[user];

            if (!req.exists) {
                _removePendingDepositorAtIndex(i);
                continue;
            }

            uint256 assets = req.assets;
            address receiver = req.receiver;

            // Calculate shares using cached values
            uint256 shares;
            if (supply == 0) {
                shares = assets; // bootstrap 1:1
            } else {
                // Calculate shares based on current exchange rate
                shares = (assets * supply) / backingAssets;
                if (shares == 0) {
                    i++;
                    continue; // Skip if zero shares would be minted
                }
            }
            
            _mint(receiver, shares);

            // telemetry
            userPrincipal[receiver] += assets;
            userShares[receiver] += shares;

            emit DepositFulfilled(user, receiver, assets, shares);

            delete depositRequests[user];
            hasPendingDeposit[user] = false;
            
            // Store index to remove later in batch
            indexesToRemove[removeCount] = i;
            removeCount++;

            totalToPool += assets;
            pendingDepositAssets -= assets;

            processed++;
            i++;
        }

        // Remove processed depositors from queue (in reverse to avoid index shifting issues)
        for (uint256 j = 0; j < removeCount; j++) {
            _removePendingDepositorAtIndex(indexesToRemove[removeCount - j - 1]);
        }

        // transfer all assets to best pool in a single operation
        if (totalToPool > 0) {
            transferToPool(bestPool, totalToPool);
        }
    }

    // ===== Withdraw user assets from pending deposits =====
    function withdrawPendingDeposit(address owner) external nonReentrant returns (uint256) {
        require(hasPendingDeposit[owner], "no pending deposit");

        DepositRequest storage req = depositRequests[owner];
        require(req.exists, "invalid request");

        uint256 userAssets = req.assets;

        // Refund the user
        IERC20(asset()).safeTransfer(owner, userAssets);

        // Update state
        delete depositRequests[owner];
        hasPendingDeposit[owner] = false;

        // Remove from queue
        _removePendingDepositorAtIndex(depositorIndex[owner]);

        // Adjust aggregate telemetry
        if (pendingDepositAssets >= userAssets) {
            pendingDepositAssets -= userAssets;
        } else {
            pendingDepositAssets = 0;
        }

        return userAssets;
    }

    // ===== Async Withdraw Flow (unchanged, with fee) =====
    function requestRedeem(uint256 shares, address controller, address owner) external nonReentrant returns (uint256) {
        require(shares > 0, "zero");
        require(balanceOf(owner) >= shares, "ERC20: transfer amount exceeds balance");
        require(msg.sender == controller || isOperator7540[controller][msg.sender], "unauthorized");
        require(!hasPendingWithdrawal[controller], "already pending");

        if (owner != msg.sender) {
            _spendAllowance(owner, msg.sender, shares);
        }
        _transfer(owner, address(this), shares);

        uint256 assets = convertToAssets(shares);

        withdrawalRequests[controller] = WithdrawalRequest({
            shares: shares,
            assetsAtRequest: assets,
            receiver: owner,
            exists: true
        });

        pendingWithdrawers.push(controller);
        withdrawerIndex[controller] = pendingWithdrawers.length - 1;
        hasPendingWithdrawal[controller] = true;
        totalRequestedAssets += assets;

        emit RedeemRequested(0, controller, owner, shares);
        return 0;
    }

    function fulfillNextWithdrawals(uint256 batchSize) external onlyRole(EXECUTOR) nonReentrant {
        address[] memory pools = registry.getWhitelistedPools();
        address underlying = asset();

        uint256 processed = 0;
        uint256 i = 0;

        while (i < pendingWithdrawers.length && processed < batchSize) {
            address user = pendingWithdrawers[i];
            WithdrawalRequest storage req = withdrawalRequests[user];

            if (!req.exists) {
                _removePendingWithdrawerAtIndex(i);
                continue;
            }

            // ========= performance fee and payout calculation ========

            uint256 grossAssets = req.assetsAtRequest; // withdrawable assets (principal + yield)
            // Compute proportional principal (user's cost basis for these shares)
            // SAFETY CHECK: Handle zero userShares case to prevent division by zero
            uint256 proportionalPrincipal;
            if (userShares[user] == 0) {
                // If userShares is zero, use the full assetsAtRequest as principal
                // This means no yield will be calculated, and no fee will be charged
                proportionalPrincipal = grossAssets;
            } else {
                // Normal calculation when userShares is not zero
                proportionalPrincipal = (userPrincipal[user] * req.shares) / userShares[user];
            }

            uint256 yieldAmount = grossAssets > proportionalPrincipal ? grossAssets - proportionalPrincipal : 0;

            uint256 fee = (yieldAmount * performanceFeeBps) / 10_000;
            uint256 payout = grossAssets - fee;

            // ========= end of performance fee and payout calculation ========

            // Calculate how much we need to withdraw, considering both the withdrawal amount and pending deposits
            uint256 idleBalance = _idleBalance();
            
            // We need to ensure we have enough idle assets for both this withdrawal and pending deposits
            // Reserve the pending deposit assets and ensure we have enough for this withdrawal
            uint256 availableForWithdrawal = idleBalance > pendingDepositAssets ? idleBalance - pendingDepositAssets : 0;
            
            // If available balance is less than what we need for this withdrawal, withdraw from pools
            if (availableForWithdrawal < grossAssets) {
                bool fullyWithdrawn = _withdrawFromPoolsAsNeeded(pools, underlying, grossAssets - availableForWithdrawal);
                
                // Verify we have enough liquidity after withdrawal from pools
                if (!fullyWithdrawn) {
                    // We couldn't withdraw enough from pools, check if we have enough idle assets now
                    uint256 currentIdleBalance = _idleBalance();
                    require(currentIdleBalance >= grossAssets, "not enough liquidity");
                }
            }

            // ========= withdrawal logic ========

            uint256 escrowedShares = req.shares;
            address receiver = req.receiver;

            // burn and transfer
            _burn(address(this), escrowedShares);

            if (fee > 0 && feeRecipient != address(0)) {
                IERC20(underlying).safeTransfer(feeRecipient, fee);
            }
            IERC20(underlying).safeTransfer(receiver, payout);

            // telemetry updates
            userPrincipal[user] = userPrincipal[user] > proportionalPrincipal
                ? userPrincipal[user] - proportionalPrincipal
                : 0;
            userShares[user] = userShares[user] > escrowedShares ? userShares[user] - escrowedShares : 0;

            delete withdrawalRequests[user];
            hasPendingWithdrawal[user] = false;
            _removePendingWithdrawerAtIndex(i);

            totalRequestedAssets = totalRequestedAssets > grossAssets ? totalRequestedAssets - grossAssets : 0;

            emit WithdrawalFulfilled(user, receiver, escrowedShares, grossAssets);

            processed++;
        }
    }

    // ===== Queue Helpers =====
    function _removePendingDepositorAtIndex(uint256 idx) internal {
        uint256 len = pendingDepositors.length;
        if (idx >= len) return;

        address userToMove = pendingDepositors[len - 1];
        pendingDepositors[idx] = userToMove;
        depositorIndex[userToMove] = idx;

        pendingDepositors.pop();
    }

    function _removePendingWithdrawerAtIndex(uint256 idx) internal {
        uint256 len = pendingWithdrawers.length;
        if (idx >= len) return;
        
        // Get addresses for index updates
        address userToRemove = pendingWithdrawers[idx];
        address userToMove = pendingWithdrawers[len - 1];
        
        // Update the moved user's index if not the same as the removed one
        if (idx != len - 1) {
            pendingWithdrawers[idx] = userToMove;
            withdrawerIndex[userToMove] = idx;
        }
        
        // Remove the last element and clear the index mapping
        pendingWithdrawers.pop();
        delete withdrawerIndex[userToRemove];
    }

    function redeemQueueLength() external view returns (uint256) {
        return pendingWithdrawers.length;
    }

    function redeemQueueAt(uint256 index) external view returns (address controller, uint256 shares) {
        WithdrawalRequest storage req = withdrawalRequests[pendingWithdrawers[index]];
        return (pendingWithdrawers[index], req.shares);
    }

    function depositQueueLength() external view returns (uint256) {
        return pendingDepositors.length;
    }

    function depositQueueAt(uint256 index) external view returns (address depositor, uint256 assets) {
        DepositRequest storage req = depositRequests[pendingDepositors[index]];
        return (pendingDepositors[index], req.assets);
    }

    // ===== Preview Overrides =====
    function previewRedeem(uint256) public pure override returns (uint256) {
        revert("ERC7540: async redeem only");
    }

    function previewWithdraw(uint256) public pure override returns (uint256) {
        revert("ERC7540: async withdraw only");
    }

    function deposit(uint256, address) public pure override returns (uint256) {
        revert("ERC7540: async deposit only");
    }

    // ===== Pool Interactions =====
    function transferToPool(address pool, uint256 amount) public onlyRole(EXECUTOR) {
        require(registry.isWhitelisted(pool), "not whitelisted");
        IERC20(asset()).safeIncreaseAllowance(pool, amount);
        if (registry.getPoolKind(pool) == WhitelistRegistry.PoolKind.AAVE) {
            IPool(pool).supply(asset(), amount, address(this), 0);
        } else {
            IERC4626Like(pool).deposit(amount, address(this));
        }
        poolPrincipal[pool] += amount;
        emit PoolSupplied(pool, amount);
    }

    function withdrawFromPool(address pool, uint256 amount) external onlyRole(EXECUTOR) nonReentrant {
        require(registry.isWhitelisted(pool), "not whitelisted");
        uint256 received;
        if (registry.getPoolKind(pool) == WhitelistRegistry.PoolKind.AAVE) {
            received = IPool(pool).withdraw(asset(), amount, address(this));
        } else {
            received = IERC4626Like(pool).withdraw(amount, address(this), address(this));
        }
        uint256 p = poolPrincipal[pool];
        poolPrincipal[pool] = received >= p ? 0 : (p - received);
        emit PoolWithdrawn(pool, amount, received);
    }

    function _withdrawFromPoolsAsNeeded(address[] memory pools, address underlying, uint256 shortfall) internal returns (bool) {
        uint256 remaining = shortfall;
        // Initial shortfall used for logging/debugging if needed
        // uint256 initialShortfall = shortfall;
        bool fullyWithdrawn = false;
        
        for (uint256 j = 0; j < pools.length && remaining > 0; j++) {
            address pool = pools[j];
            if (!registry.isWhitelisted(pool)) continue;
            
            // Get balance before withdrawal to accurately track received amount
            uint256 balanceBefore = IERC20(underlying).balanceOf(address(this));
            
            // Attempt to withdraw from pool
            if (registry.getPoolKind(pool) == WhitelistRegistry.PoolKind.AAVE) {
                try IPool(pool).withdraw(underlying, remaining, address(this)) returns (uint256 /* received */) {
                    // Update accounting based on actual received amount
                    uint256 actualReceived = IERC20(underlying).balanceOf(address(this)) - balanceBefore;
                    
                    // Update pool principal
                    uint256 p = poolPrincipal[pool];
                    poolPrincipal[pool] = actualReceived >= p ? 0 : (p - actualReceived);
                    
                    // Update remaining shortfall
                    remaining = actualReceived >= remaining ? 0 : remaining - actualReceived;
                    
                    emit PoolWithdrawn(pool, remaining + actualReceived, actualReceived);
                } catch {
                    // Continue to next pool if withdrawal fails
                    continue;
                }
            } else {
                try IERC4626Like(pool).withdraw(remaining, address(this), address(this)) returns (uint256 /* received */) {
                    // Update accounting based on actual received amount
                    uint256 actualReceived = IERC20(underlying).balanceOf(address(this)) - balanceBefore;
                    
                    // Update pool principal
                    uint256 p = poolPrincipal[pool];
                    poolPrincipal[pool] = actualReceived >= p ? 0 : (p - actualReceived);
                    
                    // Update remaining shortfall
                    remaining = actualReceived >= remaining ? 0 : remaining - actualReceived;
                    
                    emit PoolWithdrawn(pool, remaining + actualReceived, actualReceived);
                } catch {
                    // Continue to next pool if withdrawal fails
                    continue;
                }
            }
        }
        
        // Check if we were able to withdraw the full amount needed
        fullyWithdrawn = (remaining == 0);
        return fullyWithdrawn;
    }

    // ===== ERC-165 =====
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return interfaceId == 0x620ee8e4 || super.supportsInterface(interfaceId);
    }
}
