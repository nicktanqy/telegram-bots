# /start
# IF new user, goto signup flow
# ELSE goto CHOOSING (view, edit, add_expense)

# /signup
# ask for age>savings>budget>savings goal>age goal
# goto CHOOSING (view, edit, add_expense)

# CHOOSING
# show menu (view, edit, add_expense)
# view: ask for what to view (savings, budget, savings goal, age goal)
# edit: ask for what to edit (savings, budget, savings goal, age goal)
# add_expense: ask for value of expense
# goto TYPING_CHOICE

# TYPING_CHOICE
# ask for value of expense (or savings, budget, savings goal, age goal)
# goto TYPING_REPLY

# TYPING_REPLY
# store the value of expense (or savings, budget, savings goal, age goal)
# goto CHOOSING
# DONE
import logging
import os
from telegram import ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ConversationHandler, PicklePersistence, filters, MessageHandler, ApplicationBuilder, ContextTypes, CommandHandler
from dotenv import load_dotenv

load_dotenv()  # take environment variables


logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
# set higher logging level for httpx to avoid all GET and POST requests being logged
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

DEVELOPER_CHAT_ID = 138562035

CHOOSING, TYPING_REPLY, TYPING_CHOICE, NEW_USER, SAVINGS, BUDGET, SAVINGS_GOAL, AGE_GOAL = range(8)

reply_keyboard = [
    ['Current Savings', 'Monthly Budget'],
    ['Savings Goal', 'Age Goal']
]
markup = ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, input_field_placeholder="What do you want to tell me?")



async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Start the conversation and ask for user information."""
    user = update.message.from_user.first_name
    logger.info("User %s started the conversation.", user)
    reply_text = f"""Hi {user}! My name is Budget Billy.
I'm here to help you track your expenses and savings.
I can also help you with budgeting and financial planning.
"""
    status=-1
    if context.user_data:
        reply_text += f"\nSelect one of the options below to view your current status."
        "\nYou can also start adding expenses by typing /expense."
        status = CHOOSING
        await update.message.reply_text(reply_text, reply_markup=markup)
    else:
        reply_text += (
            "\nTo start, why don't you tell me more about yourself? What is your age?"
        )
        status = NEW_USER
        await update.message.reply_text(reply_text)
    logger.info("User %s started the conversation.", update.message.from_user.first_name)
    logger.info(f"User data: {context.user_data}")
    return status

async def new_user(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Ask for the user's age."""

    context.user_data["age"] = update.message.text
    await update.message.reply_text("Enter your savings.")
    return SAVINGS

async def savings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Ask for the user's savings."""
    context.user_data["savings"] = update.message.text
    logger.info(f"Savings: {update.message.text}")
    await update.message.reply_text("Enter your monthly budget.")
    return BUDGET

async def budget(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Ask for the user's budget."""
    context.user_data["budget"] = update.message.text
    logger.info(f"Budget: {update.message.text}")

    await update.message.reply_text("Enter your savings goal.")
    return SAVINGS_GOAL

async def savings_goal(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Ask for the user's savings goal."""
    context.user_data["savings_goal"] = update.message.text
    logger.info(f"Savings Goal: {update.message.text}")

    await update.message.reply_text("By what age do you want to achieve this goal?")
    return AGE_GOAL

async def age_goal(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Ask for the user's age goal."""
    context.user_data["age_goal"] = update.message.text
    logger.info(f"Age Goal: {update.message.text}")
    
    await update.message.reply_text("Great! You're all set.\nI will keep track of your expenses and savings for you."
                                    "You can always check your current status by typing /show_data."
                                    )
    return TYPING_CHOICE

async def regular_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the user's choice and ask for a value."""
    user = update.message.from_user
    logger.info(f"{user.first_name} chose: {update.message.text}")
    text = update.message.text.lower()
    context.user_data["choice"] = text
    if context.user_data.get(text):
        reply_text = f"You already told me your {text}. It is {context.user_data.get(text)}."
    else:
        reply_text = f"Enter your {text}."
    await update.message.reply_text(reply_text)

    return TYPING_REPLY

async def done(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Display the gathered info and end the conversation."""
    if "choice" in context.user_data:
        del context.user_data["choice"]

    await update.message.reply_text(
        f"I learned these facts about you: {context.user_data}"
        "\nUntil next time!",
        reply_markup=ReplyKeyboardRemove(),
    )
    return ConversationHandler.END

async def received_information(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store information provided by the user."""
    state = CHOOSING
    markup_func = markup
    user = update.message.from_user
    logger.info (f"Input from {user.first_name}: {update.message.text}")
    category = context.user_data["choice"]
    context.user_data[category] = update.message.text.lower()
    text = f"Here is what you told me so far {context.user_data}."
        
    await update.message.reply_text(
        text,
        reply_markup=markup_func,
    )
    return state

async def show_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Display the gathered info."""
    await update.message.reply_text(
        f"This is what you already told me: {context.user_data}"
    )

def main() -> None:
    logger.info("Starting the bot...")
    bot_token = os.getenv("TOKEN", "")
    if not bot_token:
        logger.error("Bot token not found. Please provide a token to get access to telegram API.")

    persistence = PicklePersistence(filepath="conversationbot")
    application = ApplicationBuilder().token(bot_token).persistence(persistence).build()

    # Set up the conversation handler with the states CHOOSING, TYPING_REPLY and TYPING_CHOICE
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('start', start)],
        states={
            CHOOSING: [
                MessageHandler(
                    filters.Regex("^(Current Savings|Monthly Budget)$"),
                    regular_choice,
                ),
            ],
            TYPING_CHOICE: [
                MessageHandler(
                    filters.TEXT & ~(filters.COMMAND | filters.Regex("^Done$")),
                    regular_choice
                )
            ],
            TYPING_REPLY: [
                MessageHandler(
                    filters.TEXT & (~filters.COMMAND | filters.Regex("^Done$")),
                    received_information
                ),
            ],
            NEW_USER: [
                MessageHandler(
                    filters.TEXT & (~filters.COMMAND | filters.Regex("^Done$")),
                    new_user
                ),
            ],
            SAVINGS: [
                MessageHandler(
                    filters.TEXT & (~filters.COMMAND | filters.Regex("^Done$")),
                    savings
                ),
            ],
            BUDGET: [
                MessageHandler(
                    filters.TEXT & (~filters.COMMAND | filters.Regex("^Done$")),
                    budget
                ),
            ],
            SAVINGS_GOAL: [
                MessageHandler(
                    filters.TEXT & (~filters.COMMAND | filters.Regex("^Done$")),
                    savings_goal
                ),
            ],
            AGE_GOAL: [
                MessageHandler(
                    filters.TEXT & (~filters.COMMAND | filters.Regex("^Done$")),
                    age_goal
                ),
            ],
        },
        fallbacks=[MessageHandler(filters.Regex("^Done$"), done)],
        name="Expense Bot",
        persistent=True,
    )
    application.add_handler(conv_handler)

    show_data_handler = CommandHandler("show_data", show_data)
    application.add_handler(show_data_handler)

    # Run the bot until the user presses Ctrl-C
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()