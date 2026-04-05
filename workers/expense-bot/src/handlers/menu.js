/**
 * Menu Choice Handler
 * Handles main menu button selections
 */

import { ExpenseService, ProfileService, RecurringExpenseService, parseApplePayMessage } from '../services.js';
import { GenericConversationHandler } from '../conversations.js';
import { FLOWS, MAIN_MENU_BUTTONS } from '../config.js';
import { TelegramService } from '../services/telegram.js';
import {
    buildProgressMessage,
    buildBreakdownMessage,
    buildApplePayConfirmation,
    buildExpenseHistoryMessage
} from '../utils/messageBuilder.js';

/**
 * Get context from KV
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Context object
 */
async function getContext(kv, userId) {
    try {
        const data = await kv.get(`${userId}:context`, "json");
        return data || {};
    } catch (error) {
        console.error(`❌ ERROR: Failed to get context for ${userId}: ${error.message}`);
        return {};
    }
}

/**
 * Get current month name
 * @returns {string} Month name
 */
function getCurrentMonthName() {
    return new Date().toLocaleString('default', { month: 'long' });
}

/**
 * Handle main menu choices
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} choice - User's menu choice
 * @returns {Promise<Object>} Response object with text and optional keyboard
 */
export async function handleMenuChoice(env, userId, chatId, choice) {
    const kv = env.USER_DATA;
    console.log(`🎯 MENU: User '${userId}' selected: '${choice}'`);

    // Check for Apple Pay transaction message first
    const applePayResult = await handleApplePayFromMenu(env, userId, chatId, choice);
    if (applePayResult) {
        return applePayResult;
    }

    // Route to appropriate handler based on menu choice
    if (choice.includes("Add Expense")) {
        return await handleMenuAddExpense(kv, userId, chatId);
    } else if (choice.includes("View Stats")) {
        return { text: await ProfileService.getProfileSummary(kv, userId) };
    } else if (choice.includes("Progress")) {
        return await handleMenuProgress(kv, userId, chatId);
    } else if (choice.includes("Breakdown")) {
        return await handleMenuBreakdown(kv, userId, chatId);
    } else if (choice.includes("Recurring")) {
        return await handleMenuRecurring(kv, userId, chatId);
    } else if (choice.includes("History")) {
        return await handleMenuHistory(kv, userId, chatId);
    } else if (choice.includes("Edit Expense")) {
        return { text: 'edit_expense' }; // Special marker for index.js to handle
    } else if (choice.includes("Add Recurring")) {
        return await handleMenuAddRecurring(kv, userId, chatId);
    } else if (choice.includes("Edit Profile")) {
        return { text: 'edit_profile' }; // Special marker for index.js to handle
    }

    return { text: 'main_menu' };
}

/**
 * Handle Apple Pay transaction from menu
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} choice - Menu choice text
 * @returns {Promise<Object|null>} Response object if Apple Pay, null otherwise
 */
async function handleApplePayFromMenu(env, userId, chatId, choice) {
    const kv = env.USER_DATA;
    const applePayData = parseApplePayMessage(choice);

    if (!applePayData || Object.keys(applePayData).length === 0) {
        return null;
    }

    console.log(`🍎 APPLE_PAY: Detected Apple Pay transaction from user '${userId}'`);
    console.log(`📦 APPLE_PAY_DATA: ${JSON.stringify(applePayData)}`);

    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);
    if (!isInitialized) {
        console.log(`⚠️  INFO: User not initialized, cannot process Apple Pay transaction`);
        return { text: "❌ Please set up your profile first with /start before using Apple Pay integration." };
    }

    try {
        const expenseData = {
            amount: applePayData.amount,
            merchant: applePayData.merchant,
            description: `Apple Pay transaction on ${applePayData.date}`
        };

        const expense = await ExpenseService.addExpense(kv, userId, expenseData);
        console.log(`✅ APPLE_PAY_SAVED: Expense recorded - $${expense.amount.toFixed(2)} at ${applePayData.merchant}`);

        return { text: buildApplePayConfirmation({
            amount: expense.amount,
            merchant: applePayData.merchant,
            date: applePayData.date,
            description: expense.description
        }) };
    } catch (error) {
        console.error(`❌ APPLE_PAY_ERROR: Failed to save Apple Pay expense: ${error.message}`);
        return { text: `❌ Error recording Apple Pay transaction: ${error.message}` };
    }
}

/**
 * Handle "Add Expense" menu choice
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object
 */
async function handleMenuAddExpense(kv, userId, chatId) {
    const conversationHandler = new GenericConversationHandler(FLOWS);
    await conversationHandler.startFlow(kv, userId, 'expense_tracking');

    const flow = FLOWS.expense_tracking;
    const firstStep = flow.getStep(0);

    return { text: firstStep.formField.prompt };
}

/**
 * Handle "Progress" menu choice
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object
 */
async function handleMenuProgress(kv, userId, chatId) {
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    const progress = await ProfileService.getMonthlySavingsProgress(kv, userId);
    const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);
    const monthName = getCurrentMonthName();
    const alert = await ProfileService.checkBudgetAlert(kv, userId);

    const message = buildProgressMessage(progress, monthName, alert);
    return { text: message };
}

/**
 * Handle "Breakdown" menu choice
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object
 */
async function handleMenuBreakdown(kv, userId, chatId) {
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    const expensesByCategory = await ProfileService.getMonthlyExpensesByCategory(kv, userId);
    const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);

    if (!expensesByCategory || Object.keys(expensesByCategory).length === 0) {
        return { text: "📋 No expenses recorded for this month yet." };
    }

    const monthName = getCurrentMonthName();
    const message = buildBreakdownMessage(expensesByCategory, totalExpenses, monthName);
    return { text: message };
}

/**
 * Handle "Recurring" menu choice
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object
 */
async function handleMenuRecurring(kv, userId, chatId) {
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    return { text: await RecurringExpenseService.getRecurringSummary(kv, userId) };
}

/**
 * Handle "History" menu choice
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object
 */
async function handleMenuHistory(kv, userId, chatId) {
    const expensesByMerchant = await ExpenseService.getExpensesByMerchant(kv, userId);

    if (!expensesByMerchant || Object.keys(expensesByMerchant).length === 0) {
        return { text: "📋 No expenses recorded yet." };
    }

    const message = buildExpenseHistoryMessage(expensesByMerchant);
    return { text: message };
}

/**
 * Handle "Add Recurring" menu choice
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object
 */
async function handleMenuAddRecurring(kv, userId, chatId) {
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    // Start recurring template setup flow
    const conversationHandler = new GenericConversationHandler(FLOWS);
    await conversationHandler.startFlow(kv, userId, 'recurring_template');

    const flow = FLOWS.recurring_template;
    const firstStep = flow.getStep(0);

    return { text: `${flow.welcomeMessage}\n\n${firstStep.formField.prompt}` };
}

/**
 * Get main menu response
 * @returns {Object} Main menu response object
 */
export function getMainMenuResponse() {
    return {
        text: 'What would you like to do?',
        keyboard: TelegramService.createKeyboard(MAIN_MENU_BUTTONS)
    };
}