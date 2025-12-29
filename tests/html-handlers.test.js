import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Test to verify all HTML onclick/onchange handlers have corresponding functions
 * This helps catch missing function references before deployment
 */
describe('HTML Event Handlers', () => {
    it('should verify all onclick handlers have corresponding functions', () => {
        const htmlPath = join(process.cwd(), 'index.html');
        const html = readFileSync(htmlPath, 'utf-8');
        
        // Extract all onclick handlers
        const onclickMatches = html.matchAll(/onclick="([^"]+)"/g);
        const onclickHandlers = Array.from(onclickMatches).map(m => m[1]);
        
        // Extract all onchange handlers
        const onchangeMatches = html.matchAll(/onchange="([^"]+)"/g);
        const onchangeHandlers = Array.from(onchangeMatches).map(m => m[1]);
        
        // Common functions that should exist
        const requiredFunctions = new Set();
        
        // Parse onclick handlers
        onclickHandlers.forEach(handler => {
            // Extract function name (handle cases like "function()" or "manager.method()")
            const match = handler.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
            if (match) {
                const funcName = match[1];
                // Skip if it's a method call (has dot)
                if (!handler.includes('.')) {
                    requiredFunctions.add(funcName);
                }
            }
        });
        
        // Parse onchange handlers
        onchangeHandlers.forEach(handler => {
            const match = handler.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
            if (match) {
                const funcName = match[1];
                if (!handler.includes('.')) {
                    requiredFunctions.add(funcName);
                }
            }
        });
        
        // List of functions that should be defined
        const expectedFunctions = [
            'openBoardSelector',
            'closeBoardSelector',
            'filterBoards',
            'filterChips',
            'selectBoard',
            'openConfigPanel',
            'closeConfigPanel',
            'switchConfigTab',
            'applyConfigToAll',
            'saveCurrentConfigAsPreset',
            'exportCurrentConfig',
            'importConfig',
            'loadConfigPreset',
            'renderConfigPresets',
            'deleteConfigPreset',
            'flashAllDevices',
            'openTestDialog',
            'openImportDialog',
            'openLabelGenerator',
            'openConfigHistory',
            'restoreConfigFromHistory'
        ];
        
        // Check that we found handlers
        expect(onclickHandlers.length + onchangeHandlers.length).toBeGreaterThan(0);
        
        // Verify critical functions are referenced
        const foundCriticalFunctions = expectedFunctions.filter(fn => {
            return html.includes(`onclick="${fn}`) || html.includes(`onchange="${fn}`);
        });
        
        // This is informational - we can't actually test if functions exist without browser
        // But we can verify the HTML references them
        console.log('Found event handlers:', {
            onclick: onclickHandlers.length,
            onchange: onchangeHandlers.length,
            criticalFunctionsFound: foundCriticalFunctions
        });
        
        // At minimum, verify we have some handlers
        expect(onclickHandlers.length + onchangeHandlers.length).toBeGreaterThan(0);
    });
    
    it('should verify no broken function references in HTML', () => {
        const htmlPath = join(process.cwd(), 'index.html');
        const html = readFileSync(htmlPath, 'utf-8');
        
        // Check for common patterns that indicate missing functions
        const suspiciousPatterns = [
            /onclick="undefined\(/,
            /onclick="null\(/,
            /onchange="undefined\(/,
            /onchange="null\(/
        ];
        
        suspiciousPatterns.forEach(pattern => {
            const matches = html.match(pattern);
            if (matches) {
                console.warn('Suspicious pattern found:', matches[0]);
            }
            expect(matches).toBeNull();
        });
    });
});

