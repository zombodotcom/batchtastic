/**
 * Storage Abstraction
 * Provides a simple, type-safe interface for localStorage
 */

/**
 * Get item from storage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Parsed value or default
 */
export function getStorage(key, defaultValue = null) {
    try {
        if (typeof localStorage === 'undefined') {
            return defaultValue;
        }
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn(`Failed to get storage key "${key}":`, e);
        return defaultValue;
    }
}

/**
 * Set item in storage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
export function setStorage(key, value) {
    try {
        if (typeof localStorage === 'undefined') {
            console.warn('localStorage not available');
            return;
        }
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn(`Failed to set storage key "${key}":`, e);
    }
}

/**
 * Remove item from storage
 * @param {string} key - Storage key
 */
export function removeStorage(key) {
    try {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.removeItem(key);
    } catch (e) {
        console.warn(`Failed to remove storage key "${key}":`, e);
    }
}

/**
 * Clear all storage (or all keys with a prefix)
 * @param {string} prefix - Optional prefix to filter keys
 */
export function clearStorage(prefix = null) {
    try {
        if (typeof localStorage === 'undefined') {
            return;
        }
        if (prefix) {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(prefix)) {
                    localStorage.removeItem(key);
                }
            });
        } else {
            localStorage.clear();
        }
    } catch (e) {
        console.warn('Failed to clear storage:', e);
    }
}

