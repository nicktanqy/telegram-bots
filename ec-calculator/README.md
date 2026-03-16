# EC Calculator Bot - Executive Condominium Affordability Calculator

A dedicated Telegram bot for calculating EC (Executive Condominium) property affordability in Singapore through the Deferred Payment Scheme.

## Overview

The EC Calculator Bot helps potential EC buyers determine their affordability by analyzing:
- EC property price
- Household income
- Loan tenure preferences
- Market interest rates
- CPF balance and contributions

## Features

✅ **Simple Multi-step Conversation** - Easy-to-follow flow for collecting user information  
✅ **Input Validation** - Validates all user inputs with helpful error messages  
✅ **Affordability Analysis** - Calculates 5 key metrics:
  - Maximum property loan available
  - Monthly mortgage payment
  - Cash upfront for down payment
  - Cash top-up for monthly repayment
  - Cash required at T.O.P (Transfer of Ownership)

✅ **Clean Architecture** - Modular, scalable design ready for formula updates

## Architecture

```
src/ec-calculator/
├── __init__.py              # Package initialization
├── main.py                  # Main bot application & message handlers
├── models.py                # Data models (FormField, ConversationFlow)
├── conversations.py         # Generic conversation handler framework
├── config.py                # Flow definitions & bot configuration
└── ec_calculator_service.py # Affordability calculation service
```

## API Flow

### 1. User starts with `/start`
Bot displays welcome message and begins data collection flow.

### 2. User provides information (6 steps):
1. **EC Unit Price** (Currency) - SGD amount for the unit
2. **Monthly Household Income** (Currency) - Combined household income
3. **Max Loan Tenure** (Number 1-30) - Years for mortgage term
4. **Market Interest Rate** (Number) - Current interest rate in %
5. **CPF Balance** (Currency) - Current CPF savings
6. **Monthly CPF Contribution** (Currency) - Contribution amount

### 3. Bot calculates affordability
- Validates all inputs
- Runs calculations
- Displays results with options to:
  - Perform a new calculation
  - Exit

## Key Components

### GenericConversationHandler
Reusable framework for multi-step conversations:
- Manages conversation state (flow, step, collected data)
- Validates input at each step
- Handles flow completion callbacks

### ECCalculatorService
Handles all affordability calculations:
- `calculate_affordability()` - Main calculation method
- `_calculate_maximum_loan()` - Max loan amount
- `_calculate_monthly_mortgage()` - Monthly payment
- `_calculate_downpayment()` - Down payment cash needed
- `_calculate_topup_for_monthly()` - Additional monthly cash
- `_calculate_cash_at_top()` - Cash needed at T.O.P

### Modular Design
- Each calculation method can be independently updated
- Placeholder formulas ready to be replaced with actual Singapore EC rules
- Comprehensive logging for debugging

## Running the Bot

```bash
cd src/ec-calculator
python main.py
```

Requires:
- `EC_TOKEN` environment variable (Telegram bot token)
- Python 3.10+
- python-telegram-bot library

## Extending the Bot

To add custom calculations:
1. Update the calculation methods in `ec_calculator_service.py`
2. Methods use placeholder formulas that can be replaced with actual logic
3. All input validation is built-in and reusable

## Calculation Formulas (Current - Placeholder)

All formulas are currently using simplified placeholder logic:
- **Maximum Loan**: `income * 5 * (tenure / 30)`
- **Monthly Payment**: Standard mortgage formula with compound interest
- **Down Payment**: 20% of property price minus CPF balance
- **Monthly Top-up**: 30% of income minus mortgage payment
- **T.O.P Cash**: 5% of property price added to down payment

These should be updated with actual Singapore EC affordability rules.

## Error Handling

✅ Input validation with specific error messages  
✅ Graceful error recovery with user guidance  
✅ Comprehensive logging for debugging  
✅ Safe state management

## Future Enhancements

- [ ] Update formulas with actual Singapore EC affordability rules
- [ ] Add support for different property types (HDB, private)
- [ ] Implement data persistence for historical calculations
- [ ] Add detailed FAQ/guidance
- [ ] Support for multiple users simultaneously
