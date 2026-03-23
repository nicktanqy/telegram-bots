/**
 * Business logic services for expense tracking
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

import { Expense } from './models.js';

/**
 * Service for managing expenses
 */
export class ExpenseService {
    /**
     * Add a new expense to user data
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} expenseData - Expense data with amount, category, description
     * @returns {Promise<Expense>} The created Expense object
     */
    static async addExpense(kv, userId, expenseData) {
        console.debug(`💰 ADD_EXPENSE: Processing expense data: ${JSON.stringify(expenseData)}`);
        
        try {
            const amount = parseFloat(expenseData.amount || 0);
            console.debug(`  Amount parsed: $${amount.toFixed(2)}`);
            
            if (amount < 0) {
                console.warning(`❌ VALIDATION: Amount is negative: $${amount}`);
                throw new Error("Amount cannot be negative");
            }
            
            const expense = new Expense(
                amount,
                expenseData.category || "Other",
                expenseData.description || ""
            );
            console.debug(`  Expense created: ${JSON.stringify(expense.toObject())}`);
            
            // Get existing user data
            const userData = await this.getUserData(kv, userId);
            if (!userData.expenses) {
                console.debug(`  Creating new expenses list`);
                userData.expenses = [];
            }
            
            userData.expenses.push(expense.toObject());
            
            // Save updated user data
            await kv.put(userId, JSON.stringify(userData));
            console.info(`✅ SAVED: Expense added - $${amount.toFixed(2)} in '${expense.category}'`);
            console.debug(`  Total expenses: ${userData.expenses.length}`);
            
            return expense;
            
        } catch (error) {
            console.error(`❌ ERROR: Error adding expense: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all expenses for a user
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Expense[]>} Array of Expense objects
     */
    static async getExpenses(kv, userId) {
        const userData = await this.getUserData(kv, userId);
        return (userData.expenses || []).map(expenseObj => Expense.fromObject(expenseObj));
    }

    /**
     * Get expenses grouped by category
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Object with category names as keys and arrays of expenses as values
     */
    static async getExpensesByCategory(kv, userId) {
        const expenses = await this.getExpenses(kv, userId);
        const grouped = {};
        
        expenses.forEach(expense => {
            if (!grouped[expense.category]) {
                grouped[expense.category] = [];
            }
            grouped[expense.category].push(expense);
        });
        
        return grouped;
    }

    /**
     * Get total expenses for a user
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<number>} Total expenses amount
     */
    static async getTotalExpenses(kv, userId) {
        const expenses = await this.getExpenses(kv, userId);
        return expenses.reduce((total, expense) => total + expense.amount, 0);
    }

    /**
     * Get total for a specific category
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} category - Category name
     * @returns {Promise<number>} Total amount for the category
     */
    static async getCategoryTotal(kv, userId, category) {
        const expenses = await this.getExpensesByCategory(kv, userId);
        const categoryExpenses = expenses[category.toLowerCase()] || [];
        return categoryExpenses.reduce((total, expense) => total + expense.amount, 0);
    }

    /**
     * Get user data from KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User data object
     */
    static async getUserData(kv, userId) {
        try {
            const data = await kv.get(userId, "json");
            return data || {};
        } catch (error) {
            console.error(`❌ ERROR: Failed to get user data for ${userId}: ${error.message}`);
            return {};
        }
    }

    /**
     * Save user data to KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} userData - User data object
     * @returns {Promise<void>}
     */
    static async saveUserData(kv, userId, userData) {
        try {
            await kv.put(userId, JSON.stringify(userData));
        } catch (error) {
            console.error(`❌ ERROR: Failed to save user data for ${userId}: ${error.message}`);
            throw error;
        }
    }
}

/**
 * Service for managing user profiles
 */
export class ProfileService {
    /**
     * Initialize user profile with setup data
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} profileData - Profile data with name, age, current_savings, monthly_budget, savings_goal, goal_age
     * @returns {Promise<void>}
     */
    static async initializeProfile(kv, userId, profileData) {
        console.debug(`👤 PROFILE_INIT: Initializing profile with data: ${JSON.stringify(profileData)}`);
        
        try {
            const userData = await ExpenseService.getUserData(kv, userId);
            
            userData.name = profileData.name || "";
            console.debug(`  Name: ${userData.name}`);
            
            userData.age = parseInt(profileData.age || 0);
            console.debug(`  Age: ${userData.age}`);
            
            userData.currentSavings = parseFloat(profileData.current_savings || 0);
            console.debug(`  Current Savings: $${userData.currentSavings.toFixed(2)}`);
            
            userData.monthlyBudget = parseFloat(profileData.monthly_budget || 0);
            console.debug(`  Monthly Budget: $${userData.monthlyBudget.toFixed(2)}`);
            
            userData.savingsGoal = parseFloat(profileData.savings_goal || 0);
            console.debug(`  Savings Goal: $${userData.savingsGoal.toFixed(2)}`);
            
            userData.goalAge = parseInt(profileData.goal_age || 0);
            console.debug(`  Goal Age: ${userData.goalAge}`);
            
            userData.isInitialized = true;
            console.info(`✅ PROFILE: Profile initialized successfully`);
            console.debug(`  User can now use all bot features`);
            
            await ExpenseService.saveUserData(kv, userId, userData);
            
        } catch (error) {
            console.error(`❌ ERROR: Error initializing profile: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if user profile is set up
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} True if profile is initialized
     */
    static async isProfileInitialized(kv, userId) {
        const userData = await ExpenseService.getUserData(kv, userId);
        return userData.isInitialized === true;
    }

    /**
     * Get a formatted profile summary
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<string>} Formatted profile summary
     */
    static async getProfileSummary(kv, userId) {
        console.debug(`📊 SUMMARY: Generating profile summary`);
        
        const isInitialized = await this.isProfileInitialized(kv, userId);
        if (!isInitialized) {
            console.debug(`⚠️  INFO: Profile not initialized`);
            return "Profile not initialized.";
        }
        
        const totalExpenses = await ExpenseService.getTotalExpenses(kv, userId);
        console.debug(`  Total Expenses: $${totalExpenses.toFixed(2)}`);
        
        const userData = await ExpenseService.getUserData(kv, userId);
        const currentSavings = userData.currentSavings || 0;
        const monthlyBudget = userData.monthlyBudget || 0;
        const savingsGoal = userData.savingsGoal || 0;
        
        const budgetRemaining = monthlyBudget - totalExpenses;
        const goalProgress = savingsGoal > 0 ? (currentSavings / savingsGoal * 100) : 0;
        
        console.debug(`  Current Savings: $${currentSavings.toFixed(2)}`);
        console.debug(`  Monthly Budget: $${monthlyBudget.toFixed(2)}`);
        console.debug(`  Budget Remaining: $${budgetRemaining.toFixed(2)}`);
        console.debug(`  Savings Goal Progress: ${goalProgress.toFixed(1)}%`);
        
        const summary = `
📊 **Your Financial Profile**
━━━━━━━━━━━━━━━━
Name: ${userData.name || 'User'}
Age: ${userData.age}
Current Savings: $${currentSavings.toFixed(2)}
Monthly Budget: $${monthlyBudget.toFixed(2)}
Savings Goal: $${savingsGoal.toFixed(2)} (Progress: ${goalProgress.toFixed(1)}%)
━━━━━━━━━━━━━━━━
Total Expenses: $${totalExpenses.toFixed(2)}
Budget Remaining: $${budgetRemaining.toFixed(2)}
        `.trim();
        
        console.debug(`✅ SUMMARY: Generated successfully`);
        return summary;
    }
}