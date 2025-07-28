// modules/ExtensionManager.js

export class ExtensionManager {
    constructor(app) {
        this.app = app;
        this.extensions = [];
        this.isLoading = false;
    }

    async loadExtensions() {
        if (this.isLoading) {
            console.log('Extensions already loading, skipping...');
            return;
        }

        this.isLoading = true;
        
        try {
            if (window.electronAPI && window.electronAPI.getExtensions) {
                console.log('Loading extensions from Electron API...');
                const extensionsData = await window.electronAPI.getExtensions();
                
                if (Array.isArray(extensionsData)) {
                    this.extensions = extensionsData;
                    console.log('Loaded extensions:', this.extensions.length);
                    
                    // Render buttons after loading
                    this.renderExtensionButtons();
                } else {
                    console.warn('Invalid extensions data received:', extensionsData);
                    this.extensions = [];
                }
            } else {
                console.warn('Electron API not available for extensions');
                this.extensions = [];
            }
        } catch (error) {
            console.error('Failed to load extensions:', error);
            this.extensions = [];
        } finally {
            this.isLoading = false;
        }
    }

    renderExtensionButtons() {
        const container = document.getElementById('extensionActions');
        if (!container) {
            console.warn('Extension actions container not found');
            return;
        }
        
        console.log('Rendering extension buttons for', this.extensions.length, 'extensions');
        
        // Clear existing buttons
        container.innerHTML = '';
        
        if (this.extensions.length === 0) {
            console.log('No extensions to render');
            return;
        }
        
        this.extensions.forEach(extension => {
            try {
                console.log('Rendering button for extension:', extension.name);
                
                // Check if extension has popup (required for button)
                const hasPopup = extension.popup || 
                                (extension.manifest && extension.manifest.browser_action && extension.manifest.browser_action.default_popup) ||
                                (extension.manifest && extension.manifest.action && extension.manifest.action.default_popup);
                
                if (!hasPopup) {
                    console.log('Extension', extension.name, 'has no popup, skipping button');
                    return;
                }
                
                const button = document.createElement('button');
                button.className = 'extension-btn';
                button.title = extension.name + (extension.version ? ` v${extension.version}` : '');
                button.setAttribute('data-extension-id', extension.id);
                
                // Get icon path
                let iconPath = this.getExtensionIconPath(extension);
                
                if (iconPath) {
                    const img = document.createElement('img');
                    img.src = iconPath;
                    img.width = 16;
                    img.height = 16;
                    img.alt = extension.name;
                    img.style.display = 'block';
                    
                    // Fallback for broken images
                    img.onerror = function() {
                        this.onerror = null;
                        this.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiM2NjYiLz48dGV4dCB4PSI4IiB5PSIxMiIgZm9udC1zaXplPSIxMiIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RTwvdGV4dD48L3N2Zz4=';
                    };
                    
                    button.appendChild(img);
                } else {
                    // Text fallback if no icon
                    button.textContent = extension.name.charAt(0).toUpperCase();
                    button.style.fontSize = '12px';
                    button.style.fontWeight = 'bold';
                }
                
                // Add click handler
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('Extension button clicked:', extension.id);
                    this.showExtensionPopup(extension.id);
                });
                
                container.appendChild(button);
                console.log('Successfully added button for extension:', extension.name);
                
            } catch (error) {
                console.error('Error rendering button for extension:', extension.name, error);
            }
        });
        
        console.log('Extension buttons rendering complete. Total buttons:', container.children.length);
    }

    getExtensionIconPath(extension) {
        // First check if extension has a pre-processed icon (base64 data URL)
        if (extension.icon && extension.icon.startsWith('data:')) {
            return extension.icon;
        }
        
        // Check manifest for icon definitions
        let iconRelativePath = null;
        
        if (extension.manifest) {
            // Check standard icons
            if (extension.manifest.icons) {
                const sizes = Object.keys(extension.manifest.icons).map(Number).sort((a, b) => b - a);
                const largestSize = sizes[0];
                if (largestSize) {
                    iconRelativePath = extension.manifest.icons[largestSize];
                }
            }
            // Check browser_action icon
            else if (extension.manifest.browser_action && extension.manifest.browser_action.default_icon) {
                const iconInfo = extension.manifest.browser_action.default_icon;
                if (typeof iconInfo === 'string') {
                    iconRelativePath = iconInfo;
                } else if (typeof iconInfo === 'object') {
                    const sizes = Object.keys(iconInfo).map(Number).sort((a, b) => b - a);
                    const largestSize = sizes[0];
                    if (largestSize) {
                        iconRelativePath = iconInfo[largestSize];
                    }
                }
            }
            // Check action icon (Manifest V3)
            else if (extension.manifest.action && extension.manifest.action.default_icon) {
                const iconInfo = extension.manifest.action.default_icon;
                if (typeof iconInfo === 'string') {
                    iconRelativePath = iconInfo;
                } else if (typeof iconInfo === 'object') {
                    const sizes = Object.keys(iconInfo).map(Number).sort((a, b) => b - a);
                    const largestSize = sizes[0];
                    if (largestSize) {
                        iconRelativePath = iconInfo[largestSize];
                    }
                }
            }
        }
        
        // If we found a relative path, construct the full URL
        if (iconRelativePath && extension.path) {
            // Use file:// protocol for local files
            return `file://${extension.path}/${iconRelativePath}`;
        }
        
        // If extension has an electronId, use chrome-extension protocol
        if (iconRelativePath && extension.electronId) {
            return `chrome-extension://${extension.electronId}/${iconRelativePath}`;
        }
        
        return null;
    }

    async showExtensionPopup(extensionId) {
        console.log('Calling showExtensionPopup for extension:', extensionId);
        
        if (!extensionId) {
            console.error('No extension ID provided');
            return;
        }
        
        try {
            if (!window.electronAPI || !window.electronAPI.showExtensionPopup) {
                console.error('Electron API not available for showing extension popup');
                alert('Extension popup requires Electron environment');
                return;
            }

            // Get current tab URL
            let currentUrl = '';
            if (this.app && this.app.activeTabId) {
                const tab = this.app.getTabs().get(this.app.activeTabId);
                currentUrl = tab ? tab.url : '';
            }
            
            console.log('Showing popup for extension:', extensionId, 'with URL:', currentUrl);
            
            const result = await window.electronAPI.showExtensionPopup(extensionId, currentUrl);
            
            console.log('Received IPC response:', result);
            
            if (!result || !result.success) {
                const errorMsg = result ? result.error : 'Unknown error';
                console.error('Failed to show extension popup:', errorMsg);
                alert(`Failed to show extension popup: ${errorMsg}`);
            } else {
                console.log('Extension popup shown successfully for:', extensionId);
            }
            
        } catch (error) {
            console.error('Error showing extension popup:', error);
            alert(`Error showing extension popup: ${error.message}`);
        }
    }

    async loadExtension() {
        try {
            if (!window.electronAPI || !window.electronAPI.loadExtension) {
                alert('Extension loading requires Electron environment');
                return;
            }
            
            console.log('Loading new extension...');
            const result = await window.electronAPI.loadExtension();
            
            if (result) {
                console.log('Extension loaded successfully:', result);
                
                // Add to local extensions array
                this.extensions.push(result);
                
                // Re-render buttons
                this.renderExtensionButtons();
                
                // Trigger UI update for extensions panel if it's currently open
                if (this.app && this.app.currentPanel === 'extensions') {
                    this.app.uiManager.renderExtensionsPanel();
                }
            } else {
                console.log('Extension loading cancelled or failed');
            }
        } catch (error) {
            console.error('Failed to load extension:', error);
            alert('Failed to load extension: ' + error.message);
        }
    }

    // Get extension by ID
    getExtension(extensionId) {
        return this.extensions.find(ext => ext.id === extensionId);
    }

    // Get all extensions
    getExtensions() {
        return this.extensions;
    }

    // Content Script Management (unchanged from original)
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
            if (!window.electronAPI || !window.electronAPI.getExtensionApiScript) {
                console.warn('Extension API script injection not available');
                return;
            }
            
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

                                    if (!jsContent || jsContent.trim() === '') {
                                        console.warn('Empty or invalid script content for:', jsFile);
                                        continue;
                                    }

                                    console.log(`Injecting ${jsFile} for extension ${extension.id}`);

                                    const injectionCode = `
                                        (function() {
                                            try {
                                                console.log('Injecting content script: ${jsFile}');
                                                
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
                                                    }
                                                }
                                                
                                            } catch (wrapperError) {
                                                console.error('Content script wrapper error for ${jsFile}:', wrapperError);
                                            }
                                        })();
                                    `;

                                    await webview.executeJavaScript(injectionCode);

                                } catch (error) {
                                    console.error('Failed to inject JS:', jsFile, error);
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

    // Debug methods
    debugExtensions() {
        console.log('=== EXTENSION MANAGER DEBUG ===');
        console.log('Extensions loaded:', this.extensions.length);
        console.log('Extensions data:', this.extensions);
        
        const container = document.getElementById('extensionActions');
        console.log('Extension container found:', !!container);
        if (container) {
            console.log('Container children:', container.children.length);
        }
        
        console.log('Electron API available:', !!window.electronAPI);
        console.log('getExtensions method available:', !!(window.electronAPI && window.electronAPI.getExtensions));
        console.log('===============================');
    }
}