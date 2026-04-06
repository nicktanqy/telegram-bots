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
    BOT_TOKEN: 'test-bot-token-123',
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
 * Simulate the handleApplePayTransaction logic for testing
 */
async function simulateApplePayTransaction(body, env) {
    const { bot_token, chat_id, text } = body;

    // Validate required fields
    if (!bot_token) {
        return { status: 400, body: { success: false, error: 'Missing bot_token' } };
    }

    if (!chat_id) {
        return { status: 400, body: { success: false, error: 'Missing chat_id' } };
    }

    if (!text) {
        return { status: 400, body: { success: false, error: 'Missing text' } };
    }

    // Validate bot_token
    if (bot_token !== env.BOT_TOKEN) {
        return { status: 401, body: { success: false, error: 'Invalid bot_token' } };
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

    // Test 1: Missing bot_token
    await runAsyncTest('Returns 400 when bot_token is missing', async () => {
        const result = await simulateApplePayTransaction({
            chat_id: 123456789,
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (result.body.error !== 'Missing bot_token') throw new Error(`Expected 'Missing bot_token' error`);
    });

    // Test 2: Missing chat_id
    await runAsyncTest('Returns 400 when chat_id is missing', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (result.body.error !== 'Missing chat_id') throw new Error(`Expected 'Missing chat_id' error`);
    });

    // Test 3: Missing text
    await runAsyncTest('Returns 400 when text is missing', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            chat_id: 123456789
        }, mockEnv);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (result.body.error !== 'Missing text') throw new Error(`Expected 'Missing text' error`);
    });

    // Test 4: Invalid bot_token
    await runAsyncTest('Returns 401 when bot_token is invalid', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'wrong-token',
            chat_id: 123456789,
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv);

        if (result.status !== 401) throw new Error(`Expected status 401, got ${result.status}`);
        if (result.body.error !== 'Invalid bot_token') throw new Error(`Expected 'Invalid bot_token' error`);
    });

    // Test 5: Invalid Apple Pay message format
    await runAsyncTest('Returns 400 for invalid Apple Pay message format', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            chat_id: 123456789,
            text: 'Invalid message format'
        }, mockEnv);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (!result.body.error.includes('Invalid Apple Pay message format')) {
            throw new Error(`Expected format error, got: ${result.body.error}`);
        }
    });

    // Test 6: User not initialized
    await runAsyncTest('Returns 400 when user is not initialized', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            chat_id: 999999999, // Non-existent user
            text: 'Spent $10 at Store on 2026-03-26'
        }, mockEnv);

        if (result.status !== 400) throw new Error(`Expected status 400, got ${result.status}`);
        if (!result.body.error.includes('not initialized')) {
            throw new Error(`Expected initialization error, got: ${result.body.error}`);
        }
    });

    // Test 7: Successful transaction
    await runAsyncTest('Returns 200 and records expense for valid request', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            chat_id: 123456789,
            text: 'Spent $15.99 at Starbucks on 2026-03-26'
        }, mockEnv);

        if (result.status !== 200) throw new Error(`Expected status 200, got ${result.status}`);
        if (!result.body.success) throw new Error('Expected success: true');
        if (result.body.expense.amount !== 15.99) throw new Error(`Expected amount 15.99, got ${result.body.expense.amount}`);
        if (result.body.expense.merchant !== 'Starbucks') throw new Error(`Expected merchant 'Starbucks', got ${result.body.expense.merchant}`);
        if (result.body.expense.date !== '2026-03-26') throw new Error(`Expected date '2026-03-26', got ${result.body.expense.date}`);
    });

    // Test 8: Verify expense was recorded
    await runAsyncTest('Expense is correctly recorded in user data', async () => {
        const expenses = await ExpenseService.getExpenses(mockKV, '123456789');
        const starbucksExpenses = expenses.filter(e => e.merchant === 'starbucks');
        
        if (starbucksExpenses.length === 0) throw new Error('Starbucks expense not found');
        if (starbucksExpenses[0].amount !== 15.99) throw new Error('Amount mismatch');
    });

    // Test 9: Integer amount
    await runAsyncTest('Handles integer amounts correctly', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            chat_id: 123456789,
            text: 'Spent $50 at Walmart on 2026-03-27'
        }, mockEnv);

        if (result.status !== 200) throw new Error(`Expected status 200, got ${result.status}`);
        if (result.body.expense.amount !== 50) throw new Error(`Expected amount 50, got ${result.body.expense.amount}`);
    });

    // Test 10: Merchant name with spaces
    await runAsyncTest('Handles merchant names with multiple words', async () => {
        const result = await simulateApplePayTransaction({
            bot_token: 'test-bot-token-123',
            chat_id: 123456789,
            text: 'Spent $25.50 at Target Store on 2026-03-28'
        }, mockEnv);

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