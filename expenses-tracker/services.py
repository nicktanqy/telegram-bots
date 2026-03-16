"""Business logic services."""

import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


@dataclass
class Expense:
    """Represents an expense record."""
    amount: float
    category: str
    description: Optional[str] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

    def to_dict(self) -> dict:
        return {
            "amount": self.amount,
            "category": self.category,
            "description": self.description,
            "timestamp": self.timestamp.isoformat(),
        }


class ExpenseService:
    """Service for managing expenses."""

    @staticmethod
    def add_expense(user_data: Dict[str, Any], expense_data: Dict[str, str]) -> Expense:
        """
        Add a new expense to user data.
        
        Args:
            user_data: User's data dictionary
            expense_data: Dictionary with 'amount', 'category', 'description'
            
        Returns:
            The created Expense object
        """
        logger.debug(f"💰 ADD_EXPENSE: Processing expense data: {expense_data}")
        
        try:
            amount = float(expense_data.get("amount", 0))
            logger.debug(f"  Amount parsed: ${amount:.2f}")
            
            if amount < 0:
                logger.warning(f"❌ VALIDATION: Amount is negative: ${amount}")
                raise ValueError("Amount cannot be negative")
            
            expense = Expense(
                amount=amount,
                category=expense_data.get("category", "Other").lower(),
                description=expense_data.get("description", ""),
            )
            logger.debug(f"  Expense created: {expense.to_dict()}")
            
            if "expenses" not in user_data:
                logger.debug(f"  Creating new expenses list")
                user_data["expenses"] = []
            
            user_data["expenses"].append(expense.to_dict())
            logger.info(f"✅ SAVED: Expense added - ${amount:.2f} in '{expense.category}'")
            logger.debug(f"  Total expenses: {len(user_data['expenses'])}")
            
            return expense
            
        except (ValueError, TypeError) as e:
            logger.error(f"❌ ERROR: Error adding expense: {e}")
            raise

    @staticmethod
    def get_expenses(user_data: Dict[str, Any]) -> List[Expense]:
        """Get all expenses for a user."""
        expenses = []
        for expense_dict in user_data.get("expenses", []):
            expense = Expense(
                amount=expense_dict["amount"],
                category=expense_dict["category"],
                description=expense_dict.get("description"),
                timestamp=datetime.fromisoformat(expense_dict["timestamp"]),
            )
            expenses.append(expense)
        return expenses

    @staticmethod
    def get_expenses_by_category(user_data: Dict[str, Any]) -> Dict[str, List[Expense]]:
        """Get expenses grouped by category."""
        grouped = {}
        for expense in ExpenseService.get_expenses(user_data):
            if expense.category not in grouped:
                grouped[expense.category] = []
            grouped[expense.category].append(expense)
        return grouped

    @staticmethod
    def get_total_expenses(user_data: Dict[str, Any]) -> float:
        """Get total expenses."""
        return sum(e.amount for e in ExpenseService.get_expenses(user_data))

    @staticmethod
    def get_category_total(user_data: Dict[str, Any], category: str) -> float:
        """Get total for a specific category."""
        expenses = ExpenseService.get_expenses_by_category(user_data)
        return sum(e.amount for e in expenses.get(category.lower(), []))


class ProfileService:
    """Service for managing user profiles."""

    @staticmethod
    def initialize_profile(user_data: Dict[str, Any], profile_data: Dict[str, str]) -> None:
        """
        Initialize user profile with setup data.
        
        Args:
            user_data: User's data dictionary
            profile_data: Dictionary with setup fields
        """
        logger.debug(f"👤 PROFILE_INIT: Initializing profile with data: {profile_data}")
        
        try:
            user_data["age"] = int(profile_data.get("age", 0))
            logger.debug(f"  Age: {user_data['age']}")
            
            user_data["current_savings"] = float(profile_data.get("current_savings", 0))
            logger.debug(f"  Current Savings: ${user_data['current_savings']:.2f}")
            
            user_data["monthly_budget"] = float(profile_data.get("monthly_budget", 0))
            logger.debug(f"  Monthly Budget: ${user_data['monthly_budget']:.2f}")
            
            user_data["savings_goal"] = float(profile_data.get("savings_goal", 0))
            logger.debug(f"  Savings Goal: ${user_data['savings_goal']:.2f}")
            
            user_data["goal_age"] = int(profile_data.get("goal_age", 0))
            logger.debug(f"  Goal Age: {user_data['goal_age']}")
            
            user_data["is_initialized"] = True
            logger.info(f"✅ PROFILE: Profile initialized successfully")
            logger.debug(f"  User can now use all bot features")
            
        except (ValueError, TypeError) as e:
            logger.error(f"❌ ERROR: Error initializing profile: {e}")
            raise

    @staticmethod
    def is_profile_initialized(user_data: Dict[str, Any]) -> bool:
        """Check if user profile is set up."""
        return user_data.get("is_initialized", False)

    @staticmethod
    def get_profile_summary(user_data: Dict[str, Any]) -> str:
        """Get a formatted profile summary."""
        logger.debug(f"📊 SUMMARY: Generating profile summary")
        
        if not ProfileService.is_profile_initialized(user_data):
            logger.debug(f"⚠️  INFO: Profile not initialized")
            return "Profile not initialized."
        
        total_expenses = ExpenseService.get_total_expenses(user_data)
        logger.debug(f"  Total Expenses: ${total_expenses:.2f}")
        
        current_savings = user_data.get("current_savings", 0)
        monthly_budget = user_data.get("monthly_budget", 0)
        savings_goal = user_data.get("savings_goal", 0)
        
        budget_remaining = monthly_budget - total_expenses
        goal_progress = (current_savings / savings_goal * 100) if savings_goal > 0 else 0
        
        logger.debug(f"  Current Savings: ${current_savings:.2f}")
        logger.debug(f"  Monthly Budget: ${monthly_budget:.2f}")
        logger.debug(f"  Budget Remaining: ${budget_remaining:.2f}")
        logger.debug(f"  Savings Goal Progress: {goal_progress:.1f}%")
        
        summary = f"""
📊 **Your Financial Profile**
━━━━━━━━━━━━━━━━
Age: {user_data.get('age')}
Current Savings: ${current_savings:.2f}
Monthly Budget: ${monthly_budget:.2f}
Savings Goal: ${savings_goal:.2f} (Progress: {goal_progress:.1f}%)
━━━━━━━━━━━━━━━━
Total Expenses: ${total_expenses:.2f}
Budget Remaining: ${budget_remaining:.2f}
        """.strip()
        
        logger.debug(f"✅ SUMMARY: Generated successfully")
        return summary
