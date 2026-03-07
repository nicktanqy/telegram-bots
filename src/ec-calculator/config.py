"""Configuration for EC Calculator Bot."""

import sys
from pathlib import Path

# Add parent directory to path so we can import from common
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.models import FormField, ConversationFlow, ConversationField, FieldType


def create_ec_calculator_flow() -> ConversationFlow:
    """Create the EC affordability calculator flow."""
    return ConversationFlow(
        name="ec_calculator",
        description="EC Deferred Payment Scheme Affordability Calculator",
        welcome_message="""🏠 **EC Affordability Calculator**

Welcome to the Executive Condominium (EC) Affordability Calculator!

I'll help you determine your affordability for purchasing an EC unit through the Deferred Payment Scheme.

Please provide the following information:""",
        completion_message="✅ Calculation complete! Here are your affordability results:",
        steps=[
            ConversationField(
                key="ec_price",
                form_field=FormField(
                    key="ec_price",
                    display_name="EC Unit Price",
                    prompt="What is the EC unit price? (in SGD)",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="household_income",
                form_field=FormField(
                    key="household_income",
                    display_name="Monthly Household Income",
                    prompt="What is your total monthly household income? (in SGD)",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="max_loan_tenure",
                form_field=FormField(
                    key="max_loan_tenure",
                    display_name="Max Loan Tenure",
                    prompt="What is your preferred maximum loan tenure? (1-30 years)",
                    field_type=FieldType.NUMBER,
                    validation_fn=lambda x: (1 <= int(float(x)) <= 30, "Loan tenure must be between 1 and 30 years") if x else (False, "Loan tenure is required"),
                ),
            ),
            ConversationField(
                key="market_interest_rate",
                form_field=FormField(
                    key="market_interest_rate",
                    display_name="Market Interest Rate",
                    prompt="What is the current market interest rate? (in %, e.g., 3.5)",
                    field_type=FieldType.NUMBER,
                    validation_fn=lambda x: (float(x) >= 0, "Interest rate cannot be negative") if x else (False, "Interest rate is required"),
                ),
            ),
            ConversationField(
                key="cpf_balance",
                form_field=FormField(
                    key="cpf_balance",
                    display_name="CPF Balance",
                    prompt="What is your current CPF balance? (in SGD)",
                    field_type=FieldType.CURRENCY,
                ),
            ),
            ConversationField(
                key="monthly_cpf_contribution",
                form_field=FormField(
                    key="monthly_cpf_contribution",
                    display_name="Monthly CPF Contribution",
                    prompt="What is your monthly CPF contribution? (in SGD)",
                    field_type=FieldType.CURRENCY,
                ),
            ),
        ],
    )


# Available flows
FLOWS = {
    "ec_calculator": create_ec_calculator_flow(),
}


# Settings
DEVELOPER_CHAT_ID = 138562035
