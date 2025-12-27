import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
            globals: {
                'crypto': 'readonly',
                'navigator': 'readonly',
                'window': 'readonly',
                'document': 'readonly',
                'localStorage': 'readonly',
                'fetch': 'readonly',
                'Blob': 'readonly',
                'File': 'readonly',
                'FileList': 'readonly',
                'FileReader': 'readonly',
                'TextEncoder': 'readonly',
                'TextDecoder': 'readonly',
                'Uint8Array': 'readonly',
                'ArrayBuffer': 'readonly',
                'Promise': 'readonly',
                'Set': 'readonly',
                'Map': 'readonly',
                'URL': 'readonly',
                'URLSearchParams': 'readonly',
                'console': 'readonly'
            }
        },
        rules: {
            // Best Practices
            'no-unused-vars': ['warn', { 
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-console': ['warn', { 
                allow: ['warn', 'error', 'log'] 
            }],
            'no-debugger': 'warn',
            'no-alert': 'warn',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-return-await': 'error',
            'require-await': 'warn',
            
            // Variables
            'no-undef': 'error',
            'no-use-before-define': ['error', { 
                functions: false,
                classes: true,
                variables: true
            }],
            
            // Style
            'indent': ['warn', 4, { 
                SwitchCase: 1 
            }],
            'quotes': ['warn', 'single', { 
                avoidEscape: true 
            }],
            'semi': ['warn', 'always'],
            'comma-dangle': ['warn', 'never'],
            'no-trailing-spaces': 'warn',
            'eol-last': ['warn', 'always'],
            'no-multiple-empty-lines': ['warn', { 
                max: 2,
                maxEOF: 1
            }],
            
            // ES6
            'prefer-const': 'warn',
            'prefer-arrow-callback': 'warn',
            'arrow-spacing': 'warn',
            'no-var': 'error',
            'object-shorthand': 'warn',
            'prefer-template': 'warn',
            
            // Error Handling
            'no-throw-literal': 'error',
            'prefer-promise-reject-errors': 'error',
            
            // Code Quality
            'complexity': ['warn', 15],
            'max-depth': ['warn', 4],
            'max-lines-per-function': ['warn', { 
                max: 100,
                skipBlankLines: true,
                skipComments: true
            }],
            'max-params': ['warn', 5],
            
            // Import/Export
            'no-duplicate-imports': 'error'
        }
    }
];

