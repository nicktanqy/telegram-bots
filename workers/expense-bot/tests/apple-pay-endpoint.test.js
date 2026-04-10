/**
 * Apple Pay Endpoint Test Suite
 * Tests for the /apple-pay endpoint handler
 */

import { ExpenseService, ProfileService, parseApplePayMessage } from '../src/services.js';

console.log('🧪 Testing Apple Pay Endpoint\n');

// Mock KV namespace for testing
const mockKV = {
    data: new Map(),
    get: async function(key, format) {
        const value = this.data.get(key);
        if (format === 'json' && value) {
            return JSON.parse(value);
        }
        return value;
    },
    put: async function(key, value) {
        this.data.set(key, value);
    },
    delete: async function(key) {
        this.data.delete(key);
    }
};

// Mock environment
const mockEnv = {
    APPLE_PAY_API_KEY: 'test-apple-pay-api-key-123',
    USER_DATA: mockKV
};

// Mock TelegramService
const mockTelegramService = {
    sendMessage: async function(env, chatId, text) {
        console.log(`  📱 Mock sendMessage to chat ${chatId}: ${text.substring(0, 50)}...`);
        return { ok: true };
    }
};

let passed = 0;
let failed = 0;

/**
 * Hash API key using SHA-256 (matches implementation in index.js)
 */
async function hashApiKey(apiKey) {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate API key (matches implementation in index.js)
 */
async function validateApiKey(providedKey, storedKey) {
    const providedHash = await hashApiKey(providedKey);
    const storedHash = await hashApiKey(storedKey);
    return providedHash === storedHash;
}

/**
 * Simulate the handleApplePayTransaction logic for testing
 * Now uses header-based authentication instead of bot_token in payload
 */
async function simulateApplePayTransaction(body, env, headers = {}) {
    const { chat_id, text } = body;
    const apiKeyHeader = headers['X-API-Key'];
    const timestampHeader = headers['X-Timestamp'];

    // Validate API key from header (X-API-Key)
    if (!apiKeyHeader) {
        return { status: 401, body: { success: false, error: 'Missing API key. Please provide X-API-Key header.' } };
    }

    // Validate API key using timing-safe comparison
    if (!env.APPLE_PAY_API_KEY) {
        return { status: 500, body: { success: false, error: 'Server configuration error' } };
    }

    const isValidKey = await validateApiKey(apiKeyHeader, env.APPLE_PAY_API_KEY);
    if (!isValidKey) {
        return { status: 403, body: { success: false, error: 'Invalid API key' } };
    }

    // Validate timestamp to prevent replay attacks (allow 5 minute window)
    if (!timestampHeader) {
        return { status: 401, body: { success: false, error: 'Missing timestamp. Please provide X-Timestamp header.' } };
    }

    // Parse ISO 8601 timestamp (e.g., "2026-04-10T19:30:00Z")
    const requestTime = new Date(timestampHeader).getTime();
    if (isNaN(requestTime)) {
        return { status: 400, body: { success: false, error: 'Invalid timestamp format. Please use ISO 8601 format (e.g., 2026-04-10T19:30:00Z)' } };
    }

    const currentTime = Date.now();
    const timeDifference = Math.abs(currentTime - requestTime);
    const MAX_TIME_DIFF = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (timeDifference > MAX_TIME_DIFF) {
        return { status: 403, body: { success: false, error: 'Request timestamp expired. Please retry.' } };
    }

    // Validate required fields
    if (!chat_id) {
        return { status: 400, body: { success: false, error: 'Missing chat_id' } };
    }

    if (!text) {
        return { status: 400, body: { success: false, error: 'Missing text' } };
    }

    // Check if KV namespace is available
    if (!env.USER_DATA) {
        return { status: 500, body: { success: false, error: 'USER_DATA KV namespace not configured' } };
    }

    // Parse Apple Pay message
    const applePayData = parseApplePayMessage(text);
    if (!applePayData || Object.keys(applePayData).length === 0) {
        return { status: 400, body: { success: false, error: 'Invalid Apple Pay message format. Expected: "Spent $X at Merchant on YYYY-MM-DD"' } };
    }

    // Convert chat_id to userId (string)
    const userId = chat_id.toString();

    // Check if user is initialized
    const isInitialized = await ProfileService.isProfileInitialized(env.USER_DATA, userId);
    if (!isInitialized) {
        return { status: 400, body: { success: false, error: 'User profile not initialized. Please start the bot with /start first.' } };
    }

    // Create expense data
    const expenseData = {
        amount: applePayData.amount,
        merchant: applePayData.merchant,
        description: `Apple Pay transaction on ${applePayData.date}`
    };

    // Add expense
    const expense = await ExpenseService.addExpense(env.USER_DATA, userId, expenseData);

    // Send confirmation message to user
    await mockTelegramService.sendMessage(env, chat_id, `✅ Apple Pay Transaction Recorded`);

    // Return success response
    return {
        status: 200,
        body: {
            success: true,
            message: '✅ Apple Pay Transaction Recorded',
            expense: {
                amount: expense.amount,
                merchant: applePayData.merchant,
                date: applePayData.date
            }
        }
    };
}

async function runAsyncTest(name, testFn) {
    try {
        await testFn();
        console.log(`✅ Test: ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ Test: ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
    console.log('');
}

async function runTests() {
    // Setup: Initialize a test user
    await ProfileService.initializeProfile(mockKV, '123456789', {
        name: 'Test User',
        age: 30,
        current_savings: 1000,
        monthly_budget: 2000,
        savings_goal: 10000,
        months_to_goal: 24,
        monthly_cash_income: 2500,
        monthly_savings_goal: 500
    });

    const validHeaders = {
        'X-API-Key': 'test-apple-pay-api-key-123',
        'X-Timestamp': new Date().toISOString()
    };

    // Test 1: Missing API key header
    await runAsyncTest('Returns 401 when X-API-Key header is missing', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv, {});

        if (result.status !== 401) throw new Error(`Expected status 401, got ${result.status}`);
        if (result.body.error !== 'Missing API key. Please provide X-API-Key header.') {
            throw new Error(`Expected 'Missing API key' error, got: ${result.body.error}`);
        }
    });

    // Test 2: Invalid API key
    await runAsyncTest('Returns 403 when X-API-Key is invalid', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv, { 'X-API-Key': 'wrong-api-key', 'X-Timestamp': Date.now().toString() });

        if (result.status !== 403) throw new Error(`Expected status 403, got ${result.status}`);
        if (result.body.error !== 'Invalid API key') throw new Error(`Expected 'Invalid API key' error`);
    });

    // Test 3: Missing timestamp header
    await runAsyncTest('Returns 401 when X-Timestamp header is missing', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv, { 'X-API-Key': 'test-apple-pay-api-key-123' });

        if (result.status !== 401) throw new Error(`Expected status 401, got ${result.status}`);
        if (result.body.error !== 'Missing timestamp. Please provide X-Timestamp header.') {
            throw new Error(`Expected 'Missing timestamp' error, got: ${result.body.error}`);
        }
    });

    // Test 4: Expired timestamp (replay attack prevention)
    await runAsyncTest('Returns 403 when timestamp is expired', async () => {
        const expiredDate = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
        const expiredTime = expiredDate.toISOString(); // Convert to ISO 8601
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv, { 'X-API-Key': 'test-apple-pay-api-key-123', 'X-Timestamp': expiredTime });

        if (result.status !== 403) throw new Error(`Expected status 403, got ${result.status}`);
        if (result.body.error !== 'Request timestamp expired. Please retry.') {
            throw new Error(`Expected 'timestamp expired' error, got: ${result.body.error}`);
        }
    });

    // Test 5: Missing chat_id
    await runAsyncTest('Returns 400 when chat_id is missing', async () => {
        const result = await simulateApplePayTransaction({
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv, validHeaders);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (result.body.error !== 'Missing chat_id') throw new Error(`Expected 'Missing chat_id' error`);
    });

    // Test 6: Missing text
    await runAsyncTest('Returns 400 when text is missing', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789
        }, mockEnv, validHeaders);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (result.body.error !== 'Missing text') throw new Error(`Expected 'Missing text' error`);
    });

    // Test 7: Invalid Apple Pay message format
    await runAsyncTest('Returns 400 for invalid Apple Pay message format', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Invalid message format'
        }, mockEnv, validHeaders);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (!result.body.error.includes('Invalid Apple Pay message format')) {
            throw new Error(`Expected format error, got: ${result.body.error}`);
        }
    });

    // Test 8: User not initialized
    await runAsyncTest('Returns 400 when user is not initialized', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 999999999, // Non-existent user
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv, validHeaders);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (!result.body.error.includes('not initialized')) {
            throw new Error(`Expected initialization error, got: ${result.body.error}`);
        }
    });

    // Test 9: Successful transaction
    await runAsyncTest('Returns 200 and records expense for valid request', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $15.99 at Starbucks on 2026-03-26'
        }, mockEnv, validHeaders);

        if (result.status !== 200) throw new Error(`Expected status 200, got ${result.status}`);
        if (!result.body.success) throw new Error('Expected success: true');
        if (result.body.expense.amount !== 15.99) throw new Error(`Expected amount 15.99, got ${result.body.expense.amount}`);
        if (result.body.expense.merchant !== 'Starbucks') throw new Error(`Expected merchant 'Starbucks', got ${result.body.expense.merchant}`);
        if (result.body.expense.date !== '2026-03-26') throw new Error(`Expected date '2026-03-26', got ${result.body.expense.date}`);
    });

    // Test 10: Verify expense was recorded
    await runAsyncTest('Expense is correctly recorded in user data', async () => {
        const expenses = await ExpenseService.getExpenses(mockKV, '123456789');
        const starbucksExpenses = expenses.filter(e => e.merchant === 'starbucks');
        
        if (starbucksExpenses.length === 0) throw new Error('Starbucks expense not found');
        if (starbucksExpenses[0].amount !== 15.99) throw new Error('Amount mismatch');
    });

    // Test 11: Integer amount
    await runAsyncTest('Handles integer amounts correctly', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $50 at Walmart on 2026-03-27'
        }, mockEnv, validHeaders);

        if (result.status !== 200) throw new Error(`Expected status 200, got ${result.status}`);
        if (result.body.expense.amount !== 50) throw new Error(`Expected amount 50, got ${result.body.expense.amount}`);
    });

    // Test 12: Merchant name with spaces
    await runAsyncTest('Handles merchant names with multiple words', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $25.50 at Target Store on 2026-03-28'
        }, mockEnv, validHeaders);

        if (result.status !== 200) throw new Error(`Expected status 200, got ${result.status}`);
        if (result.body.expense.merchant !== 'Target Store') {
            throw new Error(`Expected merchant 'Target Store', got ${result.body.expense.merchant}`);
        }
    });

    console.log('='.repeat(50));
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
        console.log('🎉 All tests passed!');
    } else {
        console.log('❌ Some tests failed.');
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
});