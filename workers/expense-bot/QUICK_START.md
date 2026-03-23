# Budget Billy - Quick Start Guide

## 🚀 Complete Your Deployment

You're almost ready! Here are the final steps to get your bot running:

### Step 1: Set Your Bot Token (REQUIRED)
```bash
wrangler secret put BOT_TOKEN
```
- **Get your token**: If you haven't created a bot yet, message [@BotFather](https://t.me/BotFather) on Telegram
- **Create bot**: Send `/newbot` and follow the instructions
- **Copy token**: BotFather will give you a token like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
- **Set secret**: Run the command above and paste your token when prompted

### Step 2: Test Local Development
```bash
wrangler dev
```
- Visit http://localhost:8787/ to see if the worker is running
- The worker should respond with "Budget Billy Expense Tracker Bot is running!"

### Step 3: Deploy to Production
```bash
wrangler deploy
```
- This will deploy your bot to Cloudflare's global network
- You'll get a URL like `https://your-worker.your-account.workers.dev`

### Step 4: Configure Telegram Webhook (CRITICAL)
Message [@BotFather](https://t.me/BotFather) with:
```
/setwebhook
```
- Enter your bot's username when prompted
- Enter your worker URL + `/webhook` as the webhook URL
- Example: `https://your-worker.your-account.workers.dev/webhook`

### Step 5: Test Your Bot
Now test your bot in Telegram:
- Send `/start` to begin setup
- Follow the conversation flow to set up your profile
- Test expense tracking with `/expense`

## 🔧 Troubleshooting

### Common Issues:

**"BOT_TOKEN not configured"**
- Run: `wrangler secret put BOT_TOKEN`
- Make sure you're in the `workers/expense-bot` directory

**Webhook not working**
- Verify the webhook URL is correct in BotFather
- Check that your worker is deployed and accessible
- Test the webhook endpoint: `https://your-worker.your-account.workers.dev/webhook`

**KV namespace errors**
- Your KV namespaces are already set up correctly
- IDs are configured in `wrangler.toml`

## 📋 Final Checklist

- [ ] Set BOT_TOKEN secret
- [ ] Test local development (`wrangler dev`)
- [ ] Deploy to production (`wrangler deploy`)
- [ ] Configure webhook in BotFather
- [ ] Test bot functionality in Telegram
- [ ] Monitor logs in Cloudflare dashboard

## 🎉 You're Ready!

Once you complete these steps, your Budget Billy bot will be fully functional with:
- ✅ Stateless architecture using Cloudflare KV
- ✅ Modern ES modules
- ✅ Production-ready security
- ✅ Global deployment on Cloudflare's network

## 📞 Need Help?

- **Cloudflare Workers docs**: https://developers.cloudflare.com/workers/
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Budget Billy docs**: See README.md in this directory