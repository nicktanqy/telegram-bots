#!/usr/bin/env node

/**
 * Force immediate month rollover for all users
 * Run this script when you have deployed the new rollover code mid-month
 * and users are still seeing last month's expenses
 */

import { execSync } from 'child_process';
import readline from 'readline';

console.log('🔄 FORCE MONTH ROLLOVER UTILITY\n');
console.log('This script will archive last month expenses and reset for current month.\n');

// Check if wrangler is installed and logged in
try {
    execSync('wrangler whoami', { stdio: 'ignore' });
    console.log('✅ Logged in to Cloudflare');
} catch (error) {
    console.error('❌ Error: Not logged in to Cloudflare. Please run:');
    console.error('   wrangler login');
    process.exit(1);
}

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
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const lastMonth = `${now.getFullYear()}-${now.getMonth().toString().padStart(2, '0')}`;

        console.log(`📅 Current month: ${currentMonth}`);
        console.log(`📅 Last month:    ${lastMonth}\n`);

        const userId = await askQuestion('Enter User ID to process (or "all" for all users): ');
        
        const dryRun = await askQuestion('Run in DRY RUN mode? (y/n): ');
        const isDryRun = dryRun.toLowerCase() === 'y' || dryRun.toLowerCase() === 'yes';

        if (isDryRun) {
            console.log('\n⚠️  RUNNING IN DRY RUN MODE - NO CHANGES WILL BE SAVED\n');
        }

        if (userId.toLowerCase() === 'all') {
            console.log('🔍 Fetching all user keys from KV...');
            
            // List all keys in KV namespace (correct wrangler v3 syntax)
            const keysOutput = execSync('wrangler kv key list --binding=USER_DATA --remote', { encoding: 'utf8' });
            const keys = JSON.parse(keysOutput);
            
            console.log(`📊 Found ${keys.length} user records\n`);

            for (const keyEntry of keys) {
                await processUser(keyEntry.name, lastMonth, currentMonth, isDryRun);
            }
        } else {
            await processUser(userId, lastMonth, currentMonth, isDryRun);
        }

        console.log('\n✅ Operation complete!');
        console.log('\nℹ️  Note: After running this script, users will see fresh empty expenses for this month');
        console.log('   and last month totals will be available in historical comparison.');

    } catch (error) {
        console.error('❌ Operation failed:', error.message);
        console.error(error.stack);
    } finally {
        rl.close();
    }
}

async function processUser(userId, lastMonth, currentMonth, isDryRun) {
    const now = new Date();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`👤 Processing user: ${userId}`);
    
    try {
        // Get current user data
        const userDataStr = execSync(`wrangler kv key get ${userId} --binding=USER_DATA --remote`, { encoding: 'utf8' }).trim();
        
        if (!userDataStr) {
            console.log(`   ⚠️  No data found for user`);
            return;
        }

        const userData = JSON.parse(userDataStr);
        
        console.log(`   📊 Current expenses count: ${userData.expenses ? userData.expenses.length : 0}`);
        console.log(`   📅 Last active month: ${userData.lastActiveMonth || 'NOT SET'}`);

        // Initialize monthly history if missing
        if (!userData.monthlyHistory) {
            userData.monthlyHistory = {};
            console.log(`   ➕ Created monthlyHistory field`);
        }

        // Check if we need to perform rollover
        if (userData.lastActiveMonth !== currentMonth || !userData.lastActiveMonth) {
            
            // Calculate final stats for last month - ACTUALLY FILTER BY MONTH
            const previousMonthExpenses = (userData.expenses || []).filter(expense => {
                const expenseDate = new Date(expense.timestamp);
                return expenseDate.getMonth() === now.getMonth() - 1 && 
                       expenseDate.getFullYear() === now.getFullYear();
            });
            
            const previousTotal = previousMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

            console.log(`   ✅ ARCHIVING ${lastMonth}:`);
            console.log(`      • Total expenses: $${previousTotal.toFixed(2)}`);
            console.log(`      • Count: ${previousMonthExpenses.length}`);
            console.log(`      • Average: ${previousMonthExpenses.length > 0 ? '$' + (previousTotal / previousMonthExpenses.length).toFixed(2) : '$0.00'}`);

            // Only save if not dry run
            if (!isDryRun) {
                // Archive to history
                userData.monthlyHistory[lastMonth] = {
                    total: previousTotal,
                    count: previousMonthExpenses.length,
                    average: previousMonthExpenses.length > 0 ? previousTotal / previousMonthExpenses.length : 0,
                    archivedAt: new Date().toISOString(),
                    migrated: true
                };

                // Keep only last 24 months
                const sortedMonths = Object.keys(userData.monthlyHistory).sort().reverse();
                if (sortedMonths.length > 24) {
                    const monthsToDelete = sortedMonths.slice(24);
                    monthsToDelete.forEach(month => delete userData.monthlyHistory[month]);
                    console.log(`   🗑️  Cleaned up ${monthsToDelete.length} old history entries`);
                }

                // Clear expenses array for new month
                userData.expenses = [];
                
                // Update last active month
                userData.lastActiveMonth = currentMonth;

                // Save back to KV using temp file to avoid Windows shell escaping issues
                const fs = await import('fs');
                const path = await import('path');
                const os = await import('os');
                
                const tempFile = path.join(os.tmpdir(), `kv-save-${Date.now()}.json`);
                fs.writeFileSync(tempFile, JSON.stringify(userData));
                
                execSync(`wrangler kv key put ${userId} --binding=USER_DATA --remote --path "${tempFile}"`, { stdio: 'ignore' });
                
                fs.unlinkSync(tempFile);

                console.log(`   💾 Saved updated user data`);
            } else {
                console.log(`   ⏭️  Dry run - not saving changes`);
            }

        } else {
            console.log(`   ✅ Already on current month - no rollover needed`);
        }

    } catch (error) {
        console.error(`   ❌ Error processing user: ${error.message}`);
    }
}

// Run the script
main().catch(console.error);