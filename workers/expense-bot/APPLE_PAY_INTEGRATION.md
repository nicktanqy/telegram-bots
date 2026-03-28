# Apple Pay Integration for Cloudflare Workers Bot

This document explains how the Apple Pay integration works with your Cloudflare Workers expense tracking bot.

## Overview

The Apple Pay integration automatically detects and processes Apple Pay transaction messages sent to your bot. When you make an Apple Pay transaction, your iPhone's Shortcuts automation will send a message in the format:

```
Spent $15 at Starbucks on 2026-03-26
```

The bot will automatically parse this message, extract the transaction details, and record it as an expense.

## How It Works

### 1. Message Detection

The bot uses regex pattern matching to detect Apple Pay messages:

```javascript
const pattern = /^Spent\s+\$(\d+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4})-(\d{2})-(\d{2})/;
```

This pattern matches messages in the exact format: `Spent $AMOUNT at MERCHANT on YYYY-MM-DD`

### 2. Data Extraction

When a match is found, the bot extracts:
- **Amount**: The transaction amount (must be positive)
- **Merchant**: The store/business name
- **Date**: The transaction date (already in YYYY-MM-DD format)

### 3. Validation

The bot validates:
- Amount must be a positive number
- Date must be in valid YYYY-MM-DD format
- Date must be within reasonable range (100-year range: 1976-2076)

### 4. Expense Recording

Valid transactions are automatically recorded with:
- **Amount**: Extracted amount
- **Merchant**: Merchant name (preserves merchant info for future features)
- **Description**: `"Apple Pay transaction on {date}"`

## Usage

### Setup Requirements

1. **User Profile**: Users must complete the initial setup (`/start`) before Apple Pay transactions can be processed
2. **Shortcuts Automation**: Set up iPhone Shortcuts to send transaction messages to your bot

### Example Workflow

1. **User makes Apple Pay transaction** at Starbucks for $15
2. **Shortcuts automation** sends: `"Spent $15 at Starbucks on 2026-03-26"`
3. **Bot detects** the Apple Pay message format
4. **Bot parses** and validates the transaction data
5. **Bot records** the expense automatically
6. **Bot responds** with confirmation:

```
✅ **Apple Pay Transaction Recorded**
━━━━━━━━━━━━━━━━
Amount: $15.00
Merchant: Starbucks
Date: 2026-03-26
Description: Apple Pay transaction on 2026-03-26

Your expense has been automatically added to your tracking!
```

## Integration Points

### Primary Detection
- **Location**: `handleMenuChoice()` method
- **Purpose**: Main entry point for Apple Pay message detection
- **Behavior**: Processes messages when user is in main menu state

### Fallback Detection
- **Location**: `handleWebhook()` method
- **Purpose**: Catches Apple Pay messages during active conversation flows
- **Behavior**: Processes messages even when user is in the middle of other operations

## Error Handling

The integration includes comprehensive error handling:

### Invalid Messages
- Messages that don't match the expected format are ignored
- Bot continues normal operation without interruption

### Validation Errors
- Negative amounts are rejected
- Invalid date formats are rejected
- Invalid numeric values are rejected

### User Not Initialized
- Users without completed profile setup receive helpful error message
- Bot guides user to complete setup with `/start`

### Processing Errors
- Database errors trigger user-friendly error messages
- Bot logs detailed error information for debugging

## Testing

A comprehensive test suite is available in `test_apple_pay.js`:

```bash
node test_apple_pay.js
```

The test suite validates:
- ✅ Valid message parsing
- ✅ Invalid message rejection
- ✅ Edge case handling
- ✅ Error condition responses

## Message Format Examples

### Valid Examples
```
Spent $15 at Starbucks on 2026-03-26
Spent $5.00 at McDonald's on 2026-03-25
Spent $100.00 at Amazon on 2026-03-20
Spent $0.50 at Vending Machine on 2026-03-26
Spent $25.75 at Target on 2025-12-15
Spent $120.00 at Best Buy on 2027-01-01
```

### Invalid Examples
```
Spent $-10.00 at Store on 2026-03-26    # Negative amount
Spent $abc at Store on 2026-03-26       # Invalid amount
Invalid message format                  # Wrong format
Spent $10.00 at Store                   # Missing date
Spent $10.00 at Store on 2026/03/26     # Wrong separator
Spent $15 at Starbucks on 2026-03-32    # Invalid day
```

## Configuration

No additional configuration is required. The integration is automatically enabled when the bot starts.

## Benefits

1. **Automatic**: No manual input required for Apple Pay transactions
2. **Accurate**: Uses exact transaction data from Apple Pay
3. **Seamless**: Works alongside existing manual expense tracking
4. **Robust**: Comprehensive validation and error handling
5. **User-Friendly**: Clear confirmation messages and error feedback

## Merchant Preservation

The integration preserves merchant information instead of using generic categories. This enables future features like:
- Merchant-based spending analytics
- Automatic merchant categorization
- Merchant-specific spending limits
- Merchant loyalty tracking

## Troubleshooting

### Common Issues

1. **Message Not Detected**
   - Ensure message format matches exactly: `Spent $AMOUNT at MERCHANT on YYYY-MM-DD`
   - Check that user has completed profile setup

2. **Transaction Not Recorded**
   - Verify amount is positive
   - Check date format is YYYY-MM-DD
   - Ensure bot has write permissions to user data

3. **Error Messages**
   - Check bot logs for detailed error information
   - Verify user profile is properly initialized

### Debug Mode

For debugging, use the `/show_data` command (developer access only) to inspect user data and transaction history.

## Migration from Python Bot

This Cloudflare Workers implementation maintains full compatibility with the original Python bot while adding:

- **Merchant Preservation**: Uses merchant field instead of category
- **Enhanced Error Handling**: Comprehensive validation and error reporting
- **Cloudflare KV Integration**: Optimized for Cloudflare Workers environment
- **Modern JavaScript**: ES6+ syntax and async/await patterns

All existing functionality is preserved while adding the new merchant-based expense tracking capabilities.