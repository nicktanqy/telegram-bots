#!/usr/bin/env node

/**
 * Test script to verify the Telegram API error fix
 */

console.log('🧪 Testing Telegram API Error Fix\n');

// Test the improved error handling by simulating a bad response
async function testTelegramErrorHandling() {
    console.log('Test 1: Simulating Telegram API error handling...');
    
    // Mock environment with a test bot token
    const mockEnv = {
        BOT_TOKEN: '7883050713:AAExYcUfhEj-n_d9ipFZ2ZZZ5qPc-eIVHVU'
    };
    
    // Mock fetch function that simulates a 400 Bad Request error
    global.fetch = async (url, options) => {
        console.log(`📤 Mock fetch called with URL: ${url}`);
        console.log(`📤 Mock fetch options: ${JSON.stringify(options, null, 2)}`);
        
        // Simulate a 400 Bad Request response
        return {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => JSON.stringify({
                ok: false,
                error_code: 400,
                description: "Bad Request: chat not found"
            })
        };
    };
    
    // Import the sendMessage function from services.js
    const { ProfileService } = await import('./src/services.js');
    
    try {
        await ProfileService.sendMessage(mockEnv, 123456, "Test message");
        console.log('❌ Test failed: Expected an error but none was thrown');
    } catch (error) {
        console.log(`✅ Test passed: Caught expected error: ${error.message}`);
        console.log('✅ Error handling is working correctly!');
    }
}

// Run the test
testTelegramErrorHandling().catch(console.error);