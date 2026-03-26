"""Main bot application."""

import logging
import os
import sys
import re
from pathlib import Path
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import (
    ConversationHandler,
    PicklePersistence,
    filters,
    MessageHandler,
    ApplicationBuilder,
    ContextTypes,
    CommandHandler,
)
from dotenv import load_dotenv

# Add parent directory to path so we can import from common
sys.path.insert(0, str(Path(__file__).parent.parent))

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

from config import FLOWS, MAIN_MENU_BUTTONS, DEVELOPER_CHAT_ID
from common.conversations import GenericConversationHandler, ConversationContext, FLOW_COMPLETE
from services import ProfileService, ExpenseService



# Conversation states
MAIN_MENU, ACTIVE_FLOW = range(2)


def parse_apple_pay_message(message_text: str) -> dict:
    """
    Parse Apple Pay transaction message.
    
    Expected format: "Spent $15 at Starbucks on 26 Mar 2026 at 10:28 PM"
    
    Returns:
        dict with keys: amount, merchant, date, or empty dict if invalid
    """
    # Pattern: "Spent $15 at Starbucks on 26 Mar 2026 at 10:28 PM"
    # We'll ignore the time part and focus on the date
    pattern = r'^Spent\s+\$(\d+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})'
    
    match = re.match(pattern, message_text.strip())
    if not match:
        return {}
    
    amount_str, merchant, day_str, month_str, year_str = match.groups()
    
    try:
        amount = float(amount_str)
        if amount <= 0:
            return {}
        
        # Convert month name to number
        month_map = {
            'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
            'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
        }
        
        day = int(day_str)
        month = month_map[month_str]
        year = int(year_str)
        
        # Extended date validation (100-year range)
        current_year = 2026  # Current year
        if not (current_year - 50 <= year <= current_year + 50) or not (1 <= month <= 12) or not (1 <= day <= 31):
            return {}
        
        # Format date as YYYY-MM-DD for consistency
        date_str = f"{year:04d}-{month:02d}-{day:02d}"
        
        return {
            'amount': amount,
            'merchant': merchant.strip(),
            'date': date_str
        }
    except (ValueError, TypeError, KeyError):
        return {}


class ExpenseBot:
    """Main bot class."""

    def __init__(self):
        self.conversation_handler = GenericConversationHandler(FLOWS)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle /start command."""
        try:
            user = update.message.from_user
            logger.info(f"👤 START: User '{user.first_name}' (ID: {user.id}) started conversation")
            logger.debug(f"📊 USER_DATA: Existing data keys: {list(context.user_data.keys())}")
            logger.debug(f"📋 IS_INITIALIZED CHECK: is_profile_initialized = {ProfileService.is_profile_initialized(context.user_data)}")

            # Check if user is initialized
            if ProfileService.is_profile_initialized(context.user_data):
                logger.debug(f"✅ PROFILE: User is already initialized")
                logger.info(f"📍 PATH: Going to 'returning existing user' branch")
                welcome_text = f"""👋 Welcome back, {user.first_name}!

{ProfileService.get_profile_summary(context.user_data)}

What would you like to do?"""
                logger.debug(f"📤 RESULT: Returning MAIN_MENU state")
                await update.message.reply_text(
                    welcome_text,
                    reply_markup=ReplyKeyboardMarkup(
                        MAIN_MENU_BUTTONS, one_time_keyboard=True
                    ),
                )
                return MAIN_MENU
            else:
                logger.debug(f"🆕 PROFILE: User is new, initializing setup flow")
                logger.info(f"📍 PATH: Going to 'new user setup' branch")
                welcome_text = f"""🤖 **Budget Billy** - Your Personal Finance Assistant

Hi {user.first_name}! 👋

I'm here to help you:
• Track your expenses
• Manage your monthly budget
• Work towards your savings goals
• Achieve financial stability

Let's start by setting up your profile."""
                # Start setup flow
                await update.message.reply_text(welcome_text)
                logger.debug(f"📤 RESULT: Starting 'expense_setup' flow for new user")
                
                # Start the flow and transition to ACTIVE_FLOW
                logger.info(f"🚀 CALLING: start_flow() for 'expense_setup'")
                flow_result = await self.conversation_handler.start_flow(
                    update, context, "expense_setup", target_state=ACTIVE_FLOW
                )
                logger.info(f"✅ RETURNED: start_flow() returned {flow_result}")
                logger.debug(f"📤 STATE_CHANGE: start_flow returned {flow_result}, transitioning to ACTIVE_FLOW")
                logger.debug(f"🔍 ConversationContext state: flow={ConversationContext.get_current_flow(context.user_data)}, step={ConversationContext.get_current_step(context.user_data)}")
                return ACTIVE_FLOW
        except Exception as e:
            logger.error(f"❌ ERROR in start: {e}", exc_info=True)
            await update.message.reply_text(
                "❌ An error occurred during startup. Please try again later."
            )
            return MAIN_MENU

    async def handle_menu_choice(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> int:
        """Handle main menu choices."""
        choice = update.message.text
        user = update.message.from_user
        logger.info(f"🎯 MENU: User '{user.first_name}' selected: '{choice}'")

        # Check for Apple Pay transaction message
        apple_pay_data = parse_apple_pay_message(choice)
        if apple_pay_data:
            logger.info(f"🍎 APPLE_PAY: Detected Apple Pay transaction from user '{user.first_name}'")
            logger.debug(f"📦 APPLE_PAY_DATA: {apple_pay_data}")
            
            # Ensure user profile is initialized
            if not ProfileService.is_profile_initialized(context.user_data):
                logger.debug(f"⚠️  INFO: User not initialized, cannot process Apple Pay transaction")
                await update.message.reply_text(
                    "❌ Please set up your profile first with /start before using Apple Pay integration."
                )
                return MAIN_MENU
            
            try:
                # Create expense data for the service
                expense_data = {
                    'amount': apple_pay_data['amount'],
                    'merchant': apple_pay_data['merchant'],  # Use merchant field
                    'description': f"Apple Pay transaction on {apple_pay_data['date']}"
                }
                
                # Add the expense
                expense = ExpenseService.add_expense(context.user_data, expense_data)
                logger.info(f"✅ APPLE_PAY_SAVED: Expense recorded - ${expense.amount} at {apple_pay_data['merchant']}")
                
                # Send confirmation message
                confirmation_msg = f"""✅ **Apple Pay Transaction Recorded**
━━━━━━━━━━━━━━━━
Amount: ${expense.amount:.2f}
Merchant: {apple_pay_data['merchant']}
Date: {apple_pay_data['date']}
Description: {expense.description}

Your expense has been automatically added to your tracking!"""
                
                await update.message.reply_text(confirmation_msg)
                return MAIN_MENU
                
            except Exception as e:
                logger.error(f"❌ APPLE_PAY_ERROR: Failed to save Apple Pay expense: {e}")
                await update.message.reply_text(
                    f"❌ Error recording Apple Pay transaction: {str(e)}"
                )
                return MAIN_MENU

        if "Add Expense" in choice:
            logger.debug(f"📤 ACTION: Starting 'expense_tracking' flow")
            result = await self.conversation_handler.start_flow(
                update, context, "expense_tracking", target_state=ACTIVE_FLOW
            )
            logger.debug(f"📤 STATE_CHANGE: start_flow returned {result}")
            return result

        elif "View Stats" in choice:
            logger.debug(f"📤 ACTION: Generating profile summary")
            summary = ProfileService.get_profile_summary(context.user_data)
            await update.message.reply_text(f"📊 {summary}")
            return MAIN_MENU

        elif "History" in choice:
            logger.debug(f"📤 ACTION: Showing expense history")
            await self.show_expense_history(update, context)
            return MAIN_MENU

        elif "Settings" in choice:
            logger.debug(f"📤 ACTION: Settings not implemented")
            await update.message.reply_text(
                "⚙️ Settings not yet implemented.\nUse /edit_profile to update your information."
            )
            return MAIN_MENU

        logger.debug(f"📤 RESULT: Returning MAIN_MENU state")
        return MAIN_MENU

    async def show_expense_history(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        """Show expense history by merchant."""
        logger.debug(f"📊 HISTORY: Fetching expense history")
        expenses_by_merchant = ExpenseService.get_expenses_by_merchant(
            context.user_data
        )

        if not expenses_by_merchant:
            logger.debug(f"ℹ️  INFO: No expenses found")
            await update.message.reply_text("📋 No expenses recorded yet.")
            return

        logger.debug(f"📊 HISTORY: Found {len(expenses_by_merchant)} merchants")
        
        message = "📋 **Expense History**\n━━━━━━━━━━━━━━━━\n"
        total_amount = 0
        for merchant, expenses in sorted(expenses_by_merchant.items()):
            merchant_total = sum(e.amount for e in expenses)
            total_amount += merchant_total
            logger.debug(f"  • {merchant}: ${merchant_total:.2f} ({len(expenses)} items)")
            
            message += f"\n**{merchant.capitalize()}** (${merchant_total:.2f})\n"
            for expense in sorted(expenses, key=lambda e: e.timestamp, reverse=True)[:5]:
                desc = f" - {expense.description}" if expense.description else ""
                message += f"  • ${expense.amount:.2f}{desc}\n"

        logger.debug(f"💰 TOTAL: ${total_amount:.2f} across all merchants")
        await update.message.reply_text(message)

    async def on_setup_complete(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE, flow_data
    ) -> None:
        """Handle completion of setup flow."""
        logger.info(f"✅ CALLBACK: Setup flow completed")
        logger.debug(f"📦 SETUP_DATA: {flow_data}")
        
        ProfileService.initialize_profile(context.user_data, flow_data)
        logger.debug(f"✅ PROFILE: User profile initialized successfully")
        
        completion_msg = FLOWS["expense_setup"].completion_message
        await update.message.reply_text(
            completion_msg,
            reply_markup=ReplyKeyboardMarkup(MAIN_MENU_BUTTONS, one_time_keyboard=True),
        )
        logger.debug(f"📤 RESULT: Setup complete, showing main menu")

    async def on_expense_complete(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE, flow_data
    ) -> None:
        """Handle completion of expense tracking flow."""
        logger.info(f"✅ CALLBACK: Expense tracking flow completed")
        logger.debug(f"📦 EXPENSE_DATA: {flow_data}")
        
        try:
            expense = ExpenseService.add_expense(context.user_data, flow_data)
            logger.info(f"✅ SAVED: Expense recorded - ${expense.amount} at '{expense.merchant}'")
            logger.debug(f"  Amount: ${expense.amount:.2f}, Merchant: {expense.merchant}, Description: {expense.description}")
            
            completion_msg = FLOWS["expense_tracking"].completion_message
            await update.message.reply_text(
                completion_msg,
                reply_markup=ReplyKeyboardMarkup(
                    MAIN_MENU_BUTTONS, one_time_keyboard=True
                ),
            )
            logger.debug(f"📤 RESULT: Expense complete, showing main menu")
        except Exception as e:
            logger.error(f"❌ ERROR: Failed to save expense: {e}")
            logger.debug(f"Exception details: {type(e).__name__}: {str(e)}")
            await update.message.reply_text(
                "❌ Error saving expense. Please try again."
            )

    async def handle_flow_input(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> int:
        """Generic flow input handler."""
        logger.debug(f"🔄 HANDLER: handle_flow_input called")
        
        current_flow = ConversationContext.get_current_flow(context.user_data)
        logger.debug(f"🔍 FLOW: Current flow is '{current_flow}'")

        # Check for Apple Pay transaction message even during active flows
        choice = update.message.text
        apple_pay_data = parse_apple_pay_message(choice)
        if apple_pay_data:
            logger.info(f"🍎 APPLE_PAY: Detected Apple Pay transaction during flow '{current_flow}' from user '{update.message.from_user.first_name}'")
            logger.debug(f"📦 APPLE_PAY_DATA: {apple_pay_data}")
            
            # Ensure user profile is initialized
            if not ProfileService.is_profile_initialized(context.user_data):
                logger.debug(f"⚠️  INFO: User not initialized, cannot process Apple Pay transaction")
                await update.message.reply_text(
                    "❌ Please set up your profile first with /start before using Apple Pay integration."
                )
                return ACTIVE_FLOW
            
            try:
                # Create expense data for the service
                expense_data = {
                    'amount': apple_pay_data['amount'],
                    'merchant': apple_pay_data['merchant'],  # Use merchant field
                    'description': f"Apple Pay transaction on {apple_pay_data['date']}"
                }
                
                # Add the expense
                expense = ExpenseService.add_expense(context.user_data, expense_data)
                logger.info(f"✅ APPLE_PAY_SAVED: Expense recorded during flow - ${expense.amount} at {apple_pay_data['merchant']}")
                
                # Send confirmation message
                confirmation_msg = f"""✅ **Apple Pay Transaction Recorded**
━━━━━━━━━━━━━━━━
Amount: ${expense.amount:.2f}
Merchant: {apple_pay_data['merchant']}
Date: {apple_pay_data['date']}
Description: {expense.description}

Your expense has been automatically added to your tracking!"""
                
                await update.message.reply_text(confirmation_msg)
                return ACTIVE_FLOW
                
            except Exception as e:
                logger.error(f"❌ APPLE_PAY_ERROR: Failed to save Apple Pay expense during flow: {e}")
                await update.message.reply_text(
                    f"❌ Error recording Apple Pay transaction: {str(e)}"
                )
                return ACTIVE_FLOW

        on_completion = None
        if current_flow == "expense_setup":
            logger.debug(f"📍 FLOW_TYPE: Setup flow - will call on_setup_complete")
            on_completion = self.on_setup_complete
        elif current_flow == "expense_tracking":
            logger.debug(f"📍 FLOW_TYPE: Tracking flow - will call on_expense_complete")
            on_completion = self.on_expense_complete
        else:
            if current_flow:
                logger.warning(f"⚠️  WARNING: Unknown flow: {current_flow}")
            else:
                logger.warning(f"⚠️  WARNING: No active flow")

        try:
            logger.debug(f"📞 PROCESSING: Calling conversation handler")
            result = await self.conversation_handler.handle_input(
                update, context, on_completion=on_completion
            )
            
            logger.debug(f"📊 RESULT_CODE: Handler returned {result}")

            if result == FLOW_COMPLETE:  # Flow complete
                logger.debug(f"✅ FLOW_COMPLETE: Returning MAIN_MENU")
                return MAIN_MENU

            logger.debug(f"➡️  CONTINUE: Returning ACTIVE_FLOW")
            return ACTIVE_FLOW
        
        except Exception as e:
            logger.error(f"❌ ERROR in handle_flow_input: {e}", exc_info=True)
            await update.message.reply_text(
                "❌ An error occurred. Please try again or use /start to restart."
            )
            ConversationContext.clear_flow(context)
            return MAIN_MENU

    async def show_data(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Show all stored user data (for debugging)."""
        user = update.message.from_user
        logger.debug(f"🔍 DEBUG: show_data command from user '{user.first_name}' (ID: {user.id})")
        
        if update.message.from_user.id != DEVELOPER_CHAT_ID:
            logger.warning(f"⚠️  SECURITY: Unauthorized access attempt by ID {user.id}")
            await update.message.reply_text("❌ Not authorized.")
            return

        logger.debug(f"✅ AUTHORIZED: Dumping all user data")
        logger.debug(f"📦 FULL_USER_DATA: {context.user_data}")
        
        data_str = str(context.user_data)
        await update.message.reply_text(f"Debug data:\n{data_str}")

    async def menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle /menu command - show main menu."""
        user = update.message.from_user
        logger.info(f"📱 COMMAND: User '{user.first_name}' called /menu")
        
        if not ProfileService.is_profile_initialized(context.user_data):
            logger.debug(f"⚠️  INFO: User not initialized, starting setup")
            await update.message.reply_text(
                "👋 Welcome! Let's set up your profile first."
            )
            return await self.start(update, context)
        
        logger.debug(f"📤 ACTION: Showing main menu")
        await update.message.reply_text(
            "📋 Main Menu - What would you like to do?",
            reply_markup=ReplyKeyboardMarkup(
                MAIN_MENU_BUTTONS, one_time_keyboard=True
            ),
        )
        return MAIN_MENU

    async def stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle /stats command - show profile summary."""
        user = update.message.from_user
        logger.info(f"📱 COMMAND: User '{user.first_name}' called /stats")
        
        if not ProfileService.is_profile_initialized(context.user_data):
            logger.debug(f"⚠️  INFO: User not initialized")
            await update.message.reply_text(
                "❌ Please set up your profile first with /start"
            )
            return ConversationHandler.END
        
        logger.debug(f"📤 ACTION: Generating profile summary")
        summary = ProfileService.get_profile_summary(context.user_data)
        await update.message.reply_text(f"📊 {summary}")
        
        current_state = ConversationContext.get_current_flow(context.user_data)
        if current_state:
            logger.debug(f"📤 RESULT: Returning ACTIVE_FLOW (active flow in progress)")
            return ACTIVE_FLOW
        logger.debug(f"📤 RESULT: Returning MAIN_MENU")
        return MAIN_MENU

    async def expense(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle /expense command - start expense tracking flow."""
        user = update.message.from_user
        logger.info(f"📱 COMMAND: User '{user.first_name}' called /expense")
        
        if not ProfileService.is_profile_initialized(context.user_data):
            logger.debug(f"⚠️  INFO: User not initialized")
            await update.message.reply_text(
                "❌ Please set up your profile first with /start"
            )
            return ConversationHandler.END
        
        logger.debug(f"📤 ACTION: Starting 'expense_tracking' flow")
        result = await self.conversation_handler.start_flow(
            update, context, "expense_tracking", target_state=ACTIVE_FLOW
        )
        logger.debug(f"📤 STATE_CHANGE: start_flow returned {result}")
        return result

    async def exit_flow(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle /exit command - exit current flow."""
        user = update.message.from_user
        current_flow = ConversationContext.get_current_flow(context.user_data)
        
        if current_flow:
            logger.info(f"📱 COMMAND: User '{user.first_name}' called /exit (in flow '{current_flow}')")
            logger.debug(f"🛑 ACTION: Exiting flow '{current_flow}'")
            ConversationContext.clear_flow(context)
            await update.message.reply_text(
                "✅ Exited current flow.",
                reply_markup=ReplyKeyboardRemove(),
            )
        else:
            logger.info(f"📱 COMMAND: User '{user.first_name}' called /exit (no active flow)")
            await update.message.reply_text("ℹ️ No active flow to exit.")
        
        return MAIN_MENU

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Cancel current operation."""
        user = update.message.from_user
        current_flow = ConversationContext.get_current_flow(context.user_data)
        logger.info(f"🛑 CANCEL: User '{user.first_name}' cancelled flow '{current_flow}'")
        
        await update.message.reply_text(
            "❌ Cancelled.",
            reply_markup=ReplyKeyboardRemove(),
        )
        ConversationContext.clear_flow(context)
        logger.debug(f"📤 RESULT: Returning MAIN_MENU state")
        return MAIN_MENU

    def build(self) -> ConversationHandler:
        """Build the conversation handler."""
        return ConversationHandler(
            entry_points=[CommandHandler("start", self.start)],
            states={
                MAIN_MENU: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_menu_choice),
                ],
                ACTIVE_FLOW: [
                    MessageHandler(
                        filters.TEXT & ~filters.COMMAND, self.handle_flow_input
                    ),
                ],
            },
            fallbacks=[
                CommandHandler("start", self.start),
                CommandHandler("menu", self.menu),
                CommandHandler("stats", self.stats),
                CommandHandler("expense", self.expense),
                CommandHandler("exit", self.exit_flow),
                CommandHandler("cancel", self.cancel),
            ],
            name="ExpenseBot",
            persistent=False,  # TEMPORARILY DISABLED TO DEBUG STATE TRANSITIONS
        )


def main() -> None:
    """Start the bot."""
    logger.info("🤖 Starting Budget Billy...")
    logger.debug(f"📍 Initialization: Loading configuration and setting up handlers")

    bot_token = os.getenv("EXP_BOT_TOKEN", "")
    if not bot_token:
        logger.error("❌ Bot token not found. Set EXP_BOT_TOKEN environment variable.")
        raise ValueError("EXP_BOT_TOKEN environment variable is required")

    logger.debug(f"✅ EXP_BOT_TOKEN: Bot token loaded successfully")
    
    logger.debug(f"💾 PERSISTENCE: Initializing PicklePersistence")
    persistence = PicklePersistence(filepath="conversationbot")
    
    logger.debug(f"🔨 BUILDER: Creating ApplicationBuilder")
    application = (
        ApplicationBuilder()
        .token(bot_token)
        .persistence(persistence)
        .build()
    )

    # Add a critical error handler to catch ANY exception
    async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        logger.error(f"❌ Application error: {context.error}", exc_info=context.error)
    
    application.add_error_handler(error_handler)

    logger.debug(f"🤖 BOT: Creating ExpenseBot instance")
    bot = ExpenseBot()
    
    logger.debug(f"📝 HANDLERS: Adding command handlers (global)")
    # IMPORTANT: Commands that return states MUST be in ConversationHandler fallbacks only,
    # not here, so ConversationHandler can manage state transitions properly.
    # Only add handlers for commands that don't affect conversation state.
    application.add_handler(CommandHandler("show_data", bot.show_data))
    
    logger.debug(f"📝 HANDLERS: Adding conversation handler")
    application.add_handler(bot.build())

    logger.info("✅ Bot ready. Starting polling...")
    logger.debug(f"🎯 POLLING: Listening for updates (Press Ctrl+C to stop)")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
