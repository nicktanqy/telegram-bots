#!/usr/bin/env python3
"""Test script for Apple Pay message parsing."""

import sys
import os
from pathlib import Path

# Add the expenses-tracker directory to the path
sys.path.insert(0, str(Path(__file__).parent / "expenses-tracker"))

from main import parse_apple_pay_message

def test_apple_pay_parsing():
    """Test the Apple Pay message parsing function."""
    
    print("🧪 Testing Apple Pay Message Parsing")
    print("=" * 50)
    
    # Test cases
    test_cases = [
        # Valid cases
        ("Spent $15 at Starbucks on 26 Mar 2026 at 10:28 PM", True, {
            'amount': 15.0,
            'merchant': 'Starbucks',
            'date': '2026-03-26'
        }),
        ("Spent $5.00 at McDonald's on 25 Mar 2026 at 1:30 PM", True, {
            'amount': 5.00,
            'merchant': "McDonald's",
            'date': '2026-03-25'
        }),
        ("Spent $100.00 at Amazon on 20 Mar 2026 at 11:45 AM", True, {
            'amount': 100.00,
            'merchant': 'Amazon',
            'date': '2026-03-20'
        }),
        ("Spent $0.50 at Vending Machine on 26 Mar 2026 at 9:15 AM", True, {
            'amount': 0.50,
            'merchant': 'Vending Machine',
            'date': '2026-03-26'
        }),
        ("Spent $25.75 at Target on 15 Dec 2025 at 6:20 PM", True, {
            'amount': 25.75,
            'merchant': 'Target',
            'date': '2025-12-15'
        }),
        ("Spent $120.00 at Best Buy on 1 Jan 2027 at 2:00 PM", True, {
            'amount': 120.00,
            'merchant': 'Best Buy',
            'date': '2027-01-01'
        }),
        
        # Invalid cases
        ("Spent $-10.00 at Store on 26 Mar 2026 at 10:28 PM", False, {}),
        ("Spent $abc at Store on 26 Mar 2026 at 10:28 PM", False, {}),
        ("Invalid message format", False, {}),
        ("Spent $10.00 at Store", False, {}),
        ("Spent $10.00 at Store on", False, {}),
        ("Spent $10.00 at Store on 26 March 2026 at 10:28 PM", False, {}),
        ("Spent $10.00 at Store on 26 MAR 2026 at 10:28 PM", False, {}),
        ("", False, {}),
        ("Spent $15 at Starbucks on 32 Mar 2026 at 10:28 PM", False, {}),
        ("Spent $15 at Starbucks on 26 Feb 1970 at 10:28 PM", False, {}),
        ("Spent $15 at Starbucks on 26 Feb 2100 at 10:28 PM", False, {}),
    ]
    
    passed = 0
    failed = 0
    
    for i, (message, should_pass, expected) in enumerate(test_cases, 1):
        print(f"\nTest {i}: {message}")
        
        result = parse_apple_pay_message(message)
        
        if should_pass:
            if result == expected:
                print(f"✅ PASS - Parsed correctly: {result}")
                passed += 1
            else:
                print(f"❌ FAIL - Expected: {expected}, Got: {result}")
                failed += 1
        else:
            if result == {}:
                print(f"✅ PASS - Correctly rejected invalid message")
                passed += 1
            else:
                print(f"❌ FAIL - Should have been rejected, but got: {result}")
                failed += 1
    
    print(f"\n" + "=" * 50)
    print(f"📊 Test Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All tests passed! Apple Pay integration is ready.")
        return True
    else:
        print("⚠️  Some tests failed. Please check the implementation.")
        return False

if __name__ == "__main__":
    success = test_apple_pay_parsing()
    sys.exit(0 if success else 1)