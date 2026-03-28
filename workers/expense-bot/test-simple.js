#!/usr/bin/env node

/**
 * Simple test script for the Budget Billy bot
 * This script tests the bot functionality without requiring the development server
 */

import { ExpenseService, ProfileService } from './src/services.js';
import { GenericConversationHandler, FLOW_COMPLETE } from './src/conversations.js';
import { FLOWS } from './src/config.js';

console.log('🧪 Simple Budget Billy Bot Test\n');

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

async function runSimpleTest() {
    console.log('Test 1: Testing basic functionality...\n');
    
    try {
        // Test 1: Check if services can be imported and used
        console.log('✅ Services imported successfully');
        
        // Test 2: Test user data operations
        const userId = 'test_user_123';
        const userData = await ExpenseService.getUserData(mockKV, userId);
        console.log('✅ User data retrieval works');
        console.log(`   Initial data: ${JSON.stringify(userData)}`);
        
        // Test 3: Test profile initialization
        const profileData = {
            name: 'Test User',
            age: 30,
            current_savings: 1000,
            monthly_budget: 2000,
            savings_goal: 10000,
            months_to_goal: 24,
            monthly_cash_income: 2500,
            monthly_savings_goal: 500
        };
        
        await ProfileService.initializeProfile(mockKV, userId, profileData);
        console.log('✅ Profile initialization works');
        
        // Test 4: Test profile summary
        const summary = await ProfileService.getProfileSummary(mockKV, userId);
        console.log('✅ Profile summary generation works');
        console.log(`   Summary preview: ${summary.substring(0, 100)}...`);
        
        // Test 5: Test expense addition
        const expenseData = {
            amount: 50.00,
            merchant: 'Starbucks',
            description: 'Coffee'
        };
        
        const expense = await ExpenseService.addExpense(mockKV, userId, expenseData);
        console.log('✅ Expense addition works');
        console.log(`   Added expense: $${expense.amount} at ${expense.merchant}`);
        
        // Test 6: Test conversation handler
        const conversationHandler = new GenericConversationHandler(FLOWS);
        console.log('✅ Conversation handler created');
        
        // Test 7: Test flow start
        await conversationHandler.startFlow(mockKV, userId, 'expense_setup');
        console.log('✅ Flow start works');
        
        console.log('\n🎉 All tests passed! The bot logic appears to be working correctly.');
        console.log('\n📝 Notes:');
        console.log('   - This test uses a mock KV namespace');
        console.log('   - The actual issue may be with Cloudflare Workers configuration');
        console.log('   - Check that KV namespaces are properly configured in wrangler.toml');
        console.log('   - Ensure BOT_TOKEN is set as a secret');
        console.log('   - Verify webhook is configured in Telegram BotFather');
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        console.error(error.stack);
    }
}

// Run the test
runSimpleTest().catch(console.error);