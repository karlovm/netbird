// modules/ExtensionManager.js

export class ExtensionManager {
    constructor(app) {
        this.app = app;
        this.extensions = [];
    }

    async loadExtensions() {
        try {
            if (window.electronAPI) {
                this.extensions = await window.electronAPI.getExtensions();
            } else {
                this.extensions = [];
                console.warn('Electron API not available for extensions');
            }
        } catch (error) {
            console.error('Failed to load extensions:', error);
            this.extensions = [];
        }
    }

    renderExtensionButtons() {
        const container = document.getElementById('extensionActions');
        if (!container) return;
        
        container.innerHTML = '';
        this.extensions.forEach(extension => {
            if (extension.icon || extension.manifest.browser_action?.default_icon) {
                const button = document.createElement('button');
                button.className = 'extension-btn';
                button.title = extension.name;
                
                let iconPath = extension.icon || extension.manifest.browser_action?.default_icon;
                if (typeof iconPath === 'object') {
                    const sizes = Object.keys(iconPath).map(Number).sort((a, b) => b - a);
                    iconPath = iconPath[sizes[0]];
                }
                
                const iconUrl = extension.icon ? extension.icon : `file://${extension.path}/${iconPath}`;
                button.innerHTML = `
                    <img src="${iconUrl}" 
                        width="16" height="16" alt="${extension.name}"
                        onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiM2NjYiLz48L3N2Zz4='">
                `;
                
                button.addEventListener('click', () => {
                    this.showExtensionPopup(extension.id);
                });
                
                container.appendChild(button);
            }
        });
    }

    async showExtensionPopup(extensionId) {
        console.log('Calling showExtensionPopup for extension:', extensionId);
        try {
            if (window.electronAPI) {
                const tab = this.app.getTabs().get(this.app.activeTabId);
                const currentUrl = tab ? tab.url : '';
                const result = await window.electronAPI.showExtensionPopup(extensionId, currentUrl);
                
                console.log('Received IPC response:', result);
                if (!result.success) {
                    console.error('Failed to show extension popup:', result.error);
                    alert(`Failed to show extension popup: ${result.error}`);
                } else {
                    console.log('Extension popup shown successfully for:', extensionId);
                }
            } else {
                console.warn('Electron API not available for showing extension popup');
                alert('Extension popup requires Electron environment');
            }
        } catch (error) {
            console.error('Error showing extension popup:', error);
            alert(`Error showing extension popup: ${error.message}`);
        }
    }

    async loadExtension() {
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.loadExtension();
                if (result) {
                    this.extensions.push(result);
                    this.renderExtensionButtons();
                    // Trigger UI update for extensions panel if it's currently open
                    if (this.app.currentPanel === 'extensions') {
                        this.app.uiManager.renderExtensionsPanel();
                    }
                }
            } else {
                alert('Extension loading requires Electron environment');
            }
        } catch (error) {
            console.error('Failed to load extension:', error);
            alert('Failed to load extension: ' + error.message);
        }
    }

    // Content Script Management
    matchesUrl(url, patterns) {
        for (const pattern of patterns) {
            if (this.testPattern(url, pattern)) {
                return true;
            }
        }
        return false;
    }

    testPattern(url, pattern) {
        let regex = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        if (pattern.includes('://')) {
            regex = '^' + regex + '$';
        }
        try {
            return new RegExp(regex).test(url);
        } catch (error) {
            console.error('Invalid pattern:', pattern, error);
            return false;
        }
    }

    async injectExtensionAPIs(webview, extension, currentUrl) {
        try {
            const apiScript = await window.electronAPI.getExtensionApiScript(extension.id, currentUrl);
            await webview.executeJavaScript(apiScript);
        } catch (error) {
            console.error('Failed to inject APIs for extension:', extension.id, error);
        }
    }

    async injectContentScripts(webview, url) {
        try {
            for (const extension of this.extensions) {
                if (!extension.enabled) continue;

                const contentScripts = extension.manifest.content_scripts || [];

                for (const script of contentScripts) {
                    if (this.matchesUrl(url, script.matches)) {
                        // Inject CSS files
                        if (script.css) {
                            for (const cssFile of script.css) {
                                try {
                                    const cssContent = await window.electronAPI.getExtensionFileContent(extension.id, cssFile);
                                    await webview.insertCSS(cssContent);
                                } catch (error) {
                                    console.error('Failed to inject CSS:', cssFile, error);
                                }
                            }
                        }

                        // Inject JavaScript files
                        if (script.js) {
                            await this.injectExtensionAPIs(webview, extension, url);
                            for (const jsFile of script.js) {
                                try {
                                    const jsContent = await window.electronAPI.getExtensionFileContent(extension.id, jsFile);

                                    // Validate content before injection
                                    if (!jsContent || jsContent.trim() === '') {
                                        console.warn('Empty or invalid script content for:', jsFile);
                                        continue;
                                    }

                                    console.log(`Attempting to inject ${jsFile} for extension ${extension.id}`);

                                    // Create robust injection method
                                    const injectionCode = `
                                        (function() {
                                            try {
                                                console.log('Injecting content script: ${jsFile}');
                                                
                                                // Check if DOM is ready
                                                if (document.readyState === 'loading') {
                                                    document.addEventListener('DOMContentLoaded', function() {
                                                        executeContentScript();
                                                    });
                                                } else {
                                                    executeContentScript();
                                                }
                                                
                                                function executeContentScript() {
                                                    try {
                                                        ${jsContent}
                                                        console.log('Successfully executed content script: ${jsFile}');
                                                    } catch (scriptError) {
                                                        console.error('Content script execution error in ${jsFile}:', scriptError);
                                                        console.error('Error stack:', scriptError.stack);
                                                    }
                                                }
                                                
                                            } catch (wrapperError) {
                                                console.error('Content script wrapper error for ${jsFile}:', wrapperError);
                                                console.error('Wrapper error stack:', wrapperError.stack);
                                            }
                                        })();
                                    `;

                                    await webview.executeJavaScript(injectionCode);
                                    console.log('Successfully injected wrapper for:', jsFile);

                                } catch (error) {
                                    console.error('Failed to inject JS:', jsFile, error);
                                    console.error('Extension:', extension.id);
                                    console.error('URL:', url);

                                    // Enhanced error reporting
                                    if (error.message.includes('Script failed to execute')) {
                                        console.error('Script execution failed. Check for:');
                                        console.error('- Syntax errors');
                                        console.error('- Missing dependencies');
                                        console.error('- DOM elements that don\'t exist yet');
                                        console.error('- Async operations without proper handling');
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to inject content scripts:', error);
        }
    }

    // Alternative safe injection method
    async injectContentScriptsSafe(webview, url) {
        try {
            for (const extension of this.extensions) {
                if (!extension.enabled) continue;

                const contentScripts = extension.manifest.content_scripts || [];

                for (const script of contentScripts) {
                    if (this.matchesUrl(url, script.matches)) {
                        if (script.js) {
                            await this.injectExtensionAPIs(webview, extension, url);
                            for (const jsFile of script.js) {
                                try {
                                    const jsContent = await window.electronAPI.getExtensionFileContent(extension.id, jsFile);

                                    // Validate content
                                    if (!jsContent || jsContent.trim() === '') {
                                        console.warn('Empty script content for:', jsFile);
                                        continue;
                                    }

                                    // Test script syntax before injection
                                    try {
                                        new Function(jsContent);
                                        console.log('Script syntax validation passed for:', jsFile);
                                    } catch (syntaxError) {
                                        console.error('Script syntax error in', jsFile, ':', syntaxError);
                                        continue;
                                    }

                                    // Safe injection with isolated scope
                                    const safeInjectionCode = `
                                        (function() {
                                            'use strict';
                                            
                                            // Create isolated scope for content script
                                            const contentScriptScope = {
                                                window: window,
                                                document: document,
                                                console: console,
                                                setTimeout: setTimeout,
                                                setInterval: setInterval,
                                                clearTimeout: clearTimeout,
                                                clearInterval: clearInterval
                                            };
                                            
                                            // Execute in try-catch with detailed error reporting
                                            try {
                                                const executeScript = function() {
                                                    ${jsContent}
                                                };
                                                
                                                // Wait for DOM if needed
                                                if (document.readyState === 'loading') {
                                                    document.addEventListener('DOMContentLoaded', executeScript);
                                                } else {
                                                    executeScript();
                                                }
                                                
                                            } catch (error) {
                                                console.error('Content script error in ${jsFile}:', {
                                                    message: error.message,
                                                    stack: error.stack,
                                                    name: error.name,
                                                    line: error.lineNumber,
                                                    column: error.columnNumber
                                                });
                                            }
                                        })();
                                    `;

                                    await webview.executeJavaScript(safeInjectionCode);
                                    console.log('Successfully injected:', jsFile);

                                } catch (error) {
                                    console.error('Injection failed for:', jsFile, error);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Content script injection failed:', error);
        }
    }

    // Debug and utility methods
    async debugContentScript(extensionId, jsFile) {
        try {
            const jsContent = await window.electronAPI.getExtensionFileContent(extensionId, jsFile);
            console.log('=== DEBUG CONTENT SCRIPT ===');
            console.log('Extension:', extensionId);
            console.log('File:', jsFile);
            console.log('Content length:', jsContent.length);
            console.log('Content preview:', jsContent.substring(0, 500));
            console.log('Contains import:', /\bimport\b/.test(jsContent));
            console.log('Contains export:', /\bexport\b/.test(jsContent));
            console.log('Contains require:', /\brequire\b/.test(jsContent));
            console.log('Contains chrome.*:', /chrome\.\w+/.test(jsContent));
            console.log('Contains browser.*:', /browser\.\w+/.test(jsContent));
            console.log('==============================');

            // Try to parse as JavaScript to check for syntax errors
            try {
                new Function(jsContent);
                console.log('✓ Script syntax is valid');
            } catch (syntaxError) {
                console.error('✗ Script syntax error:', syntaxError);
            }

            return jsContent;
        } catch (error) {
            console.error('Failed to debug content script:', error);
            return null;
        }
    }

    enableConsoleDebugging(webview) {
        webview.addEventListener('console-message', (e) => {
            console.log(`[WebView Console] [${e.level}] ${e.message}`);
            if (e.sourceId) {
                console.log(`[WebView Console] Source: ${e.sourceId}:${e.line}`);
            }
        });

        webview.addEventListener('dom-ready', () => {
            console.log('WebView DOM ready');
        });
    }

    async checkContentScriptDependencies(webview, extensionId) {
        try {
            const checkCode = `
                (function() {
                    const report = {
                        chrome: typeof chrome !== 'undefined',
                        browser: typeof browser !== 'undefined',
                        document: typeof document !== 'undefined',
                        window: typeof window !== 'undefined',
                        jQuery: typeof $ !== 'undefined' || typeof jQuery !== 'undefined',
                        readyState: document.readyState,
                        url: window.location.href,
                        timestamp: Date.now()
                    };
                    
                    console.log('Content script environment check for ${extensionId}:', report);
                    return report;
                })();
            `;

            const result = await webview.executeJavaScript(checkCode);
            console.log('Environment check result:', result);
            return result;
        } catch (error) {
            console.error('Failed to check content script dependencies:', error);
            return null;
        }
    }
}