"""Data models and validation for the bot."""

import logging
from dataclasses import dataclass, field, asdict
from typing import Any, Optional, Dict
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
    validation_fn: Optional[callable] = None
    required: bool = True

    def validate(self, value: str) -> tuple[bool, Optional[str]]:
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
                logger.debug(f"  ✅ CURRENCY: Valid currency ${val:.2f}")
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
class UserProfile:
    """User profile data."""
    user_id: int
    first_name: str
    data: Dict[str, Any] = field(default_factory=dict)

    def set_field(self, key: str, value: Any) -> None:
        """Set a user data field."""
        self.data[key] = value

    def get_field(self, key: str, default: Any = None) -> Any:
        """Get a user data field."""
        return self.data.get(key, default)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_update(cls, user_id: int, first_name: str, existing_data: Optional[dict] = None):
        """Create profile from Telegram update."""
        profile = cls(user_id=user_id, first_name=first_name)
        if existing_data:
            profile.data = existing_data
        return profile


@dataclass
class ConversationField:
    """Configuration for a conversation field step."""
    key: str
    form_field: FormField
    follow_up_text: Optional[str] = None

    def get_prompt(self) -> str:
        """Get the prompt for this field."""
        return self.form_field.prompt


@dataclass
class ConversationFlow:
    """Defines a multi-step conversation flow."""
    name: str
    description: str
    steps: list[ConversationField]
    welcome_message: Optional[str] = None
    completion_message: Optional[str] = None

    def get_step(self, index: int) -> Optional[ConversationField]:
        """Get a conversation step by index."""
        if 0 <= index < len(self.steps):
            return self.steps[index]
        return None

    def step_count(self) -> int:
        """Get total number of steps."""
        return len(self.steps)


class ValidationError(Exception):
    """Custom validation error."""
    pass
