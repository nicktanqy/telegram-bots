/**
 * Apple Pay Message Parsing Tests
 */

import { parseApplePayMessage } from '../src/services.js';

console.log('🧪 Testing Apple Pay Message Parsing');
console.log('='.repeat(50));

let passed = 0;
let failed = 0;

function runTest(name, input, expected) {
    const result = parseApplePayMessage(input);
    const isMatch = JSON.stringify(result) === JSON.stringify(expected);

    if (isMatch) {
        console.log(`✅ Test: ${name}`);
        console.log(`   Parsed correctly: ${JSON.stringify(result)}`);
        passed++;
    } else {
        console.log(`❌ Test: ${name}`);
        console.log(`   Expected: ${JSON.stringify(expected)}`);
        console.log(`   Got: ${JSON.stringify(result)}`);
        failed++;
    }
    console.log('');
}

// Test cases
runTest(
    "Valid Apple Pay message with Starbucks",
    "Spent $15 at Starbucks on 2026-03-26",
    { amount: 15.0, merchant: "Starbucks", date: "2026-03-26" }
);

runTest(
    "Valid Apple Pay message with decimal amount",
    "Spent $15.99 at McDonalds on 2026-03-26",
    { amount: 15.99, merchant: "McDonalds", date: "2026-03-26" }
);

runTest(
    "Invalid negative amount",
    "Spent $-10.00 at Store on 2026-03-26",
    {}
);

runTest(
    "Invalid message format",
    "Invalid message format",
    {}
);

runTest(
    "Empty string",
    "",
    {}
);

runTest(
    "Invalid date (month > 12)",
    "Spent $10 at Store on 2026-13-26",
    {}
);

console.log('='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('🎉 All tests passed! Apple Pay integration is ready.');
} else {
    console.log('❌ Some tests failed. Please check the implementation.');
    process.exit(1);
}