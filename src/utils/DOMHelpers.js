/**
 * DOM Helper Utilities
 * Provides simple, reusable functions for common DOM operations
 */

/**
 * Safely get element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null if not found
 */
export function getElement(id) {
    return document.getElementById(id);
}

/**
 * Get element value safely
 * @param {string} id - Element ID
 * @returns {string} Element value or empty string
 */
export function getValue(id) {
    const el = getElement(id);
    return el?.value || '';
}

/**
 * Set element value safely
 * @param {string} id - Element ID
 * @param {string} value - Value to set
 */
export function setValue(id, value) {
    const el = getElement(id);
    if (el) el.value = value;
}

/**
 * Read form values into object
 * @param {string[]} fieldIds - Array of field IDs to read
 * @returns {Object} Object with field IDs as keys and values
 */
export function readForm(fieldIds) {
    const values = {};
    for (const id of fieldIds) {
        values[id] = getValue(id);
    }
    return values;
}

/**
 * Write form values from object
 * @param {Object} values - Object with field IDs as keys and values
 */
export function writeForm(values) {
    for (const [id, value] of Object.entries(values)) {
        setValue(id, value);
    }
}

/**
 * Create a modal dialog
 * @param {Object} config - Modal configuration
 * @param {string} config.title - Modal title
 * @param {string} config.content - Modal HTML content
 * @param {Function} config.onClose - Callback when modal closes
 * @param {Function} config.onSubmit - Optional submit callback
 * @param {string} config.submitText - Submit button text (default: "OK")
 * @returns {HTMLElement} Modal element
 */
export function createModal({ title, content, onClose, onSubmit, submitText = 'OK' }) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    const hasSubmit = typeof onSubmit === 'function';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" id="modalCloseBtn">✕</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
            ${hasSubmit ? `
            <div class="modal-footer" style="padding: 1rem; border-top: 1px solid #ddd; display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button class="btn btn-secondary" id="modalCancelBtn">Cancel</button>
                <button class="btn btn-primary" id="modalSubmitBtn">${submitText}</button>
            </div>
            ` : ''}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = (result = null) => {
        modal.remove();
        if (onClose) onClose(result);
    };
    
    // Close button
    const closeBtn = modal.querySelector('#modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(null));
    }
    
    // Cancel button
    const cancelBtn = modal.querySelector('#modalCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal(null));
    }
    
    // Submit button
    const submitBtn = modal.querySelector('#modalSubmitBtn');
    if (submitBtn && onSubmit) {
        submitBtn.addEventListener('click', () => {
            const result = onSubmit();
            if (result !== false) { // Allow onSubmit to return false to prevent closing
                closeModal(result);
            }
        });
    }
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(null);
        }
    });
    
    // Focus first input if present
    setTimeout(() => {
        const firstInput = modal.querySelector('input, textarea, select');
        if (firstInput) {
            firstInput.focus();
            if (firstInput.select) firstInput.select();
        }
    }, 100);
    
    return modal;
}

/**
 * Show alert dialog (replaces browser alert)
 * @param {string} message - Alert message
 * @returns {Promise<void>} Promise that resolves when alert is closed
 */
export function showAlert(message) {
    return new Promise((resolve) => {
        createModal({
            title: 'Alert',
            content: `<p>${message}</p>`,
            onClose: resolve
        });
    });
}

/**
 * Show confirm dialog (replaces browser confirm)
 * @param {string} message - Confirm message
 * @returns {Promise<boolean>} Promise resolving to true if confirmed, false if cancelled
 */
export function showConfirm(message) {
    return new Promise((resolve) => {
        createModal({
            title: 'Confirm',
            content: `<p>${message}</p>`,
            onSubmit: () => resolve(true),
            onClose: () => resolve(false),
            submitText: 'OK'
        });
    });
}

/**
 * Show prompt dialog (replaces browser prompt)
 * @param {string} message - Prompt message
 * @param {string} defaultValue - Default input value
 * @returns {Promise<string|null>} Promise resolving to input value or null if cancelled
 */
export function showPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        const inputId = 'promptInput_' + Date.now();
        createModal({
            title: 'Input',
            content: `
                <p>${message}</p>
                <input type="text" id="${inputId}" value="${defaultValue}" style="width: 100%; padding: 0.5rem; margin-top: 0.5rem;">
            `,
            onSubmit: () => {
                const value = getValue(inputId);
                return value.trim() || null;
            },
            onClose: (result) => resolve(result),
            submitText: 'OK'
        });
    });
}

/**
 * Toggle element visibility
 * @param {string} id - Element ID
 * @param {boolean} show - Show or hide
 */
export function toggleElement(id, show) {
    const el = getElement(id);
    if (el) {
        el.style.display = show ? '' : 'none';
    }
}

/**
 * Add event listener safely
 * @param {string} id - Element ID
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 */
export function on(id, event, handler) {
    const el = getElement(id);
    if (el) {
        el.addEventListener(event, handler);
    }
}

/**
 * Set innerHTML safely
 * @param {string} id - Element ID
 * @param {string} html - HTML content
 */
export function setHTML(id, html) {
    const el = getElement(id);
    if (el) {
        el.innerHTML = html;
    }
}

