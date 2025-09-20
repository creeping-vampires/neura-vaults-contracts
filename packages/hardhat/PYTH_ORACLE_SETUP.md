# Pyth Oracle Configuration Guide

This guide explains how to configure the Pyth oracle for the YieldAllocatorVault contract to enable AUM (Assets Under Management) tracking in USD.

## Prerequisites

1. Deployed YieldAllocatorVault contract
2. Admin access to the YieldAllocatorVault (DEFAULT_ADMIN_ROLE)
3. Pyth oracle contract deployed on your target network

## Environment Variables

Add the following environment variables to your `.env` file:

```
# Existing contract addresses
YIELD_ALLOCATOR_VAULT_ADDRESS=0x3c297523DE2aF8210368b09c24aAD823718a2baA

# Pyth oracle configuration
PYTH_ORACLE_ADDRESS=0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
ASSET_ADDRESS=0x6C09F6727113543Fd061a721da512B7eFCDD0267
ASSET_PRICE_ID=0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722
```

### Notes on Environment Variables

- `YIELD_ALLOCATOR_VAULT_ADDRESS`: The address of your deployed YieldAllocatorVault contract
- `PYTH_ORACLE_ADDRESS`: The address of the Pyth oracle contract on your network
  - Hyperliquid Mainnet: `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`
- `ASSET_ADDRESS`: The address of the asset token (e.g., USDe)
- `ASSET_PRICE_ID`: The Pyth price ID for the asset (in bytes32 format)
  - USDe/USD: `0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722`

## Running the Configuration Script

Execute the following command to configure the Pyth oracle:

```bash
yarn deploy --tags ConfigurePythOracle --network hype-mainnet
```

## Verifying the Configuration

After running the script, you can verify the configuration by calling the following view functions on the YieldAllocatorVault contract:

1. `pyth()` - Should return the Pyth oracle address
2. `priceIdForAsset(assetAddress)` - Should return the price ID for the specified asset

## Using the AUM Tracking

Once configured, you can call the `totalAumUsd(maxPriceAge)` function on the YieldAllocatorVault contract to get the total AUM in USD (with 18 decimals).

Example:
```typescript
// Get total AUM with prices no older than 1 hour
const maxPriceAge = 3600; // 1 hour in seconds
const totalAumUsd = await yieldAllocatorVault.totalAumUsd(maxPriceAge);
console.log(`Total AUM: $${ethers.formatUnits(totalAumUsd, 18)}`);
```

## Troubleshooting

If you encounter any issues:

1. Ensure your account has the DEFAULT_ADMIN_ROLE on the YieldAllocatorVault contract
2. Verify that the Pyth oracle address is correct for your network
3. Check that the price ID is valid for your asset
4. Make sure the asset address matches the token used by your vault

For Pyth price feed IDs, refer to the [Pyth Network Price Feed IDs](https://pyth.network/price-feeds/) documentation.
