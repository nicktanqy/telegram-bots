"""Shared data models for Telegram bots."""

import logging
from dataclasses import dataclass
from typing import Optional, Callable, Dict, Any, Tuple
from enum import Enum

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class FieldType(Enum):
    """Types of form fields."""
    TEXT = "text"
    NUMBER = "number"
    CURRENCY = "currency"


@dataclass
class FormField:
    """Represents a single form field in a conversation."""
    key: str
    display_name: str
    prompt: str
    field_type: FieldType = FieldType.TEXT
    validation_fn: Optional[Callable] = None
    required: bool = True

    def validate(self, value: str) -> Tuple[bool, Optional[str]]:
        """Validate input. Returns (is_valid, error_message)."""
        logger.debug(f"🔍 VALIDATE: Checking field '{self.key}' with value '{value}'")
        
        if not value and self.required:
            error = f"{self.display_name} is required."
            logger.debug(f"  ❌ EMPTY: {error}")
            return False, error
        
        if self.field_type == FieldType.NUMBER:
            try:
                float(value)
                logger.debug(f"  ✅ NUMBER: Valid number")
                if self.validation_fn:
                    result = self.validation_fn(value)
                    logger.debug(f"  Custom validation: {result}")
                    return result
                return True, None
            except ValueError:
                error = f"{self.display_name} must be a number."
                logger.debug(f"  ❌ NUMBER_ERROR: {error}")
                return False, error
        
        if self.field_type == FieldType.CURRENCY:
            try:
                val = float(value)
                if val < 0:
                    error = f"{self.display_name} cannot be negative."
                    logger.debug(f"  ❌ NEGATIVE: {error}")
                    return False, error
                logger.debug(f"  ✅ CURRENCY: Valid currency SGD {val:.2f}")
                if self.validation_fn:
                    result = self.validation_fn(value)
                    logger.debug(f"  Custom validation: {result}")
                    return result
                return True, None
            except ValueError:
                error = f"{self.display_name} must be a valid amount."
                logger.debug(f"  ❌ CURRENCY_ERROR: {error}")
                return False, error
        
        if self.validation_fn:
            result = self.validation_fn(value)
            logger.debug(f"  Custom validation: {result}")
            return result
        
        logger.debug(f"  ✅ TEXT: Valid text")
        return True, None


@dataclass
class ConversationField:
    """Represents a step in a conversation flow."""
    key: str
    form_field: FormField


@dataclass
class ConversationFlow:
    """Represents a complete conversation flow."""
    name: str
    description: str
    welcome_message: str
    completion_message: str
    steps: list[ConversationField]

    def step_count(self) -> int:
        """Return total number of steps."""
        return len(self.steps)

    def get_step(self, index: int) -> Optional[ConversationField]:
        """Get step by index."""
        if 0 <= index < len(self.steps):
            return self.steps[index]
        return None
