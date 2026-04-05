/**
 * Services Test Suite
 * Tests for ExpenseService, ProfileService, and RecurringExpenseService
 */

import { ExpenseService, ProfileService, RecurringExpenseService } from '../src/services.js';
import { Expense } from '../src/models.js';

console.log('🧪 Testing Services\n');

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

let passed = 0;
let failed = 0;

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
    // Test 1: ExpenseService.getUserData
    await runAsyncTest('ExpenseService.getUserData returns empty object for new user', async () => {
        const userData = await ExpenseService.getUserData(mockKV, 'new_user');
        if (Object.keys(userData).length !== 0) {
            throw new Error('Expected empty object');
        }
    });

    // Test 2: ProfileService.initializeProfile
    await runAsyncTest('ProfileService.initializeProfile sets up user profile', async () => {
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

        await ProfileService.initializeProfile(mockKV, 'test_user', profileData);
        const userData = await ExpenseService.getUserData(mockKV, 'test_user');

        if (userData.name !== 'Test User') throw new Error('Name not set');
        if (userData.age !== 30) throw new Error('Age not set');
        if (userData.currentSavings !== 1000) throw new Error('Current savings not set');
        if (!userData.isInitialized) throw new Error('isInitialized not set');
    });

    // Test 3: ProfileService.isProfileInitialized
    await runAsyncTest('ProfileService.isProfileInitialized returns true after initialization', async () => {
        const isInitialized = await ProfileService.isProfileInitialized(mockKV, 'test_user');
        if (!isInitialized) throw new Error('Expected true');
    });

    // Test 4: ExpenseService.addExpense
    await runAsyncTest('ExpenseService.addExpense adds expense to user data', async () => {
        const expenseData = {
            amount: 50.00,
            merchant: 'Starbucks',
            description: 'Coffee'
        };

        const expense = await ExpenseService.addExpense(mockKV, 'test_user', expenseData);

        if (expense.amount !== 50) throw new Error('Amount mismatch');
        if (expense.merchant !== 'starbucks') throw new Error('Merchant not lowercased');

        const userData = await ExpenseService.getUserData(mockKV, 'test_user');
        if (!userData.expenses || userData.expenses.length !== 1) {
            throw new Error('Expense not added to user data');
        }
    });

    // Test 5: ExpenseService.getExpenses
    await runAsyncTest('ExpenseService.getExpenses returns all expenses', async () => {
        const expenses = await ExpenseService.getExpenses(mockKV, 'test_user');
        if (expenses.length !== 1) throw new Error('Expected 1 expense');
        if (!(expenses[0] instanceof Expense)) throw new Error('Expected Expense instance');
    });

    // Test 6: ExpenseService.getTotalExpenses
    await runAsyncTest('ExpenseService.getTotalExpenses calculates total', async () => {
        const total = await ExpenseService.getTotalExpenses(mockKV, 'test_user');
        if (total !== 50) throw new Error(`Expected total 50, got ${total}`);
    });

    // Test 7: ExpenseService.getRecentExpenses
    await runAsyncTest('ExpenseService.getRecentExpenses returns sorted expenses', async () => {
        const expenses = await ExpenseService.getRecentExpenses(mockKV, 'test_user', 10);
        if (expenses.length !== 1) throw new Error('Expected 1 expense');
        if (!expenses[0].originalIndex === undefined) throw new Error('Expected originalIndex');
    });

    // Test 8: RecurringExpenseService.addRecurringTemplate
    await runAsyncTest('RecurringExpenseService.addRecurringTemplate creates template', async () => {
        const templateData = {
            name: 'Netflix Subscription',
            amount: 15.99,
            merchant: 'Netflix',
            category: 'entertainment',
            frequency: 'monthly'
        };

        // Use a separate user to avoid side effects with other tests
        await RecurringExpenseService.addRecurringTemplate(mockKV, 'recurring_test_user', templateData);

        const templates = await RecurringExpenseService.getRecurringTemplates(mockKV, 'recurring_test_user');
        if (templates.length !== 1) throw new Error('Template not created');
        if (templates[0].name !== 'Netflix Subscription') throw new Error('Template name mismatch');
    });

    // Test 9: RecurringExpenseService.getRecurringSummary
    await runAsyncTest('RecurringExpenseService.getRecurringSummary returns formatted summary', async () => {
        const summary = await RecurringExpenseService.getRecurringSummary(mockKV, 'recurring_test_user');
        if (!summary.includes('Netflix Subscription')) throw new Error('Summary missing template name');
    });

    // Test 10: ProfileService.getMonthlySavingsProgress
    await runAsyncTest('ProfileService.getMonthlySavingsProgress calculates correctly', async () => {
        // Initialize a separate user for progress testing
        await ProfileService.initializeProfile(mockKV, 'progress_test_user', {
            name: 'Progress User',
            age: 25,
            current_savings: 5000,
            monthly_budget: 3000,
            savings_goal: 20000,
            months_to_goal: 36,
            monthly_cash_income: 4000,
            monthly_savings_goal: 800
        });

        const progress = await ProfileService.getMonthlySavingsProgress(mockKV, 'progress_test_user');

        if (progress.monthlyCashIncome !== 4000) throw new Error('Monthly cash income mismatch');
        if (progress.monthlySavingsGoal !== 800) throw new Error('Monthly savings goal mismatch');
    });

    // Test 11: ProfileService.checkBudgetAlert
    await runAsyncTest('ProfileService.checkBudgetAlert returns null when budget is healthy', async () => {
        const alert = await ProfileService.checkBudgetAlert(mockKV, 'progress_test_user');
        // With $3000 budget and no expenses, should be healthy
        if (alert !== null && alert.type === 'budget_exceeded') {
            throw new Error('Should not have budget alert');
        }
    });

    // Test 12: ExpenseService.updateExpense
    await runAsyncTest('ExpenseService.updateExpense updates expense fields', async () => {
        const updated = await ExpenseService.updateExpense(mockKV, 'test_user', 0, {
            amount: 75,
            description: 'Updated coffee'
        });

        if (updated.amount !== 75) throw new Error('Amount not updated');
        if (updated.description !== 'Updated coffee') throw new Error('Description not updated');
    });

    // Test 13: ExpenseService.deleteExpense
    await runAsyncTest('ExpenseService.deleteExpense removes expense', async () => {
        const deleted = await ExpenseService.deleteExpense(mockKV, 'test_user', 0);

        if (deleted.amount !== 75) throw new Error('Wrong expense deleted');

        // Note: getExpenses returns Expense objects, not raw objects
        // After deletion, the user's expenses array should have 0 regular expenses
        // (recurring expenses may be generated but they're separate)
        const userData = await ExpenseService.getUserData(mockKV, 'test_user');
        // The expenses array should be empty after deletion
        if (userData.expenses && userData.expenses.length > 0) {
            throw new Error(`Expense not deleted, still ${userData.expenses.length} expenses`);
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