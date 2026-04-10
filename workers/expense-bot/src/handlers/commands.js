/**
 * Command Handlers
 * Handles all Telegram bot commands (/start, /menu, /stats, etc.)
 */

import { ExpenseService, ProfileService, RecurringExpenseService, parseApplePayMessage } from '../services.js';
import { GenericConversationHandler } from '../conversations.js';
import { FLOWS, MAIN_MENU_BUTTONS } from '../config.js';
import { TelegramService } from '../services/telegram.js';
import {
    buildProgressMessage,
    buildBreakdownMessage,
    buildApplePayConfirmation,
    buildQuickExpenseConfirmation,
    buildExpenseHistoryMessage
} from '../utils/messageBuilder.js';

// Conversation states
const MAIN_MENU = 0;
const ACTIVE_FLOW = 1;

/**
 * Get current month name
 * @returns {string} Month name
 */
function getCurrentMonthName() {
    return new Date().toLocaleString('default', { month: 'long' });
}

/**
 * Handle /start command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text and optional keyboard
 */
export async function handleStart(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (isInitialized) {
        const userData = await ExpenseService.getUserData(kv, userId);
        const userName = userData.name || 'User';
        const summary = await ProfileService.getProfileSummary(kv, userId);
        return {
            text: `👋 Welcome back, ${userName}!\n\n${summary}\n\nWhat would you like to do?`,
            keyboard: TelegramService.createKeyboard(MAIN_MENU_BUTTONS)
        };
    } else {
        const welcomeText = `🤖 **Budget Billy** - Your Personal Finance Assistant\n\nHi! I'm here to help you track expenses and manage your budget.\n\nLet's start by setting up your profile.`;

        // Start setup flow
        const conversationHandler = new GenericConversationHandler(FLOWS);
        await conversationHandler.startFlow(kv, userId, 'expense_setup');

        const flow = FLOWS.expense_setup;
        const firstStep = flow.getStep(0);
        const setupText = `${welcomeText}\n\n${flow.welcomeMessage}\n\n${firstStep.formField.prompt}`;

        return { text: setupText };
    }
}

/**
 * Handle /menu command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text and keyboard
 */
export async function handleMenu(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    return {
        text: "📋 Main Menu - What would you like to do?",
        keyboard: TelegramService.createKeyboard(MAIN_MENU_BUTTONS)
    };
}

/**
 * Handle /stats command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleStats(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    return { text: await ProfileService.getProfileSummary(kv, userId) };
}

/**
 * Handle /expense command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleExpense(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    const conversationHandler = new GenericConversationHandler(FLOWS);
    await conversationHandler.startFlow(kv, userId, 'expense_tracking');

    const flow = FLOWS.expense_tracking;
    const firstStep = flow.getStep(0);

    return { text: `${flow.welcomeMessage}\n\n${firstStep.formField.prompt}` };
}

/**
 * Handle /exit command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleExit(env, userId, chatId) {
    const kv = env.USER_DATA;
    const context = await getContext(kv, userId);
    const currentFlow = context?.currentFlow || null;

    if (currentFlow) {
        await clearFlow(kv, userId);
        return { text: "✅ Exited current flow." };
    } else {
        return { text: "ℹ️ No active flow to exit." };
    }
}

/**
 * Handle /cancel command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleCancel(env, userId, chatId) {
    const kv = env.USER_DATA;
    const context = await getContext(kv, userId);
    const currentFlow = context?.currentFlow || null;

    if (currentFlow) {
        await clearFlow(kv, userId);
    }

    return { text: "❌ Cancelled." };
}

/**
 * Handle /edit_profile command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text or null (if sent via inline keyboard)
 */
export async function handleEditProfile(env, userId, chatId) {
    const isInitialized = await ProfileService.isProfileInitialized(env.USER_DATA, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
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
        await TelegramService.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
        return null; // Return null since we're sending via sendMessageWithInlineKeyboard
    }

    return { text: message };
}

/**
 * Handle /progress command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleProgress(env, userId, chatId) {
    const kv = env.USER_DATA;
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
 * Handle /breakdown command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleBreakdown(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    const expensesByMerchant = await ExpenseService.getExpensesByMerchant(kv, userId);
    const totalExpenses = await ProfileService.getTotalMonthlyExpenses(kv, userId);

    if (!expensesByMerchant || Object.keys(expensesByMerchant).length === 0) {
        return { text: "📋 No expenses recorded for this month yet." };
    }

    const monthName = getCurrentMonthName();
    const message = buildBreakdownMessage(expensesByMerchant, totalExpenses, monthName);
    return { text: message };
}

/**
 * Handle /recurring command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleRecurring(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    return { text: await RecurringExpenseService.getRecurringSummary(kv, userId) };
}

/**
 * Handle /add_recurring command
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleAddRecurring(env, userId, chatId) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    // Start template setup flow
    const conversationHandler = new GenericConversationHandler(FLOWS);
    await conversationHandler.startFlow(kv, userId, 'recurring_template');

    const flow = FLOWS.recurring_template;
    const firstStep = flow.getStep(0);

    return { text: `${flow.welcomeMessage}\n\n${firstStep.formField.prompt}` };
}

/**
 * Handle /monthly-report command (admin only)
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleMonthlyReport(env, userId, chatId) {
    if (userId !== String(env.DEVELOPER_CHAT_ID || '138562035')) {
        return { text: "❌ Not authorized." };
    }

    return { text: "✅ Monthly reports will be sent to all users." };
}

/**
 * Handle /show_data command (developer only)
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleShowData(env, userId, chatId) {
    const kv = env.USER_DATA;
    if (userId !== String(env.DEVELOPER_CHAT_ID || '138562035')) {
        return { text: "❌ Not authorized." };
    }

    const userData = await ExpenseService.getUserData(kv, userId);
    return { text: `Debug data:\n${JSON.stringify(userData, null, 2)}` };
}

/**
 * Handle /debug_recurring command (developer only)
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Response object with text
 */
export async function handleDebugRecurring(env, userId, chatId) {
    const kv = env.USER_DATA;
    if (userId !== String(env.DEVELOPER_CHAT_ID || '138562035')) {
        return { text: "❌ Not authorized." };
    }

    const userData = await ExpenseService.getUserData(kv, userId);
    const templates = await RecurringExpenseService.getRecurringTemplates(kv, userId);
    
    let debugText = `🔍 Recurring Expense Debug\n━━━━━━━━━━━━━━━━\n`;
    debugText += `User ID: ${userId}\n`;
    debugText += `Profile Initialized: ${userData.isInitialized}\n`;
    debugText += `Recurring Templates Count: ${templates.length}\n\n`;
    
    if (templates.length > 0) {
        debugText += `Templates:\n`;
        templates.forEach((template, index) => {
            debugText += `${index + 1}. ${template.name} - $${template.amount} (${template.frequency})\n`;
        });
    } else {
        debugText += `No recurring templates found.\n`;
    }
    
    debugText += `\nFull user data:\n${JSON.stringify(userData, null, 2)}`;
    
    return { text: debugText };
}

/**
 * Handle quick add command (/add <amount> <description>)
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} command - The command text (e.g., "15 coffee")
 * @returns {Promise<Object>} Response object with text
 */
export async function handleQuickAdd(env, userId, chatId, command) {
    const kv = env.USER_DATA;
    const isInitialized = await ProfileService.isProfileInitialized(kv, userId);

    if (!isInitialized) {
        return { text: "❌ Please set up your profile first with /start" };
    }

    // Parse command like "15 coffee" or "15.50 lunch at mcdonalds"
    const match = command.match(/^(\d+(?:\.\d{1,2})?)\s+(.+)$/);
    if (!match) {
        return { text: "❌ Invalid format. Use: /add [amount] [description]\nExample: /add 15 coffee" };
    }

    const [_, amountStr, description] = match;
    const amount = parseFloat(amountStr);

    if (amount <= 0) {
        return { text: "❌ Amount must be positive." };
    }

    try {
        const expenseData = {
            amount: amount,
            merchant: description.split(' at ')[1] || description.split(' ')[0] || "Unknown",
            description: description
        };

        const expense = await ExpenseService.addExpense(kv, userId, expenseData);

        return { text: buildQuickExpenseConfirmation(expense.toObject()) };
    } catch (error) {
        console.error(`❌ ERROR: Failed to add quick expense: ${error.message}`);
        return { text: `❌ Error adding expense: ${error.message}` };
    }
}

/**
 * Handle Apple Pay transaction message
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 * @returns {Promise<Object|null>} Response object with text, or null if not Apple Pay message
 */
export async function handleApplePayMessage(env, userId, chatId, text) {
    const kv = env.USER_DATA;
    const applePayData = parseApplePayMessage(text);

    if (!applePayData || Object.keys(applePayData).length === 0) {
        return null; // Not an Apple Pay message
    }

    // Ensure user profile is initialized
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
 * Clear flow from KV
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function clearFlow(kv, userId) {
    await kv.delete(`${userId}:context`);
}