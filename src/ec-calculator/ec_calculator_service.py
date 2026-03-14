"""EC Affordability Calculator Service.

Handles calculations for Singapore EC property affordability
based on user's financial profile and property details.
"""

import logging
from dataclasses import dataclass
from typing import Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

STRESS_TEST_INTEREST_RATE = 4.0
CPF_OA_INTEREST_RATE=0.025

@dataclass
class ECAffordabilityResult:
    """Result of EC affordability calculation."""
    ec_price: float
    household_income: float
    max_loan_tenure: int
    market_interest_rate: float
    cpf_balance: float
    monthly_cpf_contribution: float
    other_debts: float
    buyer_stamp_duty: float
    legal_fees: float
    remaining_cpf_balance: float
    
    # Calculated results
    maximum_property_loan: float
    monthly_mortgage_loan: float
    cash_upfront_for_downpayment: float
    cash_topup_for_monthly_repayment: float
    cash_required_at_top: float
    cpf_balance_at_top: float

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
                "Other Monthly Debts": f"SGD {self.other_debts:,.2f}",
            },
            "CPF Deductions": {
                "Buyer Stamp Duty (BSD)": f"SGD {self.buyer_stamp_duty:,.2f}",
                "Legal Fees": f"SGD {self.legal_fees:,.2f}",
                "Total Fees": f"SGD {self.buyer_stamp_duty + self.legal_fees:,.2f}",
                "CPF Balance After Fees": f"SGD {self.remaining_cpf_balance:,.2f}",
            },
            "Affordability Analysis": {
                "Maximum Property Loan": f"SGD {self.maximum_property_loan:,.2f}",
                "Monthly Mortgage Payment": f"SGD {self.monthly_mortgage_loan:,.2f}",
                "5% Cash Downpayment": f"SGD{self.ec_price * 0.05:,.2f}",
                "15% Cash Downpayment": f"SGD{self.ec_price * 0.15:,.2f}",
                "Total Cash Upfront for Down Payment": f"SGD {self.cash_upfront_for_downpayment:,.2f}",
                "Cash Top-up for Monthly Repayment": f"SGD {self.cash_topup_for_monthly_repayment:,.2f}",
                "Remaining Amount to Pay": f"SGD {self.ec_price - self.maximum_property_loan - self.cash_upfront_for_downpayment:,.2f}",
                "CPF After Fees": f"SGD {self.cpf_balance-self.buyer_stamp_duty:,.2f}",
                "Cash Required at T.O.P": f"SGD {self.cash_required_at_top:,.2f}",
                "Cash Required with Pledging": f"SGD {self.cash_required_at_top / 1.4:,.2f}",
                "CPF Balance at T.O.P (2.5 years)": f"SGD {self.cpf_balance_at_top:,.2f}",
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
            other_debts = float(user_input.get("other_debts", 0))
            
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
            if other_debts < 0:
                raise ValueError("Other debts cannot be negative")
            
            logger.debug(f"✅ EC_CALC: Input validation passed")
            
            # Calculate CPF-related fees
            bsd = ECCalculatorService._calculate_buyer_stamp_duty(ec_price)
            legal_fees = 3000.0  # Fixed legal fee
            total_fees = bsd + legal_fees
            remaining_cpf = max(0, cpf_balance - total_fees)
            
            logger.debug(f"📋 FEES: BSD = SGD {bsd:,.2f}, Legal Fees = SGD {legal_fees:,.2f}, Total = SGD {total_fees:,.2f}")
            logger.debug(f"💰 CPF: Original = SGD {cpf_balance:,.2f}, Remaining = SGD {remaining_cpf:,.2f}")
            
            # Calculate affordability metrics
            max_loan = ECCalculatorService._calculate_maximum_loan(
                household_income, max_loan_tenure, market_interest_rate, ec_price, other_debts
            )
            monthly_mortgage = ECCalculatorService._calculate_monthly_mortgage(
                max_loan, max_loan_tenure, market_interest_rate
            )
            downpayment_amount = ECCalculatorService._calculate_downpayment(
                ec_price
            )
            topup_cash = ECCalculatorService._calculate_topup_for_monthly(
                monthly_mortgage, monthly_cpf_contribution
            )
            cpf_at_top = ECCalculatorService._calculate_cpf_at_top(
                cpf_balance, total_fees, monthly_cpf_contribution
            )
            cash_at_top = ECCalculatorService._calculate_cash_at_top(
                ec_price, max_loan, downpayment_amount, cpf_at_top
            )
            
            logger.info(f"✅ EC_CALC: Calculations complete")
            
            result = ECAffordabilityResult(
                ec_price=ec_price,
                household_income=household_income,
                max_loan_tenure=max_loan_tenure,
                market_interest_rate=market_interest_rate,
                cpf_balance=cpf_balance,
                monthly_cpf_contribution=monthly_cpf_contribution,
                other_debts=other_debts,
                buyer_stamp_duty=bsd,
                legal_fees=legal_fees,
                remaining_cpf_balance=remaining_cpf,
                maximum_property_loan=max_loan,
                monthly_mortgage_loan=monthly_mortgage,
                cash_upfront_for_downpayment=downpayment_amount,
                cash_topup_for_monthly_repayment=topup_cash,
                cash_required_at_top=cash_at_top,
                cpf_balance_at_top=cpf_at_top,
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
    def _calculate_buyer_stamp_duty(ec_price: float) -> float:
        """
        Calculate Buyer Stamp Duty (BSD) for EC property purchase.
        
        Tiered structure:
        - First $180,000: 1%
        - Next $180,000 ($180,000 to $360,000): 2%
        - Next $640,000 ($360,000 to $1,000,000): 3%
        - Next $500,000 ($1,000,000 to $1,500,000): 4%
        - Amount above $1,500,000: 6%
        
        Args:
            ec_price: EC property price
            
        Returns:
            Buyer Stamp Duty amount
        """
        bsd = 0.0
        
        # Tier 1: First $180,000 at 1%
        if ec_price > 0:
            tier1 = min(ec_price, 180000)
            bsd += tier1 * 0.01
            logger.debug(f"  BSD Tier 1 ($0 - $180k @ 1%): SGD {tier1 * 0.01:,.2f}")
        
        # Tier 2: Next $180,000 ($180k - $360k) at 2%
        if ec_price > 180000:
            tier2 = min(ec_price - 180000, 180000)
            bsd += tier2 * 0.02
            logger.debug(f"  BSD Tier 2 ($180k - $360k @ 2%): SGD {tier2 * 0.02:,.2f}")
        
        # Tier 3: Next $640,000 ($360k - $1,000k) at 3%
        if ec_price > 360000:
            tier3 = min(ec_price - 360000, 640000)
            bsd += tier3 * 0.03
            logger.debug(f"  BSD Tier 3 ($360k - $1M @ 3%): SGD {tier3 * 0.03:,.2f}")
        
        # Tier 4: Next $500,000 ($1M - $1.5M) at 4%
        if ec_price > 1000000:
            tier4 = min(ec_price - 1000000, 500000)
            bsd += tier4 * 0.04
            logger.debug(f"  BSD Tier 4 ($1M - $1.5M @ 4%): SGD {tier4 * 0.04:,.2f}")
        
        # Tier 5: Amount above $1.5M at 6%
        if ec_price > 1500000:
            tier5 = ec_price - 1500000
            bsd += tier5 * 0.06
            logger.debug(f"  BSD Tier 5 (>$1.5M @ 6%): SGD {tier5 * 0.06:,.2f}")
        
        logger.debug(f"📋 BUYER_STAMP_DUTY: Total = SGD {bsd:,.2f}")
        return bsd

    @staticmethod
    def _calculate_maximum_loan(
        household_income: float, loan_tenure: int, interest_rate: float, 
        ec_price: float, other_debts: float
    ) -> float:
        """
        Calculate maximum property loan amount based on Singapore EC regulations.
        
        Takes the minimum of three constraints:
        1. MSR (Mortgage Servicing Ratio): 30% of gross monthly income
        2. TDSR (Total Debt Servicing Ratio): 55% minus other debts
        3. LTV (Loan-to-Value): 75% of property price
        
        Args:
            household_income: Gross monthly household income
            loan_tenure: Loan tenure in years
            interest_rate: Annual interest rate in percentage (e.g., 3.5 for 3.5%)
            ec_price: EC property price
            other_debts: Monthly debt obligations
            
        Returns:
            Maximum loan amount in SGD
        """
        logger.debug(f"💰 MAX_LOAN: Calculating maximum loan with MSR, TDSR, and LTV constraints")
        
        interest_rate = STRESS_TEST_INTEREST_RATE
        # Constraint 1: MSR (Mortgage Servicing Ratio) - 30% of gross monthly income
        max_monthly_payment_msr = household_income * 0.30
        max_loan_msr = ECCalculatorService._calculate_loan_from_monthly_payment(
            max_monthly_payment_msr, loan_tenure, interest_rate
        )
        logger.debug(f"  MSR Constraint: Max Monthly Payment = SGD {max_monthly_payment_msr:,.2f} → Max Loan = SGD {max_loan_msr:,.2f}")
        
        # Constraint 2: TDSR (Total Debt Servicing Ratio) - 55% of income minus other debts
        max_total_debt_payment = household_income * 0.55
        max_monthly_payment_tdsr = max_total_debt_payment - other_debts
        max_monthly_payment_tdsr = max(0, max_monthly_payment_tdsr)  # Ensure non-negative
        max_loan_tdsr = ECCalculatorService._calculate_loan_from_monthly_payment(
            max_monthly_payment_tdsr, loan_tenure, interest_rate
        )
        logger.debug(f"  TDSR Constraint: (55% Income - Other Debts) = SGD {max_monthly_payment_tdsr:,.2f} → Max Loan = SGD {max_loan_tdsr:,.2f}")
        
        # Constraint 3: LTV (Loan-to-Value) - 75% of property price
        max_loan_ltv = ec_price * 0.75
        logger.debug(f"  LTV Constraint: 75% of EC Price = SGD {max_loan_ltv:,.2f}")
        
        # Take the minimum of the three constraints
        max_loan = min(max_loan_msr, max_loan_tdsr, max_loan_ltv)
        
        logger.info(f"💰 MAX_LOAN: Final maximum loan = SGD {max_loan:,.2f} (limited by {'MSR' if max_loan == max_loan_msr else 'TDSR' if max_loan == max_loan_tdsr else 'LTV'})")
        return max_loan

    @staticmethod
    def _calculate_loan_from_monthly_payment(
        monthly_payment: float, tenure_years: int, interest_rate: float
    ) -> float:
        """
        Calculate loan amount from monthly payment using mortgage formula.
        
        Formula: P = M / {[r(1+r)^n] / [(1+r)^n - 1]}
        Where: P = Principal (loan), M = Monthly Payment, r = monthly rate, n = number of payments
        
        Args:
            monthly_payment: Maximum monthly payment in SGD
            tenure_years: Loan tenure in years
            interest_rate: Annual interest rate in percentage
            
        Returns:
            Maximum loan amount that can be serviced with the given monthly payment
        """
        if monthly_payment <= 0:
            return 0
            
        if interest_rate == 0:
            # If no interest, simple division
            return monthly_payment * tenure_years * 12
        
        monthly_rate = (interest_rate / 100) / 12
        num_payments = tenure_years * 12
        
        # Calculate the mortgage payment factor
        rate_factor = (1 + monthly_rate) ** num_payments
        payment_factor = (monthly_rate * rate_factor) / (rate_factor - 1)
        
        # Inverse: Loan = Monthly Payment / Payment Factor
        loan = monthly_payment / payment_factor
        
        logger.debug(f"    Loan calculation: Monthly Payment SGD {monthly_payment:.2f} at {interest_rate}% over {tenure_years} years = SGD {loan:,.2f}")
        return loan

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
    def _calculate_downpayment(ec_price: float) -> float:
        """
        Calculate cash down payment required for EC property.
        
        Down payment requirement: 20% of EC property price
        Must be fully paid in cash (not from CPF).
        
        Formula: Down Payment = 20% × EC Price
        
        Args:
            ec_price: EC property price
            
        Returns:
            Cash down payment required (20% of EC price)
        """
        down_payment_required = ec_price * 0.20
        
        logger.debug(f"💵 DOWN_PAYMENT: 20% of EC Price (Cash Required) = SGD {down_payment_required:,.2f}")
        return down_payment_required

    @staticmethod
    def _calculate_topup_for_monthly(
        monthly_mortgage: float, monthly_cpf_contribution: float
    ) -> float:
        """
        Calculate monthly cash top-up required for mortgage repayment.
        
        The monthly mortgage payment can be covered by:
        1. Monthly CPF contribution (up to the mortgage amount)
        2. Cash from pocket (top-up amount)
        
        Formula: Monthly Cash Top-up = Monthly Mortgage - Monthly CPF Contribution
        
        Args:
            monthly_mortgage: Monthly mortgage payment amount
            monthly_cpf_contribution: Monthly CPF contribution available for mortgage
            
        Returns:
            Monthly cash top-up required (out of pocket)
        """
        cash_topup = max(0, monthly_mortgage - monthly_cpf_contribution)
        
        logger.debug(f"💳 MORTGAGE: SGD {monthly_mortgage:,.2f}")
        logger.debug(f"💰 CPF USED: SGD {min(monthly_cpf_contribution, monthly_mortgage):,.2f}")
        logger.debug(f"💸 CASH_TOPUP: SGD {cash_topup:,.2f}")
        return cash_topup

    @staticmethod
    def _calculate_cash_at_top(
        ec_price: float, loan_amount: float, downpayment_amount: float, cpf_at_top: float
    ) -> float:
        """
        Calculate cash required at T.O.P (Top of Purchase).
        
        After accounting for loan and down payment, any remainder can be covered by
        CPF balance available at T.O.P. Only additional cash is required if CPF is insufficient.
        
        Formula: Remainder = Property Price - Loan Amount - Down Payment
        Cash at T.O.P = max(0, Remainder - CPF at T.O.P)
        
        Args:
            ec_price: EC property price
            loan_amount: Maximum loan amount approved
            downpayment_amount: Total down payment amount (20% of EC price)
            cpf_at_top: CPF balance available at T.O.P (2.5 years)
            
        Returns:
            Cash required at T.O.P (after CPF is used to cover remainder)
        """
        remainder = ec_price - loan_amount - downpayment_amount
        cash_at_top = max(0, remainder - cpf_at_top)
        
        logger.debug(f"💰 CASH_AT_TOP: (SGD {ec_price:,.2f} - SGD {loan_amount:,.2f} - SGD {downpayment_amount:,.2f}) - SGD {cpf_at_top:,.2f}")
        logger.debug(f"💰 CASH_AT_TOP: SGD {remainder:,.2f} - SGD {cpf_at_top:,.2f} = SGD {cash_at_top:,.2f}")
        return cash_at_top

    @staticmethod
    def calculate_investment(principal, monthly_deposit, annual_rate, years):
        # Interest compounded monthly
        n = 12 
        monthly_rate = annual_rate / n
        total_months = int(years * n)
        
        # Part 1: Compound interest on the starting capital
        # Formula: A = P(1 + r/n)^(nt)
        principal_growth = principal * (1 + monthly_rate)**total_months
        logger.debug(f"PRINCIPAL GROWTH {principal_growth}")
        # Part 2: Future value of a series of monthly deposits (Ordinary Annuity)
        # Formula: PMT * [((1 + r/n)^(nt) - 1) / (r/n)]
        deposits_growth = monthly_deposit * (((1 + monthly_rate)**total_months - 1) / monthly_rate)
        logger.debug(f"DEPOSITS GROWTH {deposits_growth}")
        
        return principal_growth + deposits_growth

    @staticmethod
    def _calculate_cpf_at_top(
        initial_cpf_balance: float, cpf_used_for_fees: float, monthly_cpf_contribution: float
    ) -> float:
        """
        Calculate CPF balance at T.O.P (2.5 years after purchase).
        
        CPF balance grows with monthly contributions over 2.5 years (30 months),
        but is reduced by fees paid upfront.
        
        Formula: CPF at T.O.P = Initial CPF - CPF Used for Fees + (Monthly Contribution × 2.5 × 12)
        
        Args:
            initial_cpf_balance: Initial CPF balance
            cpf_used_for_fees: CPF deducted for BSD and legal fees
            monthly_cpf_contribution: Monthly CPF contribution amount
            
        Returns:
            CPF balance at T.O.P (after 2.5 years)
        """
        months_to_top = 2.5 * 12  # 2.5 years = 30 months
        cpf_after_fees = initial_cpf_balance - cpf_used_for_fees
        cpf_at_top = ECCalculatorService.calculate_investment(cpf_after_fees, monthly_cpf_contribution, CPF_OA_INTEREST_RATE, 2.5)
        
        logger.debug(f"💰 CPF_AT_TOP: SGD {initial_cpf_balance:,.2f} - SGD {cpf_used_for_fees:,.2f} + (SGD {monthly_cpf_contribution:,.2f} × 30 months) = SGD {cpf_at_top:,.2f}")
        return cpf_at_top
