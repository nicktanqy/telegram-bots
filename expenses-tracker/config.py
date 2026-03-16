"""Configuration and conversation flows for the bot."""

import sys
from pathlib import Path

# Add parent directory to path so we can import from common
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.models import (
    FormField, ConversationFlow, ConversationField, FieldType
)


def create_expense_setup_flow() -> ConversationFlow:
    """Create the new user setup flow."""
    return ConversationFlow(
        name="expense_setup",
        description="Initial setup for expense tracking",
        welcome_message="Welcome! Let's set up your financial profile. This will help me track your expenses better.",
        completion_message="✅ Great! Your profile is ready. I'll now help you track your finances.",
        steps=[
            ConversationField(
                key="age",
                form_field=FormField(
                    key="age",
                    display_name="Age",
                    prompt="What is your age?",
                    field_type=FieldType.NUMBER,
                ),
            ),
            ConversationField(
                key="current_savings",
                form_field=FormField(
                    key="current_savings",
                    display_name="Current Savings",
                    prompt="How much do you currently have in savings?",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="monthly_budget",
                form_field=FormField(
                    key="monthly_budget",
                    display_name="Monthly Budget",
                    prompt="What is your monthly budget?",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="savings_goal",
                form_field=FormField(
                    key="savings_goal",
                    display_name="Savings Goal",
                    prompt="What is your savings goal amount?",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="goal_age",
                form_field=FormField(
                    key="goal_age",
                    display_name="Goal Age",
                    prompt="By what age do you want to achieve this goal?",
                    field_type=FieldType.NUMBER,
                ),
            ),
        ],
    )


def create_expense_tracking_flow() -> ConversationFlow:
    """Create the expense tracking flow."""
    return ConversationFlow(
        name="expense_tracking",
        description="Track a new expense",
        welcome_message="Let's record an expense.",
        completion_message="✅ Expense recorded successfully!",
        steps=[
            ConversationField(
                key="amount",
                form_field=FormField(
                    key="amount",
                    display_name="Expense Amount",
                    prompt="How much did you spend?",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="category",
                form_field=FormField(
                    key="category",
                    display_name="Category",
                    prompt="What category? (e.g., food, transport, entertainment)",
                    field_type=FieldType.TEXT,
                ),
            ),
            ConversationField(
                key="description",
                form_field=FormField(
                    key="description",
                    display_name="Description",
                    prompt="Describe the expense (optional - press enter to skip)",
                    field_type=FieldType.TEXT,
                    required=False,
                ),
            ),
        ],
    )


# Available flows
FLOWS = {
    "expense_setup": create_expense_setup_flow(),
    "expense_tracking": create_expense_tracking_flow(),
}


# UI Configuration
MAIN_MENU_BUTTONS = [
    ["📊 View Stats", "💰 Add Expense"],
    ["⚙️ Settings", "📋 History"],
]


# Settings
DEVELOPER_CHAT_ID = 138562035
