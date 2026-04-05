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
    constructor(key, displayName, prompt, fieldType = FieldType.TEXT, validationFn = null, required = true, allowSkip = false) {
        this.key = key;
        this.displayName = displayName;
        this.prompt = prompt;
        this.fieldType = fieldType;
        this.validationFn = validationFn;
        this.required = required;
        this.allowSkip = allowSkip; // If true, shows a skip button instead of "press enter"
    }

    /**
     * Validate input. Returns { isValid: boolean, errorMessage: string|null }
     */
    validate(value) {
        console.debug(`🔍 VALIDATE: Checking field '${this.key}' with value '${value}'`);
        
        if (!value && this.required) {
            const error = `${this.displayName} is required. ${this.getHelpText()}`;
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
                const errorMsg = `${this.displayName} must be a number. ${this.getHelpText()}`;
                console.debug(`  ❌ NUMBER_ERROR: ${errorMsg}`);
                return { isValid: false, errorMessage: errorMsg };
            }
        }
        
        if (this.fieldType === FieldType.CURRENCY) {
            try {
                const val = parseFloat(value);
                if (val < 0) {
                    const errorMsg = `${this.displayName} cannot be negative. ${this.getHelpText()}`;
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
                const errorMsg = `${this.displayName} must be a valid amount. ${this.getHelpText()}`;
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

    /**
     * Get helpful text for the field based on its type and validation rules
     */
    getHelpText() {
        switch (this.fieldType) {
            case FieldType.NUMBER:
                if (this.key === 'months_to_goal') {
                    return "Example: 12 (for 1 year), 24 (for 2 years), 60 (for 5 years)";
                }
                return "Example: 25, 30, 45";
            
            case FieldType.CURRENCY:
                if (this.key === 'amount') {
                    return "Example: 15.50, 100, 25.99";
                }
                if (this.key === 'current_savings' || this.key === 'savings_goal') {
                    return "Example: 1000.00, 5000, 10000.50";
                }
                if (this.key === 'monthly_budget' || this.key === 'monthly_cash_income' || this.key === 'monthly_savings_goal') {
                    return "Example: 2000.00, 2500, 500.75";
                }
                return "Example: 15.50, 100, 25.99";
            
            case FieldType.TEXT:
                if (this.key === 'name') {
                    return "Example: John Doe, Sarah";
                }
                if (this.key === 'category') {
                    return "Example: food, transport, entertainment, utilities";
                }
                if (this.key === 'description') {
                    return "Example: Coffee at Starbucks, Bus fare, Movie ticket";
                }
                return "Please enter a valid value";
            
            default:
                return "Please enter a valid value";
        }
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
        this.timestamp = timestamp || new Date().toISOString();
    }

    toObject() {
        return {
            amount: this.amount,
            merchant: this.merchant,
            description: this.description,
            timestamp: this.timestamp,
        };
    }

    static fromObject(obj) {
        return new Expense(
            obj.amount,
            obj.merchant,
            obj.description,
            obj.timestamp
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