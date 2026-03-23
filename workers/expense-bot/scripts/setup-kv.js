#!/usr/bin/env node

/**
 * Setup script for Cloudflare KV namespaces
 * Run this script to create and configure KV namespaces for the bot
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Setting up Cloudflare KV namespaces for Budget Billy...\n');

// Check if wrangler is installed
try {
    execSync('wrangler --version', { stdio: 'ignore' });
    console.log('✅ Wrangler CLI is installed');
} catch (error) {
    console.error('❌ Error: Wrangler CLI is not installed. Please install it with:');
    console.error('   npm install -g wrangler');
    process.exit(1);
}

// Check if logged in to Cloudflare
try {
    execSync('wrangler whoami', { stdio: 'ignore' });
    console.log('✅ Logged in to Cloudflare');
} catch (error) {
    console.error('❌ Error: Not logged in to Cloudflare. Please run:');
    console.error('   wrangler login');
    process.exit(1);
}

// Create KV namespaces
const namespaces = [
    { name: 'USER_DATA', description: 'User profiles, expenses, and conversation state' },
    { name: 'BOT_CONFIG', description: 'Bot configuration and settings' }
];

const kvIds = {};

for (const namespace of namespaces) {
    console.log(`\n📦 Creating KV namespace: ${namespace.name}`);
    console.log(`   Description: ${namespace.description}`);
    
    try {
        const output = execSync(`wrangler kv:namespace create "${namespace.name}"`, { encoding: 'utf8' });
        const match = output.match(/id: '([^']+)'/);
        
        if (match) {
            const id = match[1];
            kvIds[namespace.name] = id;
            console.log(`✅ Created ${namespace.name} with ID: ${id}`);
        } else {
            throw new Error('Could not parse KV namespace ID from output');
        }
    } catch (error) {
        console.error(`❌ Error creating ${namespace.name}:`, error.message);
        process.exit(1);
    }
}

// Update wrangler.toml with the new KV IDs
const wranglerTomlPath = path.join(process.cwd(), 'wrangler.toml');
let wranglerTomlContent = fs.readFileSync(wranglerTomlPath, 'utf8');

// Replace KV IDs in wrangler.toml
for (const [namespace, id] of Object.entries(kvIds)) {
    const binding = namespace;
    const pattern = new RegExp(
        `\\[\\[kv_namespaces\\]\\]\\s*binding\\s*=\\s*"${binding}"\\s*id\\s*=\\s*"([^"]*)"`,
        'g'
    );
    wranglerTomlContent = wranglerTomlContent.replace(pattern, 
        `[[kv_namespaces]]\nbinding = "${binding}"\nid = "${id}"`
    );
}

fs.writeFileSync(wranglerTomlPath, wranglerTomlContent);
console.log('\n✅ Updated wrangler.toml with KV namespace IDs');

// Instructions for setting secrets
console.log('\n🔐 Next steps - Set environment variables:');
console.log('   Run these commands to set your secrets:');

console.log('\n1. Set your Telegram bot token:');
console.log('   wrangler secret put BOT_TOKEN');
console.log('   (Get your token from https://t.me/BotFather)');

console.log('\n2. Set developer chat ID (optional, for debug commands):');
console.log('   wrangler secret put DEVELOPER_CHAT_ID');
console.log('   (Get your chat ID from https://t.me/userinfobot)');

console.log('\n3. Deploy your bot:');
console.log('   wrangler publish');

console.log('\n🎉 Setup complete! Your KV namespaces are ready.');
console.log('\n📋 Summary:');
for (const [namespace, id] of Object.entries(kvIds)) {
    console.log(`   ${namespace}: ${id}`);
}