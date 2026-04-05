/**
 * Test suite for skip button functionality in conversation flows
 * This test verifies that the skip button works correctly in all flows
 */

// Mock KV store
class MockKV {
    constructor() {
        this.store = new Map();
    }

    async get(key, type = 'text') {
        const value = this.store.get(key);
        if (value === undefined) return null;
        if (type === 'json') {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        return value;
    }

    async put(key, value, options = {}) {
        this.store.set(key, value);
        if (options.expirationTtl) {
            // In a real test, we'd set a timeout to delete, but for now just store it
        }
    }

    async delete(key) {
        this.store.delete(key);
    }
}

// Mock fetch for Telegram API
const originalFetch = global.fetch;
let fetchCalls = [];

global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options, method: options.method || 'GET' });
    
    // Mock successful Telegram API responses
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ok: true, result: {} }),
        json: async () => ({ ok: true, result: {} })
    };
};

// Import the bot module
import bot from './src/index.js';
import { FLOWS } from './src/config.js';

// Test utilities
const TEST_USER_ID = '138562035';
const TEST_CHAT_ID = 138562035;
const TEST_CALLBACK_QUERY_ID = '595119411153006533';

function createMockEnv() {
    return {
        USER_DATA: new MockKV(),
        BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        REQUEST_CACHE: new MockKV()
    };
}

function createCallbackQueryUpdate(callbackData, messageId = 1302) {
    return {
        callback_query: {
            id: TEST_CALLBACK_QUERY_ID,
            from: {
                id: TEST_USER_ID,
                is_bot: false,
                first_name: 'Nicholas',
                username: 'sliceanddiice',
                language_code: 'en'
            },
            message: {
                message_id: messageId,
                from: {
                    id: 7883050713,
                    is_bot: true,
                    first_name: 'Billy Bot (Finance)',
                    username: 'every_expense_bot'
                },
                chat: {
                    id: TEST_CHAT_ID,
                    first_name: 'Nicholas',
                    username: 'sliceanddiice',
                    type: 'private'
                },
                date: Math.floor(Date.now() / 1000),
                text: 'Test message'
            },
            chat_instance: '3462044335568509689',
            data: callbackData
        }
    };
}

function createMessageUpdate(text, messageId = 1301) {
    return {
        update_id: Math.floor(Math.random() * 1000000),
        message: {
            message_id: messageId,
            from: {
                id: TEST_USER_ID,
                is_bot: false,
                first_name: 'Nicholas',
                username: 'sliceanddiice',
                language_code: 'en'
            },
            chat: {
                id: TEST_CHAT_ID,
                first_name: 'Nicholas',
                username: 'sliceanddiice',
                type: 'private'
            },
            date: Math.floor(Date.now() / 1000),
            text: text
        }
    };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test runner
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        testsPassed++;
        console.log(`  ✅ ${message}`);
    } else {
        testsFailed++;
        console.error(`  ❌ ${message}`);
    }
}

async function resetState(env) {
    // Clear all KV stores
    env.USER_DATA.store.clear();
    if (env.REQUEST_CACHE) {
        env.REQUEST_CACHE.store.clear();
    }
    fetchCalls = [];
}

// Tests
console.log('\n🧪 Testing Skip Button Functionality\n');

// Test 1: Callback query is handled before message check
console.log('Test 1: Callback query handling takes precedence');
{
    const env = createMockEnv();
    
    // First, simulate a callback query update
    const callbackUpdate = createCallbackQueryUpdate('skip_field:name');
    const callbackRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(callbackUpdate)
    });
    
    const response = await bot.fetch(callbackRequest, env, null);
    
    assert(response.status === 200, 'Callback query returns 200 OK');
    assert(fetchCalls.length > 0, 'Telegram API was called');
    
    // Check that answerCallbackQuery was called
    const answerCallbackCall = fetchCalls.find(call => 
        call.url.includes('answerCallbackQuery')
    );
    assert(answerCallbackCall !== undefined, 'answerCallbackQuery was called');
    
    resetState(env);
}

// Test 2: Skip button advances to next step in edit_profile flow
console.log('\nTest 2: Skip button advances flow to next step');
{
    const env = createMockEnv();
    
    // Initialize user profile first (required for edit_profile)
    // Must include isInitialized: true for the check to pass
    // Note: getUserData uses kv.get(userId, "json") - key is just userId
    const userData = {
        name: 'Test User',
        currentSavings: 1000,
        monthlyBudget: 500,
        savingsGoal: 10000,
        monthlyCashIncome: 3000,
        monthlySavingsGoal: 500,
        isInitialized: true
    };
    await env.USER_DATA.put(TEST_USER_ID, JSON.stringify(userData));
    
    // First, start the edit_profile flow
    const startUpdate = createMessageUpdate('/edit_profile');
    const startRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(startUpdate)
    });
    
    await bot.fetch(startRequest, env, null);
    
    // Check that a message was sent with inline keyboard
    const sendMessageCall = fetchCalls.find(call => 
        call.url.includes('sendMessage') && 
        call.options.body.includes('inline_keyboard')
    );
    assert(sendMessageCall !== undefined, 'Message with inline keyboard was sent');
    
    if (sendMessageCall) {
        const body = JSON.parse(sendMessageCall.options.body);
        assert(
            body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'skip_field:name',
            'Skip button has correct callback_data'
        );
    }
    
    resetState(env);
}

// Test 3: Skip button with no active flow shows error
console.log('\nTest 3: Skip button with no active flow shows error');
{
    const env = createMockEnv();
    
    // Send skip callback without starting a flow
    const skipUpdate = createCallbackQueryUpdate('skip_field:name');
    const skipRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(skipUpdate)
    });
    
    fetchCalls = [];
    await bot.fetch(skipRequest, env, null);
    
    // Check that an error message was sent
    const errorMessageCall = fetchCalls.find(call => 
        call.url.includes('sendMessage') && 
        call.options.body.includes('No active flow')
    );
    assert(errorMessageCall !== undefined, 'Error message shown when no active flow');
    
    resetState(env);
}

// Test 4: Skip button completes flow when on last step
console.log('\nTest 4: Skip button completes flow when on last step');
{
    const env = createMockEnv();
    
    // Initialize user profile first (required for flows)
    // Must include isInitialized: true for the check to pass
    // Note: getUserData uses kv.get(userId, "json") - key is just userId
    const userData = {
        name: 'Test User',
        currentSavings: 1000,
        monthlyBudget: 500,
        savingsGoal: 10000,
        monthlyCashIncome: 3000,
        monthlySavingsGoal: 500,
        isInitialized: true
    };
    await env.USER_DATA.put(TEST_USER_ID, JSON.stringify(userData));
    
    // Start edit_profile flow
    const startUpdate = createMessageUpdate('/edit_profile');
    const startRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(startUpdate)
    });
    await bot.fetch(startRequest, env, null);
    
    // Manually advance to the last step
    const context = {
        currentFlow: 'edit_profile',
        currentStep: FLOWS.edit_profile.stepCount() - 1,
        flowData: {}
    };
    await env.USER_DATA.put(`${TEST_USER_ID}:context`, JSON.stringify(context));
    
    fetchCalls = [];
    
    // Now press skip on the last step
    const skipUpdate = createCallbackQueryUpdate('skip_field:monthly_savings_goal');
    const skipRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(skipUpdate)
    });
    
    await bot.fetch(skipRequest, env, null);
    
    // Check that completion message was sent
    const completionMessage = fetchCalls.find(call => 
        call.url.includes('sendMessage') && 
        call.options.body.includes('Operation completed')
    );
    assert(completionMessage !== undefined, 'Flow completion message sent');
    
    // Check that flow was cleared
    const clearedContext = await env.USER_DATA.get(`${TEST_USER_ID}:context`, 'json');
    assert(!clearedContext || !clearedContext.currentFlow, 'Flow context was cleared');
    
    resetState(env);
}

// Test 5: Skip button sends next prompt with inline keyboard if next field allows skip
console.log('\nTest 5: Skip button sends next prompt with inline keyboard');
{
    const env = createMockEnv();
    
    // Initialize user profile (must include isInitialized: true)
    // Note: getUserData uses kv.get(userId, "json") - key is just userId
    const userData = {
        name: 'Test User',
        currentSavings: 1000,
        monthlyBudget: 500,
        savingsGoal: 10000,
        monthlyCashIncome: 3000,
        monthlySavingsGoal: 500,
        isInitialized: true
    };
    await env.USER_DATA.put(TEST_USER_ID, JSON.stringify(userData));
    
    // Start edit_profile flow
    const startUpdate = createMessageUpdate('/edit_profile');
    const startRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(startUpdate)
    });
    await bot.fetch(startRequest, env, null);
    
    fetchCalls = [];
    
    // Press skip on first field (name)
    const skipUpdate = createCallbackQueryUpdate('skip_field:name');
    const skipRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(skipUpdate)
    });
    
    await bot.fetch(skipRequest, env, null);
    
    // Check that next prompt was sent with inline keyboard
    const nextPromptCall = fetchCalls.find(call => 
        call.url.includes('sendMessage') && 
        call.options.body.includes('inline_keyboard') &&
        call.options.body.includes('skip_field:')
    );
    assert(nextPromptCall !== undefined, 'Next prompt sent with skip button');
    
    // Check that step was advanced
    const context = await env.USER_DATA.get(`${TEST_USER_ID}:context`, 'json');
    assert(context.currentStep === 1, 'Step was advanced to 1');
    
    resetState(env);
}

// Test 6: Verify callback query is NOT ignored with "No message in update"
console.log('\nTest 6: Callback query is not ignored');
{
    const env = createMockEnv();
    
    // Set up a flow context so skip has something to work with
    const context = {
        currentFlow: 'edit_profile',
        currentStep: 0,
        flowData: {}
    };
    await env.USER_DATA.put(`${TEST_USER_ID}:context`, JSON.stringify(context));
    
    // Initialize user (must include isInitialized: true)
    // Note: getUserData uses kv.get(userId, "json") - key is just userId
    const userData = {
        name: 'Test User',
        currentSavings: 1000,
        isInitialized: true
    };
    await env.USER_DATA.put(TEST_USER_ID, JSON.stringify(userData));
    
    fetchCalls = [];
    
    // Send callback query
    const skipUpdate = createCallbackQueryUpdate('skip_field:name');
    const skipRequest = new Request('https://example.com/webhook', {
        method: 'POST',
        body: JSON.stringify(skipUpdate)
    });
    
    await bot.fetch(skipRequest, env, null);
    
    // The old bug would log "No message in update, ignoring" and do nothing
    // Now we should see callback handling
    const wasCallbackHandled = fetchCalls.some(call => 
        call.url.includes('answerCallbackQuery')
    );
    assert(wasCallbackHandled, 'Callback query was handled (not ignored)');
    
    // Should NOT have just returned OK without doing anything
    const sentNextPrompt = fetchCalls.some(call => 
        call.url.includes('sendMessage') && 
        !call.options.body.includes('No active flow')
    );
    assert(sentNextPrompt, 'Bot responded with more than just ignoring');
    
    resetState(env);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(50));

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}