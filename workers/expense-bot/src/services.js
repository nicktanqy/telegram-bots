/**
 * Business logic services for expense tracking
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

import { Expense } from './models.js';

/**
 * Parse Apple Pay transaction message.
 * 
 * Expected format: "Spent $15 at Starbucks on 2026-03-26"
 * 
 * @param {string} messageText - The message text to parse
 * @returns {Object} Object with keys: amount, merchant, date, or empty object if invalid
 */
export function parseApplePayMessage(messageText) {
    // Pattern: "Spent $15 at Starbucks on 2026-03-26"
    // Message ends with the date, no time portion
    const pattern = /^Spent\s+\$(\d+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4})-(\d{2})-(\d{2})/;
    
    const match = messageText.trim().match(pattern);
    if (!match) {
        return {};
    }
    
    const [_, amountStr, merchant, yearStr, monthStr, dayStr] = match;
    
    try {
        const amount = parseFloat(amountStr);
        if (amount <= 0) {
            return {};
        }
        
        const day = parseInt(dayStr);
        const month = parseInt(monthStr);
        const year = parseInt(yearStr);
        
        // Extended date validation (100-year range)
        const currentYear = 2026; // Current year
        if (!(currentYear - 50 <= year && year <= currentYear + 50) || !(1 <= month && month <= 12) || !(1 <= day && day <= 31)) {
            return {};
        }
        
        // Format date as YYYY-MM-DD for consistency
        const dateStr = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        return {
            amount: amount,
            merchant: merchant.trim(),
            date: dateStr
        };
    } catch (error) {
        console.error(`❌ ERROR: Failed to parse Apple Pay message: ${error.message}`);
        return {};
    }
}

/**
 * Service for managing expenses
 */
export class ExpenseService {
    /**
     * Add a new expense to user data with timeout handling
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} expenseData - Expense data with amount, merchant, description
     * @returns {Promise<Expense>} The created Expense object
     */
    static async addExpense(kv, userId, expenseData) {
        console.debug(`💰 ADD_EXPENSE: Processing expense data: ${JSON.stringify(expenseData)}`);
        
        try {
            const amount = parseFloat(expenseData.amount || 0);
            console.debug(`  Amount parsed: $${amount.toFixed(2)}`);
            
            if (amount <= 0) {
                console.error(`❌ VALIDATION: Amount must be positive: $${amount}`);
                throw new Error("Amount must be positive");
            }
            
            const expense = new Expense(
                amount,
                expenseData.merchant || "Unknown",
                expenseData.description || ""
            );
            console.debug(`  Expense created: ${JSON.stringify(expense.toObject())}`);
            
            // Get existing user data with timeout handling
            let userData;
            try {
                userData = await this.getUserData(kv, userId);
            } catch (kvError) {
                console.warn(`⚠️  KV GET failed for user ${userId}: ${kvError.message}`);
                // Create new user data if KV operation fails
                userData = {
                    expenses: [],
                    name: "User",
                    age: 0,
                    currentSavings: 0,
                    monthlyBudget: 0,
                    savingsGoal: 0,
                    monthlyCashIncome: 0,
                    monthlySavingsGoal: 0,
                    isInitialized: false
                };
            }
            
            if (!userData.expenses) {
                console.debug(`  Creating new expenses list`);
                userData.expenses = [];
            }
            
            userData.expenses.push(expense.toObject());
            
            // Save updated user data with timeout handling
            try {
                await kv.put(userId, JSON.stringify(userData));
                console.info(`✅ SAVED: Expense added - $${amount.toFixed(2)} at '${expense.merchant}'`);
                console.debug(`  Total expenses: ${userData.expenses.length}`);
            } catch (kvError) {
                console.error(`❌ KV PUT failed for user ${userId}: ${kvError.message}`);
                throw new Error(`Failed to save expense data: ${kvError.message}`);
            }
            
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
     * Get expenses grouped by merchant
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Object with merchant names as keys and arrays of expenses as values
     */
    static async getExpensesByMerchant(kv, userId) {
        const expenses = await this.getExpenses(kv, userId);
        const grouped = {};
        
        expenses.forEach(expense => {
            if (!grouped[expense.merchant]) {
                grouped[expense.merchant] = [];
            }
            grouped[expense.merchant].push(expense);
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
     * Get total for a specific merchant
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} merchant - Merchant name
     * @returns {Promise<number>} Total amount for the merchant
     */
    static async getMerchantTotal(kv, userId, merchant) {
        const expenses = await this.getExpensesByMerchant(kv, userId);
        const merchantExpenses = expenses[merchant.toLowerCase()] || [];
        return merchantExpenses.reduce((total, expense) => total + expense.amount, 0);
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

    /**
     * Delete user data from KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    static async deleteUserData(kv, userId) {
        try {
            await kv.delete(userId);
        } catch (error) {
            console.error(`❌ ERROR: Failed to delete user data for ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get recent expenses for a user (sorted by most recent first)
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of expenses to return
     * @returns {Promise<Object[]>} Array of expense objects with index
     */
    static async getRecentExpenses(kv, userId, limit = 10) {
        const userData = await this.getUserData(kv, userId);
        const expenses = userData.expenses || [];
        
        // Sort by timestamp (most recent first) and limit
        const sortedExpenses = expenses
            .map((expense, index) => ({...expense, originalIndex: index}))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
        
        return sortedExpenses;
    }

    /**
     * Get a specific expense by its index in the expenses array
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} index - Index of the expense in the array
     * @returns {Promise<Object|null>} Expense object or null if not found
     */
    static async getExpenseByIndex(kv, userId, index) {
        const userData = await this.getUserData(kv, userId);
        const expenses = userData.expenses || [];
        
        if (index < 0 || index >= expenses.length) {
            return null;
        }
        
        return {...expenses[index], originalIndex: index};
    }

    /**
     * Update an expense at a specific index
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} index - Index of the expense to update
     * @param {Object} updates - Object with fields to update (amount, merchant, description, category)
     * @returns {Promise<Object>} Updated expense object
     */
    static async updateExpense(kv, userId, index, updates) {
        console.debug(`✏️ UPDATE_EXPENSE: Updating expense at index ${index} for user ${userId}`);
        
        const userData = await this.getUserData(kv, userId);
        const expenses = userData.expenses || [];
        
        if (index < 0 || index >= expenses.length) {
            throw new Error("Expense not found");
        }
        
        // Apply updates
        const expense = expenses[index];
        if (updates.amount !== undefined) {
            expense.amount = parseFloat(updates.amount);
        }
        if (updates.merchant !== undefined) {
            expense.merchant = updates.merchant.toLowerCase();
        }
        if (updates.description !== undefined) {
            expense.description = updates.description;
        }
        
        // Save updated user data
        await this.saveUserData(kv, userId, userData);
        console.info(`✅ EXPENSE_UPDATED: Updated expense at index ${index}`);
        
        return expense;
    }

    /**
     * Delete an expense at a specific index
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} index - Index of the expense to delete
     * @returns {Promise<Object>} Deleted expense object
     */
    static async deleteExpense(kv, userId, index) {
        console.debug(`🗑️ DELETE_EXPENSE: Deleting expense at index ${index} for user ${userId}`);
        
        const userData = await this.getUserData(kv, userId);
        const expenses = userData.expenses || [];
        
        if (index < 0 || index >= expenses.length) {
            throw new Error("Expense not found");
        }
        
        // Get the expense before deleting
        const deletedExpense = expenses[index];
        
        // Remove the expense
        expenses.splice(index, 1);
        
        // Save updated user data
        await this.saveUserData(kv, userId, userData);
        console.info(`✅ EXPENSE_DELETED: Deleted expense at index ${index}`);
        
        return deletedExpense;
    }
}

/**
 * Service for managing recurring expenses and templates
 */
export class RecurringExpenseService {
    /**
     * Add a recurring expense template
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} templateData - Template data with name, amount, merchant, frequency
     * @returns {Promise<void>}
     */
    static async addRecurringTemplate(kv, userId, templateData) {
        console.debug(`🔄 ADD_TEMPLATE: Adding template for user '${userId}': ${JSON.stringify(templateData)}`);
        
        try {
            const userData = await ExpenseService.getUserData(kv, userId);
            if (!userData.recurringTemplates) {
                userData.recurringTemplates = [];
            }
            
            const template = {
                id: Date.now().toString(),
                name: templateData.name,
                amount: parseFloat(templateData.amount),
                merchant: templateData.merchant,
                frequency: templateData.frequency || 'monthly', // daily, weekly, monthly, yearly
                description: templateData.description || '',
                isActive: true,
                createdAt: new Date().toISOString()
            };
            
            userData.recurringTemplates.push(template);
            await ExpenseService.saveUserData(kv, userId, userData);
            
            console.info(`✅ TEMPLATE: Added recurring template '${template.name}'`);
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to add recurring template: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all recurring expense templates for a user
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of recurring templates
     */
    static async getRecurringTemplates(kv, userId) {
        const userData = await ExpenseService.getUserData(kv, userId);
        return userData.recurringTemplates || [];
    }

    /**
     * Delete a recurring expense template
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} templateId - Template ID
     * @returns {Promise<void>}
     */
    static async deleteRecurringTemplate(kv, userId, templateId) {
        console.debug(`🗑️ DELETE_TEMPLATE: Deleting template '${templateId}' for user '${userId}'`);
        
        try {
            const userData = await ExpenseService.getUserData(kv, userId);
            if (userData.recurringTemplates) {
                userData.recurringTemplates = userData.recurringTemplates.filter(t => t.id !== templateId);
                await ExpenseService.saveUserData(kv, userId, userData);
                console.info(`✅ TEMPLATE: Deleted template '${templateId}'`);
            }
        } catch (error) {
            console.error(`❌ ERROR: Failed to delete recurring template: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate expenses from recurring templates for a given period
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} period - Time period (e.g., '2026-03' for March 2026)
     * @returns {Promise<Array>} Array of generated expenses
     */
    static async generateRecurringExpenses(kv, userId, period) {
        console.debug(`🔄 GENERATE: Generating recurring expenses for period '${period}'`);
        
        try {
            const templates = await this.getRecurringTemplates(kv, userId);
            const generatedExpenses = [];
            
            for (const template of templates) {
                if (!template.isActive) continue;
                
                const expenses = this.generateExpensesForTemplate(template, period);
                generatedExpenses.push(...expenses);
            }
            
            // Add generated expenses to user data
            if (generatedExpenses.length > 0) {
                const userData = await ExpenseService.getUserData(kv, userId);
                if (!userData.expenses) {
                    userData.expenses = [];
                }
                
                // Check if expenses for this period already exist to avoid duplicates
                const existingExpenseIds = new Set();
                userData.expenses.forEach(expense => {
                    const expenseDate = new Date(expense.timestamp);
                    const expensePeriod = `${expenseDate.getFullYear()}-${(expenseDate.getMonth() + 1).toString().padStart(2, '0')}`;
                    if (expensePeriod === period) {
                        existingExpenseIds.add(`${expense.merchant}-${expense.description}`);
                    }
                });
                
                // Only add new expenses that don't already exist for this period
                const newExpenses = generatedExpenses.filter(expense => {
                    const expenseKey = `${expense.merchant}-${expense.description}`;
                    return !existingExpenseIds.has(expenseKey);
                });
                
                if (newExpenses.length > 0) {
                    userData.expenses.push(...newExpenses.map(expense => expense.toObject()));
                    await ExpenseService.saveUserData(kv, userId, userData);
                    console.info(`✅ GENERATED: ${newExpenses.length} recurring expenses for period '${period}'`);
                } else {
                    console.info(`ℹ️  INFO: No new recurring expenses to generate for period '${period}'`);
                }
            }
            
            // Return only the new expenses that were actually added, not all generated
            return generatedExpenses.filter(expense => {
                const expenseKey = `${expense.merchant}-${expense.description}`;
                return !generatedExpenses.some((existing, index) => 
                    index < generatedExpenses.indexOf(expense) && 
                    `${existing.merchant}-${existing.description}` === expenseKey
                );
            });
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to generate recurring expenses: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate expenses for a specific template
     * @param {Object} template - Template object
     * @param {string} period - Time period (YYYY-MM format)
     * @returns {Array} Array of generated Expense objects
     */
    static generateExpensesForTemplate(template, period) {
        const expenses = [];
        const [year, month] = period.split('-').map(Number);
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        // Only generate for current or past periods
        const periodDate = new Date(year, month - 1, 1);
        if (periodDate > currentDate) {
            return expenses;
        }

        const daysInMonth = new Date(year, month, 0).getDate();
        
        switch (template.frequency) {
            case 'daily':
                for (let day = 1; day <= daysInMonth; day++) {
                    const expense = new Expense(
                        template.amount,
                        template.merchant,
                        `${template.name} - Daily expense`,
                        new Date(year, month - 1, day).toISOString()
                    );
                    expenses.push(expense);
                }
                break;
                
            case 'weekly':
                // Generate expenses for each week (assume weekly on the 1st, 8th, 15th, 22nd)
                const weeklyDays = [1, 8, 15, 22];
                for (const day of weeklyDays) {
                    if (day <= daysInMonth) {
                        const expense = new Expense(
                            template.amount,
                            template.merchant,
                            `${template.name} - Weekly expense`,
                            new Date(year, month - 1, day).toISOString()
                        );
                        expenses.push(expense);
                    }
                }
                break;
                
            case 'monthly':
                // Generate one expense per month with current date/time
                const expense = new Expense(
                    template.amount,
                    template.merchant,
                    `${template.name} - Monthly expense`,
                    new Date().toISOString() // Use current date/time instead of period date
                );
                expenses.push(expense);
                break;
                
            case 'yearly':
                // Only generate if this is the correct month for yearly expense
                if (month === 1) { // January
                    const expense = new Expense(
                        template.amount,
                        template.merchant,
                        `${template.name} - Yearly expense`,
                        new Date(year, 0, 1).toISOString()
                    );
                    expenses.push(expense);
                }
                break;
        }
        
        return expenses;
    }

    /**
     * Get recurring expense summary for a user
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<string>} Formatted summary
     */
    static async getRecurringSummary(kv, userId) {
        const templates = await this.getRecurringTemplates(kv, userId);
        
        if (templates.length === 0) {
            return "📋 No recurring expense templates set up yet.";
        }
        
        let summary = "📋 **Recurring Expense Templates**\n━━━━━━━━━━━━━━━━\n";
        
        for (const template of templates) {
            if (!template.isActive) continue;
            
            summary += `\n**${template.name}**\n`;
            summary += `  Amount: $${template.amount.toFixed(2)}\n`;
            summary += `  Merchant: ${template.merchant}\n`;
            summary += `  Frequency: ${template.frequency}\n`;
            
            // Calculate monthly equivalent
            const monthlyAmount = this.getMonthlyEquivalent(template.amount, template.frequency);
            summary += `  Monthly Equivalent: $${monthlyAmount.toFixed(2)}\n`;
        }
        
        // Calculate total monthly recurring expenses
        const totalMonthly = templates
            .filter(t => t.isActive)
            .reduce((total, t) => total + this.getMonthlyEquivalent(t.amount, t.frequency), 0);
        
        summary += `\n**Total Monthly Recurring: $${totalMonthly.toFixed(2)}**`;
        
        return summary;
    }

    /**
     * Calculate monthly equivalent for a recurring expense
     * @param {number} amount - Expense amount
     * @param {string} frequency - Frequency (daily, weekly, monthly, yearly)
     * @returns {number} Monthly equivalent amount
     */
    static getMonthlyEquivalent(amount, frequency) {
        switch (frequency) {
            case 'daily':
                return amount * 30; // Approximate
            case 'weekly':
                return amount * 4.33; // 52 weeks / 12 months
            case 'monthly':
                return amount;
            case 'yearly':
                return amount / 12;
            default:
                return amount;
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
     * @param {Object} profileData - Profile data with name, age, current_savings, monthly_budget, savings_goal, goal_age, monthly_cash_income, monthly_savings_goal
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
            
            userData.monthsToGoal = parseInt(profileData.months_to_goal || 0);
            console.debug(`  Months to Goal: ${userData.monthsToGoal}`);
            
            userData.monthlyCashIncome = parseFloat(profileData.monthly_cash_income || 0);
            console.debug(`  Monthly Cash Income: $${userData.monthlyCashIncome.toFixed(2)}`);
            
            userData.monthlySavingsGoal = parseFloat(profileData.monthly_savings_goal || 0);
            console.debug(`  Monthly Savings Goal: $${userData.monthlySavingsGoal.toFixed(2)}`);
            
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
        
        // Get monthly expenses including recurring expenses
        const monthlyExpenses = await ProfileService.getMonthlyExpenses(kv, userId);
        const totalMonthlyExpenses = monthlyExpenses.reduce((total, expense) => total + expense.amount, 0);
        console.debug(`  Total Monthly Expenses (including recurring): $${totalMonthlyExpenses.toFixed(2)}`);
        
        const userData = await ExpenseService.getUserData(kv, userId);
        const currentSavings = userData.currentSavings || 0;
        const monthlyBudget = userData.monthlyBudget || 0;
        const savingsGoal = userData.savingsGoal || 0;
        const monthsToGoal = userData.monthsToGoal || 0;
        const age = userData.age || 0;
        
        const budgetRemaining = monthlyBudget - totalMonthlyExpenses;
        const goalProgress = savingsGoal > 0 ? (currentSavings / savingsGoal * 100) : 0;
        
        // Calculate journey progress
        const journeyInfo = await this.calculateJourneyProgress(kv, userId);
        
        console.debug(`  Current Savings: $${currentSavings.toFixed(2)}`);
        console.debug(`  Monthly Budget: $${monthlyBudget.toFixed(2)}`);
        console.debug(`  Budget Remaining: $${budgetRemaining.toFixed(2)}`);
        console.debug(`  Savings Goal Progress: ${goalProgress.toFixed(1)}%`);
        
        let summary = `
📊 **Your Financial Profile**
━━━━━━━━━━━━━━━━
Name: ${userData.name || 'User'}
Age: ${age}
Current Savings: $${currentSavings.toFixed(2)}
Monthly Budget: $${monthlyBudget.toFixed(2)}
Savings Goal: $${savingsGoal.toFixed(2)} (Progress: ${goalProgress.toFixed(1)}%)`;

        if (monthsToGoal > 0) {
            summary += `
Months to Goal: ${monthsToGoal}
Monthly Savings Needed: $${journeyInfo.monthlySavingsNeeded.toFixed(2)}
Journey Progress: ${journeyInfo.journeyProgress.toFixed(1)}%`;
        }
        
        summary += `
━━━━━━━━━━━━━━━━
Total Monthly Expenses: $${totalMonthlyExpenses.toFixed(2)}
Budget Remaining: $${budgetRemaining.toFixed(2)}`;
        
        console.debug(`✅ SUMMARY: Generated successfully`);
        return summary;
    }

    /**
     * Calculate journey progress toward savings goal based on months
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Journey progress information
     */
    static async calculateJourneyProgress(kv, userId) {
        const userData = await ExpenseService.getUserData(kv, userId);
        const currentSavings = userData.currentSavings || 0;
        const savingsGoal = userData.savingsGoal || 0;
        const monthsToGoal = userData.monthsToGoal || 0;
        
        if (monthsToGoal <= 0 || savingsGoal <= 0) {
            return {
                monthsRemaining: 0,
                monthlySavingsNeeded: 0,
                journeyProgress: 0
            };
        }
        
        const monthsRemaining = monthsToGoal;
        
        let monthlySavingsNeeded = 0;
        if (monthsRemaining > 0) {
            const amountNeeded = savingsGoal - currentSavings;
            monthlySavingsNeeded = amountNeeded / monthsRemaining;
        }
        
        const journeyProgress = monthsRemaining > 0 ? 
            ((monthsRemaining - (savingsGoal - currentSavings) / monthlySavingsNeeded) / monthsRemaining * 100) : 0;
        
        return {
            monthsRemaining,
            monthlySavingsNeeded: Math.max(0, monthlySavingsNeeded),
            journeyProgress: Math.max(0, Math.min(100, journeyProgress))
        };
    }

    /**
     * Get monthly expenses for current month including recurring expenses
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Expense[]>} Array of expenses for current month
     */
    static async getMonthlyExpenses(kv, userId) {
        // Get regular expenses
        const expenses = await ExpenseService.getExpenses(kv, userId);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        // Filter regular expenses for current month
        const regularExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.timestamp);
            return expenseDate.getFullYear() === currentYear && expenseDate.getMonth() === currentMonth;
        });
        
        // Generate recurring expenses for current month
        const currentPeriod = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;
        const recurringExpenses = await RecurringExpenseService.generateRecurringExpenses(kv, userId, currentPeriod);
        
        // Combine regular and recurring expenses
        const allExpenses = [...regularExpenses, ...recurringExpenses];
        
        // Sort by timestamp
        allExpenses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return allExpenses;
    }

    /**
     * Get monthly expenses grouped by category
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Expenses grouped by category
     */
    static async getMonthlyExpensesByCategory(kv, userId) {
        const monthlyExpenses = await ProfileService.getMonthlyExpenses(kv, userId);
        const grouped = {};
        
        monthlyExpenses.forEach(expense => {
            // Extract category from description or use merchant as category
            let category = 'other';
            if (expense.description) {
                const desc = expense.description.toLowerCase();
                
                // Check for recurring expense patterns first
                if (desc.includes('monthly expense') || desc.includes('weekly expense') || desc.includes('daily expense') || desc.includes('yearly expense')) {
                    // For recurring expenses, try to extract category from the template name
                    const templateName = expense.description.split(' - ')[0].toLowerCase();
                    if (templateName.includes('rent') || templateName.includes('housing') || templateName.includes('home')) {
                        category = 'housing';
                    } else if (templateName.includes('netflix') || templateName.includes('spotify') || templateName.includes('streaming') || templateName.includes('entertainment')) {
                        category = 'entertainment';
                    } else if (templateName.includes('gym') || templateName.includes('health') || templateName.includes('medical') || templateName.includes('pharmacy')) {
                        category = 'healthcare';
                    } else if (templateName.includes('electricity') || templateName.includes('water') || templateName.includes('internet') || templateName.includes('utilities')) {
                        category = 'utilities';
                    } else if (templateName.includes('transport') || templateName.includes('bus') || templateName.includes('mrt') || templateName.includes('taxi')) {
                        category = 'transport';
                    } else if (templateName.includes('food') || templateName.includes('meal') || templateName.includes('restaurant') || templateName.includes('cafe')) {
                        category = 'food';
                    } else if (templateName.includes('shopping') || templateName.includes('clothes') || templateName.includes('electronics')) {
                        category = 'shopping';
                    } else if (templateName.includes('education') || templateName.includes('books') || templateName.includes('courses')) {
                        category = 'education';
                    }
                } else {
                    // Regular expense category detection
                    if (desc.includes('food') || desc.includes('meal') || desc.includes('restaurant') || desc.includes('cafe')) {
                        category = 'food';
                    } else if (desc.includes('transport') || desc.includes('bus') || desc.includes('mrt') || desc.includes('taxi')) {
                        category = 'transport';
                    } else if (desc.includes('entertainment') || desc.includes('movie') || desc.includes('game') || desc.includes('streaming')) {
                        category = 'entertainment';
                    } else if (desc.includes('utilities') || desc.includes('electricity') || desc.includes('water') || desc.includes('internet')) {
                        category = 'utilities';
                    } else if (desc.includes('shopping') || desc.includes('clothes') || desc.includes('electronics')) {
                        category = 'shopping';
                    } else if (desc.includes('healthcare') || desc.includes('medical') || desc.includes('pharmacy')) {
                        category = 'healthcare';
                    } else if (desc.includes('education') || desc.includes('books') || desc.includes('courses')) {
                        category = 'education';
                    }
                }
            }
            
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(expense);
        });
        
        return grouped;
    }

    /**
     * Get total monthly expenses
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<number>} Total expenses for current month
     */
    static async getTotalMonthlyExpenses(kv, userId) {
        const monthlyExpenses = await ProfileService.getMonthlyExpenses(kv, userId);
        return monthlyExpenses.reduce((total, expense) => total + expense.amount, 0);
    }

    /**
     * Get monthly savings progress
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Monthly savings progress information
     */
    static async getMonthlySavingsProgress(kv, userId) {
        const userData = await ExpenseService.getUserData(kv, userId);
        const monthlyBudget = userData.monthlyBudget || 0;
        const monthlyCashIncome = userData.monthlyCashIncome || 0;
        const monthlySavingsGoal = userData.monthlySavingsGoal || 0;
        
        const totalMonthlyExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);
        const monthlySavings = monthlyCashIncome - totalMonthlyExpenses;
        
        const budgetRemaining = monthlyBudget - totalMonthlyExpenses;
        const monthlySavingsProgress = monthlySavingsGoal > 0 ? 
            (monthlySavings / monthlySavingsGoal * 100) : 0;
        
        return {
            totalExpenses: totalMonthlyExpenses,
            monthlySavings,
            budgetRemaining,
            monthlySavingsProgress: Math.max(0, Math.min(100, monthlySavingsProgress)),
            monthlyBudget,
            monthlyCashIncome,
            monthlySavingsGoal
        };
    }

    /**
     * Check if user should receive budget alert
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} Alert information or null if no alert needed
     */
    static async checkBudgetAlert(kv, userId) {
        const progress = await ProfileService.getMonthlySavingsProgress(kv, userId);
        
        if (progress.budgetRemaining < 0) {
            return {
                type: 'budget_exceeded',
                message: `⚠️ **Budget Alert!** You have exceeded your monthly budget by $${Math.abs(progress.budgetRemaining).toFixed(2)}`
            };
        } else if (progress.budgetRemaining < progress.monthlyBudget * 0.2) {
            return {
                type: 'budget_low',
                message: `⚠️ **Budget Warning!** You have only $${progress.budgetRemaining.toFixed(2)} remaining in your monthly budget`
            };
        }
        
        return null;
    }

    /**
     * Send monthly report to user
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    static async sendMonthlyReport(env, userId) {
        try {
            const userData = await ExpenseService.getUserData(env.USER_DATA, userId);
            if (!userData.isInitialized) return;
            
            const chatId = parseInt(userId);
            const now = new Date();
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const monthName = lastMonth.toLocaleString('default', { month: 'long' }) + ' ' + lastMonth.getFullYear();
            
            const monthlyExpenses = await ProfileService.getMonthlyExpenses(env.USER_DATA, userId);
            const totalExpenses = monthlyExpenses.reduce((total, expense) => total + expense.amount, 0);
            
            const expensesByCategory = await ProfileService.getMonthlyExpensesByCategory(env.USER_DATA, userId);
            
            let report = `📊 **Monthly Report - ${monthName}**
━━━━━━━━━━━━━━━━
Total Expenses: $${totalExpenses.toFixed(2)}`;

            if (Object.keys(expensesByCategory).length > 0) {
                report += `\n\n**Expense Breakdown:**`;
                for (const [category, expenses] of Object.entries(expensesByCategory)) {
                    const categoryTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
                    report += `\n• ${category.charAt(0).toUpperCase() + category.slice(1)}: $${categoryTotal.toFixed(2)}`;
                }
            }
            
            report += `\n\nKeep tracking your expenses to reach your savings goals!`;
            
            await this.sendMessage(env, chatId, report);
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to send monthly report to ${userId}: ${error.message}`);
        }
    }

    /**
     * Send monthly reports to all users (for scheduled tasks)
     * @param {Object} env - Environment variables
     * @returns {Promise<void>}
     */
    static async sendMonthlyReports(env) {
        try {
            console.log('⏰ SCHEDULED: Starting monthly report distribution');
            
            // Note: In a real implementation, you would need to maintain a list of active user IDs
            // This is a placeholder for the actual implementation
            // You could store user IDs in a separate KV namespace or use a different approach
            
            console.log('✅ SCHEDULED: Monthly reports completed');
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to send monthly reports: ${error.message}`);
        }
    }

    /**
     * Send message to Telegram
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {string} text - Message text
     * @returns {Promise<void>}
     */
    static async sendMessage(env, chatId, text) {
        const botToken = env.BOT_TOKEN;
        if (!botToken) {
            throw new Error('BOT_TOKEN environment variable is required');
        }
        
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        };
        
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
    }
}