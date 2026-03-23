#!/usr/bin/env node

/**
 * Migration script for existing user data from Python bot to Cloudflare Workers
 * This script helps migrate data from the old PicklePersistence format to Cloudflare KV
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

console.log('🔄 Budget Billy Data Migration Tool\n');
console.log('This script helps migrate user data from the Python bot to Cloudflare Workers.\n');

// Check if wrangler is installed and logged in
try {
    execSync('wrangler whoami', { stdio: 'ignore' });
    console.log('✅ Logged in to Cloudflare');
} catch (error) {
    console.error('❌ Error: Not logged in to Cloudflare. Please run:');
    console.error('   wrangler login');
    process.exit(1);
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    try {
        // Check if old data exists
        const oldDataPath = path.join(process.cwd(), '../../expenses-tracker/conversationbot');
        const hasOldData = fs.existsSync(oldDataPath);
        
        if (hasOldData) {
            console.log('📁 Found old bot data at:', oldDataPath);
            const migrate = await askQuestion('\nDo you want to migrate this data? (y/n): ');
            
            if (migrate.toLowerCase() === 'y' || migrate.toLowerCase() === 'yes') {
                await migrateOldData(oldDataPath);
            }
        } else {
            console.log('ℹ️  No old bot data found at expected location');
        }
        
        // Manual data entry option
        const manualEntry = await askQuestion('\nDo you want to manually enter user data? (y/n): ');
        if (manualEntry.toLowerCase() === 'y' || manualEntry.toLowerCase() === 'yes') {
            await manualDataEntry();
        }
        
        console.log('\n✅ Migration complete!');
        console.log('\nNext steps:');
        console.log('1. Set your bot token: wrangler secret put BOT_TOKEN');
        console.log('2. Deploy your bot: wrangler publish');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        rl.close();
    }
}

async function migrateOldData(dataPath) {
    console.log('\n🔄 Attempting to migrate old data...');
    
    try {
        // Try to read the old pickle file (this would require Python to be installed)
        // For now, we'll provide instructions since Node.js can't directly read Python pickle files
        
        console.log('⚠️  Note: Old data is stored in Python pickle format.');
        console.log('   To migrate this data, you have a few options:');
        console.log('');
        console.log('1. Manual Migration:');
        console.log('   - Start the old Python bot');
        console.log('   - Use /show_data command to export user data');
        console.log('   - Manually enter the data using this tool');
        console.log('');
        console.log('2. Python Script Migration:');
        console.log('   - Create a Python script to read the pickle file');
        console.log('   - Convert data to JSON format');
        console.log('   - Use the JSON data with this migration tool');
        console.log('');
        console.log('3. Fresh Start:');
        console.log('   - Skip migration and start fresh with the new bot');
        console.log('   - Users will need to re-setup their profiles');
        
        const choice = await askQuestion('\nChoose an option (1=Manual, 2=Python Script, 3=Skip): ');
        
        if (choice === '1') {
            await manualDataEntry();
        } else if (choice === '2') {
            console.log('\n📝 Python script template for data extraction:');
            console.log(`
import pickle
import json

# Load the old data
with open('conversationbot', 'rb') as f:
    old_data = pickle.load(f)

# Convert to JSON format
json_data = {}
for user_id, user_data in old_data.items():
    # Extract relevant data
    user_json = {
        "age": user_data.get("age"),
        "currentSavings": user_data.get("current_savings", 0),
        "monthlyBudget": user_data.get("monthly_budget", 0),
        "savingsGoal": user_data.get("savings_goal", 0),
        "goalAge": user_data.get("goal_age"),
        "isInitialized": user_data.get("is_initialized", False),
        "expenses": user_data.get("expenses", [])
    }
    json_data[str(user_id)] = user_json

# Save to JSON file
with open('migrated_data.json', 'w') as f:
    json.dump(json_data, f, indent=2)

print("Data exported to migrated_data.json")
            `);
            
            const jsonPath = await askQuestion('\nPath to your JSON data file (or press Enter to skip): ');
            if (jsonPath && fs.existsSync(jsonPath)) {
                await importJsonData(jsonPath);
            }
        }
        
    } catch (error) {
        console.error('❌ Error reading old data:', error.message);
    }
}

async function manualDataEntry() {
    console.log('\n📝 Manual Data Entry');
    console.log('Enter user data manually. Press Enter to skip a user.\n');
    
    let userId;
    do {
        userId = await askQuestion('User ID (or press Enter to finish): ');
        
        if (userId) {
            const userData = await collectUserData(userId);
            if (userData) {
                await saveToKV(userId, userData);
            }
        }
    } while (userId);
}

async function collectUserData(userId) {
    console.log(`\n👤 Collecting data for user ${userId}:`);
    
    const age = await askQuestion('Age: ');
    if (!age) return null;
    
    const currentSavings = await askQuestion('Current savings: ');
    const monthlyBudget = await askQuestion('Monthly budget: ');
    const savingsGoal = await askQuestion('Savings goal: ');
    const goalAge = await askQuestion('Goal age: ');
    
    const hasExpenses = await askQuestion('Does this user have expenses? (y/n): ');
    let expenses = [];
    
    if (hasExpenses.toLowerCase() === 'y') {
        console.log('Enter expenses (one per line, empty line to finish):');
        let expenseInput;
        do {
            expenseInput = await askQuestion('Expense (amount,category,description): ');
            if (expenseInput) {
                const [amount, category, description = ''] = expenseInput.split(',');
                expenses.push({
                    amount: parseFloat(amount),
                    category: category.trim().toLowerCase(),
                    description: description.trim(),
                    timestamp: new Date().toISOString()
                });
            }
        } while (expenseInput);
    }
    
    return {
        age: parseInt(age),
        currentSavings: parseFloat(currentSavings || 0),
        monthlyBudget: parseFloat(monthlyBudget || 0),
        savingsGoal: parseFloat(savingsGoal || 0),
        goalAge: parseInt(goalAge || 0),
        isInitialized: true,
        expenses: expenses
    };
}

async function importJsonData(jsonPath) {
    try {
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        console.log(`\n📊 Found ${Object.keys(jsonData).length} users in JSON file`);
        
        for (const [userId, userData] of Object.entries(jsonData)) {
            console.log(`\n💾 Saving data for user ${userId}...`);
            await saveToKV(userId, userData);
        }
        
        console.log('✅ All data imported successfully!');
        
    } catch (error) {
        console.error('❌ Error importing JSON data:', error.message);
    }
}

async function saveToKV(userId, userData) {
    try {
        // Save user data to KV
        const dataCommand = `echo '${JSON.stringify(userData)}' | wrangler kv:key put ${userId}`;
        execSync(dataCommand, { stdio: 'inherit' });
        
        console.log(`✅ Saved user data for ${userId}`);
        
    } catch (error) {
        console.error(`❌ Error saving data for ${userId}:`, error.message);
    }
}

// Run the migration
main().catch(console.error);