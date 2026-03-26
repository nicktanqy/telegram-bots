/**
 * Data models for the expense tracking bot
 * Migrated from Python to JavaScript for Cloudflare Workers
 */

/**
 * Types of form fields
 */
export const FieldType = {
    TEXT: 'text',
    NUMBER: 'number',
    CURRENCY: 'currency'
};

/**
 * Represents a single form field in a conversation
 */
export class FormField {
    constructor(key, displayName, prompt, fieldType = FieldType.TEXT, validationFn = null, required = true) {
        this.key = key;
        this.displayName = displayName;
        this.prompt = prompt;
        this.fieldType = fieldType;
        this.validationFn = validationFn;
        this.required = required;
    }

    /**
     * Validate input. Returns { isValid: boolean, errorMessage: string|null }
     */
    validate(value) {
        console.debug(`🔍 VALIDATE: Checking field '${this.key}' with value '${value}'`);
        
        if (!value && this.required) {
            const error = `${this.displayName} is required.`;
            console.debug(`  ❌ EMPTY: ${error}`);
            return { isValid: false, errorMessage: error };
        }
        
        if (this.fieldType === FieldType.NUMBER) {
            try {
                parseFloat(value);
                console.debug(`  ✅ NUMBER: Valid number`);
                if (this.validationFn) {
                    const result = this.validationFn(value);
                    console.debug(`  Custom validation: ${JSON.stringify(result)}`);
                    return result;
                }
                return { isValid: true, errorMessage: null };
            } catch (error) {
                const errorMsg = `${this.displayName} must be a number.`;
                console.debug(`  ❌ NUMBER_ERROR: ${errorMsg}`);
                return { isValid: false, errorMessage: errorMsg };
            }
        }
        
        if (this.fieldType === FieldType.CURRENCY) {
            try {
                const val = parseFloat(value);
                if (val < 0) {
                    const errorMsg = `${this.displayName} cannot be negative.`;
                    console.debug(`  ❌ NEGATIVE: ${errorMsg}`);
                    return { isValid: false, errorMessage: errorMsg };
                }
                console.debug(`  ✅ CURRENCY: Valid currency SGD ${val.toFixed(2)}`);
                if (this.validationFn) {
                    const result = this.validationFn(value);
                    console.debug(`  Custom validation: ${JSON.stringify(result)}`);
                    return result;
                }
                return { isValid: true, errorMessage: null };
            } catch (error) {
                const errorMsg = `${this.displayName} must be a valid amount.`;
                console.debug(`  ❌ CURRENCY_ERROR: ${errorMsg}`);
                return { isValid: false, errorMessage: errorMsg };
            }
        }
        
        if (this.validationFn) {
            const result = this.validationFn(value);
            console.debug(`  Custom validation: ${JSON.stringify(result)}`);
            return result;
        }
        
        console.debug(`  ✅ TEXT: Valid text`);
        return { isValid: true, errorMessage: null };
    }
}

/**
 * Represents a step in a conversation flow
 */
export class ConversationField {
    constructor(key, formField) {
        this.key = key;
        this.formField = formField;
    }
}

/**
 * Represents an expense record
 */
export class Expense {
    constructor(amount, merchant, description = null, timestamp = null) {
        this.amount = parseFloat(amount);
        this.merchant = merchant.toLowerCase();
        this.description = description;
        this.timestamp = timestamp || new Date();
    }

    toObject() {
        return {
            amount: this.amount,
            merchant: this.merchant,
            description: this.description,
            timestamp: this.timestamp.toISOString(),
        };
    }

    static fromObject(obj) {
        return new Expense(
            obj.amount,
            obj.merchant,
            obj.description,
            new Date(obj.timestamp)
        );
    }
}

/**
 * Represents a complete conversation flow
 */
export class ConversationFlow {
    constructor(name, description, welcomeMessage, completionMessage, steps) {
        this.name = name;
        this.description = description;
        this.welcomeMessage = welcomeMessage;
        this.completionMessage = completionMessage;
        this.steps = steps;
    }

    stepCount() {
        return this.steps.length;
    }

    getStep(index) {
        if (index >= 0 && index < this.steps.length) {
            return this.steps[index];
        }
        return null;
    }
}