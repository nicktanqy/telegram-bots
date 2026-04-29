/**
 * Telegram Bot API Service
 * Centralized service for all Telegram API interactions
 */

const RATE_LIMIT_DELAY = 500; // 500ms between messages

/**
 * Telegram Service for handling all bot API calls
 */
export class TelegramService {
    /**
     * Escape special characters for Telegram Markdown parsing
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    static escapeMarkdown(text) {
        if (!text) return '';
        return text.toString()
            .replace(/\_/g, '\\_')
            .replace(/\*/g, '\\*')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\~/g, '\\~')
            .replace(/\`/g, '\\`')
            .replace(/\>/g, '\\>')
            .replace(/\#/g, '\\#')
            .replace(/\+/g, '\\+')
            .replace(/\-/g, '\\-')
            .replace(/\=/g, '\\=')
            .replace(/\|/g, '\\|')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/\./g, '\\.')
            .replace(/\!/g, '\\!');
    }
    /**
     * Get bot token from environment
     * @param {Object} env - Environment variables
     * @returns {string} Bot token
     */
    static getToken(env) {
        const botToken = env.BOT_TOKEN;
        if (!botToken) {
            throw new Error('BOT_TOKEN environment variable is required');
        }
        return botToken;
    }

    /**
     * Build Telegram API URL
     * @param {string} token - Bot token
     * @param {string} method - API method name
     * @returns {string} Full API URL
     */
    static buildUrl(token, method) {
        return `https://api.telegram.org/bot${token}/${method}`;
    }

    /**
     * Delay for rate limiting
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Rate limiting delay between messages
     * @returns {Promise<void>}
     */
    static async rateLimitDelay() {
        await this.delay(RATE_LIMIT_DELAY);
    }

    /**
     * Send a text message to a chat
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {string} text - Message text
     * @param {Object} keyboard - Optional reply keyboard
     * @returns {Promise<void>}
     */
    static async sendMessage(env, chatId, text, keyboard = null) {
        const token = this.getToken(env);
        const url = this.buildUrl(token, 'sendMessage');
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        };

        if (keyboard) {
            body.reply_markup = {
                keyboard: keyboard,
                one_time_keyboard: true,
                resize_keyboard: true
            };
        }

        await this.rateLimitDelay();

        try {
            const startTime = Date.now();
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const responseTime = Date.now() - startTime;
            const responseText = await response.text();

            if (!response.ok) {
                await this.handleError(response, responseText, chatId, text, keyboard);
                return;
            }

            console.info(`✅ MESSAGE_SENT: Successfully sent message to chat ${chatId} (${responseTime}ms)`);
        } catch (error) {
            console.error(`❌ ERROR: Failed to send message: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle Telegram API errors with retry logic
     * @param {Response} response - Fetch response
     * @param {string} responseText - Response body text
     * @param {number} chatId - Chat ID
     * @param {string} text - Original message text
     * @param {Object} keyboard - Original keyboard
     * @throws {Error} If error cannot be recovered
     */
    static async handleError(response, responseText, chatId, text, keyboard) {
        let errorMessage = `Telegram API error: ${response.status} ${response.statusText}`;

        try {
            const errorData = JSON.parse(responseText);
            if (errorData && errorData.description) {
                errorMessage = `Telegram API error: ${errorData.description}`;

                if (errorData.error_code === 429) {
                    console.warn(`⚠️  RATE_LIMIT: Telegram rate limit exceeded, waiting 2 seconds...`);
                    await this.delay(2000);
                    return await this.sendMessage(env, chatId, text, keyboard);
                } else if (errorData.error_code === 403) {
                    console.warn(`⚠️  BLOCKED: User ${chatId} has blocked the bot`);
                    return;
                } else if (errorData.error_code === 400) {
                    console.error(`❌ BAD_REQUEST: Permanent failure - will NOT retry: ${errorMessage}`);
                    return;
                }
            }
        } catch (parseError) {
            errorMessage = `Telegram API error: ${response.status} ${response.statusText} - ${responseText}`;
        }

        throw new Error(errorMessage);
    }

    /**
     * Send a message with inline keyboard
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {string} text - Message text
     * @param {Array} inlineKeyboard - Inline keyboard buttons
     * @returns {Promise<void>}
     */
    static async sendMessageWithInlineKeyboard(env, chatId, text, inlineKeyboard = null) {
        const token = this.getToken(env);
        const url = this.buildUrl(token, 'sendMessage');
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined
        };

        await this.rateLimitDelay();

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                let errorMessage = `Telegram API error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = JSON.parse(await response.text());
                    if (errorData && errorData.description) {
                        errorMessage = `Telegram API error: ${errorData.description}`;
                    }
                } catch (parseError) {
                    // Use default error message
                }
                throw new Error(errorMessage);
            }

            console.info(`✅ INLINE_MESSAGE_SENT: Successfully sent inline message to chat ${chatId}`);
        } catch (error) {
            console.error(`❌ ERROR: Failed to send inline message: ${error.message}`);
            throw error;
        }
    }

    /**
     * Answer a callback query
     * @param {Object} env - Environment variables
     * @param {number} callbackQueryId - Callback query ID
     * @param {string} message - Optional message to show
     * @returns {Promise<void>}
     */
    static async answerCallbackQuery(env, callbackQueryId, message = null) {
        const token = this.getToken(env);
        const url = this.buildUrl(token, 'answerCallbackQuery');
        const body = { callback_query_id: callbackQueryId };

        if (message) {
            body.text = message;
            body.show_alert = false;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const responseText = await response.text();
                console.error(`❌ ERROR: Failed to answer callback query: ${responseText}`);
            }
        } catch (error) {
            console.error(`❌ ERROR: Failed to answer callback query: ${error.message}`);
        }
    }

    /**
     * Edit a message text
     * @param {Object} env - Environment variables
     * @param {number} chatId - Chat ID
     * @param {number} messageId - Message ID to edit
     * @param {string} text - New message text
     * @param {Array} inlineKeyboard - Optional new inline keyboard
     * @returns {Promise<void>}
     */
    static async editMessageText(env, chatId, messageId, text, inlineKeyboard = null) {
        const token = this.getToken(env);
        const url = this.buildUrl(token, 'editMessageText');
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'Markdown'
        };

        if (inlineKeyboard) {
            body.reply_markup = { inline_keyboard: inlineKeyboard };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const responseText = await response.text();
                console.error(`❌ ERROR: Failed to edit message: ${responseText}`);
            }
        } catch (error) {
            console.error(`❌ ERROR: Failed to edit message: ${error.message}`);
        }
    }

    /**
     * Create a reply keyboard markup
     * @param {Array} buttons - Array of button rows
     * @returns {Array} Keyboard markup
     */
    static createKeyboard(buttons) {
        return buttons;
    }
}