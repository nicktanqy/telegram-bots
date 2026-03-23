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
                "name",
                new FormField(
                    "name",
                    "Name",
                    "What is your name?",
                    FieldType.TEXT,
                    (value) => {
                        if (!value || value.trim().length < 2) {
                            return { isValid: false, errorMessage: "Name must be at least 2 characters long." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
                    true
                )
            ),
            new ConversationField(
                "age",
                new FormField(
                    "age",
                    "Age",
                    "What is your age?",
                    FieldType.NUMBER,
                    (value) => {
                        const age = parseInt(value);
                        if (age < 13 || age > 120) {
                            return { isValid: false, errorMessage: "Age must be between 13 and 120." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        const amount = parseFloat(value);
                        if (amount < 0) {
                            return { isValid: false, errorMessage: "Savings cannot be negative." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        const amount = parseFloat(value);
                        if (amount <= 0) {
                            return { isValid: false, errorMessage: "Monthly budget must be positive." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        const amount = parseFloat(value);
                        if (amount <= 0) {
                            return { isValid: false, errorMessage: "Savings goal must be positive." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        const age = parseInt(value);
                        if (age < 13 || age > 120) {
                            return { isValid: false, errorMessage: "Goal age must be between 13 and 120." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        const amount = parseFloat(value);
                        if (amount <= 0) {
                            return { isValid: false, errorMessage: "Expense amount must be positive." };
                        }
                        if (amount > 10000) {
                            return { isValid: false, errorMessage: "Expense amount seems too high. Please enter a valid amount." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        const category = value.toLowerCase().trim();
                        const validCategories = ['food', 'transport', 'entertainment', 'utilities', 'shopping', 'healthcare', 'education', 'other'];
                        if (!category || category.length < 2) {
                            return { isValid: false, errorMessage: "Please enter a valid category." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
                    (value) => {
                        if (value && value.length > 200) {
                            return { isValid: false, errorMessage: "Description too long. Please keep it under 200 characters." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
                    false
                )
            ),
        ]
    );
}

/**
 * Create the edit profile flow
 * @returns {ConversationFlow} Edit profile flow configuration
 */
function createEditProfileFlow() {
    return new ConversationFlow(
        "edit_profile",
        "Edit user profile",
        "Let's update your profile information.",
        "✅ Profile updated successfully!",
        [
            new ConversationField(
                "name",
                new FormField(
                    "name",
                    "Name",
                    "What is your name? (press enter to keep current)",
                    FieldType.TEXT,
                    (value) => {
                        if (value && value.trim().length > 0 && value.trim().length < 2) {
                            return { isValid: false, errorMessage: "Name must be at least 2 characters long." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
                    false
                )
            ),
            new ConversationField(
                "current_savings",
                new FormField(
                    "current_savings",
                    "Current Savings",
                    "What is your current savings? (press enter to keep current)",
                    FieldType.CURRENCY,
                    (value) => {
                        if (!value) return { isValid: true, errorMessage: null };
                        const amount = parseFloat(value);
                        if (amount < 0) {
                            return { isValid: false, errorMessage: "Savings cannot be negative." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
                    false
                )
            ),
            new ConversationField(
                "monthly_budget",
                new FormField(
                    "monthly_budget",
                    "Monthly Budget",
                    "What is your monthly budget? (press enter to keep current)",
                    FieldType.CURRENCY,
                    (value) => {
                        if (!value) return { isValid: true, errorMessage: null };
                        const amount = parseFloat(value);
                        if (amount <= 0) {
                            return { isValid: false, errorMessage: "Monthly budget must be positive." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
                    false
                )
            ),
            new ConversationField(
                "savings_goal",
                new FormField(
                    "savings_goal",
                    "Savings Goal",
                    "What is your savings goal amount? (press enter to keep current)",
                    FieldType.CURRENCY,
                    (value) => {
                        if (!value) return { isValid: true, errorMessage: null };
                        const amount = parseFloat(value);
                        if (amount <= 0) {
                            return { isValid: false, errorMessage: "Savings goal must be positive." };
                        }
                        return { isValid: true, errorMessage: null };
                    },
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
    edit_profile: createEditProfileFlow(),
};

// UI Configuration
export const MAIN_MENU_BUTTONS = [
    ["📊 View Stats", "💰 Add Expense"],
    ["⚙️ Settings", "📋 History"],
];

// Settings
export const DEVELOPER_CHAT_ID = 138562035;