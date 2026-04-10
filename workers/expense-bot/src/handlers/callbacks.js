/**
 * Callback Handlers
 * Handles all Telegram callback queries from inline keyboards
 */

import { ExpenseService } from '../services.js';
import { FLOWS } from '../config.js';
import { TelegramService } from '../services/telegram.js';
import {
    buildEditExpenseSelectionMessage,
    buildExpenseEditMenu,
    buildDeleteConfirmationMessage,
    buildExpenseUpdateConfirmation
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
 * Get current flow from context
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Current flow name
 */
async function getCurrentFlow(kv, userId) {
    const context = await getContext(kv, userId);
    return context?.currentFlow || null;
}

/**
 * Get current step from context
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @returns {Promise<number>} Current step index
 */
async function getCurrentStep(kv, userId) {
    const context = await getContext(kv, userId);
    return context?.currentStep || 0;
}

/**
 * Get flow data from context
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Flow data object
 */
async function getFlowData(kv, userId) {
    const context = await getContext(kv, userId);
    return context?.flowData || {};
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

/**
 * Advance to the next step in the current flow
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function advanceStep(kv, userId) {
    const context = await getContext(kv, userId);
    const currentStep = context?.currentStep || 0;
    context.currentStep = currentStep + 1;
    await kv.put(`${userId}:context`, JSON.stringify(context));
}

/**
 * Get completion callback for a specific flow
 * @param {string} flowName - Name of the flow
 * @returns {Function|null} Completion callback function
 */
function getCompletionCallback(flowName) {
    const callbacks = {
        expense_setup: onSetupComplete,
        expense_tracking: onExpenseComplete,
        edit_profile: onEditProfileComplete,
        recurring_template: onRecurringTemplateComplete
    };
    return callbacks[flowName] || null;
}

/**
 * Handle completion of setup flow
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {Object} flowData - Flow data
 */
async function onSetupComplete(kv, userId, flowData) {
    // Import ProfileService dynamically to avoid circular dependency
    const { ProfileService } = await import('../services.js');
    await ProfileService.initializeProfile(kv, userId, flowData);
}

/**
 * Handle completion of expense tracking flow
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {Object} flowData - Flow data
 */
async function onExpenseComplete(kv, userId, flowData) {
    try {
        await ExpenseService.addExpense(kv, userId, flowData);
    } catch (error) {
        console.error(`❌ ERROR: Failed to save expense: ${error.message}`);
    }
}

/**
 * Handle completion of edit profile flow
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {Object} flowData - Flow data
 */
async function onEditProfileComplete(kv, userId, flowData) {
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
    } catch (error) {
        console.error(`❌ ERROR: Failed to update profile: ${error.message}`);
    }
}

/**
 * Handle completion of recurring template flow
 * @param {KVNamespace} kv - Cloudflare KV namespace
 * @param {string} userId - User ID
 * @param {Object} flowData - Flow data
 */
async function onRecurringTemplateComplete(kv, userId, flowData) {
    try {
        const { RecurringExpenseService } = await import('../services.js');
        const templateData = {
            name: flowData.template_name,
            amount: flowData.template_amount,
            merchant: flowData.template_merchant,
            frequency: flowData.template_frequency,
            description: flowData.template_description || ''
        };

        await RecurringExpenseService.addRecurringTemplate(kv, userId, templateData);
    } catch (error) {
        console.error(`❌ ERROR: Failed to create recurring template: ${error.message}`);
    }
}

/**
 * Handle /edit_expense command - show list of expenses to edit
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 */
export async function handleEditExpense(env, userId, chatId) {
    const isInitialized = await (await import('../services.js')).ProfileService.isProfileInitialized(env.USER_DATA, userId);
    if (!isInitialized) {
        await TelegramService.sendMessage(env, chatId, "❌ Please set up your profile first with /start");
        return;
    }

    // Get recent expenses
    const expenses = await ExpenseService.getRecentExpenses(env.USER_DATA, userId, 10);

    if (!expenses || expenses.length === 0) {
        await TelegramService.sendMessage(env, chatId, "📋 You don't have any expenses to edit yet. Start tracking with /expense");
        return;
    }

    const { message, inlineKeyboard } = buildEditExpenseSelectionMessage(expenses);
    await TelegramService.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
}

/**
 * Handle callback queries from inline keyboards
 * @param {Object} env - Environment variables
 * @param {Object} callbackQuery - Callback query object from Telegram
 */
export async function handleCallbackQuery(env, callbackQuery) {
    try {
        const userId = callbackQuery.from.id.toString();
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;

        // Answer the callback query immediately to remove loading state
        await TelegramService.answerCallbackQuery(env, callbackQuery.id);

        // Route to appropriate handler based on callback data
        if (data === 'edit_cancel') {
            await TelegramService.sendMessage(env, chatId, "❌ Edit cancelled.");
            return;
        }

        if (data.startsWith('edit_exp:')) {
            await handleEditExpenseSelection(env, userId, chatId, data);
            return;
        }

        if (data.startsWith('edit_field:')) {
            await handleEditFieldSelection(env, userId, chatId, data);
            return;
        }

        if (data === 'edit_delete') {
            await handleDeleteConfirmation(env, userId, chatId);
            return;
        }

        if (data === 'edit_delete_confirm') {
            await handleDeleteConfirm(env, userId, chatId);
            return;
        }

        if (data === 'edit_cancel_menu') {
            await handleEditCancel(env, userId, chatId);
            return;
        }

        if (data.startsWith('skip_field:')) {
            await handleSkipField(env, userId, chatId, data);
            return;
        }

    } catch (error) {
        console.error(`❌ ERROR in handleCallbackQuery: ${error.message}`);
    }
}

/**
 * Handle expense selection for editing
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} data - Callback data
 */
async function handleEditExpenseSelection(env, userId, chatId, data) {
    const index = parseInt(data.split(':')[1]);

    if (isNaN(index)) {
        await TelegramService.sendMessage(env, chatId, "❌ Invalid expense selection.");
        return;
    }

    const expense = await ExpenseService.getExpenseByIndex(env.USER_DATA, userId, index);

    if (!expense) {
        await TelegramService.sendMessage(env, chatId, "❌ Expense not found. It may have been deleted.");
        return;
    }

    // Store selected expense info in context
    const context = await getContext(env.USER_DATA, userId);
    context.editExpenseIndex = index;
    context.editExpenseData = expense;
    await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));

    const { message, inlineKeyboard } = buildExpenseEditMenu(expense);
    await TelegramService.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
}

/**
 * Handle field selection for editing
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} data - Callback data
 */
async function handleEditFieldSelection(env, userId, chatId, data) {
    const field = data.split(':')[1];
    const context = await getContext(env.USER_DATA, userId);
    const expense = context.editExpenseData;

    if (!expense) {
        await TelegramService.sendMessage(env, chatId, "❌ Session expired. Please select the expense again with /edit_expense");
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
    }

    await TelegramService.sendMessage(env, chatId, prompt);
}

/**
 * Handle delete confirmation request
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 */
async function handleDeleteConfirmation(env, userId, chatId) {
    const context = await getContext(env.USER_DATA, userId);
    const expense = context.editExpenseData;

    if (!expense) {
        await TelegramService.sendMessage(env, chatId, "❌ Session expired. Please select the expense again with /edit_expense");
        return;
    }

    const { message, inlineKeyboard } = buildDeleteConfirmationMessage(expense);
    await TelegramService.sendMessageWithInlineKeyboard(env, chatId, message, inlineKeyboard);
}

/**
 * Handle delete confirmation - actually delete the expense
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 */
async function handleDeleteConfirm(env, userId, chatId) {
    const context = await getContext(env.USER_DATA, userId);
    const index = context.editExpenseIndex;

    if (index === undefined) {
        await TelegramService.sendMessage(env, chatId, "❌ Session expired. Please try again with /edit_expense");
        return;
    }

    try {
        const deleted = await ExpenseService.deleteExpense(env.USER_DATA, userId, index);

        // Clear the edit context
        delete context.editExpenseIndex;
        delete context.editExpenseData;
        delete context.editExpenseField;
        await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));

        await TelegramService.sendMessage(env, chatId, `🗑️ Expense deleted successfully!

Removed: $${deleted.amount.toFixed(2)} at ${deleted.merchant} on ${new Date(deleted.timestamp).toISOString().split('T')[0]}`);
    } catch (error) {
        await TelegramService.sendMessage(env, chatId, `❌ Error deleting expense: ${error.message}`);
    }
}

/**
 * Handle edit cancellation
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 */
async function handleEditCancel(env, userId, chatId) {
    const context = await getContext(env.USER_DATA, userId);
    delete context.editExpenseIndex;
    delete context.editExpenseData;
    delete context.editExpenseField;
    await env.USER_DATA.put(`${userId}:context`, JSON.stringify(context));

    await TelegramService.sendMessage(env, chatId, "❌ Edit cancelled.");
}

/**
 * Handle skip field in conversation flow
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} data - Callback data
 */
async function handleSkipField(env, userId, chatId, data) {
        const fieldKey = data.split(':')[1];
        const currentFlow = await getCurrentFlow(env.USER_DATA, userId);
    if (!currentFlow) {
        await TelegramService.sendMessage(env, chatId, "❌ No active flow to skip in.");
        return;
    }

    const flow = FLOWS[currentFlow];
    const currentStep = await getCurrentStep(env.USER_DATA, userId);
    const totalSteps = flow.stepCount();

    // Check if flow is complete after skipping
    if (currentStep + 1 >= totalSteps) {
        // Flow completed, call completion callback
        const flowData = await getFlowData(env.USER_DATA, userId);
        const callback = getCompletionCallback(currentFlow);

        if (callback) {
            await callback(env.USER_DATA, userId, flowData);
        }

        await clearFlow(env.USER_DATA, userId);
        await TelegramService.sendMessage(env, chatId, "✅ Operation completed successfully!");
        return;
    }

    // Advance to next step
    await advanceStep(env.USER_DATA, userId);
    const nextStep = await getCurrentStep(env.USER_DATA, userId);
    const nextStepObj = flow.getStep(nextStep);

    if (nextStepObj) {
        // Send next prompt with skip button if applicable
        if (nextStepObj.formField.allowSkip) {
            const inlineKeyboard = [
                [{ text: "⏭️ Skip - Keep Current", callback_data: `skip_field:${nextStepObj.key}` }]
            ];
            await TelegramService.sendMessageWithInlineKeyboard(env, chatId, nextStepObj.formField.prompt, inlineKeyboard);
        } else {
            await TelegramService.sendMessage(env, chatId, nextStepObj.formField.prompt);
        }
    } else {
        // No more steps, complete the flow
        const flowData = await getFlowData(env.USER_DATA, userId);
        const callback = getCompletionCallback(currentFlow);

        if (callback) {
            await callback(env.USER_DATA, userId, flowData);
        }

        await clearFlow(env.USER_DATA, userId);
        await TelegramService.sendMessage(env, chatId, flow.completionMessage);
    }
}

/**
 * Handle text input during edit flow
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {number} chatId - Chat ID
 * @param {string} text - User's text input
 */
export async function handleEditInput(env, userId, chatId, text) {
    const kv = env.USER_DATA;
    const context = await getContext(kv, userId);
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
                    await TelegramService.sendMessage(env, chatId, "❌ Invalid amount. Please enter a positive number (e.g., 75.50):");
                    return;
                }
                if (amount > 10000) {
                    await TelegramService.sendMessage(env, chatId, "❌ Amount seems too high. Please enter a valid amount:");
                    return;
                }
                updates.amount = amount;
                break;

            case 'date':
                const dateMatch = text.match(/^\d{4}-\d{2}-\d{2}$/);
                if (!dateMatch) {
                    await TelegramService.sendMessage(env, chatId, "❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2024-01-20):");
                    return;
                }
                // Validate the date is real
                const dateObj = new Date(text);
                if (isNaN(dateObj.getTime())) {
                    await TelegramService.sendMessage(env, chatId, "❌ Invalid date. Please enter a valid date:");
                    return;
                }
                updates.timestamp = dateObj.toISOString();
                break;

            case 'description':
                if (text.length > 200) {
                    await TelegramService.sendMessage(env, chatId, "❌ Description too long. Please keep it under 200 characters:");
                    return;
                }
                updates.description = text.trim();
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
        const message = buildExpenseUpdateConfirmation(updated);
        await TelegramService.sendMessage(env, chatId, message);

    } catch (error) {
        await TelegramService.sendMessage(env, chatId, `❌ Error updating expense: ${error.message}`);
    }
}