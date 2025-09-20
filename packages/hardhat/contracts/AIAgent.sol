// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./YieldAllocatorVault.sol";
import "./WhitelistRegistry.sol";

/**
 * @title AIAgent
 * @notice Executor agent that manages pool allocations and processes FIFO async withdraws.
 */
contract AIAgent is AccessControl {
    YieldAllocatorVault public vault;
    WhitelistRegistry public registry;
    bytes32 public constant EXECUTOR = keccak256("EXECUTOR");

    constructor(
        YieldAllocatorVault _vault,
        WhitelistRegistry _registry,
        address executor
    ) {
        vault = _vault;
        registry = _registry;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR, executor);
    }

    modifier onlyExecutor() {
        require(hasRole(EXECUTOR, msg.sender), "Not executor");
        _;
    }
    modifier onlyAllowedPool(address pool) {
        require(registry.isWhitelisted(pool), "Pool not whitelisted");
        _;
    }

    // ===== Pool Management =====

    function depositToPool(address pool, uint256 amount) external onlyExecutor onlyAllowedPool(pool) {
        vault.transferToPool(pool, amount);
    }

    function withdrawFromPool(address pool, uint256 amount) external onlyExecutor onlyAllowedPool(pool) {
        vault.withdrawFromPool(pool, amount);
    }

    function claimAndReinvest(address pool) external onlyExecutor onlyAllowedPool(pool) {
        uint256 amount = 1e15; // 0.001 units

        uint256 principal = vault.poolPrincipal(pool);
        require(principal >= amount, "Insufficient pool principal");

        IERC20 asset = IERC20(vault.asset());

        uint256 balanceBefore = asset.balanceOf(address(vault));
        vault.withdrawFromPool(pool, amount);
        uint256 balanceAfter = asset.balanceOf(address(vault));
        require(balanceAfter >= balanceBefore, "Vault balance decreased unexpectedly");
        uint256 actualWithdrawn = balanceAfter - balanceBefore;

        vault.transferToPool(pool, actualWithdrawn);

        emit YieldReinvested(pool, amount, actualWithdrawn);
    }

    // ==== Deposit Fulfillment ====
    // @notice Process up to `batchSize` requests from the FIFO deposit queue. It also transfers all pending idle assets to the best pool.
    function fullfillBatchDeposits(uint256 batchSize, address bestPool) external onlyExecutor {
        vault.fulfillNextDeposits(batchSize, bestPool);
    }

    // ===== Withdrawal Fulfillment =====

    // @notice Process up to `batchSize` requests from the FIFO redeem queue.
    function fulfillBatchWithdrawals(uint256 batchSize) external onlyExecutor {
        vault.fulfillNextWithdrawals(batchSize);
    }

    // ===== Events =====
    event YieldReinvested(address indexed pool, uint256 withdrawnAmount, uint256 reinvestedAmount);
}
