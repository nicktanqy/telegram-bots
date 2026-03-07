"""Reusable conversation handling framework."""

import logging
from typing import Callable, Optional, Any, Dict
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import ContextTypes

from .models import UserProfile, ConversationFlow, ConversationField, ValidationError

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Internal state codes for handle_input
FLOW_COMPLETE = 999  # Sentinel value to signal flow completion


class ConversationContext:
    """Manages conversation state and user data."""
    
    CURRENT_FLOW = "current_flow"
    CURRENT_STEP = "current_step"
    FLOW_DATA = "flow_data"

    @staticmethod
    def set_flow(context: ContextTypes.DEFAULT_TYPE, flow_name: str, flow: ConversationFlow) -> None:
        """Set the current conversation flow."""
        logger.debug(f"🔄 STATE: Setting flow to '{flow_name}' with {flow.step_count()} steps")
        context.user_data[ConversationContext.CURRENT_FLOW] = flow_name
        context.user_data[ConversationContext.CURRENT_STEP] = 0
        context.user_data[ConversationContext.FLOW_DATA] = {}
        logger.debug(f"✅ STATE: Flow initialized - Flow: {flow_name}, Step: 0, Data: {{}}")

    @staticmethod
    def get_current_flow(user_data: Dict) -> Optional[str]:
        """Get current flow name."""
        return user_data.get(ConversationContext.CURRENT_FLOW)

    @staticmethod
    def get_current_step(user_data: Dict) -> int:
        """Get current step in flow."""
        return user_data.get(ConversationContext.CURRENT_STEP, 0)

    @staticmethod
    def advance_step(context: ContextTypes.DEFAULT_TYPE) -> None:
        """Move to next step."""
        current_step = context.user_data.get(ConversationContext.CURRENT_STEP, 0)
        next_step = current_step + 1
        context.user_data[ConversationContext.CURRENT_STEP] = next_step
        flow_name = context.user_data.get(ConversationContext.CURRENT_FLOW)
        logger.debug(f"➡️  STATE: Advanced step in flow '{flow_name}': {current_step} → {next_step}")

    @staticmethod
    def get_flow_data(user_data: Dict) -> Dict[str, Any]:
        """Get accumulated flow data."""
        return user_data.get(ConversationContext.FLOW_DATA, {})

    @staticmethod
    def set_flow_field(context: ContextTypes.DEFAULT_TYPE, key: str, value: Any) -> None:
        """Set a field in the current flow data."""
        if ConversationContext.FLOW_DATA not in context.user_data:
            context.user_data[ConversationContext.FLOW_DATA] = {}
        context.user_data[ConversationContext.FLOW_DATA][key] = value
        logger.debug(f"📝 DATA: Stored field '{key}' = '{value}'")

    @staticmethod
    def clear_flow(context: ContextTypes.DEFAULT_TYPE) -> None:
        """Clear current flow state."""
        flow_name = context.user_data.get(ConversationContext.CURRENT_FLOW)
        logger.debug(f"🔚 STATE: Clearing flow '{flow_name}'")
        context.user_data.pop(ConversationContext.CURRENT_FLOW, None)
        context.user_data.pop(ConversationContext.CURRENT_STEP, None)
        context.user_data.pop(ConversationContext.FLOW_DATA, None)
        logger.debug(f"✅ STATE: Flow cleared")


class GenericConversationHandler:
    """Generic handler for multi-step conversations."""

    def __init__(self, flows: Dict[str, ConversationFlow]):
        """
        Initialize handler with available flows.
        
        Args:
            flows: Dictionary mapping flow names to ConversationFlow objects
        """
        self.flows = flows

    async def handle_input(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        on_completion: Optional[Callable] = None
    ) -> int:
        """
        Generic handler for conversation input.
        
        Args:
            update: Telegram update
            context: Telegram context
            on_completion: Optional callback when flow completes
            
        Returns:
            State code (for ConversationHandler)
        """
        user = update.message.from_user
        logger.info(f"🔴 ENTRY_handle_input: User '{user.first_name}' sent message '{update.message.text}' - HANDLER WAS CALLED")
        flow_name = ConversationContext.get_current_flow(context.user_data)
        current_step = ConversationContext.get_current_step(context.user_data)
        
        logger.debug(f"📨 INPUT: User '{user.first_name}' sent: '{update.message.text}'")
        logger.debug(f"📍 STATE: Current flow='{flow_name}', step={current_step}")
        
        if not flow_name or flow_name not in self.flows:
            logger.error(f"❌ ERROR: Invalid flow: {flow_name}")
            await update.message.reply_text(
                "❌ No active flow. Please use /start or /menu to begin."
            )
            return 1  # Return ACTIVE_FLOW to stay in conversation
        
        flow = self.flows[flow_name]
        step = flow.get_step(current_step)
        
        if not step:
            logger.error(f"❌ ERROR: Invalid step {current_step} in flow {flow_name}")
            await update.message.reply_text(
                "❌ Error processing your input. Please try again with /start."
            )
            return 1  # Return ACTIVE_FLOW to stay in conversation
        
        logger.debug(f"🎯 VALIDATION: Validating input for field '{step.key}'")
        
        # Validate input
        is_valid, error_msg = step.form_field.validate(update.message.text)
        
        if not is_valid:
            logger.warning(f"❌ VALIDATION FAILED: {error_msg}")
            await update.message.reply_text(f"❌ {error_msg}\n\n{step.form_field.prompt}")
            return 1  # Stay in ACTIVE_FLOW state
        
        logger.info(f"✅ VALIDATION PASSED: Field '{step.key}' accepted value: '{update.message.text}'")
        
        # Store the value
        ConversationContext.set_flow_field(context, step.key, update.message.text)
        
        # Check if flow is complete
        total_steps = flow.step_count()
        if current_step + 1 >= total_steps:
            logger.info(f"🎉 COMPLETION: Flow '{flow_name}' is complete!")
            
            # Flow complete
            flow_data = ConversationContext.get_flow_data(context.user_data)
            logger.debug(f"📦 FLOW_DATA: {flow_data}")
            
            if on_completion:
                logger.debug(f"📞 CALLBACK: Calling on_completion callback")
                await on_completion(update, context, flow_data)
            
            ConversationContext.clear_flow(context)
            logger.debug(f"📤 RESULT: Returning FLOW_COMPLETE signal")
            return FLOW_COMPLETE  # Signal flow completion
        
        # Move to next step
        ConversationContext.advance_step(context)
        next_step_idx = ConversationContext.get_current_step(context.user_data)
        next_step = flow.get_step(next_step_idx)
        
        logger.debug(f"➡️  NEXT_STEP: Prompting for field '{next_step.key}' ({next_step_idx + 1}/{total_steps})")
        
        if next_step:
            logger.info(f"📤 SENDING_PROMPT: About to send prompt for field '{next_step.key}'")
            await update.message.reply_text(next_step.form_field.prompt)
            logger.info(f"✅ PROMPT_SENT: Prompt sent successfully for '{next_step.key}'")
        else:
            logger.error(f"❌ ERROR: Next step {next_step_idx} not found")
            await update.message.reply_text("❌ Error with form. Please restart with /start.")
        
        logger.debug(f"📤 RESULT: Returning ACTIVE_FLOW (continue)")
        return 1  # Return ACTIVE_FLOW to stay in conversation

    async def start_flow(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        flow_name: str,
        target_state: int = 1
    ) -> int:
        """
        Start a new conversation flow.
        
        Args:
            update: Telegram update
            context: Telegram context
            flow_name: Name of the flow to start
            target_state: State to return after flow starts (default: 1 for ACTIVE_FLOW)
            
        Returns:
            State code (usually ACTIVE_FLOW or 1)
        """
        logger.debug(f"🚀 FLOW_START: Initiating flow '{flow_name}'")
        
        if flow_name not in self.flows:
            logger.error(f"❌ ERROR: Flow not found: {flow_name}")
            await update.message.reply_text("❌ Flow not available.")
            return 0  # Return MAIN_MENU on error
        
        flow = self.flows[flow_name]
        logger.debug(f"📋 FLOW_INFO: '{flow_name}' has {flow.step_count()} steps")
        
        ConversationContext.set_flow(context, flow_name, flow)
        
        # Send welcome message and first prompt
        if flow.welcome_message:
            logger.debug(f"💬 MESSAGE: Sending welcome message for '{flow_name}'")
            await update.message.reply_text(flow.welcome_message)
        
        first_step = flow.get_step(0)
        if first_step:
            logger.debug(f"🎯 FIRST_STEP: Prompting for field '{first_step.key}'")
            await update.message.reply_text(first_step.form_field.prompt)
        
        logger.debug(f"📤 RESULT: Flow '{flow_name}' started, returning state {target_state}")
        return target_state  # Return the target state (usually ACTIVE_FLOW)
