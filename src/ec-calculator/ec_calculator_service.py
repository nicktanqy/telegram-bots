"""EC Affordability Calculator Service.

Handles calculations for Singapore EC property affordability
based on user's financial profile and property details.
"""

import logging
from dataclasses import dataclass
from typing import Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


@dataclass
class ECAffordabilityResult:
    """Result of EC affordability calculation."""
    ec_price: float
    household_income: float
    max_loan_tenure: int
    market_interest_rate: float
    cpf_balance: float
    monthly_cpf_contribution: float
    
    # Calculated results
    maximum_property_loan: float
    monthly_mortgage_loan: float
    cash_upfront_for_downpayment: float
    cash_topup_for_monthly_repayment: float
    cash_required_at_top: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for display."""
        return {
            "Input Parameters": {
                "EC Price": f"SGD {self.ec_price:,.2f}",
                "Household Income": f"SGD {self.household_income:,.2f}",
                "Max Loan Tenure": f"{self.max_loan_tenure} years",
                "Market Interest Rate": f"{self.market_interest_rate:.2f}%",
                "CPF Balance": f"SGD {self.cpf_balance:,.2f}",
                "Monthly CPF Contribution": f"SGD {self.monthly_cpf_contribution:,.2f}",
            },
            "Affordability Analysis": {
                "Maximum Property Loan": f"SGD {self.maximum_property_loan:,.2f}",
                "Monthly Mortgage Payment": f"SGD {self.monthly_mortgage_loan:,.2f}",
                "Cash Upfront for Down Payment": f"SGD {self.cash_upfront_for_downpayment:,.2f}",
                "Cash Top-up for Monthly Repayment": f"SGD {self.cash_topup_for_monthly_repayment:,.2f}",
                "Cash Required at T.O.P": f"SGD {self.cash_required_at_top:,.2f}",
            }
        }


class ECCalculatorService:
    """Service for EC affordability calculations."""

    @staticmethod
    def calculate_affordability(user_input: Dict[str, str]) -> ECAffordabilityResult:
        """
        Calculate EC affordability based on user input.
        
        Args:
            user_input: Dictionary with keys:
                - ec_price: Price of the EC unit
                - household_income: Total monthly household income
                - max_loan_tenure: Maximum loan tenure in years (max 30)
                - market_interest_rate: Current market interest rate in %
                - cpf_balance: Current CPF balance
                - monthly_cpf_contribution: Monthly CPF contribution amount
        
        Returns:
            ECAffordabilityResult with calculated values
            
        Raises:
            ValueError: If input data is invalid
        """
        logger.debug(f"🏠 EC_CALC: Starting affordability calculation")
        
        try:
            # Parse input
            ec_price = float(user_input.get("ec_price", 0))
            household_income = float(user_input.get("household_income", 0))
            max_loan_tenure = int(user_input.get("max_loan_tenure", 30))
            market_interest_rate = float(user_input.get("market_interest_rate", 0))
            cpf_balance = float(user_input.get("cpf_balance", 0))
            monthly_cpf_contribution = float(user_input.get("monthly_cpf_contribution", 0))
            
            # Validation
            if ec_price <= 0:
                raise ValueError("EC price must be greater than 0")
            if household_income <= 0:
                raise ValueError("Household income must be greater than 0")
            if max_loan_tenure <= 0 or max_loan_tenure > 30:
                raise ValueError("Loan tenure must be between 1 and 30 years")
            if market_interest_rate < 0:
                raise ValueError("Interest rate cannot be negative")
            if cpf_balance < 0:
                raise ValueError("CPF balance cannot be negative")
            if monthly_cpf_contribution < 0:
                raise ValueError("Monthly CPF contribution cannot be negative")
            
            logger.debug(f"✅ EC_CALC: Input validation passed")
            
            # Calculate affordability metrics
            max_loan = ECCalculatorService._calculate_maximum_loan(
                household_income, max_loan_tenure
            )
            monthly_mortgage = ECCalculatorService._calculate_monthly_mortgage(
                max_loan, max_loan_tenure, market_interest_rate
            )
            downpayment_cash = ECCalculatorService._calculate_downpayment(
                ec_price, cpf_balance
            )
            topup_cash = ECCalculatorService._calculate_topup_for_monthly(
                household_income, monthly_mortgage
            )
            cash_at_top = ECCalculatorService._calculate_cash_at_top(
                ec_price, downpayment_cash, monthly_mortgage
            )
            
            logger.info(f"✅ EC_CALC: Calculations complete")
            
            result = ECAffordabilityResult(
                ec_price=ec_price,
                household_income=household_income,
                max_loan_tenure=max_loan_tenure,
                market_interest_rate=market_interest_rate,
                cpf_balance=cpf_balance,
                monthly_cpf_contribution=monthly_cpf_contribution,
                maximum_property_loan=max_loan,
                monthly_mortgage_loan=monthly_mortgage,
                cash_upfront_for_downpayment=downpayment_cash,
                cash_topup_for_monthly_repayment=topup_cash,
                cash_required_at_top=cash_at_top,
            )
            
            logger.debug(f"📦 EC_CALC: Result object created")
            return result
            
        except ValueError as e:
            logger.error(f"❌ EC_CALC_ERROR: Validation error: {e}")
            raise
        except Exception as e:
            logger.error(f"❌ EC_CALC_ERROR: Unexpected error: {e}", exc_info=True)
            raise

    @staticmethod
    def _calculate_maximum_loan(
        household_income: float, loan_tenure: int
    ) -> float:
        """
        Calculate maximum property loan amount.
        
        PLACEHOLDER FORMULA: 
        - Typically based on Singapore's loan-to-value (LTV) ratios
        - Debt servicing ratio limits may apply
        
        Current formula: income * 5 * (loan_tenure / 30)
        """
        max_loan = household_income * 5 * (loan_tenure / 30)
        logger.debug(f"💰 MAX_LOAN: SGD {max_loan:,.2f}")
        return max_loan

    @staticmethod
    def _calculate_monthly_mortgage(
        loan_amount: float, tenure_years: int, interest_rate: float
    ) -> float:
        """
        Calculate monthly mortgage payment.
        
        PLACEHOLDER FORMULA:
        Uses standard mortgage calculation with monthly compound interest.
        """
        if interest_rate == 0:
            monthly_payment = loan_amount / (tenure_years * 12)
        else:
            monthly_rate = (interest_rate / 100) / 12
            num_payments = tenure_years * 12
            numerator = monthly_rate * ((1 + monthly_rate) ** num_payments)
            denominator = ((1 + monthly_rate) ** num_payments) - 1
            monthly_payment = loan_amount * (numerator / denominator)
        
        logger.debug(f"💳 MONTHLY_MORTGAGE: SGD {monthly_payment:,.2f}")
        return monthly_payment

    @staticmethod
    def _calculate_downpayment(ec_price: float, cpf_balance: float) -> float:
        """
        Calculate cash upfront required for down payment.
        
        PLACEHOLDER FORMULA:
        - Down payment is typically 20-25% of property price
        - CPF can be used to cover part of down payment
        """
        down_payment_percent = 0.20
        total_downpayment = ec_price * down_payment_percent
        cash_needed = max(0, total_downpayment - cpf_balance)
        
        logger.debug(f"💵 DOWNPAYMENT_CASH: SGD {cash_needed:,.2f}")
        return cash_needed

    @staticmethod
    def _calculate_topup_for_monthly(
        household_income: float, monthly_mortgage: float
    ) -> float:
        """
        Calculate additional cash needed for monthly repayment.
        
        PLACEHOLDER FORMULA:
        - Debt servicing ratio limit: typically 30% of gross income
        """
        max_monthly_commitment = household_income * 0.30
        cash_topup = max(0, monthly_mortgage - max_monthly_commitment)
        
        logger.debug(f"💸 TOPUP_MONTHLY: SGD {cash_topup:,.2f}")
        return cash_topup

    @staticmethod
    def _calculate_cash_at_top(
        ec_price: float, downpayment_cash: float, monthly_mortgage: float
    ) -> float:
        """
        Calculate cash required at T.O.P (Top Object Point).
        
        PLACEHOLDER FORMULA:
        - T.O.P is when you take ownership
        """
        top_costs = ec_price * 0.05
        total_cash_at_top = downpayment_cash + top_costs
        
        logger.debug(f"💰 CASH_AT_TOP: SGD {total_cash_at_top:,.2f}")
        return total_cash_at_top
