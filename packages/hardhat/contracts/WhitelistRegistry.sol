// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

// DataTypes struct needed for the IPool interface
interface DataTypes {
    enum InterestRateMode { NONE, STABLE, VARIABLE }
    
    struct ReserveConfigurationMap {
        uint256 data;
    }
    
    struct ReserveData {
        ReserveConfigurationMap configuration;
        uint128 liquidityIndex;
        uint128 currentLiquidityRate;
        uint128 variableBorrowIndex;
        uint128 currentVariableBorrowRate;
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        uint16 id;
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
        uint128 accruedToTreasury;
        uint128 unbacked;
        uint128 isolationModeTotalDebt;
    }
    
    struct UserConfigurationMap {
        uint256 data;
    }
    
    struct EModeCategory {
        uint16 ltv;
        uint16 liquidationThreshold;
        uint16 liquidationBonus;
        address priceSource;
        string label;
    }
}

interface IPoolAddressesProvider {
    // Minimal interface needed for IPool
}

// Aave style pool interface : hyperrfi, hyperlend, etc
interface IPool {
    // Basic functions used by our contracts
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    
    // Additional functions from the ABI
    function supplyWithPermit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external;
    
    // View functions
    function getReserveData(address asset) external view returns (DataTypes.ReserveData memory);
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    );
    function getReservesList() external view returns (address[] memory);
    
    // Constants
    function ADDRESSES_PROVIDER() external view returns (IPoolAddressesProvider);
    function POOL_REVISION() external view returns (uint256);
}


// Minimal ERC-4626 interface (local, non-breaking) : felix pool
interface IERC4626Like {

    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);

    function balanceOf(address owner) external view returns (uint256);
    function asset() external view returns (address);

    /// @notice Deposit underlying `assets` and mint shares to `receiver`.
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /// @notice Withdraw `assets` of underlying to `receiver`, burning shares from `owner`.
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
}


contract WhitelistRegistry is AccessControl {
    bytes32 public constant GOVERNOR = keccak256("GOVERNOR");
    mapping(address => bool) public isWhitelisted;

    event PoolStatusChanged(address indexed pool, bool allowed);
    constructor(address governor) {
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GOVERNOR, governor);
    }

    // struct of pool kinds in registry : Aave, ERC4626 
    enum PoolKind { AAVE, ERC4626 }
    
    // Array to track all whitelisted pools
    address[] private whitelistedPoolsArray;

    // Mapping of pool to its kind
    mapping(address => PoolKind) public poolKind;

    function setPool(address pool, bool allowed, PoolKind kind) external onlyRole(GOVERNOR) {
        // If we're adding a pool that wasn't previously whitelisted
        if (allowed && !isWhitelisted[pool]) {
            whitelistedPoolsArray.push(pool);
        }

        poolKind[pool] = kind;
        
        isWhitelisted[pool] = allowed;
        emit PoolStatusChanged(pool, allowed);
    }

    // get pool kind
    function getPoolKind(address pool) external view returns (PoolKind) {
        return poolKind[pool];
    }
    
    // Function to get all whitelisted pools
    function getWhitelistedPools() external view returns (address[] memory) {
        uint256 count = 0;
        
        // First count how many whitelisted pools we have
        for (uint256 i = 0; i < whitelistedPoolsArray.length; i++) {
            if (isWhitelisted[whitelistedPoolsArray[i]]) {
                count++;
            }
        }
        
        // Create result array of the correct size
        address[] memory result = new address[](count);
        uint256 resultIndex = 0;
        
        // Fill result array with whitelisted pools
        for (uint256 i = 0; i < whitelistedPoolsArray.length; i++) {
            if (isWhitelisted[whitelistedPoolsArray[i]]) {
                result[resultIndex] = whitelistedPoolsArray[i];
                resultIndex++;
            }
        }
        
        return result;
    }
}