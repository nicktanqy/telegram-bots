/**
 * Main bot application for Cloudflare Workers
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

import { ExpenseService, ProfileService } from './services.js';
import { GenericConversationHandler, FLOW_COMPLETE } from './conversations.js';
import { FLOWS, MAIN_MENU_BUTTONS, DEVELOPER_CHAT_ID } from './config.js';

// Conversation states
const MAIN_MENU = 0;
const ACTIVE_FLOW = 1;

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
            } else if (text === '/show_data' && userId === DEVELOPER_CHAT_ID.toString()) {
                responseText = await this.showData(env.USER_DATA, userId, chatId);
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
        
        if (choice.includes("Add Expense")) {
            const conversationHandler = new GenericConversationHandler(FLOWS);
            await conversationHandler.startFlow(kv, userId, 'expense_tracking');
            
            const flow = FLOWS.expense_tracking;
            const firstStep = flow.getStep(0);
            return firstStep.formField.prompt;
        } else if (choice.includes("View Stats")) {
            return await ProfileService.getProfileSummary(kv, userId);
        } else if (choice.includes("History")) {
            return await this.showExpenseHistory(kv, userId, chatId);
        } else if (choice.includes("Settings")) {
            return "⚙️ Settings not yet implemented.\nUse /edit_profile to update your information.";
        }
        
        return 'main_menu';
    },

    /**
     * Show expense history by category
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @returns {Promise<string>} Response text
     */
    async showExpenseHistory(kv, userId, chatId) {
        const expensesByCategory = await ExpenseService.getExpensesByCategory(kv, userId);
        
        if (!expensesByCategory || Object.keys(expensesByCategory).length === 0) {
            return "📋 No expenses recorded yet.";
        }
        
        let message = "📋 **Expense History**\n━━━━━━━━━━━━━━━━\n";
        let totalAmount = 0;
        
        for (const [category, expenses] of Object.entries(expensesByCategory)) {
            const categoryTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
            totalAmount += categoryTotal;
            
            message += `\n**${category.charAt(0).toUpperCase() + category.slice(1)}** ($${categoryTotal.toFixed(2)})\n`;
            
            // Show last 5 expenses in this category
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
        }
        return null;
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
     * Send message to Telegram
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
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
        }
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