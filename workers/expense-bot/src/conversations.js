/**
 * Conversation handling framework for Telegram bots
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

import { ConversationFlow, ConversationField } from './models.js';

// Internal state codes
export const FLOW_COMPLETE = 999; // Sentinel value to signal flow completion

/**
 * Conversation context management for KV storage
 */
export class ConversationContext {
    static CURRENT_FLOW = "current_flow";
    static CURRENT_STEP = "current_step";
    static FLOW_DATA = "flow_data";

    /**
     * Set the current conversation flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} flowName - Name of the flow
     * @param {ConversationFlow} flow - Flow object
     * @returns {Promise<void>}
     */
    static async setFlow(kv, userId, flowName, flow) {
        console.debug(`🔄 STATE: Setting flow to '${flowName}' with ${flow.stepCount()} steps`);
        
        const context = {
            currentFlow: flowName,
            currentStep: 0,
            flowData: {}
        };
        
        await kv.put(`${userId}:context`, JSON.stringify(context));
    }

    /**
     * Get current flow name
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<string|null>} Current flow name or null
     */
    static async getCurrentFlow(kv, userId) {
        const context = await this.getContext(kv, userId);
        return context?.currentFlow || null;
    }

    /**
     * Get current step in flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<number>} Current step index
     */
    static async getCurrentStep(kv, userId) {
        const context = await this.getContext(kv, userId);
        return context?.currentStep || 0;
    }

    /**
     * Move to next step
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    static async advanceStep(kv, userId) {
        const context = await this.getContext(kv, userId);
        const currentStep = context?.currentStep || 0;
        const nextStep = currentStep + 1;
        
        context.currentStep = nextStep;
        await kv.put(`${userId}:context`, JSON.stringify(context));
        
        console.debug(`➡️  STATE: Advanced step: ${currentStep} → ${nextStep}`);
    }

    /**
     * Get accumulated flow data
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Flow data object
     */
    static async getFlowData(kv, userId) {
        const context = await this.getContext(kv, userId);
        return context?.flowData || {};
    }

    /**
     * Set a field in the current flow data
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} key - Field key
     * @param {any} value - Field value
     * @returns {Promise<void>}
     */
    static async setFlowField(kv, userId, key, value) {
        const context = await this.getContext(kv, userId);
        if (!context.flowData) {
            context.flowData = {};
        }
        context.flowData[key] = value;
        
        await kv.put(`${userId}:context`, JSON.stringify(context));
        console.debug(`📝 DATA: Stored field '${key}' = '${value}'`);
    }

    /**
     * Clear current flow state
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    static async clearFlow(kv, userId) {
        await kv.delete(`${userId}:context`);
        console.debug(`✅ STATE: Flow cleared`);
    }

    /**
     * Get full context object
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Context object
     */
    static async getContext(kv, userId) {
        try {
            const data = await kv.get(`${userId}:context`, "json");
            return data || {};
        } catch (error) {
            console.error(`❌ ERROR: Failed to get context for ${userId}: ${error.message}`);
            return {};
        }
    }
}

/**
 * Generic handler for multi-step conversations
 */
export class GenericConversationHandler {
    /**
     * Initialize handler with available flows
     * @param {Object} flows - Object with flow names as keys and ConversationFlow objects as values
     */
    constructor(flows) {
        this.flows = flows;
    }

    /**
     * Generic handler for conversation input
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} input - User input text
     * @param {Function} onCompletion - Optional callback when flow completes
     * @returns {Promise<number>} State code
     */
    async handleInput(kv, userId, input, onCompletion = null) {
        try {
            const flowName = await ConversationContext.getCurrentFlow(kv, userId);
            const currentStep = await ConversationContext.getCurrentStep(kv, userId);
            
            console.debug(`📨 INPUT: User '${userId}' sent: '${input}'`);
            console.debug(`📍 STATE: Current flow='${flowName}', step=${currentStep}`);
            
            if (!flowName || !this.flows[flowName]) {
                console.error(`❌ ERROR: Invalid flow: ${flowName}`);
                return 1;
            }
            
            const flow = this.flows[flowName];
            const step = flow.getStep(currentStep);
            
            if (!step) {
                console.error(`❌ ERROR: Invalid step ${currentStep} in flow ${flowName}`);
                return 1;
            }
            
            console.debug(`🎯 VALIDATION: Validating input for field '${step.key}'`);
            
            // Validate input
            const validation = step.formField.validate(input);
            
            if (!validation.isValid) {
                console.warning(`❌ VALIDATION FAILED: ${validation.errorMessage}`);
                return 1;
            }
            
            console.info(`✅ VALIDATION PASSED: Field '${step.key}' accepted value: '${input}'`);
            
            // Store the value
            await ConversationContext.setFlowField(kv, userId, step.key, input);
            
            // Check if flow is complete
            const totalSteps = flow.stepCount();
            if (currentStep + 1 >= totalSteps) {
                console.info(`🎉 COMPLETION: Flow '${flowName}' is complete!`);
                
                const flowData = await ConversationContext.getFlowData(kv, userId);
                console.debug(`📦 FLOW_DATA: ${JSON.stringify(flowData)}`);
                
                if (onCompletion) {
                    console.debug(`📞 CALLBACK: Calling on_completion callback`);
                    await onCompletion(kv, userId, flowData);
                }
                
                await ConversationContext.clearFlow(kv, userId);
                console.debug(`📤 RESULT: Returning FLOW_COMPLETE signal`);
                return FLOW_COMPLETE;
            }
            
            // Move to next step
            await ConversationContext.advanceStep(kv, userId);
            const nextStepIdx = await ConversationContext.getCurrentStep(kv, userId);
            const nextStep = flow.getStep(nextStepIdx);
            
            console.debug(`➡️  NEXT_STEP: Prompting for field '${nextStep.key}' (${nextStepIdx + 1}/${totalSteps})`);
            
            return 1; // Continue flow
        } catch (error) {
            console.error(`❌ ERROR in handleInput: ${error.message}`);
            return 1;
        }
    }

    /**
     * Start a new conversation flow
     * @param {KVNamespace} kv - Cloudflare KV namespace
     * @param {string} userId - User ID
     * @param {string} flowName - Name of the flow to start
     * @param {number} targetState - State to return after flow starts
     * @returns {Promise<number>} State code
     */
    async startFlow(kv, userId, flowName, targetState = 1) {
        console.debug(`🚀 FLOW_START: Initiating flow '${flowName}'`);
        
        if (!this.flows[flowName]) {
            console.error(`❌ ERROR: Unknown flow: ${flowName}`);
            return targetState;
        }
        
        const flow = this.flows[flowName];
        await ConversationContext.setFlow(kv, userId, flowName, flow);
        
        console.info(`✅ FLOW_STARTED: Flow '${flowName}' started successfully`);
        
        return targetState;
    }
}