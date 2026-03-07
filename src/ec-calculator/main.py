"""Main EC Calculator Bot Application."""

import logging
import os
import sys
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

from .config import FLOWS, DEVELOPER_CHAT_ID
from common.conversations import GenericConversationHandler, ConversationContext, FLOW_COMPLETE
from .ec_calculator_service import ECCalculatorService


# Conversation states
MAIN_MENU, ACTIVE_FLOW = range(2)


class ECCalculatorBot:
    """EC Calculator Bot class."""

    def __init__(self):
        self.conversation_handler = GenericConversationHandler(FLOWS)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle /start command."""
        try:
            user = update.message.from_user
            logger.info(f"👤 START: User '{user.first_name}' (ID: {user.id}) started conversation")
            
            logger.debug(f"📤 RESULT: Starting EC calculator flow")
            result = await self.conversation_handler.start_flow(
                update, context, "ec_calculator", target_state=ACTIVE_FLOW
            )
            logger.debug(f"📤 STATE_CHANGE: start_flow returned {result}")
            return result
            
        except Exception as e:
            logger.error(f"❌ ERROR in start: {e}", exc_info=True)
            await update.message.reply_text(
                "❌ An error occurred during startup. Please try again later."
            )
            return MAIN_MENU

    async def on_ec_calculator_complete(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE, flow_data
    ) -> None:
        """Handle completion of EC affordability calculator flow."""
        logger.info(f"✅ CALLBACK: EC calculator flow completed")
        logger.debug(f"📦 EC_DATA: {flow_data}")
        
        try:
            # Perform affordability calculation
            result = ECCalculatorService.calculate_affordability(flow_data)
            logger.info(f"✅ CALCULATED: EC affordability analysis complete")
            logger.debug(f"  Max Loan: SGD {result.maximum_property_loan:,.2f}")
            logger.debug(f"  Monthly Mortgage: SGD {result.monthly_mortgage_loan:,.2f}")
            
            # Format the result for display
            result_dict = result.to_dict()
            
            # Create a formatted message
            message = "📊 **EC Affordability Analysis**\n"
            message += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            
            # Input Parameters
            message += "**Your Input:**\n"
            for key, value in result_dict["Input Parameters"].items():
                message += f"• {key}: {value}\n"
            
            message += "\n**Affordability Results:**\n"
            for key, value in result_dict["Affordability Analysis"].items():
                message += f"• {key}: {value}\n"
            
            completion_msg = FLOWS["ec_calculator"].completion_message
            await update.message.reply_text(
                completion_msg + "\n\n" + message,
                reply_markup=ReplyKeyboardMarkup(
                    [["🔄 New Calculation", "❌ Exit"]],
                    one_time_keyboard=True
                ),
            )
            logger.debug(f"📤 RESULT: EC calculation complete")
            
            # Store the result in user data for potential future use
            if "ec_calculations" not in context.user_data:
                context.user_data["ec_calculations"] = []
            context.user_data["ec_calculations"].append(result.to_dict())
            logger.debug(f"💾 STORED: EC calculation result saved")
            
        except ValueError as e:
            logger.error(f"❌ CALC_ERROR: Invalid input for EC calculator: {e}")
            await update.message.reply_text(
                f"❌ Calculation error: {str(e)}\n\nPlease try again with /start"
            )
        except Exception as e:
            logger.error(f"❌ ERROR: Failed to calculate EC affordability: {e}", exc_info=True)
            await update.message.reply_text(
                "❌ Error calculating affordability. Please try again."
            )

    async def handle_flow_input(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> int:
        """Generic flow input handler."""
        logger.debug(f"🔄 HANDLER: handle_flow_input called")
        
        current_flow = ConversationContext.get_current_flow(context.user_data)
        logger.debug(f"🔍 FLOW: Current flow is '{current_flow}'")

        on_completion = None
        if current_flow == "ec_calculator":
            logger.debug(f"📍 FLOW_TYPE: EC calculator flow - will call on_ec_calculator_complete")
            on_completion = self.on_ec_calculator_complete
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

            if result == FLOW_COMPLETE:
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

    async def handle_menu_choice(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> int:
        """Handle menu choices after calculation."""
        choice = update.message.text
        user = update.message.from_user
        logger.info(f"🎯 MENU: User '{user.first_name}' selected: '{choice}'")

        if "New Calculation" in choice:
            logger.debug(f"📤 ACTION: Starting new EC calculator flow")
            result = await self.conversation_handler.start_flow(
                update, context, "ec_calculator", target_state=ACTIVE_FLOW
            )
            logger.debug(f"📤 STATE_CHANGE: start_flow returned {result}")
            return result
        
        elif "Exit" in choice:
            logger.debug(f"📤 ACTION: User exiting")
            await update.message.reply_text(
                "👋 Thank you for using EC Calculator Bot! Use /start anytime to begin a new calculation.",
                reply_markup=ReplyKeyboardRemove(),
            )
            return ConversationHandler.END

        logger.debug(f"📤 RESULT: Returning MAIN_MENU state")
        return MAIN_MENU

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Cancel current operation."""
        user = update.message.from_user
        current_flow = ConversationContext.get_current_flow(context.user_data)
        logger.info(f"🛑 CANCEL: User '{user.first_name}' cancelled flow '{current_flow}'")
        
        await update.message.reply_text(
            "❌ Cancelled. Use /start to begin a new calculation.",
            reply_markup=ReplyKeyboardRemove(),
        )
        ConversationContext.clear_flow(context)
        logger.debug(f"📤 RESULT: Returning MAIN_MENU state")
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
                CommandHandler("cancel", self.cancel),
            ],
            name="ECCalculatorBot",
            persistent=False,
        )


def main() -> None:
    """Start the bot."""
    logger.info("🤖 Starting EC Calculator Bot...")
    logger.debug(f"📍 Initialization: Loading configuration and setting up handlers")

    bot_token = os.getenv("EC_BOT_TOKEN", "")
    if not bot_token:
        logger.error("❌ Bot token not found. Set EC_BOT_TOKEN environment variable.")
        raise ValueError("EC_BOT_TOKEN environment variable is required")

    logger.debug(f"✅ TOKEN: Bot token loaded successfully")
    
    logger.debug(f"💾 PERSISTENCE: Initializing PicklePersistence")
    persistence = PicklePersistence(filepath="ec_calculator_bot")
    
    logger.debug(f"🔨 BUILDER: Creating ApplicationBuilder")
    application = (
        ApplicationBuilder()
        .token(bot_token)
        .persistence(persistence)
        .build()
    )

    # Add error handler
    async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        logger.error(f"❌ Application error: {context.error}", exc_info=context.error)
    
    application.add_error_handler(error_handler)

    logger.debug(f"🤖 BOT: Creating ECCalculatorBot instance")
    bot = ECCalculatorBot()
    
    logger.debug(f"📝 HANDLERS: Adding command handlers")
    application.add_handler(CommandHandler("show_data", bot.show_data))
    
    logger.debug(f"📝 HANDLERS: Adding conversation handler")
    application.add_handler(bot.build())

    logger.info("✅ Bot ready. Starting polling...")
    logger.debug(f"🎯 POLLING: Listening for updates (Press Ctrl+C to stop)")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
