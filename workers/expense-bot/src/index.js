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
            
            // Handle callback queries FIRST (before checking for message)
            // This is critical because callback queries have message nested inside callback_query.message
            if (update.callback_query) {
                await this.handleCallbackQuery(env, update.callback_query);
                return new Response('OK', { status: 200 });
            }
            
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
                responseText = await this.editProfile(env, userId, chatId);
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
            } else if (text === '/edit_expense') {
                await this.editExpense(env, userId, chatId);
                return new Response('OK', { status: 200 });
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
                    // Check if user is in edit mode (editing an expense field)
                    const editContext = await this.getContext(env.USER_DATA, userId);
                    if (editContext.editExpenseField) {
                        await this.handleEditInput(env, userId, chatId, text);
                        return new Response('OK', { status: 200 });
                    }
                    
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
                                
                                // If field allows skip, send with inline keyboard
                                if (nextStep.formField.allowSkip) {
                                    const inlineKeyboard = [
                                        [{ text: "⏭️ Skip - Keep Current", callback_data: `skip_field:${nextStep.key}` }]
                                    ];
                                    await this.sendMessageWithInlineKeyboard(env, chatId, responseText, inlineKeyboard);
                                    return new Response('OK', { status: 200 });
                                }
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
            const setupText = `${welcomeText}\n\n${flow.welcomeMessage}\n\n${firstStep.formField.prompt}`;
            
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
        
        return `${flow.welcomeMessage}\n\n${firstStep.formField.prompt}`;
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
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async editProfile(env, userId, chatId) {
        const isInitialized = await ProfileService.isProfileInitialized(env.USER_DATA, userId);
        
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        const conversationHandler = new GenericConversationHandler(FLOWS);
        await conversationHandler.startFlow(env.USER_DATA, userId, 'edit_profile');
        
        const flow = FLOWS.edit_profile;
        const firstStep = flow.getStep(0);
        const message = `${flow.welcomeMessage}\n\n${firstStep.formField.prompt}`;
        
        // If first field allows skip, send with inline keyboard
        if (firstStep.formField.allowSkip) {
            const inlineKeyboard = [
                [{ text: "⏭️ Skip - Keep Current", callback_data: `skip_field:${firstStep.key}` }]
            ];
            await this.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
            return null; // Return null since we're sending via sendMessageWithInlineKeyboard
        }
        
        return message;
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
        
        return `${flow.welcomeMessage}\n\n${firstStep.formField.prompt}`;
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
     * Send message with inline keyboard
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {string} text - Message text
     * @param {Array} inlineKeyboard - Inline keyboard buttons (array of arrays)
     * @returns {Promise<void>}
     */
    async sendMessageWithInlineKeyboard(env, chatId, text, inlineKeyboard = null) {
        const botToken = env.BOT_TOKEN;
        if (!botToken) {
            throw new Error('BOT_TOKEN environment variable is required');
        }
        
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined
        };
        
        // Rate limiting: wait between messages to avoid hitting Telegram limits
        await this.rateLimitDelay();
        
        try {
            console.debug(`📤 SEND_INLINE: Sending to chat ${chatId}: ${text.substring(0, 50)}...`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            const responseText = await response.text();
            console.debug(`📥 RESPONSE: Status ${response.status}, Body: ${responseText}`);
            
            if (!response.ok) {
                let errorMessage = `Telegram API error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = JSON.parse(responseText);
                    if (errorData && errorData.description) {
                        errorMessage = `Telegram API error: ${errorData.description}`;
                    }
                } catch (parseError) {
                    errorMessage = `Telegram API error: ${response.status} ${response.statusText} - ${responseText}`;
                }
                throw new Error(errorMessage);
            }
            
            console.info(`✅ INLINE_MESSAGE_SENT: Successfully sent inline message to chat ${chatId}`);
            
        } catch (error) {
            console.error(`❌ ERROR: Failed to send inline message: ${error.message}`);
            throw error;
        }
    },

    /**
     * Answer callback query (for inline button presses)
     * @param {Object} env - Environment variables
     * @param {number} callbackQueryId - Callback query ID
     * @param {string} message - Optional message to show
     * @returns {Promise<void>}
     */
    async answerCallbackQuery(env, callbackQueryId, message = null) {
        const botToken = env.BOT_TOKEN;
        if (!botToken) {
            throw new Error('BOT_TOKEN environment variable is required');
        }
        
        const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
        const body = {
            callback_query_id: callbackQueryId
        };
        
        if (message) {
            body.text = message;
            body.show_alert = false; // Show as notification, not alert
        }
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                const responseText = await response.text();
                console.error(`❌ ERROR: Failed to answer callback query: ${responseText}`);
            }
        } catch (error) {
            console.error(`❌ ERROR: Failed to answer callback query: ${error.message}`);
        }
    },

    /**
     * Edit message text (for updating inline messages)
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {number} messageId - Message ID to edit
     * @param {string} text - New message text
     * @param {Array} inlineKeyboard - New inline keyboard (optional)
     * @returns {Promise<void>}
     */
    async editMessageText(env, chatId, messageId, text, inlineKeyboard = null) {
        const botToken = env.BOT_TOKEN;
        if (!botToken) {
            throw new Error('BOT_TOKEN environment variable is required');
        }
        
        const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'Markdown'
        };
        
        if (inlineKeyboard) {
            body.reply_markup = { inline_keyboard: inlineKeyboard };
        }
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                const responseText = await response.text();
                console.error(`❌ ERROR: Failed to edit message: ${responseText}`);
            }
        } catch (error) {
            console.error(`❌ ERROR: Failed to edit message: ${error.message}`);
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
    },

    /**
     * Get flow data from KV context
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Flow data object
     */
    async getFlowData(kv, userId) {
        const context = await this.getContext(kv, userId);
        return context?.flowData || {};
    },

    /**
     * Advance to the next step in the current flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    async advanceStep(kv, userId) {
        const context = await this.getContext(kv, userId);
        const currentStep = context?.currentStep || 0;
        context.currentStep = currentStep + 1;
        await kv.put(`${userId}:context`, JSON.stringify(context));
        console.debug(`➡️  STATE: Advanced step: ${currentStep} → ${currentStep + 1}`);
    },

    /**
     * Handle /edit_expense command
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async editExpense(env, userId, chatId) {
        console.log(`✏️ EDIT_EXPENSE: User '${userId}' requested to edit expense`);
        
        const isInitialized = await ProfileService.isProfileInitialized(env.USER_DATA, userId);
        if (!isInitialized) {
            return "❌ Please set up your profile first with /start";
        }
        
        // Get recent expenses
        const expenses = await ExpenseService.getRecentExpenses(env.USER_DATA, userId, 10);
        
        if (!expenses || expenses.length === 0) {
            return "📋 You don't have any expenses to edit yet. Start tracking with /expense";
        }
        
        // Build inline keyboard with expenses
        const inlineKeyboard = [];
        
        for (const expense of expenses) {
            const date = new Date(expense.timestamp);
            const dateStr = date.toISOString().split('T')[0];
            
            // Button text: "$50.00 - Starbucks (2024-01-15)"
            const buttonText = `$${expense.amount.toFixed(2)} - ${expense.merchant} (${dateStr})`;
            
            // Callback data: "edit_exp:{originalIndex}"
            const callbackData = `edit_exp:${expense.originalIndex}`;
            
            inlineKeyboard.push([{
                text: buttonText,
                callback_data: callbackData
            }]);
        }
        
        // Add a cancel button
        inlineKeyboard.push([{
            text: "❌ Cancel",
            callback_data: "edit_cancel"
        }]);
        
        // Send message with inline keyboard
        const message = "📋 Here are your recent expenses. Which one would you like to edit?";
        await this.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
        
        return null; // Return null since we're sending via sendMessageWithInlineKeyboard
    },

    /**
     * Handle callback queries from inline keyboards
     * @param {Object} env - Environment variables
     * @param {Object} callbackQuery - Callback query object from Telegram
     * @returns {Promise<void>}
     */
    async handleCallbackQuery(env, callbackQuery) {
        try {
            const userId = callbackQuery.from.id.toString();
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const data = callbackQuery.data;
            
            console.log(`🔘 CALLBACK: User '${userId}' triggered callback: '${data}'`);
            
            // Answer the callback query immediately to remove loading state
            await this.answerCallbackQuery(env, callbackQuery.id);
            
            if (data === 'edit_cancel') {
                await this.sendMessage(env, chatId, "❌ Edit cancelled.");
                return;
            }
            
            if (data.startsWith('edit_exp:')) {
                // Extract expense index
                const index = parseInt(data.split(':')[1]);
                
                if (isNaN(index)) {
                    await this.sendMessage(env, chatId, "❌ Invalid expense selection.");
                    return;
                }
                
                // Get the expense
                const expense = await ExpenseService.getExpenseByIndex(env.USER_DATA, userId, index);
                
                if (!expense) {
                    await this.sendMessage(env, chatId, "❌ Expense not found. It may have been deleted.");
                    return;
                }
                
                // Store selected expense info in context for later use
                const context = await this.getContext(env.USER_DATA, userId);
                context.editExpenseIndex = index;
                context.editExpenseData = expense;
                await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));
                
                // Build the edit menu
                const date = new Date(expense.timestamp);
                const dateStr = date.toISOString().split('T')[0];
                const desc = expense.description || '(No description)';
                const category = expense.category || 'Other';
                
                const message = `✏️ **Editing Expense**
━━━━━━━━━━━━━━━━
💰 Amount: $${expense.amount.toFixed(2)}
📅 Date: ${dateStr}
📝 Description: ${desc}
🏷️ Category: ${category}

What would you like to edit?`;
                
                const inlineKeyboard = [
                    [
                        { text: "💰 Amount", callback_data: "edit_field:amount" },
                        { text: "📅 Date", callback_data: "edit_field:date" }
                    ],
                    [
                        { text: "📝 Description", callback_data: "edit_field:description" },
                        { text: "🏷️ Category", callback_data: "edit_field:category" }
                    ],
                    [
                        { text: "🗑️ Delete", callback_data: "edit_delete" }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: "edit_cancel_menu" }
                    ]
                ];
                
                await this.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
                return;
            }
            
            if (data.startsWith('edit_field:')) {
                // User wants to edit a specific field
                const field = data.split(':')[1];
                const context = await this.getContext(env.USER_DATA, userId);
                const expense = context.editExpenseData;
                
                if (!expense) {
                    await this.sendMessage(env, chatId, "❌ Session expired. Please select the expense again with /edit_expense");
                    return;
                }
                
                // Store the field being edited in context
                context.editExpenseField = field;
                await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));
                
                // Prompt for new value based on field
                let prompt = '';
                switch (field) {
                    case 'amount':
                        prompt = `Current amount: $${expense.amount.toFixed(2)}. Enter new amount (e.g., 75.50):`;
                        break;
                    case 'date':
                        const date = new Date(expense.timestamp);
                        prompt = `Current date: ${date.toISOString().split('T')[0]}. Enter new date (YYYY-MM-DD format):`;
                        break;
                    case 'description':
                        prompt = `Current description: "${expense.description || ''}". Enter new description:`;
                        break;
                    case 'category':
                        prompt = `Current category: ${expense.category || 'Other'}. Enter new category (e.g., food, transport, entertainment):`;
                        break;
                }
                
                await this.sendMessage(env, chatId, prompt);
                return;
            }
            
            if (data === 'edit_delete') {
                // Confirm deletion
                const context = await this.getContext(env.USER_DATA, userId);
                const expense = context.editExpenseData;
                
                if (!expense) {
                    await this.sendMessage(env, chatId, "❌ Session expired. Please select the expense again with /edit_expense");
                    return;
                }
                
                const date = new Date(expense.timestamp);
                const dateStr = date.toISOString().split('T')[0];
                
                const message = `⚠️ **DELETE CONFIRMATION**
━━━━━━━━━━━━━━━━
Are you sure you want to delete this expense?

💰 $${expense.amount.toFixed(2)} at ${expense.merchant}
📅 ${dateStr}
📝 ${expense.description || '(No description)'}

This action cannot be undone.`;
                
                const inlineKeyboard = [
                    [
                        { text: "✅ Yes, Delete", callback_data: "edit_delete_confirm" },
                        { text: "❌ Cancel", callback_data: "edit_cancel_menu" }
                    ]
                ];
                
                await this.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
                return;
            }
            
            if (data === 'edit_delete_confirm') {
                // Perform deletion
                const context = await this.getContext(env.USER_DATA, userId);
                const index = context.editExpenseIndex;
                
                if (index === undefined) {
                    await this.sendMessage(env, chatId, "❌ Session expired. Please try again with /edit_expense");
                    return;
                }
                
                try {
                    const deleted = await ExpenseService.deleteExpense(env.USER_DATA, userId, index);
                    
                    // Clear the edit context
                    delete context.editExpenseIndex;
                    delete context.editExpenseData;
                    delete context.editExpenseField;
                    await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));
                    
                    await this.sendMessage(env, chatId, `🗑️ Expense deleted successfully!

Removed: $${deleted.amount.toFixed(2)} at ${deleted.merchant} on ${new Date(deleted.timestamp).toISOString().split('T')[0]}`);
                } catch (error) {
                    await this.sendMessage(env, chatId, `❌ Error deleting expense: ${error.message}`);
                }
                return;
            }
            
            if (data === 'edit_cancel_menu') {
                // Clear the edit context
                const context = await this.getContext(env.USER_DATA, userId);
                delete context.editExpenseIndex;
                delete context.editExpenseData;
                delete context.editExpenseField;
                await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));
                
                await this.sendMessage(env, chatId, "❌ Edit cancelled.");
                return;
            }
            
            if (data.startsWith('skip_field:')) {
                // User wants to skip the current field in a conversation flow
                const fieldKey = data.split(':')[1];
                console.log(`⏭️ SKIP: User '${userId}' skipping field '${fieldKey}'`);
                
                const currentFlow = await this.getCurrentFlow(env.USER_DATA, userId);
                if (!currentFlow) {
                    await this.sendMessage(env, chatId, "❌ No active flow to skip in.");
                    return;
                }
                
                const flow = FLOWS[currentFlow];
                const currentStep = await this.getCurrentStep(env.USER_DATA, userId);
                const totalSteps = flow.stepCount();
                
                // Check if flow is complete after skipping
                if (currentStep + 1 >= totalSteps) {
                    // Flow completed, call completion callback
                    const flowData = await this.getFlowData(env.USER_DATA, userId);
                    const callback = this.getCompletionCallback(currentFlow);
                    
                    if (callback) {
                        await callback(env.USER_DATA, userId, flowData);
                    }
                    
                    await this.clearFlow(env.USER_DATA, userId);
                    await this.sendMessage(env, chatId, "✅ Operation completed successfully!");
                    return;
                }
                
                // Advance to next step
                await this.advanceStep(env.USER_DATA, userId);
                const nextStep = await this.getCurrentStep(env.USER_DATA, userId);
                const nextStepObj = flow.getStep(nextStep);
                
                if (nextStepObj) {
                    // Send next prompt with skip button if applicable
                    if (nextStepObj.formField.allowSkip) {
                        const inlineKeyboard = [
                            [{ text: "⏭️ Skip - Keep Current", callback_data: `skip_field:${nextStepObj.key}` }]
                        ];
                        await this.sendMessageWithInlineKeyboard(env, chatId, nextStepObj.formField.prompt, inlineKeyboard);
                    } else {
                        await this.sendMessage(env, chatId, nextStepObj.formField.prompt);
                    }
                } else {
                    // No more steps, complete the flow
                    const flowData = await this.getFlowData(env.USER_DATA, userId);
                    const callback = this.getCompletionCallback(currentFlow);
                    
                    if (callback) {
                        await callback(env.USER_DATA, userId, flowData);
                    }
                    
                    await this.clearFlow(env.USER_DATA, userId);
                    await this.sendMessage(env, chatId, flow.completionMessage);
                }
                
                return;
            }
            
        } catch (error) {
            console.error(`❌ ERROR in handleCallbackQuery: ${error.message}`);
        }
    },

    /**
     * Handle text input during edit flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {string} text - User's text input
     * @returns {Promise<void>}
     */
    async handleEditInput(env, userId, chatId, text) {
        const kv = env.USER_DATA;
        const context = await this.getContext(kv, userId);
        const field = context.editExpenseField;
        const expense = context.editExpenseData;
        
        if (!field || !expense) {
            // Not in edit mode
            return;
        }
        
        try {
            const updates = {};
            
            switch (field) {
                case 'amount':
                    const amount = parseFloat(text);
                    if (isNaN(amount) || amount <= 0) {
                        await this.sendMessage(env, chatId, "❌ Invalid amount. Please enter a positive number (e.g., 75.50):");
                        return;
                    }
                    if (amount > 10000) {
                        await this.sendMessage(env, chatId, "❌ Amount seems too high. Please enter a valid amount:");
                        return;
                    }
                    updates.amount = amount;
                    break;
                    
                case 'date':
                    const dateMatch = text.match(/^\d{4}-\d{2}-\d{2}$/);
                    if (!dateMatch) {
                        await this.sendMessage(env, chatId, "❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2024-01-20):");
                        return;
                    }
                    // Validate the date is real
                    const dateObj = new Date(text);
                    if (isNaN(dateObj.getTime())) {
                        await this.sendMessage(env, chatId, "❌ Invalid date. Please enter a valid date:");
                        return;
                    }
                    updates.timestamp = dateObj.toISOString();
                    break;
                    
                case 'description':
                    if (text.length > 200) {
                        await this.sendMessage(env, chatId, "❌ Description too long. Please keep it under 200 characters:");
                        return;
                    }
                    updates.description = text.trim();
                    break;
                    
                case 'category':
                    const category = text.toLowerCase().trim();
                    if (category.length < 2) {
                        await this.sendMessage(env, chatId, "❌ Category too short. Please enter a valid category:");
                        return;
                    }
                    updates.category = category;
                    break;
            }
            
            // Apply the update
            const index = context.editExpenseIndex;
            const updated = await ExpenseService.updateExpense(kv, userId, index, updates);
            
            // Clear the entire edit context
            delete context.editExpenseField;
            delete context.editExpenseData;
            delete context.editExpenseIndex;
            await kv.put(`${userId}:context`, JSON.stringify(context));
            
            // Show confirmation message
            const date = new Date(updated.timestamp);
            const dateStr = date.toISOString().split('T')[0];
            const desc = updated.description || '(No description)';
            const cat = updated.category || 'Other';
            
            const message = `✅ **Expense Updated**
━━━━━━━━━━━━━━━━
💰 Amount: $${updated.amount.toFixed(2)}
📅 Date: ${dateStr}
📝 Description: ${desc}
🏷️ Category: ${cat}

Your expense has been successfully updated!`;
            
            await this.sendMessage(env, chatId, message);
            
        } catch (error) {
            await this.sendMessage(env, chatId, `❌ Error updating expense: ${error.message}`);
        }
    }
};
