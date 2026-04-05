/**
 * Message Builder Utilities
 * Centralized message formatting to eliminate duplication
 */

/**
 * Separator line for messages
 */
const SEPARATOR = '━━━━━━━━━━━━━━━━';

/**
 * Build a progress message for monthly savings tracking
 * @param {Object} progressData - Progress data object
 * @param {string} monthName - Name of the current month
 * @param {Object|null} alert - Optional budget alert
 * @returns {string} Formatted progress message
 */
export function buildProgressMessage(progressData, monthName, alert = null) {
    let message = `📊 **Monthly Progress - ${monthName}**
${SEPARATOR}
Total Expenses: $${progressData.totalExpenses.toFixed(2)}
Monthly Income: $${progressData.monthlyCashIncome.toFixed(2)}
Monthly Savings: $${progressData.monthlySavings.toFixed(2)}
Budget Remaining: $${progressData.budgetRemaining.toFixed(2)}`;

    if (progressData.monthlySavingsGoal > 0) {
        message += `
Monthly Savings Goal: $${progressData.monthlySavingsGoal.toFixed(2)}
Progress: ${progressData.monthlySavingsProgress.toFixed(1)}%`;
    }

    if (alert) {
        message += `\n\n${alert.message}`;
    }

    return message;
}

/**
 * Build an expense breakdown message by category
 * @param {Object} expensesByCategory - Expenses grouped by category
 * @param {number} totalExpenses - Total expenses amount
 * @param {string} monthName - Name of the current month
 * @returns {string} Formatted breakdown message
 */
export function buildBreakdownMessage(expensesByCategory, totalExpenses, monthName) {
    let message = `📊 **Expense Breakdown - ${monthName}**
${SEPARATOR}
Total Expenses: $${totalExpenses.toFixed(2)}`;

    for (const [category, expenses] of Object.entries(expensesByCategory)) {
        const categoryTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const percentage = totalExpenses > 0 ? (categoryTotal / totalExpenses * 100) : 0;

        message += `\n\n**${capitalizeFirst(category)}** ($${categoryTotal.toFixed(2)} - ${percentage.toFixed(1)}%)`;

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
}

/**
 * Build an Apple Pay transaction confirmation message
 * @param {Object} expenseData - Expense data with amount, merchant, date, description
 * @returns {string} Formatted confirmation message
 */
export function buildApplePayConfirmation(expenseData) {
    return `✅ Apple Pay Transaction Recorded
${SEPARATOR}
Amount: $${expenseData.amount.toFixed(2)}
Merchant: ${expenseData.merchant}
Date: ${expenseData.date}
Description: ${expenseData.description}

Your expense has been automatically added to your tracking!`;
}

/**
 * Build a quick expense confirmation message
 * @param {Object} expenseData - Expense data with amount, description, merchant
 * @returns {string} Formatted confirmation message
 */
export function buildQuickExpenseConfirmation(expenseData) {
    return `✅ **Expense Added**
${SEPARATOR}
Amount: $${expenseData.amount.toFixed(2)}
Description: ${expenseData.description}
Merchant: ${expenseData.merchant}`;
}

/**
 * Build expense history message
 * @param {Object} expensesByMerchant - Expenses grouped by merchant
 * @returns {string} Formatted history message
 */
export function buildExpenseHistoryMessage(expensesByMerchant) {
    let message = "📋 **Expense History**\n━━━━━━━━━━━━━━━━\n";
    let totalAmount = 0;

    for (const [merchant, expenses] of Object.entries(expensesByMerchant)) {
        const merchantTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        totalAmount += merchantTotal;

        message += `\n**${capitalizeFirst(merchant)}** ($${merchantTotal.toFixed(2)})\n`;

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
}

/**
 * Build edit expense selection message
 * @param {Array} expenses - Array of recent expenses
 * @returns {Object} Object with message text and inline keyboard
 */
export function buildEditExpenseSelectionMessage(expenses) {
    const inlineKeyboard = [];

    for (const expense of expenses) {
        const date = new Date(expense.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const buttonText = `$${expense.amount.toFixed(2)} - ${expense.merchant} (${dateStr})`;
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

    return {
        message: "📋 Here are your recent expenses. Which one would you like to edit?",
        inlineKeyboard
    };
}

/**
 * Build the expense editing menu
 * @param {Object} expense - Expense object to edit
 * @returns {Object} Object with message text and inline keyboard
 */
export function buildExpenseEditMenu(expense) {
    const date = new Date(expense.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const desc = expense.description || '(No description)';
    const category = expense.category || 'Other';

    const message = `✏️ **Editing Expense**
${SEPARATOR}
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

    return { message, inlineKeyboard };
}

/**
 * Build delete confirmation message
 * @param {Object} expense - Expense object to delete
 * @returns {Object} Object with message text and inline keyboard
 */
export function buildDeleteConfirmationMessage(expense) {
    const date = new Date(expense.timestamp);
    const dateStr = date.toISOString().split('T')[0];

    const message = `⚠️ **DELETE CONFIRMATION**
${SEPARATOR}
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

    return { message, inlineKeyboard };
}

/**
 * Build expense update confirmation message
 * @param {Object} updated - Updated expense object
 * @returns {string} Formatted confirmation message
 */
export function buildExpenseUpdateConfirmation(updated) {
    const date = new Date(updated.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const desc = updated.description || '(No description)';
    const cat = updated.category || 'Other';

    return `✅ **Expense Updated**
${SEPARATOR}
💰 Amount: $${updated.amount.toFixed(2)}
📅 Date: ${dateStr}
📝 Description: ${desc}
🏷️ Category: ${cat}

Your expense has been successfully updated!`;
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}