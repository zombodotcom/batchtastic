/**
 * Configuration Diff Utility
 * Provides utilities for comparing and diffing device configurations
 */

/**
 * Compare two configuration objects and return differences
 * @param {Object} config1 - First configuration object
 * @param {Object} config2 - Second configuration object
 * @returns {Object} Diff object with added, removed, and changed fields
 */
export function compareConfigs(config1, config2) {
    const diff = {
        added: {},
        removed: {},
        changed: {},
        unchanged: {}
    };
    
    const allKeys = new Set([
        ...Object.keys(config1 || {}),
        ...Object.keys(config2 || {})
    ]);
    
    for (const key of allKeys) {
        const val1 = config1?.[key];
        const val2 = config2?.[key];
        
        if (val1 === undefined && val2 !== undefined) {
            diff.added[key] = val2;
        } else if (val1 !== undefined && val2 === undefined) {
            diff.removed[key] = val1;
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
            diff.changed[key] = {
                from: val1,
                to: val2
            };
        } else {
            diff.unchanged[key] = val1;
        }
    }
    
    return diff;
}

/**
 * Format diff for display
 * @param {Object} diff - Diff object from compareConfigs
 * @returns {string} Formatted diff string
 */
export function formatDiff(diff) {
    const lines = [];
    
    if (Object.keys(diff.added).length > 0) {
        lines.push('Added:');
        for (const [key, value] of Object.entries(diff.added)) {
            lines.push(`  + ${key}: ${JSON.stringify(value)}`);
        }
    }
    
    if (Object.keys(diff.removed).length > 0) {
        lines.push('Removed:');
        for (const [key, value] of Object.entries(diff.removed)) {
            lines.push(`  - ${key}: ${JSON.stringify(value)}`);
        }
    }
    
    if (Object.keys(diff.changed).length > 0) {
        lines.push('Changed:');
        for (const [key, change] of Object.entries(diff.changed)) {
            lines.push(`  ~ ${key}: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`);
        }
    }
    
    if (lines.length === 0) {
        return 'No differences';
    }
    
    return lines.join('\n');
}

/**
 * Get config diff between device and template
 * @param {Object} deviceConfig - Device configuration
 * @param {Object} templateConfig - Template configuration
 * @returns {Object} Diff object
 */
export function getConfigDiffFromTemplate(deviceConfig, templateConfig) {
    return compareConfigs(deviceConfig, templateConfig);
}

/**
 * Get config diff between two devices
 * @param {Object} device1Config - First device configuration
 * @param {Object} device2Config - Second device configuration
 * @returns {Object} Diff object
 */
export function getConfigDiffBetweenDevices(device1Config, device2Config) {
    return compareConfigs(device1Config, device2Config);
}

/**
 * Check if two configs are equal
 * @param {Object} config1 - First configuration
 * @param {Object} config2 - Second configuration
 * @returns {boolean} True if configs are equal
 */
export function configsEqual(config1, config2) {
    const diff = compareConfigs(config1, config2);
    return Object.keys(diff.added).length === 0 &&
           Object.keys(diff.removed).length === 0 &&
           Object.keys(diff.changed).length === 0;
}

