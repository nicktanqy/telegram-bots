/**
 * Configuration and conversation flows for the bot
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

import { FormField, ConversationField, ConversationFlow, FieldType } from './models.js';

/**
 * Create the new user setup flow
 * @returns {ConversationFlow} Setup flow configuration
 */
function createExpenseSetupFlow() {
    return new ConversationFlow(
        "expense_setup",
        "Initial setup for expense tracking",
        "Welcome! Let's set up your financial profile. This will help me track your expenses better.",
        "✅ Great! Your profile is ready. I'll now help you track your finances.",
        [
            new ConversationField(
                "age",
                new FormField(
                    "age",
                    "Age",
                    "What is your age?",
                    FieldType.NUMBER,
                    null,
                    true
                )
            ),
            new ConversationField(
                "current_savings",
                new FormField(
                    "current_savings",
                    "Current Savings",
                    "How much do you currently have in savings?",
                    FieldType.CURRENCY,
                    null,
                    true
                )
            ),
            new ConversationField(
                "monthly_budget",
                new FormField(
                    "monthly_budget",
                    "Monthly Budget",
                    "What is your monthly budget?",
                    FieldType.CURRENCY,
                    null,
                    true
                )
            ),
            new ConversationField(
                "savings_goal",
                new FormField(
                    "savings_goal",
                    "Savings Goal",
                    "What is your savings goal amount?",
                    FieldType.CURRENCY,
                    null,
                    true
                )
            ),
            new ConversationField(
                "goal_age",
                new FormField(
                    "goal_age",
                    "Goal Age",
                    "By what age do you want to achieve this goal?",
                    FieldType.NUMBER,
                    null,
                    true
                )
            ),
        ]
    );
}

/**
 * Create the expense tracking flow
 * @returns {ConversationFlow} Expense tracking flow configuration
 */
function createExpenseTrackingFlow() {
    return new ConversationFlow(
        "expense_tracking",
        "Track a new expense",
        "Let's record an expense.",
        "✅ Expense recorded successfully!",
        [
            new ConversationField(
                "amount",
                new FormField(
                    "amount",
                    "Expense Amount",
                    "How much did you spend?",
                    FieldType.CURRENCY,
                    null,
                    true
                )
            ),
            new ConversationField(
                "category",
                new FormField(
                    "category",
                    "Category",
                    "What category? (e.g., food, transport, entertainment)",
                    FieldType.TEXT,
                    null,
                    true
                )
            ),
            new ConversationField(
                "description",
                new FormField(
                    "description",
                    "Description",
                    "Describe the expense (optional - press enter to skip)",
                    FieldType.TEXT,
                    null,
                    false
                )
            ),
        ]
    );
}

// Available flows
export const FLOWS = {
    expense_setup: createExpenseSetupFlow(),
    expense_tracking: createExpenseTrackingFlow(),
};

// UI Configuration
export const MAIN_MENU_BUTTONS = [
    ["📊 View Stats", "💰 Add Expense"],
    ["⚙️ Settings", "📋 History"],
];

// Settings
export const DEVELOPER_CHAT_ID = 138562035;