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
- Displays menu buttons: View Stats, Add Expense, Progress, Breakdown, Recurring, History

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

### `/add [amount] [description]`
**Purpose:** Quick add an expense with a single command  
**Usage:** Type `/add 15 coffee` or `/add 50 lunch at mcdonalds`

**Behavior:**
- Requires initialized profile
- Parses amount and description from the command
- Immediately records the expense without additional prompts
- Format: `/add [amount] [description]` or `/add [amount] [merchant] at [location]`

**Examples:**
- `/add 15 coffee` - Records $15 expense for coffee
- `/add 50 lunch at mcdonalds` - Records $50 expense at McDonald's

**Returns:** Confirmation message with expense details

---

### `/edit_profile`
**Purpose:** Edit your profile settings  
**Usage:** Type `/edit_profile` to update your financial information

**Behavior:**
- Requires initialized profile
- Starts the edit profile flow with skip options
- You can update:
  - Name
  - Current Savings
  - Monthly Budget
  - Savings Goal
  - Monthly Cash Income
  - Monthly Savings Goal
- Tap ⏭️ Skip to keep current values

**Returns:** ACTIVE_FLOW (starts edit profile flow)

---

### `/progress`
**Purpose:** View your monthly savings progress  
**Usage:** Type `/progress` to see how you're doing this month

**Behavior:**
- Requires initialized profile
- Shows monthly progress including:
  - Total Expenses
  - Monthly Income
  - Monthly Savings
  - Budget Remaining
  - Monthly Savings Goal and Progress %
- Includes budget alerts if you're approaching your limit

**Returns:** Progress summary message

---

### `/breakdown`
**Purpose:** View expense breakdown by category  
**Usage:** Type `/breakdown` to see where your money is going

**Behavior:**
- Requires initialized profile
- Shows expenses grouped by category for the current month
- For each category shows:
  - Total amount spent
  - Percentage of total expenses
  - Last 3 expenses in that category

**Returns:** Category breakdown summary

---

### `/recurring`
**Purpose:** View your recurring expenses summary  
**Usage:** Type `/recurring` to see all your recurring expenses

**Behavior:**
- Requires initialized profile
- Shows all recurring expense templates
- Displays total monthly recurring expenses
- Helps track subscriptions and regular payments

**Returns:** Recurring expenses summary

---

### `/add_recurring`
**Purpose:** Add a new recurring expense template  
**Usage:** Type `/add_recurring` to set up a recurring expense

**Behavior:**
- Requires initialized profile
- Starts the recurring template setup flow
- Prompts for:
  - Template Name (e.g., "Netflix", "Gym")
  - Amount
  - Merchant
  - Category
  - Frequency (daily, weekly, monthly, yearly)

**Returns:** ACTIVE_FLOW (starts recurring template flow)

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

### `/edit_expense`
**Purpose:** Edit or delete an existing expense  
**Usage:** Type `/edit_expense` to view and edit your recent expenses

**Behavior:**
- Requires initialized profile
- Shows a list of your 10 most recent expenses with inline buttons
- Click on an expense to edit it
- You can edit: Amount, Date, Description, Category
- You can also delete the expense
- After editing one field, you can continue editing other fields or exit

**Returns:** ACTIVE_FLOW (starts edit expense flow with inline keyboards)

---

### `/monthly-report` (Developer Only)
**Purpose:** Trigger monthly reports to be sent to all users  
**Usage:** Type `/monthly-report` (authorized users only)

**Security:** Only user ID 138562035 can use this command

**Behavior:**
- Triggers the monthly report generation process
- Sends financial summaries to all users
- Typically called by cron job, but can be manually triggered

**Returns:** Confirmation message

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
   - `/start`, `/menu`, `/stats`, `/expense`, `/exit`, `/edit_profile`, `/progress`, `/breakdown`, `/recurring`, `/add_recurring`, `/monthly-report`, `/add`, `/show_data`, `/edit_expense`
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

### Scenario 4: Quick Add Expense
```
User: /add 25 lunch
Bot: "✅ Expense Added - $25.00 for lunch"
```

### Scenario 5: Mid-Flow Command
```
User: In expense flow "How much did you spend?"
User: /menu
Bot: "Exited and returned to main menu"
```

### Scenario 6: Check Monthly Progress
```
User: /progress
Bot: "📊 Monthly Progress - April
━━━━━━━━━━━━━━━━
Total Expenses: $1,250.00
Monthly Income: $3,000.00
Monthly Savings: $500.00
Budget Remaining: $1,750.00"
```

### Scenario 7: View Expense Breakdown
```
User: /breakdown
Bot: "📊 Expense Breakdown - April
━━━━━━━━━━━━━━━━
Total Expenses: $1,250.00

**Food** ($450.00 - 36.0%)
  • $15.50 at Starbucks - Morning coffee
  • $45.00 at Restaurant - Lunch meeting
  • $8.75 at Cafe - Afternoon snack

**Transport** ($300.00 - 24.0%)
  • $50.00 at Gas Station
  • $25.00 at Parking
  • $35.00 at Uber"
```

---

## Implementation Details

### Where Commands Are Registered

1. **Application Level** (`index.js` handleWebhook)
   ```javascript
   if (text === '/start') {
       responseText = await this.start(env.USER_DATA, userId, chatId);
   } else if (text === '/menu') {
       responseText = await this.menu(env.USER_DATA, userId, chatId);
   } else if (text === '/stats') {
       responseText = await this.stats(env.USER_DATA, userId, chatId);
   } else if (text === '/expense') {
       responseText = await this.expense(env.USER_DATA, userId, chatId);
   } else if (text === '/exit') {
       responseText = await this.exitFlow(env.USER_DATA, userId, chatId);
   } else if (text === '/cancel') {
       responseText = await this.cancel(env.USER_DATA, userId, chatId);
   } else if (text === '/edit_profile') {
       responseText = await this.editProfile(env, userId, chatId);
   } else if (text === '/progress') {
       responseText = await this.progress(env.USER_DATA, userId, chatId);
   } else if (text === '/breakdown') {
       responseText = await this.breakdown(env.USER_DATA, userId, chatId);
   } else if (text === '/recurring') {
       responseText = await this.recurring(env.USER_DATA, userId, chatId);
   } else if (text === '/add_recurring') {
       responseText = await this.addRecurring(env.USER_DATA, userId, chatId);
   } else if (text === '/monthly-report' && userId === DEVELOPER_CHAT_ID.toString()) {
       responseText = await this.monthlyReport(env, userId, chatId);
   } else if (text.startsWith('/add ') && text.length > 5) {
       responseText = await this.quickAdd(env.USER_DATA, userId, chatId, text.substring(5));
   } else if (text === '/show_data' && userId === DEVELOPER_CHAT_ID.toString()) {
       responseText = await this.showData(env.USER_DATA, userId, chatId);
   } else if (text === '/edit_expense') {
       await this.editExpense(env, userId, chatId);
       return new Response('OK', { status: 200 });
   }
   ```

### Main Menu Buttons

The main menu is configured in `config.js`:

```javascript
export const MAIN_MENU_BUTTONS = [
    ["📊 View Stats", "💰 Add Expense"],
    ["📈 Progress", "📊 Breakdown"],
    ["🔄 Recurring", "📋 History"],
];
```

### State Management

- **Commands preserve state context** when possible
- `/stats`, `/progress`, `/breakdown`, `/recurring` check if you're in a flow and return appropriately
- `/exit` clears flow state and returns to MAIN_MENU
- `/menu` always returns to MAIN_MENU
- `/expense`, `/edit_profile`, `/add_recurring` start ACTIVE_FLOW state
- `/add` is a quick command that doesn't change state

---

## Logging

All commands are logged with the 📱 COMMAND prefix for easy debugging:

```
INFO     📱 COMMAND: User 'John' called /start
INFO     📱 COMMAND: User 'John' called /stats
INFO     📱 COMMAND: User 'John' called /expense
INFO     📱 COMMAND: User 'John' called /exit
INFO     📱 COMMAND: User 'John' called /progress
INFO     📱 COMMAND: User 'John' called /breakdown
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

**Quick add not working?**
- Ensure format is correct: `/add [amount] [description]`
- Amount must be a number, description must have at least one word
- Example: `/add 15 coffee` or `/add 50.50 lunch at restaurant`