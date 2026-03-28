/**
 * Main bot application for Cloudflare Workers
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

import { ExpenseService, ProfileService, RecurringExpenseService, parseApplePayMessage } from './services.js';
import { GenericConversationHandler, FLOW_COMPLETE } from './conversations.js';
import { FLOWS, MAIN_MENU_BUTTONS, DEVELOPER_CHAT_ID } from './config.js';

// Conversation states
const MAIN_MENU = 0;
const ACTIVE_FLOW = 1;

// Request deduplication and timeout handling
const REQUEST_TIMEOUT = 300000; // 5 minutes max execution time
const REQUEST_CACHE_TTL = 60000; // 1 minute cache for deduplication

/**
 * Main bot class for Cloudflare Workers
 */
export default {
    /**
     * Handle incoming requests to the worker
     * @param {Request} request - Incoming HTTP request
     * @param {Object} env - Environment variables
     * @param {Object} ctx - ExecutionContext
     * @returns {Promise<Response>} HTTP response
     */
    async fetch(request, env, ctx) {
        try {
            // Parse the request URL to check if it's a webhook
            const url = new URL(request.url);
            
            // Handle webhook requests from Telegram
            if (url.pathname === '/webhook') {
                return await this.handleWebhook(request, env);
            }
            
            // Handle scheduled tasks
            if (url.pathname === '/scheduled') {
                return await this.handleScheduled(request, env);
            }
            
            // Handle other routes
            if (url.pathname === '/') {
                return new Response('Budget Billy Expense Tracker Bot is running!', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                });
            }
            
            return new Response('Not Found', { status: 404 });
            
        } catch (error) {
            console.error('❌ ERROR in fetch:', error);
            return new Response('Internal Server Error', { status: 500 });
        }
    },

    /**
     * Handle scheduled tasks (cron triggers)
     * @param {Request} request - Incoming HTTP request
     * @param {Object} env - Environment variables
     * @returns {Promise<Response>} HTTP response
     */
    async handleScheduled(request, env) {
        try {
            console.log('⏰ SCHEDULED: Processing scheduled task');
            
            // Send monthly reports to all users
            await ProfileService.sendMonthlyReports(env);
            
            return new Response('✅ Scheduled task completed', { status: 200 });
            
        } catch (error) {
            console.error('❌ ERROR in handleScheduled:', error);
            return new Response('Internal Server Error', { status: 500 });
        }
    },

    /**
     * Handle Telegram webhook requests
     * @param {Request} request - Incoming HTTP request
     * @param {Object} env - Environment variables
     * @returns {Promise<Response>} HTTP response
     */
    async handleWebhook(request, env) {
        try {
            const body = await request.json();
            console.log('📨 WEBHOOK: Received update:', JSON.stringify(body, null, 2));
            
            // Extract update information
            const update = body;
            const message = update.message || update.edited_message;
            
            if (!message) {
                console.log('ℹ️  INFO: No message in update, ignoring');
                return new Response('OK', { status: 200 });
            }
            
            const userId = message.from.id.toString();
            const text = message.text || '';
            const chatId = message.chat.id;
            
            // Request deduplication - prevent processing the same message multiple times
            const requestId = `${update.update_id}_${userId}_${Date.now()}`;
            const cacheKey = `request_${update.update_id}_${userId}`;
            
            // Check if this request was already processed (within cache TTL)
            if (env.REQUEST_CACHE) {
                try {
                    const cached = await env.REQUEST_CACHE.get(cacheKey);
                    if (cached) {
                        console.log(`🔄 DUPLICATE: Request ${update.update_id} already processed for user ${userId}`);
                        return new Response('OK', { status: 200 });
                    }
                } catch (cacheError) {
                    console.warn(`⚠️  WARNING: Request cache check failed: ${cacheError.message}`);
                }
            }
            
            // Set cache entry to prevent duplicate processing
            if (env.REQUEST_CACHE) {
                try {
                    await env.REQUEST_CACHE.put(cacheKey, 'processed', { expirationTtl: REQUEST_CACHE_TTL });
                    console.log(`💾 CACHE: Set cache for request ${update.update_id}`);
                } catch (cacheError) {
                    console.warn(`⚠️  WARNING: Request cache set failed: ${cacheError.message}`);
                }
            }
            
            // Check if KV namespaces are available
            if (!env.USER_DATA) {
                console.error('❌ ERROR: USER_DATA KV namespace not available');
                return new Response('KV namespace not configured', { status: 500 });
            }
            
            // Initialize conversation handler
            const conversationHandler = new GenericConversationHandler(FLOWS);
            
            // Handle different types of commands and messages
            let responseText = '';
            let keyboard = null;
            
            if (text === '/start') {
                responseText = await this.start(env.USER_DATA, userId, chatId);
            } else if (text === '/menu') {
                responseText = await this.menu(env.USER_DATA, userId, chatId);
            } else if (text === '/stats') {
                responseText = await this.stats(env.USER_DATA, userId, chatId);
            } else if (text === '/expense') {
                responseText = await this.expense(env.USER_DATA, userId, chatId);
            } else if (text === '/exit') {
                responseText = await this.exitFlow(env.USER_DATA, userId, chatId);
            } else if (text === '/cancel') {
                responseText = await this.cancel(env.USER_DATA, userId, chatId);
            } else if (text === '/edit_profile') {
                responseText = await this.editProfile(env.USER_DATA, userId, chatId);
            } else if (text === '/progress') {
                responseText = await this.progress(env.USER_DATA, userId, chatId);
            } else if (text === '/breakdown') {
                responseText = await this.breakdown(env.USER_DATA, userId, chatId);
            } else if (text === '/recurring') {
                responseText = await this.recurring(env.USER_DATA, userId, chatId);
            } else if (text === '/add_recurring') {
                responseText = await this.addRecurring(env.USER_DATA, userId, chatId);
            } else if (text === '/monthly-report' && userId === DEVELOPER_CHAT_ID.toString()) {
                responseText = await this.monthlyReport(env, userId, chatId);
            } else if (text.startsWith('/add ') && text.length > 5) {
                responseText = await this.quickAdd(env.USER_DATA, userId, chatId, text.substring(5));
            } else if (text === '/show_data' && userId === DEVELOPER_CHAT_ID.toString()) {
                responseText = await this.showData(env.USER_DATA, userId, chatId);
            } else {
                // Check for Apple Pay transaction message even during active flows
                const applePayData = parseApplePayMessage(text);
                if (applePayData && Object.keys(applePayData).length > 0) {
                    const currentFlow = await this.getCurrentFlow(env.USER_DATA, userId);
                    console.log(`🍎 APPLE_PAY: Detected Apple Pay transaction during flow '${currentFlow}' from user '${userId}'`);
                    console.log(`📦 APPLE_PAY_DATA: ${JSON.stringify(applePayData)}`);
                    
                    // Ensure user profile is initialized
                    const isInitialized = await ProfileService.isProfileInitialized(env.USER_DATA, userId);
                    if (!isInitialized) {
                        console.log(`⚠️  INFO: User not initialized, cannot process Apple Pay transaction`);
                        responseText = "❌ Please set up your profile first with /start before using Apple Pay integration.";
                    } else {
                        try {
                            // Create expense data for the service
                            const expenseData = {
                                amount: applePayData.amount,
                                merchant: applePayData.merchant,
                                description: `Apple Pay transaction on ${applePayData.date}`
                            };
                            
                            // Add the expense
                            const expense = await ExpenseService.addExpense(env.USER_DATA, userId, expenseData);
                            console.log(`✅ APPLE_PAY_SAVED: Expense recorded during flow - $${expense.amount} at ${applePayData.merchant}`);
                            
                            // Send confirmation message
                            const confirmationMsg = `✅ Apple Pay Transaction Recorded
━━━━━━━━━━━━━━━━
Amount: $${expense.amount.toFixed(2)}
Merchant: ${applePayData.merchant}
Date: ${applePayData.date}
Description: ${expense.description}

Your expense has been automatically added to your tracking!`;
                            
                            responseText = confirmationMsg;
                        } catch (error) {
                            console.error(`❌ APPLE_PAY_ERROR: Failed to save Apple Pay expense during flow: ${error.message}`);
                            responseText = `❌ Error recording Apple Pay transaction: ${error.message}`;
                        }
                    }
                } else {
                    // Handle menu choices and conversation input
                    const currentFlow = await this.getCurrentFlow(env.USER_DATA, userId);
                    
                    if (currentFlow) {
                        // Handle conversation input
                        const result = await conversationHandler.handleInput(
                            env.USER_DATA,
                            userId,
                            text,
                            this.getCompletionCallback(currentFlow)
                        );
                        
                        if (result === FLOW_COMPLETE) {
                            // Flow completed, show main menu
                            responseText = '✅ Operation completed successfully!';
                            keyboard = this.createKeyboard(MAIN_MENU_BUTTONS);
                        } else {
                            // Continue flow - get next prompt
                            const flow = FLOWS[currentFlow];
                            const currentStep = await this.getCurrentStep(env.USER_DATA, userId);
                            const nextStep = flow.getStep(currentStep);
                            
                            if (nextStep) {
                                responseText = nextStep.formField.prompt;
                            } else {
                                // No more steps, complete the flow
                                responseText = flow.completionMessage;
                                await this.clearFlow(env.USER_DATA, userId);
                                keyboard = this.createKeyboard(MAIN_MENU_BUTTONS);
                            }
                        }
                    } else {
                        // Handle main menu choices
                        responseText = await this.handleMenuChoice(env.USER_DATA, userId, chatId, text);
                        if (responseText === 'main_menu') {
                            responseText = 'What would you like to do?';
                            keyboard = this.createKeyboard(MAIN_MENU_BUTTONS);
                        }
                    }
                }
            }
            
            // Send response to Telegram
            if (responseText) {
                await this.sendMessage(env, chatId, responseText, keyboard);
            }
            
            return new Response('OK', { status: 200 });
            
        } catch (error) {
            console.error('❌ ERROR in handleWebhook:', error);
            return new Response('Internal Server Error', { status: 500 });
        }
    },

    /**
     * Handle /start command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async start(kv, userId, chatId) {
        console.log(`👤 START: User '${userId}' started conversation`);
        
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (isInitialized) {
            const userData = await ExpenseService.getUserData(kv, userId);
            const userName = userData.name || 'User';
            const summary = await ProfileService.getProfileSummary(kv, userId);
            return `👋 Welcome back, ${userName}!\n\n${summary}\n\nWhat would you like to do?`;
        } else {
            const welcomeText = `🤖 **Budget Billy** - Your Personal Finance Assistant\n\nHi! I'm here to help you track expenses and manage your budget.\n\nLet's start by setting up your profile.`;
            
            // Start setup flow
            const conversationHandler = new GenericConversationHandler(FLOWS);
            await conversationHandler.startFlow(kv, userId, 'expense_setup');
            
            const flow = FLOWS.expense_setup;
            const firstStep = flow.getStep(0);
            const setupText = `${welcomeText}\n\n${flow.welcome_message}\n\n${firstStep.formField.prompt}`;
            
            return setupText;
        }
    },

    /**
     * Handle /menu command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async menu(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        return "📋 Main Menu - What would you like to do?";
    },

    /**
     * Handle /stats command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async stats(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        return await ProfileService.getProfileSummary(kv, userId);
    },

    /**
     * Handle /expense command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async expense(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        const conversationHandler = new GenericConversationHandler(FLOWS);
        await conversationHandler.startFlow(kv, userId, 'expense_tracking');
        
        const flow = FLOWS.expense_tracking;
        const firstStep = flow.getStep(0);
        
        return `${flow.welcome_message}\n\n${firstStep.formField.prompt}`;
    },

    /**
     * Handle /exit command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async exitFlow(kv, userId, chatId) {
        const currentFlow = await this.getCurrentFlow(kv, userId);
        
        if (currentFlow) {
            await this.clearFlow(kv, userId);
            return "✅ Exited current flow.";
        } else {
            return "ℹ️ No active flow to exit.";
        }
    },

    /**
     * Handle /cancel command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async cancel(kv, userId, chatId) {
        const currentFlow = await this.getCurrentFlow(kv, userId);
        
        if (currentFlow) {
            await this.clearFlow(kv, userId);
            return "❌ Cancelled.";
        }
        
        return "❌ Cancelled.";
    },

    /**
     * Handle /edit_profile command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async editProfile(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        const conversationHandler = new GenericConversationHandler(FLOWS);
        await conversationHandler.startFlow(kv, userId, 'edit_profile');
        
        const flow = FLOWS.edit_profile;
        const firstStep = flow.getStep(0);
        
        return `${flow.welcome_message}\n\n${firstStep.formField.prompt}`;
    },

    /**
     * Handle /progress command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async progress(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        const progress = await ProfileService.getMonthlySavingsProgress(kv, userId);
        const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);
        
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long' });
        
        let message = `📊 **Monthly Progress - ${monthName}**
━━━━━━━━━━━━━━━━
Total Expenses: $${totalExpenses.toFixed(2)}
Monthly Income: $${progress.monthlyCashIncome.toFixed(2)}
Monthly Savings: $${progress.monthlySavings.toFixed(2)}
Budget Remaining: $${progress.budgetRemaining.toFixed(2)}`;
        
        if (progress.monthlySavingsGoal > 0) {
            message += `
Monthly Savings Goal: $${progress.monthlySavingsGoal.toFixed(2)}
Progress: ${progress.monthlySavingsProgress.toFixed(1)}%`;
        }
        
        // Check for budget alerts
        const alert = await ProfileService.checkBudgetAlert(kv, userId);
        if (alert) {
            message += `\n\n${alert.message}`;
        }
        
        return message;
    },

    /**
     * Handle /breakdown command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async breakdown(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        const expensesByCategory = await ProfileService.getMonthlyExpensesByCategory(kv, userId);
        const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);
        
        if (!expensesByCategory || Object.keys(expensesByCategory).length === 0) {
            return "📋 No expenses recorded for this month yet.";
        }
        
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long' });
        
        let message = `📊 **Expense Breakdown - ${monthName}**
━━━━━━━━━━━━━━━━
Total Expenses: $${totalExpenses.toFixed(2)}`;
        
        for (const [category, expenses] of Object.entries(expensesByCategory)) {
            const categoryTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
            const percentage = totalExpenses > 0 ? (categoryTotal / totalExpenses * 100) : 0;
            
            message += `\n\n**${category.charAt(0).toUpperCase() + category.slice(1)}** ($${categoryTotal.toFixed(2)} - ${percentage.toFixed(1)}%)`;
            
            // Show last 3 expenses in this category
            const sortedExpenses = expenses
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 3);
            
            for (const expense of sortedExpenses) {
                const desc = expense.description ? ` - ${expense.description}` : "";
                message += `\n  • $${expense.amount.toFixed(2)} at ${expense.merchant}${desc}`;
            }
        }
        
        return message;
    },

    /**
     * Handle /monthly-report command (admin only)
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async monthlyReport(env, userId, chatId) {
        if (userId !== DEVELOPER_CHAT_ID.toString()) {
            return "❌ Not authorized.";
        }
        
        try {
            // This would be called by a cron job to send reports to all users
            // For now, just return a confirmation message
            return "✅ Monthly reports will be sent to all users.";
        } catch (error) {
            console.error(`❌ ERROR: Failed to send monthly reports: ${error.message}`);
            return "❌ Error sending monthly reports.";
        }
    },

    /**
     * Handle quick add command (e.g., /add 15 coffee)
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {string} command - The command text (e.g., "15 coffee")
     * @returns {Promise<string>} Response text
     */
    async quickAdd(kv, userId, chatId, command) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        // Parse command like "15 coffee" or "15.50 lunch at mcdonalds"
        const match = command.match(/^(\d+(?:\.\d{1,2})?)\s+(.+)$/);
        if (!match) {
            return "❌ Invalid format. Use: /add [amount] [description]\nExample: /add 15 coffee";
        }
        
        const [_, amountStr, description] = match;
        const amount = parseFloat(amountStr);
        
        if (amount <= 0) {
            return "❌ Amount must be positive.";
        }
        
        try {
            const expenseData = {
                amount: amount,
                merchant: description.split(' at ')[1] || description.split(' ')[0] || "Unknown",
                description: description
            };
            
            const expense = await ExpenseService.addExpense(kv, userId, expenseData);
            
            return `✅ **Expense Added**
━━━━━━━━━━━━━━━━
Amount: $${expense.amount.toFixed(2)}
Description: ${expense.description}
Merchant: ${expense.merchant}`;
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to add quick expense: ${error.message}`);
            return `❌ Error adding expense: ${error.message}`;
        }
    },

    /**
     * Handle /recurring command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async recurring(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        return await RecurringExpenseService.getRecurringSummary(kv, userId);
    },

    /**
     * Handle /add_recurring command
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async addRecurring(kv, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        // Start template setup flow
        const conversationHandler = new GenericConversationHandler(FLOWS);
        await conversationHandler.startFlow(kv, userId, 'recurring_template');
        
        const flow = FLOWS.recurring_template;
        const firstStep = flow.getStep(0);
        
        return `${flow.welcome_message}\n\n${firstStep.formField.prompt}`;
    },

    /**
     * Handle /show_data command (developer only)
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async showData(kv, userId, chatId) {
        if (userId !== DEVELOPER_CHAT_ID.toString()) {
            return "❌ Not authorized.";
        }
        
        const userData = await ExpenseService.getUserData(kv, userId);
        return `Debug data:\n${JSON.stringify(userData, null, 2)}`;
    },

    /**
     * Handle main menu choices
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {string} choice - User's menu choice
     * @returns {Promise<string>} Response text
     */
    async handleMenuChoice(kv, userId, chatId, choice) {
        console.log(`🎯 MENU: User '${userId}' selected: '${choice}'`);
        
        // Check for Apple Pay transaction message
        const applePayData = parseApplePayMessage(choice);
        if (applePayData && Object.keys(applePayData).length > 0) {
            console.log(`🍎 APPLE_PAY: Detected Apple Pay transaction from user '${userId}'`);
            console.log(`📦 APPLE_PAY_DATA: ${JSON.stringify(applePayData)}`);
            
            // Ensure user profile is initialized
            const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
            if (!isInitialized) {
                console.log(`⚠️  INFO: User not initialized, cannot process Apple Pay transaction`);
                return "❌ Please set up your profile first with /start before using Apple Pay integration.";
            }
            
            try {
                // Create expense data for the service
                const expenseData = {
                    amount: applePayData.amount,
                    merchant: applePayData.merchant,
                    description: `Apple Pay transaction on ${applePayData.date}`
                };
                
                // Add the expense
                const expense = await ExpenseService.addExpense(kv, userId, expenseData);
                console.log(`✅ APPLE_PAY_SAVED: Expense recorded - $${expense.amount} at ${applePayData.merchant}`);
                
                // Send confirmation message
                const confirmationMsg = `✅ Apple Pay Transaction Recorded
━━━━━━━━━━━━━━━━
Amount: $${expense.amount.toFixed(2)}
Merchant: ${applePayData.merchant}
Date: ${applePayData.date}
Description: ${expense.description}

Your expense has been automatically added to your tracking!`;
                
                return confirmationMsg;
                
            } catch (error) {
                console.error(`❌ APPLE_PAY_ERROR: Failed to save Apple Pay expense: ${error.message}`);
                return `❌ Error recording Apple Pay transaction: ${error.message}`;
            }
        }
        
        if (choice.includes("Add Expense")) {
            const conversationHandler = new GenericConversationHandler(FLOWS);
            await conversationHandler.startFlow(kv, userId, 'expense_tracking');
            
            const flow = FLOWS.expense_tracking;
            const firstStep = flow.getStep(0);
            return firstStep.formField.prompt;
        } else if (choice.includes("View Stats")) {
            return await ProfileService.getProfileSummary(kv, userId);
        } else if (choice.includes("Progress")) {
            const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
            
            if (!isInitialized) {
                return "❌ Please set up your profile first with /start";
            }
            
            const progress = await ProfileService.getMonthlySavingsProgress(kv, userId);
            const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);
            
            const now = new Date();
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            let message = `📊 **Monthly Progress - ${monthName}**
━━━━━━━━━━━━━━━━
Total Expenses: $${totalExpenses.toFixed(2)}
Monthly Income: $${progress.monthlyCashIncome.toFixed(2)}
Monthly Savings: $${progress.monthlySavings.toFixed(2)}
Budget Remaining: $${progress.budgetRemaining.toFixed(2)}`;
            
            if (progress.monthlySavingsGoal > 0) {
                message += `
Monthly Savings Goal: $${progress.monthlySavingsGoal.toFixed(2)}
Progress: ${progress.monthlySavingsProgress.toFixed(1)}%`;
            }
            
            // Check for budget alerts
            const alert = await ProfileService.checkBudgetAlert(kv, userId);
            if (alert) {
                message += `\n\n${alert.message}`;
            }
            
            return message;
        } else if (choice.includes("Breakdown")) {
            const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
            
            if (!isInitialized) {
                return "❌ Please set up your profile first with /start";
            }
            
            const expensesByCategory = await ProfileService.getMonthlyExpensesByCategory(kv, userId);
            const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);
            
            if (!expensesByCategory || Object.keys(expensesByCategory).length === 0) {
                return "📋 No expenses recorded for this month yet.";
            }
            
            const now = new Date();
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            let message = `📊 **Expense Breakdown - ${monthName}**
━━━━━━━━━━━━━━━━
Total Expenses: $${totalExpenses.toFixed(2)}`;
            
            for (const [category, expenses] of Object.entries(expensesByCategory)) {
                const categoryTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
                const percentage = totalExpenses > 0 ? (categoryTotal / totalExpenses * 100) : 0;
                
                message += `\n\n**${category.charAt(0).toUpperCase() + category.slice(1)}** ($${categoryTotal.toFixed(2)} - ${percentage.toFixed(1)}%)`;
                
                // Show last 3 expenses in this category
                const sortedExpenses = expenses
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 3);
                
                for (const expense of sortedExpenses) {
                    const desc = expense.description ? ` - ${expense.description}` : "";
                    message += `\n  • $${expense.amount.toFixed(2)} at ${expense.merchant}${desc}`;
                }
            }
            
            return message;
        } else if (choice.includes("Recurring")) {
            const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
            
            if (!isInitialized) {
                return "❌ Please set up your profile first with /start";
            }
            
            return await RecurringExpenseService.getRecurringSummary(kv, userId);
        } else if (choice.includes("History")) {
            return await this.showExpenseHistory(kv, userId, chatId);
        }
        
        return 'main_menu';
    },

    /**
     * Show expense history by merchant
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async showExpenseHistory(kv, userId, chatId) {
        const expensesByMerchant = await ExpenseService.getExpensesByMerchant(kv, userId);
        
        if (!expensesByMerchant || Object.keys(expensesByMerchant).length === 0) {
            return "📋 No expenses recorded yet.";
        }
        
        let message = "📋 **Expense History**\n━━━━━━━━━━━━━━━━\n";
        let totalAmount = 0;
        
        for (const [merchant, expenses] of Object.entries(expensesByMerchant)) {
            const merchantTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
            totalAmount += merchantTotal;
            
            message += `\n**${merchant.charAt(0).toUpperCase() + merchant.slice(1)}** ($${merchantTotal.toFixed(2)})\n`;
            
            // Show last 5 expenses with this merchant
            const sortedExpenses = expenses
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 5);
            
            for (const expense of sortedExpenses) {
                const desc = expense.description ? ` - ${expense.description}` : "";
                message += `  • $${expense.amount.toFixed(2)}${desc}\n`;
            }
        }
        
        return message;
    },

    /**
     * Get completion callback for a specific flow
     * @param {string} flowName - Name of the flow
     * @returns {Function} Completion callback function
     */
    getCompletionCallback(flowName) {
        if (flowName === 'expense_setup') {
            return this.onSetupComplete.bind(this);
        } else if (flowName === 'expense_tracking') {
            return this.onExpenseComplete.bind(this);
        } else if (flowName === 'edit_profile') {
            return this.onEditProfileComplete.bind(this);
        } else if (flowName === 'recurring_template') {
            return this.onRecurringTemplateComplete.bind(this);
        }
        return null;
    },

    /**
     * Handle completion of recurring template flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} flowData - Flow data
     * @returns {Promise<void>}
     */
    async onRecurringTemplateComplete(kv, userId, flowData) {
        console.log(`✅ CALLBACK: Recurring template flow completed for user ${userId}`);
        console.log(`📦 TEMPLATE_DATA: ${JSON.stringify(flowData)}`);
        
        try {
            const templateData = {
                name: flowData.template_name,
                amount: flowData.template_amount,
                merchant: flowData.template_merchant,
                category: flowData.template_category,
                frequency: flowData.template_frequency,
                description: flowData.template_description || ''
            };
            
            await RecurringExpenseService.addRecurringTemplate(kv, userId, templateData);
            console.log(`✅ TEMPLATE: Recurring template '${templateData.name}' created successfully`);
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to create recurring template: ${error.message}`);
        }
    },

    /**
     * Handle completion of setup flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} flowData - Flow data
     * @returns {Promise<void>}
     */
    async onSetupComplete(kv, userId, flowData) {
        console.log(`✅ CALLBACK: Setup flow completed for user ${userId}`);
        console.log(`📦 SETUP_DATA: ${JSON.stringify(flowData)}`);
        
        await ProfileService.initializeProfile(kv, userId, flowData);
        console.log(`✅ PROFILE: User profile initialized successfully`);
    },

    /**
     * Handle completion of expense tracking flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} flowData - Flow data
     * @returns {Promise<void>}
     */
    async onExpenseComplete(kv, userId, flowData) {
        console.log(`✅ CALLBACK: Expense tracking flow completed for user ${userId}`);
        console.log(`📦 EXPENSE_DATA: ${JSON.stringify(flowData)}`);
        
        try {
            await ExpenseService.addExpense(kv, userId, flowData);
            console.log(`✅ SAVED: Expense recorded successfully`);
        } catch (error) {
            console.error(`❌ ERROR: Failed to save expense: ${error.message}`);
        }
    },

    /**
     * Handle completion of edit profile flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {Object} flowData - Flow data
     * @returns {Promise<void>}
     */
    async onEditProfileComplete(kv, userId, flowData) {
        console.log(`✅ CALLBACK: Edit profile flow completed for user ${userId}`);
        console.log(`📦 PROFILE_DATA: ${JSON.stringify(flowData)}`);
        
        try {
            const userData = await ExpenseService.getUserData(kv, userId);
            // Update only the fields that were provided
            if (flowData.name && flowData.name.trim().length > 0) userData.name = flowData.name.trim();
            if (flowData.current_savings) userData.currentSavings = parseFloat(flowData.current_savings);
            if (flowData.monthly_budget) userData.monthlyBudget = parseFloat(flowData.monthly_budget);
            if (flowData.savings_goal) userData.savingsGoal = parseFloat(flowData.savings_goal);
            if (flowData.monthly_cash_income) userData.monthlyCashIncome = parseFloat(flowData.monthly_cash_income);
            if (flowData.monthly_savings_goal) userData.monthlySavingsGoal = parseFloat(flowData.monthly_savings_goal);
            
            await ExpenseService.saveUserData(kv, userId, userData);
            console.log(`✅ SAVED: Profile updated successfully`);
        } catch (error) {
            console.error(`❌ ERROR: Failed to update profile: ${error.message}`);
        }
    },

    /**
     * Send message to Telegram with improved error handling and retry logic
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {string} text - Message text
     * @param {Array} keyboard - Optional keyboard
     * @returns {Promise<void>}
     */
    async sendMessage(env, chatId, text, keyboard = null) {
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
        
        if (keyboard) {
            body.reply_markup = {
                keyboard: keyboard,
                one_time_keyboard: true,
                resize_keyboard: true
            };
        }
        
        // Rate limiting: wait between messages to avoid hitting Telegram limits
        await this.rateLimitDelay();
        
        try {
            console.debug(`📤 SEND_MESSAGE: Sending to chat ${chatId}: ${text.substring(0, 50)}...`);
            
            const startTime = Date.now();
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            const responseTime = Date.now() - startTime;
            
            console.debug(`⏱️  RESPONSE_TIME: ${responseTime}ms`);
            
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
                        
                        // Handle specific Telegram errors
                        if (errorData.error_code === 429) {
                            // Rate limit exceeded - wait and retry
                            console.warn(`⚠️  RATE_LIMIT: Telegram rate limit exceeded, waiting 2 seconds...`);
                            await this.delay(2000);
                            return await this.sendMessage(env, chatId, text, keyboard);
                        } else if (errorData.error_code === 403) {
                            // User blocked the bot
                            console.warn(`⚠️  BLOCKED: User ${chatId} has blocked the bot`);
                            return; // Don't throw error for blocked users
                        }
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
            
            console.info(`✅ MESSAGE_SENT: Successfully sent message to chat ${chatId} (${responseTime}ms)`);
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to send message: ${error.message}`);
            throw error;
        }
    },

    /**
     * Simple rate limiting to avoid Telegram API limits
     * @returns {Promise<void>}
     */
    async rateLimitDelay() {
        // Wait 500ms between messages to avoid hitting rate limits
        await this.delay(500);
    },

    /**
     * Utility delay function
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Create keyboard markup
     * @param {Array} buttons - Array of button rows
     * @returns {Array} Keyboard markup
     */
    createKeyboard(buttons) {
        return buttons;
    },

    /**
     * Get current flow from KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<string|null>} Current flow name
     */
    async getCurrentFlow(kv, userId) {
        const context = await this.getContext(kv, userId);
        return context?.currentFlow || null;
    },

    /**
     * Get current step from KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<number>} Current step index
     */
    async getCurrentStep(kv, userId) {
        const context = await this.getContext(kv, userId);
        return context?.currentStep || 0;
    },

    /**
     * Clear flow from KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    async clearFlow(kv, userId) {
        await kv.delete(`${userId}:context`);
    },

    /**
     * Get context from KV
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Context object
     */
    async getContext(kv, userId) {
        try {
            const data = await kv.get(`${userId}:context`, "json");
            return data || {};
        } catch (error) {
            console.error(`❌ ERROR: Failed to get context for ${userId}: ${error.message}`);
            return {};
        }
    }
};