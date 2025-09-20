// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPool
 * @dev A mock implementation of a yield-generating pool for testing purposes
 * This contract simulates yield generation by allowing the owner to add rewards
 */
contract MockPool is Ownable {
    IERC20 public asset;
    uint256 public yieldRate = 500; // 5% yield (in basis points)
    uint256 public constant BASIS_POINTS = 10000;
    
    mapping(address => uint256) public userDeposits;
    mapping(address => uint256) public depositTimestamps;
    uint256 public totalDeposits;
    
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 yield);
    event YieldRateUpdated(uint256 newRate);
    event YieldAdded(uint256 amount);
    
    constructor(address _asset) Ownable(msg.sender) {
        asset = IERC20(_asset);
    }
    
    /**
     * @dev Simulates depositing assets into the pool
     * @param amount The amount to deposit
     */
    function deposit(uint256 amount) external {
        // Transfer tokens from sender to this contract
        asset.transferFrom(msg.sender, address(this), amount);
        
        // Update user's deposit info
        userDeposits[msg.sender] += amount;
        depositTimestamps[msg.sender] = block.timestamp;
        totalDeposits += amount;
        
        emit Deposited(msg.sender, amount);
    }
    
    /**
     * @dev Simulates withdrawing assets from the pool with yield
     * @param amount The amount to withdraw
     */
    function withdraw(uint256 amount) external {
        require(userDeposits[msg.sender] >= amount, "Insufficient deposit");
        
        // Calculate yield based on time and yield rate
        uint256 timeElapsed = block.timestamp - depositTimestamps[msg.sender];
        uint256 yieldAmount = calculateYield(amount, timeElapsed);
        
        // Update user's deposit info
        userDeposits[msg.sender] -= amount;
        totalDeposits -= amount;
        
        // Transfer principal + yield to user
        asset.transfer(msg.sender, amount + yieldAmount);
        
        emit Withdrawn(msg.sender, amount, yieldAmount);
    }
    
    /**
     * @dev Calculates yield based on amount, time, and yield rate
     * @param amount The principal amount
     * @param timeElapsed Time elapsed since deposit in seconds
     * @return The yield amount
     */
    function calculateYield(uint256 amount, uint256 timeElapsed) public view returns (uint256) {
        // Simple yield calculation: principal * rate * time (in years)
        // 31536000 seconds = 1 year
        return amount * yieldRate * timeElapsed / (BASIS_POINTS * 31536000);
    }
    
    /**
     * @dev Updates the yield rate (owner only)
     * @param newRate The new yield rate in basis points (e.g., 500 = 5%)
     */
    function setYieldRate(uint256 newRate) external onlyOwner {
        require(newRate <= 10000, "Rate too high");
        yieldRate = newRate;
        emit YieldRateUpdated(newRate);
    }
    
    /**
     * @dev Adds yield to the pool (simulates external yield source)
     * @param amount The amount of yield to add
     */
    function addYield(uint256 amount) external {
        asset.transferFrom(msg.sender, address(this), amount);
        emit YieldAdded(amount);
    }
    
    /**
     * @dev Returns the total balance including yield
     */
    function totalBalance() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }
}
