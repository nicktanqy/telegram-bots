# Budget Billy Expense Tracker - Cloudflare Workers

A stateless Telegram bot for expense tracking, migrated from Python to Cloudflare Workers with Cloudflare KV for data storage.

## Features

- ✅ **Stateless Architecture**: No persistent memory, uses Cloudflare KV for data storage
- 🏗️ **Modern ES Modules**: Built with modern JavaScript ES6+ modules
- 🔒 **Production Ready**: Secure configuration for production deployment
- 🚀 **Cloudflare Workers**: Fast, global deployment with minimal latency
- 💾 **KV Storage**: Persistent data storage using Cloudflare KV
- 🤖 **Conversation Flows**: Multi-step conversation handling
- 📊 **Expense Tracking**: Track expenses by category with detailed reporting
- 📈 **Financial Profiles**: User profiles with savings goals and budget tracking

## Architecture

### State Migration
- **Before**: Python bot using PicklePersistence for local storage
- **After**: Cloudflare Workers using KV namespaces for distributed storage

### Data Storage
- **USER_DATA**: User profiles, expenses, and conversation state
- **BOT_CONFIG**: Bot configuration and settings

### Conversation Management
- **ConversationContext**: Manages conversation state in KV
- **GenericConversationHandler**: Handles multi-step flows
- **Flow Completion Callbacks**: Custom handlers for different flows

## Installation

### Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install the Cloudflare Workers CLI
   ```bash
   npm install -g wrangler
   ```
3. **Telegram Bot Token**: Create a bot via [@BotFather](https://t.me/BotFather)

### Setup

1. **Clone and Install Dependencies**
   ```bash
   cd workers/expense-bot
   npm install
   ```

2. **Configure Wrangler**
   ```bash
   wrangler login
   wrangler init --site
   ```

3. **Create KV Namespaces**
   ```bash
   # Create USER_DATA namespace
   wrangler kv:namespace create "USER_DATA"
   
   # Create BOT_CONFIG namespace  
   wrangler kv:namespace create "BOT_CONFIG"
   ```

4. **Update wrangler.toml**
   Replace the KV IDs in `wrangler.toml` with your actual namespace IDs:
   ```toml
   [[kv_namespaces]]
   binding = "USER_DATA"
   id = "your-user-data-kv-id-here"

   [[kv_namespaces]]
   binding = "BOT_CONFIG"
   id = "your-bot-config-kv-id-here"
   ```

5. **Set Environment Variables**
   ```bash
   # Set your Telegram bot token (required for production)
   wrangler secret put BOT_TOKEN
   
   # Set developer chat ID (optional, for debug commands)
   wrangler secret put DEVELOPER_CHAT_ID
   ```
   
   > **Important**: The bot token must be set as a secret using `wrangler secret put BOT_TOKEN`, not in the code. The token in `wrangler.toml` is only for local development.

## Deployment

### Development
```bash
# Start local development server
wrangler dev
```

### Production
```bash
# Deploy to Cloudflare Workers
wrangler publish
```

### Environment-Specific Deployment
```bash
# Deploy to production environment
wrangler publish --env production

# Deploy to staging environment  
wrangler publish --env staging
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Telegram bot token | ✅ Yes |
| `DEVELOPER_CHAT_ID` | Developer user ID for debug commands | Optional |

### KV Namespaces

| Namespace | Purpose | Binding |
|-----------|---------|---------|
| `USER_DATA` | User profiles, expenses, conversation state | `USER_DATA` |
| `BOT_CONFIG` | Bot configuration and settings | `BOT_CONFIG` |

## Usage

### Telegram Commands

- `/start` - Initialize bot and setup profile
- `/menu` - Show main menu
- `/stats` - View financial profile summary
- `/expense` - Add new expense
- `/exit` - Exit current conversation flow
- `/cancel` - Cancel current operation
- `/show_data` - Debug command (developer only)

### Conversation Flows

1. **Expense Setup Flow** (`/start` for new users)
   - Age
   - Current savings
   - Monthly budget
   - Savings goal
   - Goal age

2. **Expense Tracking Flow** (`/expense`)
   - Expense amount
   - Category
   - Description (optional)

### Apple Pay Integration (iOS Shortcuts)

The bot supports automated expense recording via iOS Shortcuts. This allows you to automatically record Apple Pay transactions by triggering a shortcut on your iPhone.

#### API Endpoint

```
POST /apple-pay
Content-Type: application/json
```

#### Request Body

| Field | Type | Description |
|-------|------|-------------|
| `bot_token` | string | Your Telegram bot token (for authentication) |
| `chat_id` | number | The user's Telegram chat ID |
| `text` | string | Apple Pay transaction message in format: `"Spent $X at Merchant on YYYY-MM-DD"` |

#### Example Request

```json
POST https://billy-bot.nicktanqy.workers.dev/apple-pay
{
  "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
  "chat_id": 123456789,
  "text": "Spent $15.99 at Starbucks on 2026-03-26"
}
```

#### Example Response (Success)

```json
{
  "success": true,
  "message": "✅ Apple Pay Transaction Recorded",
  "expense": {
    "amount": 15.99,
    "merchant": "Starbucks",
    "date": "2026-03-26"
  }
}
```

#### Example Response (Error)

```json
{
  "success": false,
  "error": "Invalid bot_token"
}
```

#### iOS Shortcuts Setup

1. Open the **Shortcuts** app on your iPhone
2. Create a new shortcut with the following actions:
   - **Get Transaction Details** (extract amount, merchant, date from Apple Pay notification)
   - **Format Text**: `"Spent $" + Amount + " at " + Merchant + " on " + Date`
   - **Make Request**:
     - URL: `https://billy-bot.nicktanqy.workers.dev/apple-pay`
     - Method: POST
     - Headers: `Content-Type: application/json`
     - Body: JSON with `bot_token`, `chat_id`, and formatted `text`

#### Error Codes

| Status Code | Description |
|-------------|-------------|
| `200` | Success - expense recorded and confirmation sent |
| `400` | Bad Request - missing required fields or invalid message format |
| `401` | Unauthorized - invalid bot_token |
| `500` | Internal Server Error |

## Security Features

- 🔐 **Environment Variables**: Sensitive data stored as secrets
- 🛡️ **KV Access Control**: Namespaced data storage
- 🔒 **Developer Commands**: Restricted to authorized users
- 📡 **HTTPS Only**: All communications encrypted
- 🚫 **Input Validation**: Comprehensive validation for all inputs

## File Structure

```
workers/expense-bot/
├── src/
│   ├── index.js              # Main entry point (request routing)
│   ├── models.js             # Data models (Expense, FormField, ConversationFlow)
│   ├── services.js           # Business logic services
│   │   └── parseApplePayMessage()
│   │   └── ExpenseService
│   │   └── RecurringExpenseService
│   │   └── ProfileService
│   ├── conversations.js      # Conversation handling framework
│   │   └── ConversationContext
│   │   └── GenericConversationHandler
│   ├── config.js             # Bot configuration and flow definitions
│   ├── services/
│   │   └── telegram.js       # Telegram Bot API service (TelegramService)
│   ├── handlers/
│   │   ├── commands.js       # Command handlers (/start, /menu, /stats, etc.)
│   │   ├── callbacks.js      # Callback query handlers (inline keyboards, edit expense)
│   │   └── menu.js           # Menu choice handler
│   └── utils/
│       └── messageBuilder.js # Centralized message formatting utilities
├── tests/
│   ├── services.test.js      # Services test suite
│   └── apple-pay.test.js     # Apple Pay parsing tests
├── scripts/
│   ├── setup-kv.js           # KV namespace setup script
│   ├── test-bot.js           # Bot testing script
│   └── migrate-data.js       # Data migration script
├── package.json              # Dependencies and scripts
├── wrangler.toml             # Cloudflare Workers configuration
└── README.md                 # This file
```

### Architecture Overview

The codebase follows **clean code** and **SOLID principles**:

1. **Separation of Concerns**: Each module has a single responsibility
   - `handlers/` - Request handling logic
   - `services/` - Business logic
   - `utils/` - Shared utilities
   - `models.js` - Data structures

2. **DRY Principle**: Eliminated code duplication
   - `messageBuilder.js` - Centralized message formatting
   - `TelegramService` - Single source for all Telegram API calls

3. **Dependency Injection**: Services are imported and used where needed

4. **Testability**: Modular structure enables easy unit testing

### Architecture Principles

The refactored codebase follows **clean code** and **SOLID principles**:

| Principle | Implementation |
|-----------|----------------|
| **Single Responsibility** | Each module handles one concern (commands, callbacks, Telegram API, etc.) |
| **DRY** | Shared utilities (`messageBuilder.js`, `TelegramService`) eliminate duplication |
| **Open/Closed** | New commands can be added to `handlers/commands.js` without modifying core logic |
| **Dependency Injection** | Services are imported where needed, enabling easy mocking for tests |
| **Testability** | Modular structure with isolated units enables comprehensive testing |

## Migration Notes

### From Python to JavaScript

1. **Data Models**: Converted Python classes to JavaScript classes with similar structure
2. **Services**: Maintained same API but adapted for async/await patterns
3. **Conversation Handler**: Preserved state management logic with KV storage
4. **Error Handling**: Enhanced with proper async error handling

### State Management Changes

- **Before**: `context.user_data` (in-memory persistence)
- **After**: `kv.get()/kv.put()` (distributed KV storage)
- **Conversation State**: Stored in `${userId}:context` keys
- **User Data**: Stored in `${userId}` keys

### API Changes

- **Telegram Integration**: Uses fetch API instead of python-telegram-bot
- **Environment Variables**: Uses `env` object instead of `os.getenv()`
- **Logging**: Uses `console.log()` instead of Python logging module

## Troubleshooting

### Common Issues

1. **KV Namespace Not Found**
   ```
   Error: KV namespace not found
   ```
   **Solution**: Ensure KV namespaces are created and IDs are correct in `wrangler.toml`

2. **Bot Token Missing**
   ```
   Error: BOT_TOKEN environment variable is required
   ```
   **Solution**: Set the bot token using `wrangler secret put BOT_TOKEN`

3. **CORS Issues**
   ```
   CORS policy blocked request
   ```
   **Solution**: Ensure proper headers are set in response

### Debug Commands

- Use `/show_data` to view user data (requires developer access)
- Check Cloudflare Workers logs in dashboard
- Use `wrangler dev` for local debugging

## Performance

- **Cold Start**: < 100ms (Cloudflare Workers)
- **KV Latency**: < 10ms (global edge network)
- **Memory Usage**: Minimal (stateless design)
- **Scalability**: Automatic scaling with Cloudflare network

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create a GitHub issue
- Check Cloudflare Workers documentation
- Review Telegram Bot API documentation