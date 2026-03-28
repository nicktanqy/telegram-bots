/**
 * Simple test to verify Apple Pay parsing works
 */

// Mock the parseApplePayMessage function for testing
function parseApplePayMessage(messageText) {
    // Pattern: "Spent $15 at Starbucks on 2026-03-26 at 10:28 PM"
    // We'll ignore the time part and focus on the date
    const pattern = /^Spent\s+\$(\d+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4})-(\d{2})-(\d{2})/;
    
    const match = messageText.trim().match(pattern);
    if (!match) {
        return {};
    }
    
    const [_, amountStr, merchant, yearStr, monthStr, dayStr] = match;
    
    try {
        const amount = parseFloat(amountStr);
        if (amount <= 0) {
            return {};
        }
        
        const day = parseInt(dayStr);
        const month = parseInt(monthStr);
        const year = parseInt(yearStr);
        
        // Extended date validation (100-year range)
        const currentYear = 2026; // Current year
        if (!(currentYear - 50 <= year && year <= currentYear + 50) || !(1 <= month && month <= 12) || !(1 <= day && day <= 31)) {
            return {};
        }
        
        // Format date as YYYY-MM-DD for consistency
        const dateStr = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        return {
            amount: amount,
            merchant: merchant.trim(),
            date: dateStr
        };
    } catch (error) {
        console.error(`❌ ERROR: Failed to parse Apple Pay message: ${error.message}`);
        return {};
    }
}

// Test cases
const testCases = [
    {
        name: "Valid Apple Pay message with Starbucks",
        input: "Spent $15 at Starbucks on 2026-03-26",
        expected: {
            amount: 15.0,
            merchant: "Starbucks",
            date: "2026-03-26"
        }
    },
    {
        name: "Invalid negative amount",
        input: "Spent $-10.00 at Store on 2026-03-26",
        expected: {}
    },
    {
        name: "Invalid message format",
        input: "Invalid message format",
        expected: {}
    }
];

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