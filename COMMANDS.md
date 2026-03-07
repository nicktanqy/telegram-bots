# Bot Commands Guide

## Available Commands

All commands start with `/` and can be used from any state of the bot. They provide quick access to common features without navigating through menus.

### `/start`
**Purpose:** Start the bot / Initialize a new user  
**Usage:** Type `/start` or tap the /start button

**Behavior:**
- If user is new: Starts the profile setup flow
- If user is initialized: Shows welcome back message with current stats and main menu

**Returns:** 
- New users → ACTIVE_FLOW (setup flow)
- Existing users → MAIN_MENU

---

### `/menu`
**Purpose:** Return to or show the main menu  
**Usage:** Type `/menu` at any time

**Behavior:**
- Requires initialized profile (setup must be complete)
- Returns to main menu showing all available actions
- Displays menu buttons: View Stats, Add Expense, Settings, History

**Returns:** MAIN_MENU

---

### `/stats`
**Purpose:** Display your financial profile summary  
**Usage:** Type `/stats` to see your current financial status

**Behavior:**
- Requires initialized profile
- Shows formatted summary including:
  - Age
  - Current Savings
  - Monthly Budget
  - Savings Goal and Progress %
  - Total Expenses
  - Budget Remaining

**Returns:**
- If in a flow: ACTIVE_FLOW (stays in active conversation)
- Otherwise: MAIN_MENU

---

### `/expense`
**Purpose:** Start the expense tracking flow  
**Usage:** Type `/expense` to quickly add an expense

**Behavior:**
- Requires initialized profile
- Starts the expense tracking flow
- Prompts for: Amount → Category → Description (optional)
- After completion, returns to main menu

**Returns:** ACTIVE_FLOW (starts expense flow)

---

### `/exit`
**Purpose:** Exit current flow / Cancel operation  
**Usage:** Type `/exit` to stop the current flow

**Behavior:**
- If in an active flow: Exits the flow and returns to menu
- If not in a flow: Displays info message
- Clears all flow state and resets keyboard

**Returns:** MAIN_MENU

---

### `/cancel` (Alias: `/exit`)
**Purpose:** Same as /exit - cancel current operation  
**Usage:** Type `/cancel` to exit current flow

---

### `/show_data` (Developer Only)
**Purpose:** Dump all user data for debugging  
**Usage:** Type `/show_data` (authorized users only)

**Security:** Only user ID 138562035 can use this command

**Returns:** Raw user data dictionary string

---

## Command Priority

Commands are processed with the following priority:

1. **Application-level handlers** (checked first)
   - `/start`, `/menu`, `/stats`, `/expense`, `/exit`, `/show_data`
   - These have the highest priority and work from any state

2. **ConversationHandler fallbacks** (checked second)
   - Backup handlers for all commands
   - Provide redundancy and state-specific handling

3. **State-specific handlers** (checked last)
   - MAIN_MENU: Button choices and menu input
   - ACTIVE_FLOW: Flow input processing

---

## Example Usage Scenarios

### Scenario 1: New User
```
User: /start
Bot: "Welcome! Let's set up your profile"
Bot: "What is your age?"
User: 25
Bot: "Enter your savings"
[... continues setup flow ...]
User: /exit
Bot: "Exited current flow"
Bot: Shows main menu
```

### Scenario 2: Returning User
```
User: /start
Bot: "Welcome back! [Profile Summary]"
Bot: Shows main menu with buttons
User: /expense
Bot: "Let's record an expense"
Bot: "How much did you spend?"
User: 50
[... continues expense flow ...]
```

### Scenario 3: Quick Stats Check
```
User: /stats
Bot: [Shows profile summary]
Bot: Returns to current state (menu or flow)
```

### Scenario 4: Mid-Flow Command
```
User: In expense flow "How much did you spend?"
User: /menu
Bot: "Exited and returned to main menu"
```

---

## Implementation Details

### Where Commands Are Registered

1. **Application Level** (`expense-bot.py` main())
   ```python
   application.add_handler(CommandHandler("start", bot.start))
   application.add_handler(CommandHandler("menu", bot.menu))
   application.add_handler(CommandHandler("stats", bot.stats))
   application.add_handler(CommandHandler("expense", bot.expense))
   application.add_handler(CommandHandler("exit", bot.exit_flow))
   application.add_handler(CommandHandler("show_data", bot.show_data))
   ```

2. **ConversationHandler Fallbacks** (`bot.build()`)
   ```python
   fallbacks=[
       CommandHandler("start", self.start),
       CommandHandler("menu", self.menu),
       CommandHandler("stats", self.stats),
       CommandHandler("expense", self.expense),
       CommandHandler("exit", self.exit_flow),
       CommandHandler("cancel", self.cancel),
       ...
   ]
   ```

### State Management

- **Commands preserve state context** when possible
- `/stats` checks if you're in a flow and returns appropriately
- `/exit` clears flow state and returns to MAIN_MENU
- `/menu` always returns to MAIN_MENU
- `/expense` starts ACTIVE_FLOW state

---

## Logging

All commands are logged with the 📱 COMMAND prefix for easy debugging:

```
INFO     📱 COMMAND: User 'John' called /start
INFO     📱 COMMAND: User 'John' called /stats
INFO     📱 COMMAND: User 'John' called /expense
INFO     📱 COMMAND: User 'John' called /exit
```

---

## Troubleshooting

**Commands not working?**
1. Ensure you're a Telegram user (not a bot)
2. Verify the bot is running: check logs for "✅ Bot ready"
3. Try `/start` first to initialize profile
4. Check if the bot token is valid

**Profile not initialized error?**
- Run `/start` to set up your profile
- This only needs to be done once

**Stuck in a flow?**
- Type `/exit` or `/cancel` to exit immediately
- This will clear your current flow and return to menu

**Commands not responding?**
- Check the bot console logs - look for ERROR messages
- Try `/start` to reinitialize
- If issue persists, check network connectivity
