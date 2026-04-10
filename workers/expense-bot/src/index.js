/**
 * Main bot application for Cloudflare Workers
 * Refactored modular architecture
 */

import { GenericConversationHandler, FLOW_COMPLETE } from './conversations.js';
import { FLOWS, MAIN_MENU_BUTTONS, DEVELOPER_CHAT_ID } from './config.js';
import { TelegramService } from './services/telegram.js';
import {
    handleStart,
    handleMenu,
    handleStats,
    handleExpense,
    handleExit,
    handleCancel,
    handleEditProfile,
    handleProgress,
    handleBreakdown,
    handleRecurring,
    handleAddRecurring,
    handleMonthlyReport,
    handleShowData,
    handleQuickAdd,
    handleApplePayMessage
} from './handlers/commands.js';
import {
    handleCallbackQuery,
    handleEditExpense,
    handleEditInput
} from './handlers/callbacks.js';
import { handleMenuChoice, getMainMenuResponse } from './handlers/menu.js';
import { ProfileService, ExpenseService, parseApplePayMessage } from './services.js';
import { buildApplePayConfirmation } from './utils/messageBuilder.js';

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
            const url = new URL(request.url);

            // Handle webhook requests from Telegram
            if (url.pathname === '/webhook') {
                return await this.handleWebhook(request, env);
            }

            // Handle scheduled tasks
            if (url.pathname === '/scheduled') {
                return await this.handleScheduled(request, env);
            }

            // Handle health check
            if (url.pathname === '/') {
                return new Response('Budget Billy Expense Tracker Bot is running!', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                });
            }

            // Handle Apple Pay transactions from external systems (e.g., iOS Shortcuts)
            if (url.pathname === '/apple-pay' && request.method === 'POST') {
                return await this.handleApplePayTransaction(request, env);
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
            const update = body;

            // Handle callback queries FIRST (before checking for message)
            if (update.callback_query) {
                await handleCallbackQuery(env, update.callback_query);
                return new Response('OK', { status: 200 });
            }

            const message = update.message || update.edited_message;

            if (!message) {
                return new Response('OK', { status: 200 });
            }

            const userId = message.from.id.toString();
            const text = message.text || '';
            const chatId = message.chat.id;

            // Request deduplication
            if (!await this.checkRequestDeduplication(env, update.update_id, userId)) {
                return new Response('OK', { status: 200 });
            }

            // Check if KV namespaces are available
            if (!env.USER_DATA) {
                console.error('❌ ERROR: USER_DATA KV namespace not available');
                return new Response('KV namespace not configured', { status: 500 });
            }

            // Initialize conversation handler
            const conversationHandler = new GenericConversationHandler(FLOWS);

            // Handle commands
            const commandResult = await this.handleCommand(env, userId, chatId, text);
            if (commandResult !== null) {
                return commandResult;
            }

            // Check for Apple Pay message
            const applePayResult = await handleApplePayMessage(env, userId, chatId, text);
            if (applePayResult) {
                await TelegramService.sendMessage(env, chatId, applePayResult.text);
                return new Response('OK', { status: 200 });
            }

            // Check if user is in edit mode
            const editContext = await this.getContext(env.USER_DATA, userId);
            if (editContext.editExpenseField) {
                await handleEditInput(env, userId, chatId, text);
                return new Response('OK', { status: 200 });
            }

            // Handle conversation flow or menu choice
            const currentFlow = await this.getCurrentFlow(env.USER_DATA, userId);

            if (currentFlow) {
                return await this.handleFlowInput(env, userId, chatId, text, conversationHandler, currentFlow);
            } else {
                return await this.handleMenuInput(env, userId, chatId, text);
            }

        } catch (error) {
            console.error('❌ ERROR in handleWebhook:', error);
            return new Response('Internal Server Error', { status: 500 });
        }
    },

    /**
     * Check request deduplication
     * @param {Object} env - Environment variables
     * @param {number} updateId - Update ID
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} True if request should be processed
     */
    async checkRequestDeduplication(env, updateId, userId) {
        const cacheKey = `request_${updateId}_${userId}`;

        if (env.REQUEST_CACHE) {
            try {
                const cached = await env.REQUEST_CACHE.get(cacheKey);
                if (cached) {
                    return false;
                }
            } catch (cacheError) {
                console.warn(`⚠️  WARNING: Request cache check failed: ${cacheError.message}`);
            }
        }

        // Set cache entry to prevent duplicate processing
        if (env.REQUEST_CACHE) {
            try {
                await env.REQUEST_CACHE.put(cacheKey, 'processed', { expirationTtl: REQUEST_CACHE_TTL });
            } catch (cacheError) {
                console.warn(`⚠️  WARNING: Request cache set failed: ${cacheError.message}`);
            }
        }

        return true;
    },

    /**
     * Handle Telegram commands
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {string} text - Message text
     * @returns {Promise<Response|null>} Response if command was handled, null otherwise
     */
    async handleCommand(env, userId, chatId, text) {
        const handlers = {
            '/start': () => handleStart(env, userId, chatId),
            '/menu': () => handleMenu(env, userId, chatId),
            '/stats': () => handleStats(env, userId, chatId),
            '/expense': () => handleExpense(env, userId, chatId),
            '/exit': () => handleExit(env, userId, chatId),
            '/cancel': () => handleCancel(env, userId, chatId),
            '/edit_profile': () => handleEditProfile(env, userId, chatId),
            '/progress': () => handleProgress(env, userId, chatId),
            '/breakdown': () => handleBreakdown(env, userId, chatId),
            '/recurring': () => handleRecurring(env, userId, chatId),
            '/add_recurring': () => handleAddRecurring(env, userId, chatId),
            '/monthly-report': () => userId === DEVELOPER_CHAT_ID.toString() ? handleMonthlyReport(env, userId, chatId) : null,
            '/show_data': () => userId === DEVELOPER_CHAT_ID.toString() ? handleShowData(env, userId, chatId) : null,
        };

        // Handle direct commands
        for (const [command, handler] of Object.entries(handlers)) {
            if (text === command) {
                const result = await handler();
                if (result === null) return null;

                if (result.text) {
                    await TelegramService.sendMessage(env, chatId, result.text, result.keyboard);
                }
                return new Response('OK', { status: 200 });
            }
        }

        // Handle /edit_expense command
        if (text === '/edit_expense') {
            await handleEditExpense(env, userId, chatId);
            return new Response('OK', { status: 200 });
        }

        // Handle quick add command (/add <amount> <description>)
        if (text.startsWith('/add ') && text.length > 5) {
            const result = await handleQuickAdd(env, userId, chatId, text.substring(5));
            await TelegramService.sendMessage(env, chatId, result.text);
            return new Response('OK', { status: 200 });
        }

        return null; // No command matched
    },

    /**
     * Handle input during an active conversation flow
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {string} text - User input text
     * @param {GenericConversationHandler} conversationHandler - Conversation handler
     * @param {string} currentFlow - Current flow name
     * @returns {Promise<Response>} HTTP response
     */
    async handleFlowInput(env, userId, chatId, text, conversationHandler, currentFlow) {
        const result = await conversationHandler.handleInput(
            env.USER_DATA,
            userId,
            text,
            this.getCompletionCallback(currentFlow)
        );

        if (result === FLOW_COMPLETE) {
            // Flow completed, show main menu
            await TelegramService.sendMessage(
                env,
                chatId,
                '✅ Operation completed successfully!',
                TelegramService.createKeyboard(MAIN_MENU_BUTTONS)
            );
        } else {
            // Continue flow - get next prompt
            const flow = FLOWS[currentFlow];
            const currentStep = await this.getCurrentStep(env.USER_DATA, userId);
            const nextStep = flow.getStep(currentStep);

            if (nextStep) {
                const prompt = nextStep.formField.prompt;

                // If field allows skip, send with inline keyboard
                if (nextStep.formField.allowSkip) {
                    const inlineKeyboard = [
                        [{ text: "⏭️ Skip - Keep Current", callback_data: `skip_field:${nextStep.key}` }]
                    ];
                    await TelegramService.sendMessageWithInlineKeyboard(env, chatId, prompt, inlineKeyboard);
                } else {
                    await TelegramService.sendMessage(env, chatId, prompt);
                }
            } else {
                // No more steps, complete the flow
                await TelegramService.sendMessage(env, chatId, flow.completionMessage);
                await this.clearFlow(env.USER_DATA, userId);
            }
        }

        return new Response('OK', { status: 200 });
    },

    /**
     * Handle input when no flow is active (menu choices)
     * @param {Object} env - Environment variables
     * @param {string} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {string} text - User input text
     * @returns {Promise<Response>} HTTP response
     */
    async handleMenuInput(env, userId, chatId, text) {
        const result = await handleMenuChoice(env, userId, chatId, text);

        if (result.text === 'main_menu') {
            const menuResponse = getMainMenuResponse();
            await TelegramService.sendMessage(env, chatId, menuResponse.text, menuResponse.keyboard);
        } else if (result.text === 'edit_expense') {
            await handleEditExpense(env, userId, chatId);
        } else if (result.text === 'edit_profile') {
            await handleEditProfile(env, userId, chatId);
        } else if (result.text) {
            await TelegramService.sendMessage(env, chatId, result.text, result.keyboard);
        }

        return new Response('OK', { status: 200 });
    },

    /**
     * Get completion callback for a specific flow
     * @param {string} flowName - Name of the flow
     * @returns {Function|null} Completion callback function
     */
    getCompletionCallback(flowName) {
        // Import the callbacks from the callbacks handler
        return async (kv, userId, flowData) => {
            const { onSetupComplete, onExpenseComplete, onEditProfileComplete, onRecurringTemplateComplete } =
                await import('./handlers/callbacks.js');

            const callbacks = {
                expense_setup: onSetupComplete,
                expense_tracking: onExpenseComplete,
                edit_profile: onEditProfileComplete,
                recurring_template: onRecurringTemplateComplete
            };

            const callback = callbacks[flowName];
            if (callback) {
                await callback(kv, userId, flowData);
            }
        };
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
     * Handle Apple Pay transaction from external systems (e.g., iOS Shortcuts)
     * @param {Request} request - Incoming HTTP request
     * @param {Object} env - Environment variables
     * @returns {Promise<Response>} HTTP response
     */
    async handleApplePayTransaction(request, env) {
        try {
            // Parse request body
            const body = await request.json();
            const { chat_id, text } = body;

            // Validate API key from header (X-API-Key)
            const apiKeyHeader = request.headers.get('X-API-Key');
            if (!apiKeyHeader) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Missing API key. Please provide X-API-Key header.'
                }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }

            // Validate API key using timing-safe comparison
            if (!env.APPLE_PAY_API_KEY) {
                console.error('❌ APPLE_PAY_API_KEY environment variable not configured');
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Server configuration error'
                }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }

            const isValidKey = await this.validateApiKey(apiKeyHeader, env.APPLE_PAY_API_KEY);
            if (!isValidKey) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid API key'
                }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            // Validate timestamp to prevent replay attacks (allow 5 minute window)
            const timestampHeader = request.headers.get('X-Timestamp');
            if (!timestampHeader) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Missing timestamp. Please provide X-Timestamp header.'
                }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }

            // Parse ISO 8601 timestamp (e.g., "2026-04-10T19:30:00Z")
            const requestTime = new Date(timestampHeader).getTime();
            if (isNaN(requestTime)) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid timestamp format. Please use ISO 8601 format (e.g., 2026-04-10T19:30:00Z)'
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            const currentTime = Date.now();
            const timeDifference = Math.abs(currentTime - requestTime);
            const MAX_TIME_DIFF = 5 * 60 * 1000; // 5 minutes in milliseconds

            if (timeDifference > MAX_TIME_DIFF) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Request timestamp expired. Please retry.'
                }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            // Validate required fields
            if (!chat_id) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Missing chat_id'
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            if (!text) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Missing text'
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            // Check if KV namespace is available
            if (!env.USER_DATA) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'USER_DATA KV namespace not configured'
                }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }

            // Parse Apple Pay message
            const applePayData = parseApplePayMessage(text);
            if (!applePayData || Object.keys(applePayData).length === 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid Apple Pay message format. Expected: "Spent $X at Merchant on YYYY-MM-DD"'
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            // Convert chat_id to userId (string)
            const userId = chat_id.toString();

            // Check if user is initialized
            const isInitialized = await ProfileService.isProfileInitialized(env.USER_DATA, userId);
            if (!isInitialized) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'User profile not initialized. Please start the bot with /start first.'
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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
            const confirmationText = buildApplePayConfirmation({
                amount: expense.amount,
                merchant: applePayData.merchant,
                date: applePayData.date,
                description: expense.description
            });
            await TelegramService.sendMessage(env, chat_id, confirmationText);

            // Return success response
            return new Response(JSON.stringify({
                success: true,
                message: '✅ Apple Pay Transaction Recorded',
                expense: {
                    amount: expense.amount,
                    merchant: applePayData.merchant,
                    date: applePayData.date
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });

        } catch (error) {
            console.error('❌ ERROR in handleApplePayTransaction:', error);
            return new Response(JSON.stringify({
                success: false,
                error: 'Internal server error'
            }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    },

    /**
     * Validate API key using timing-safe comparison
     * @param {string} providedKey - API key from request header
     * @param {string} storedKey - Stored API key from environment
     * @returns {Promise<boolean>} True if keys match
     */
    async validateApiKey(providedKey, storedKey) {
        try {
            // For Cloudflare Workers, we can use the built-in crypto.subtle
            // Hash both keys and compare the hashes for timing-safe comparison
            const providedHash = await this.hashApiKey(providedKey);
            const storedHash = await this.hashApiKey(storedKey);
            
            // Use timing-safe comparison
            return providedHash === storedHash;
        } catch (error) {
            console.error('❌ ERROR validating API key:', error);
            return false;
        }
    },

    /**
     * Hash API key using SHA-256
     * @param {string} apiKey - API key to hash
     * @returns {Promise<string>} Hex-encoded SHA-256 hash
     */
    async hashApiKey(apiKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(apiKey);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
};
