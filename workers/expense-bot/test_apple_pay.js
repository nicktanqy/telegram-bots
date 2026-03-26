/**
 * Test Apple Pay integration for Cloudflare Workers bot
 */

import { parseApplePayMessage } from '../src/services.js';

/**
 * Test cases for Apple Pay message parsing
 */
const testCases = [
    {
        name: "Valid Apple Pay message with Starbucks",
        input: "Spent $15 at Starbucks on 26 Mar 2026 at 10:28 PM",
        expected: {
            amount: 15.0,
            merchant: "Starbucks",
            date: "2026-03-26"
        }
    },
    {
        name: "Valid Apple Pay message with McDonald's",
        input: "Spent $5.00 at McDonald's on 25 Mar 2026 at 1:30 PM",
        expected: {
            amount: 5.0,
            merchant: "McDonald's",
            date: "2026-03-25"
        }
    },
    {
        name: "Valid Apple Pay message with Amazon",
        input: "Spent $100.00 at Amazon on 20 Mar 2026 at 11:45 AM",
        expected: {
            amount: 100.0,
            merchant: "Amazon",
            date: "2026-03-20"
        }
    },
    {
        name: "Valid Apple Pay message with Vending Machine",
        input: "Spent $0.50 at Vending Machine on 26 Mar 2026 at 9:15 AM",
        expected: {
            amount: 0.5,
            merchant: "Vending Machine",
            date: "2026-03-26"
        }
    },
    {
        name: "Valid Apple Pay message with Target",
        input: "Spent $25.75 at Target on 15 Dec 2025 at 6:20 PM",
        expected: {
            amount: 25.75,
            merchant: "Target",
            date: "2025-12-15"
        }
    },
    {
        name: "Valid Apple Pay message with Best Buy",
        input: "Spent $120.00 at Best Buy on 1 Jan 2027 at 2:00 PM",
        expected: {
            amount: 120.0,
            merchant: "Best Buy",
            date: "2027-01-01"
        }
    },
    {
        name: "Invalid negative amount",
        input: "Spent $-10.00 at Store on 26 Mar 2026 at 10:28 PM",
        expected: {}
    },
    {
        name: "Invalid non-numeric amount",
        input: "Spent $abc at Store on 26 Mar 2026 at 10:28 PM",
        expected: {}
    },
    {
        name: "Invalid message format",
        input: "Invalid message format",
        expected: {}
    },
    {
        name: "Missing date",
        input: "Spent $10.00 at Store",
        expected: {}
    },
    {
        name: "Missing date part",
        input: "Spent $10.00 at Store on",
        expected: {}
    },
    {
        name: "Invalid month format",
        input: "Spent $10.00 at Store on 26 March 2026 at 10:28 PM",
        expected: {}
    },
    {
        name: "Invalid month format uppercase",
        input: "Spent $10.00 at Store on 26 MAR 2026 at 10:28 PM",
        expected: {}
    },
    {
        name: "Empty message",
        input: "",
        expected: {}
    },
    {
        name: "Invalid day",
        input: "Spent $15 at Starbucks on 32 Mar 2026 at 10:28 PM",
        expected: {}
    },
    {
        name: "Invalid year (too old)",
        input: "Spent $15 at Starbucks on 26 Feb 1970 at 10:28 PM",
        expected: {}
    },
    {
        name: "Invalid year (too far future)",
        input: "Spent $15 at Starbucks on 26 Feb 2100 at 10:28 PM",
        expected: {}
    }
];

/**
 * Run all tests
 */
function runTests() {
    console.log('🧪 Testing Apple Pay Message Parsing');
    console.log('='.repeat(50));
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach((testCase, index) => {
        const result = parseApplePayMessage(testCase.input);
        const isMatch = JSON.stringify(result) === JSON.stringify(testCase.expected);
        
        if (isMatch) {
            console.log(`✅ Test ${index + 1}: ${testCase.name}`);
            console.log(`   Parsed correctly: ${JSON.stringify(result)}`);
            passed++;
        } else {
            console.log(`❌ Test ${index + 1}: ${testCase.name}`);
            console.log(`   Expected: ${JSON.stringify(testCase.expected)}`);
            console.log(`   Got: ${JSON.stringify(result)}`);
            failed++;
        }
        console.log('');
    });
    
    console.log('='.repeat(50));
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('🎉 All tests passed! Apple Pay integration is ready.');
    } else {
        console.log('❌ Some tests failed. Please check the implementation.');
    }
    
    return failed === 0;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests();
}

export { runTests };