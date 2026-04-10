# Apple Pay API Security Implementation

## Overview

The Apple Pay endpoint (`/apple-pay`) has been updated to use secure header-based authentication instead of passing the bot token in the request payload.

## Security Improvements

### Before (Insecure)
- Bot token passed in JSON payload: `{"bot_token": "secret", "chat_id": 123, "text": "..."}`

### After (Secure)
- API key passed in HTTP header: `X-API-Key: your-api-key`
- Timestamp for replay attack prevention: `X-Timestamp: 1649123456789`

## New Authentication Requirements

### Required Headers

1. **X-API-Key** (Required)
   - Your secure API key for authentication
   - Must match the `APPLE_PAY_API_KEY` environment variable
   - Uses SHA-256 hashing with timing-safe comparison

2. **X-Timestamp** (Required)
   - Current timestamp in ISO 8601 format
   - Prevents replay attacks by rejecting requests older than 5 minutes
   - Format: `2026-04-10T19:30:00Z` (use `new Date().toISOString()` in JavaScript)

### Required JSON Body

```json
{
  "chat_id": 123456789,
  "text": "Spent $15.99 at Starbucks on 2026-03-26"
}
```

## Environment Configuration

### Development (.env)
```env
BOT_TOKEN=7883050713:AAExYcUfhEj-n_d9ipFZ2ZZZ5qPc-eIVHVU
APPLE_PAY_API_KEY=your-secure-api-key-here-change-this-in-production
```

### Production (Cloudflare Workers)
Set via wrangler secret:
```bash
wrangler secret put APPLE_PAY_API_KEY
```

## iOS Shortcut Configuration

### 1. Update the Shortcut

Replace your existing Apple Pay automation shortcut with the new configuration:

#### Action 1: Get Clipboard
- **Action**: Get Clipboard
- **Store result in**: `clipboardText`

#### Action 2: Get Current Date
- **Action**: Get Current Date
- **Store result in**: `currentDate`

#### Action 3: Get Chat ID
- **Action**: Ask for Input
- **Prompt**: "Enter your Telegram Chat ID"
- **Store result in**: `chatId`

#### Action 4: Get API Key
- **Action**: Ask for Input
- **Prompt**: "Enter your Apple Pay API Key"
- **Store result in**: `apiKey`

#### Action 5: Get Timestamp
- **Action**: Get Current Date
- **Action**: Format Date → Custom → `yyyy-MM-dd'T'HH:mm:ss'Z'` (ISO 8601 format)
- **Store result in**: `timestamp`

#### Action 6: URL Encode Text
- **Action**: Text → Replace Text
- **Find**: ` ` (space)
- **Replace**: `%20`
- **Text**: `clipboardText`
- **Store result in**: `encodedText`

#### Action 7: Create JSON Body
- **Action**: Text
- **Content**:
```
{
  "chat_id": {{chatId}},
  "text": "{{encodedText}}"
}
```
- **Store result in**: `jsonBody`

#### Action 8: Make HTTP Request
- **Action**: Get Contents of URL
- **URL**: `https://billy-bot.workers.dev/apple-pay`
- **Method**: POST
- **Headers**:
  - `Content-Type: application/json`
  - `X-API-Key: {{apiKey}}`
  - `X-Timestamp: {{timestamp}}`
- **Body**: `{{jsonBody}}`
- **Store result in**: `response`

#### Action 9: Show Result
- **Action**: Show Result
- **Text**: `{{response}}`

### 2. Generate a Secure API Key

For iOS Shortcuts, generate a secure API key:

1. Use a password manager to generate a 32-character random string
2. Example: `a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6`
3. Set this as your `APPLE_PAY_API_KEY` in the environment

### 3. Security Best Practices

#### For iOS Keychain Storage
- Store your API key in iOS Keychain instead of plain text
- Use the "Get Password" action to retrieve it securely

#### For Multiple Users
- Each user should have their own unique API key
- Store keys in a secure database or environment variable manager

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Missing API key. Please provide X-API-Key header."
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

```json
{
  "success": false,
  "error": "Request timestamp expired. Please retry."
}
```

### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing chat_id"
}
```

## Migration Guide

### For Existing iOS Shortcuts

1. **Update the HTTP Request action**:
   - Add `X-API-Key` header with your API key
   - Add `X-Timestamp` header with current timestamp
   - Remove `bot_token` from JSON body

2. **Update JSON body**:
   - Remove `bot_token` field
   - Keep `chat_id` and `text` fields

### Example Migration

**Before:**
```json
{
  "bot_token": "7883050713:AAExYcUfhEj-n_d9ipFZ2ZZZ5qPc-eIVHVU",
  "chat_id": 123456789,
  "text": "Spent $15.99 at Starbucks on 2026-03-26"
}
```

**After:**
```json
{
  "chat_id": 123456789,
  "text": "Spent $15.99 at Starbucks on 2026-03-26"
}
```

**Headers:**
```
X-API-Key: your-secure-api-key
X-Timestamp: 2026-04-10T19:30:00Z
```

## Security Benefits

1. **No Token Exposure**: API key not logged in request bodies
2. **Replay Attack Prevention**: Timestamp validation prevents request replay
3. **Timing Attack Resistance**: Uses timing-safe comparison for key validation
4. **Separation of Concerns**: Different keys for different purposes
5. **Easy Rotation**: API keys can be changed without affecting bot functionality

## Testing

Run the updated test suite:
```bash
cd workers/expense-bot
node tests/apple-pay-endpoint.test.js
```

All 12 tests should pass, including:
- Missing API key validation
- Invalid API key rejection
- Timestamp validation
- Replay attack prevention
- Successful transaction processing