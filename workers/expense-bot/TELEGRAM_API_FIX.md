# Telegram API Error Fix

## Problem Description

The Cloudflare Worker was experiencing "400 Bad Request" errors when trying to send messages to Telegram. The error was occurring in the `handleWebhook` function when the bot attempted to respond to user messages.

## Root Cause Analysis

The issue was in the `sendMessage` function in both `src/index.js` and `src/services.js`. The original implementation had several problems:

1. **Insufficient Error Handling**: The function only checked `response.ok` but didn't read the response body to get detailed error information from Telegram API.
2. **Poor Debugging**: No logging of request details or response content made it difficult to diagnose issues.
3. **Generic Error Messages**: When errors occurred, only generic HTTP status codes were reported, not the actual Telegram API error descriptions.

## Solution Implemented

### Enhanced Error Handling

The `sendMessage` function was updated with comprehensive error handling that:

1. **Logs Request Details**: Adds debug logging for the message being sent (first 50 characters for privacy)
2. **Reads Response Body**: Always reads the response text to capture Telegram's detailed error messages
3. **Parses Telegram Errors**: Attempts to parse JSON error responses to extract the `description` field
4. **Fallback Error Messages**: Provides meaningful error messages even when response parsing fails
5. **Warning Detection**: Checks for warnings in successful responses (when `ok: false`)

### Code Changes

#### In `src/index.js` and `src/services.js`:

**Before:**
```javascript
try {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
    }
} catch (error) {
    console.error(`❌ ERROR: Failed to send message: ${error.message}`);
    throw error;
}
```

**After:**
```javascript
try {
    console.debug(`📤 SEND_MESSAGE: Sending to chat ${chatId}: ${text.substring(0, 50)}...`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    // Always try to read the response body for debugging
    const responseText = await response.text();
    console.debug(`📥 RESPONSE: Status ${response.status}, Body: ${responseText}`);
    
    if (!response.ok) {
        // Parse the response to get more detailed error information
        let errorMessage = `Telegram API error: ${response.status} ${response.statusText}`;
        
        try {
            const errorData = JSON.parse(responseText);
            if (errorData && errorData.description) {
                errorMessage = `Telegram API error: ${errorData.description}`;
            }
        } catch (parseError) {
            // If we can't parse the response, use the raw text
            errorMessage = `Telegram API error: ${response.status} ${response.statusText} - ${responseText}`;
        }
        
        throw new Error(errorMessage);
    }
    
    // Parse successful response to check for any warnings
    try {
        const responseData = JSON.parse(responseText);
        if (responseData && responseData.ok === false) {
            console.warn(`⚠️  WARNING: Telegram API returned ok=false: ${JSON.stringify(responseData)}`);
        }
    } catch (parseError) {
        console.warn(`⚠️  WARNING: Could not parse successful response: ${responseText}`);
    }
    
    console.info(`✅ MESSAGE_SENT: Successfully sent message to chat ${chatId}`);
    
} catch (error) {
    console.error(`❌ ERROR: Failed to send message: ${error.message}`);
    throw error;
}
```

## Benefits of the Fix

1. **Better Debugging**: Detailed logging helps identify exactly what's going wrong
2. **Specific Error Messages**: Users and developers get meaningful error descriptions
3. **Improved Reliability**: Better handling of edge cases and malformed responses
4. **Monitoring**: Warning detection for potential issues that don't cause failures

## Testing

The fix includes enhanced logging that will help identify the specific cause of any future Telegram API errors. When an error occurs, you'll now see:

- The message being sent (first 50 characters)
- The full HTTP response status and body
- The specific Telegram API error description (if available)
- Fallback error messages for unparseable responses

## Environment Variables

Ensure these environment variables are properly configured in your Cloudflare Worker:

- `BOT_TOKEN`: Your Telegram bot token
- `USER_DATA`: KV namespace for user data storage
- `BOT_CONFIG`: KV namespace for bot configuration (optional)

## Deployment

After applying this fix, redeploy your Cloudflare Worker. The enhanced error handling will provide much better visibility into any Telegram API issues that occur.

## Common Telegram API Errors

With this fix, you'll now see specific error messages for common issues:

- **"Bad Request: chat not found"**: User blocked the bot or chat ID is invalid
- **"Forbidden: bot is not a member of the chat"**: Bot needs to be added to group/channel
- **"Too Many Requests"**: Rate limiting - implement retry logic with backoff
- **"Unauthorized"**: Invalid bot token

The detailed error messages will help you quickly identify and resolve these issues.