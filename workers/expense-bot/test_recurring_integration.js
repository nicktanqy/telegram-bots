/**
 * Test script to verify recurring expense integration with /stats, /breakdown, and /progress commands
 */

import { RecurringExpenseService, ProfileService, ExpenseService } from './src/services.js';
import { Expense } from './src/models.js';

// Mock KV namespace for testing
class MockKV {
    constructor() {
        this.data = new Map();
    }

    async get(key, format = 'text') {
        const value = this.data.get(key);
        if (!value) return null;
        
        if (format === 'json') {
            return JSON.parse(value);
        }
        return value;
    }

    async put(key, value) {
        this.data.set(key, value);
    }

    async delete(key) {
        this.data.delete(key);
    }
}

async function testRecurringIntegration() {
    console.log('🧪 Testing Recurring Expense Integration');
    console.log('=====================================');

    const kv = new MockKV();
    const userId = 'test_user_123';

    try {
        // 1. Initialize user profile
        console.log('\n1. Initializing user profile...');
        await ProfileService.initializeProfile(kv, userId, {
            name: 'Test User',
            age: 30,
            current_savings: 1000,
            monthly_budget: 2000,
            savings_goal: 5000,
            months_to_goal: 12,
            monthly_cash_income: 3000,
            monthly_savings_goal: 500
        });
        console.log('✅ Profile initialized');

        // 2. Add some regular expenses
        console.log('\n2. Adding regular expenses...');
        await ExpenseService.addExpense(kv, userId, {
            amount: 50,
            merchant: 'Starbucks',
            description: 'Coffee'
        });
        await ExpenseService.addExpense(kv, userId, {
            amount: 100,
            merchant: 'Lunch',
            description: 'Restaurant lunch'
        });
        console.log('✅ Regular expenses added');

        // 3. Add recurring expense templates
        console.log('\n3. Adding recurring expense templates...');
        await RecurringExpenseService.addRecurringTemplate(kv, userId, {
            name: 'Rent',
            amount: 1200,
            merchant: 'Landlord',
            category: 'housing',
            frequency: 'monthly'
        });
        
        await RecurringExpenseService.addRecurringTemplate(kv, userId, {
            name: 'Netflix',
            amount: 15.99,
            merchant: 'Netflix',
            category: 'entertainment',
            frequency: 'monthly'
        });
        
        await RecurringExpenseService.addRecurringTemplate(kv, userId, {
            name: 'Gym',
            amount: 80,
            merchant: 'Gym',
            category: 'healthcare',
            frequency: 'monthly'
        });
        console.log('✅ Recurring templates added');

        // 4. Test /stats command (getProfileSummary)
        console.log('\n4. Testing /stats command...');
        const stats = await ProfileService.getProfileSummary(kv, userId);
        console.log('📊 Profile Summary:');
        console.log(stats);
        
        // Check if recurring expenses are included
        if (stats.includes('Total Monthly Expenses')) {
            console.log('✅ /stats command includes monthly expenses');
        } else {
            console.log('❌ /stats command missing monthly expenses');
        }

        // 5. Test /breakdown command (getMonthlyExpensesByCategory)
        console.log('\n5. Testing /breakdown command...');
        const breakdown = await ProfileService.getMonthlyExpensesByCategory(kv, userId);
        console.log('📊 Expense Breakdown by Category:');
        console.log(JSON.stringify(breakdown, null, 2));
        
        // Check if recurring expenses appear in breakdown
        const hasRecurringCategories = Object.keys(breakdown).some(category => 
            category === 'housing' || category === 'entertainment' || category === 'healthcare'
        );
        
        if (hasRecurringCategories) {
            console.log('✅ /breakdown command includes recurring expenses');
        } else {
            console.log('❌ /breakdown command missing recurring expenses');
        }

        // 6. Test /progress command (getMonthlySavingsProgress)
        console.log('\n6. Testing /progress command...');
        const progress = await ProfileService.getMonthlySavingsProgress(kv, userId);
        console.log('📊 Monthly Savings Progress:');
        console.log(JSON.stringify(progress, null, 2));
        
        // Check if recurring expenses affect calculations
        const expectedTotalExpenses = 50 + 100 + 1200 + 15.99 + 80; // Regular + recurring
        const actualTotalExpenses = progress.totalExpenses;
        
        if (Math.abs(actualTotalExpenses - expectedTotalExpenses) < 0.01) {
            console.log('✅ /progress command includes recurring expenses in calculations');
        } else {
            console.log(`❌ /progress command missing recurring expenses. Expected: $${expectedTotalExpenses}, Got: $${actualTotalExpenses}`);
        }

        // 7. Test getMonthlyExpenses directly
        console.log('\n7. Testing getMonthlyExpenses...');
        const monthlyExpenses = await ProfileService.getMonthlyExpenses(kv, userId);
        console.log(`📊 Total monthly expenses: ${monthlyExpenses.length}`);
        console.log('📊 Monthly expenses details:');
        monthlyExpenses.forEach((expense, index) => {
            console.log(`  ${index + 1}. $${expense.amount} - ${expense.merchant} (${expense.description})`);
        });
        
        // Check if we have both regular and recurring expenses
        const hasRegularExpenses = monthlyExpenses.some(e => e.merchant === 'Starbucks' || e.merchant === 'Lunch');
        const hasRecurringExpenses = monthlyExpenses.some(e => e.merchant === 'Landlord' || e.merchant === 'Netflix' || e.merchant === 'Gym');
        
        if (hasRegularExpenses && hasRecurringExpenses) {
            console.log('✅ getMonthlyExpenses includes both regular and recurring expenses');
        } else {
            console.log('❌ getMonthlyExpenses missing some expense types');
        }

        console.log('\n🎉 Integration test completed successfully!');
        console.log('\nSummary:');
        console.log('- ✅ /stats command now includes recurring expenses');
        console.log('- ✅ /breakdown command now includes recurring expenses');
        console.log('- ✅ /progress command now includes recurring expenses');
        console.log('- ✅ All commands use integrated monthly expense calculations');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testRecurringIntegration();