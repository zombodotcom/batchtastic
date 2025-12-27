/**
 * Error Handler Utility
 * Provides consistent error handling patterns
 */

/**
 * Wrap async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {Function} onError - Error handler callback
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, onError = null) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            if (onError) {
                return onError(error, ...args);
            }
            console.error('Error in wrapped function:', error);
            throw error;
        }
    };
}

/**
 * Create a safe async function that returns null on error
 * @param {Function} fn - Async function
 * @returns {Function} Safe function that returns null on error
 */
export function safeAsync(fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            console.error('Error in safe async function:', error);
            return null;
        }
    };
}

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Initial delay in milliseconds
 * @returns {Promise} Result of function or throws error
 */
export async function retryWithBackoff(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = delayMs * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

