/**
 * Configuration Mapping Utilities
 * Provides generic field mapping and validation for config objects
 */

/**
 * Map configuration fields from input to output format
 * @param {Object} input - Input config object
 * @param {Object} mappings - Field mappings { inputField: outputField }
 * @param {Object} enumMappings - Enum mappings { field: enumMap }
 * @param {Object} defaults - Default values
 * @returns {Object} Mapped config object
 */
export function mapConfigFields(input, mappings = {}, enumMappings = {}, defaults = {}) {
    const output = { ...defaults };
    
    for (const [inputField, outputField] of Object.entries(mappings)) {
        const value = input[inputField];
        
        // Skip undefined/null values
        if (value === undefined || value === null) continue;
        
        // Handle enum mapping
        if (enumMappings[inputField]) {
            const enumMap = enumMappings[inputField];
            const enumValue = enumMap[value];
            if (enumValue !== undefined) {
                output[outputField] = enumValue;
            }
        } else {
            // Direct mapping
            output[outputField] = value;
        }
    }
    
    return output;
}

/**
 * Copy fields from source to target, only if defined
 * @param {Object} source - Source object
 * @param {Object} target - Target object
 * @param {string[]} fields - Fields to copy
 */
export function copyFields(source, target, fields) {
    for (const field of fields) {
        if (source[field] !== undefined) {
            target[field] = source[field];
        }
    }
}

/**
 * Validate config object against schema
 * @param {Object} config - Config to validate
 * @param {Object} schema - Validation schema { field: { type, min, max, enum } }
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateConfig(config, schema) {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
        const value = config[field];
        
        // Skip validation if field is optional and not present
        if (rules.optional && value === undefined) continue;
        
        // Type validation
        if (rules.type && value !== undefined) {
            const actualType = typeof value;
            if (actualType !== rules.type) {
                errors.push(`${field} must be ${rules.type}, got ${actualType}`);
            }
        }
        
        // Range validation
        if (rules.min !== undefined && value < rules.min) {
            errors.push(`${field} must be >= ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
            errors.push(`${field} must be <= ${rules.max}`);
        }
        
        // Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Merge multiple config objects
 * Later configs override earlier ones
 * @param {...Object} configs - Config objects to merge
 * @returns {Object} Merged config
 */
export function mergeConfigs(...configs) {
    return Object.assign({}, ...configs);
}

/**
 * Filter config object to only include specified fields
 * @param {Object} config - Config object
 * @param {string[]} fields - Fields to keep
 * @returns {Object} Filtered config
 */
export function filterConfig(config, fields) {
    const filtered = {};
    for (const field of fields) {
        if (config[field] !== undefined) {
            filtered[field] = config[field];
        }
    }
    return filtered;
}

/**
 * Check if config object has any valid fields
 * @param {Object} config - Config object
 * @param {string[]} validFields - List of valid field names
 * @returns {boolean} True if config has at least one valid field
 */
export function hasValidFields(config, validFields) {
    return Object.keys(config).some(key => validFields.includes(key));
}

