// renderer\app.js

class NetBirdApp {
    constructor() {
        this.tabs = new Map();
        this.activeTabId = null;
        this.tabCounter = 0;
        this.history = [];
        this.bookmarks = [];
        this.extensions = [];
        this.currentPanel = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadData();
        this.createInitialTab();
        this.setupResizer();
        this.setupWindowControls();
    }

    setupWindowControls() {
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            window.electronAPI.minimizeWindow();
        });
        document.getElementById('maximizeBtn').addEventListener('click', () => {
            window.electronAPI.maximizeWindow();
        });
        document.getElementById('closeBtn').addEventListener('click', () => {
            window.electronAPI.closeWindow();
        });
    }

    setupResizer() {
        const resizer = document.querySelector('.resizer');
        let isResizing = false;

        resizer.addEventListener('mousedown', () => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const sidebar = document.querySelector('.sidebar');
            const newWidth = document.body.clientWidth - e.clientX;
            sidebar.style.width = `${Math.max(50, Math.min(500, newWidth))}px`;
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.cursor = 'default';
        });
    }

    bindEvents() {
        document.getElementById('newTabBtn').addEventListener('click', () => {
            this.createNewTab();
        });

        document.getElementById('backBtn').addEventListener('click', () => {
            this.goBack();
        });

        document.getElementById('forwardBtn').addEventListener('click', () => {
            this.goForward();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refresh();
        });

        const urlInput = document.getElementById('urlInput');
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigate(urlInput.value);
            }
        });

        document.getElementById('historyBtn').addEventListener('click', () => {
            this.togglePanel('history');
        });

        document.getElementById('bookmarksBtn').addEventListener('click', () => {
            this.togglePanel('bookmarks');
        });

        document.getElementById('extensionsBtn').addEventListener('click', () => {
            this.togglePanel('extensions');
        });

        if (window.electronAPI) {
            window.electronAPI.onCreateNewTab(() => {
                this.createNewTab();
            });
        }
    }

    async loadData() {
        try {
            if (window.electronAPI) {
                this.history = await window.electronAPI.getHistory();
                this.bookmarks = await window.electronAPI.getBookmarks();
                this.extensions = await window.electronAPI.getExtensions();
                this.renderExtensionButtons();
            } else {
                this.history = [];
                this.bookmarks = [];
                this.extensions = [];
                console.warn('Electron API not available, running in fallback mode');
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            this.history = [];
            this.bookmarks = [];
            this.extensions = [];
        }
    }

    createInitialTab() {
        this.createNewTab('https://www.google.com');
    }

    createNewTab(url = 'https://www.google.com') {
        const tabId = `tab-${++this.tabCounter}`;
        const tab = {
            id: tabId,
            url: url,
            title: 'New Tab',
            favicon: null,
            canGoBack: false,
            canGoForward: false,
            isLoading: false
        };

        this.tabs.set(tabId, tab);
        this.renderTab(tab);
        this.switchToTab(tabId);

        if (url === 'netbird://welcome') {
            this.showWelcomeScreen();
        } else {
            this.navigate(url);
        }
    }

    renderTab(tab) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab-item';
        tabElement.dataset.tabId = tab.id;
        tabElement.innerHTML = `
    <img class="tab-favicon" src="${tab.favicon || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 16 16%22><circle cx=%228%22 cy=%228%22 r=%226%22 fill=%22%23999%22/></svg>'}" alt="">
    <span class="tab-title">${tab.title}</span>
    <button class="tab-close" onclick="app.closeTab('${tab.id}')">
        <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" stroke-width="2"/>
        </svg>
    </button>
`;

        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchToTab(tab.id);
            }
        });

        document.getElementById('tabsContainer').appendChild(tabElement);
    }

    switchToTab(tabId) {
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.classList.remove('active');
        });

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.classList.add('active');
        }

        this.activeTabId = tabId;
        const tab = this.tabs.get(tabId);
        if (tab) {
            this.updateUI(tab);
            this.showWebview(tabId);

            setTimeout(() => {
                const webview = document.getElementById(`webview-${tabId}`);
                if (webview) {
                    this.resizeWebview(webview);
                }
            }, 100);
        }
    }

    closeTab(tabId) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.remove();
        }

        const webview = document.getElementById(`webview-${tabId}`);
        if (webview) {
            webview.remove();
        }

        this.tabs.delete(tabId);

        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[0]);
            } else {
                this.showWelcomeScreen();
            }
        }
    }

    navigate(url) {
        if (!this.activeTabId) return;

        if (url === 'netbird://welcome' || url === '') {
            this.showWelcomeScreen();
            return;
        }

        url = url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
            }
        }

        const tab = this.tabs.get(this.activeTabId);
        if (tab) {
            tab.url = url;
            tab.isLoading = true;
            this.updateUI(tab);
            this.navigateWebview(this.activeTabId, url);
        }
    }

    navigateWebview(tabId, url) {
        let webview = document.getElementById(`webview-${tabId}`);

        if (!webview) {
            webview = document.createElement('webview');
            webview.id = `webview-${tabId}`;
            const preloadPath = window.electronAPI.getPreloadPath();  // Get path from exposed API
            webview.setAttribute('webpreferences', `preload=${preloadPath}, contextIsolation=true, nodeIntegration=false, enableRemoteModule=false, webSecurity=false, allowRunningInsecureContent=true`);
            webview.setAttribute('allowpopups', 'true');
            webview.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                border: none !important;
                outline: none !important;
                background: white;
            `;

            webview.setAttribute('allowpopups', 'true');


            webview.addEventListener('did-stop-loading', () => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.isLoading = false;
                    tab.title = webview.getTitle() || 'Untitled';
                    this.updateUI(tab);
                    this.updateTabTitle(tabId, tab.title);
                }
                this.resizeWebview(webview);
                this.injectContentScripts(webview, webview.getURL());
            });

            webview.addEventListener('dom-ready', () => {
                webview.executeJavaScript(`
                    document.documentElement.style.height = '100vh';
                    document.body.style.height = '100vh';
                    document.body.style.margin = '0';
                    document.body.style.padding = '0';
                    document.body.style.overflow = 'auto';
                `).catch(err => console.log('Could not execute sizing script:', err));
            });

            webview.addEventListener('did-start-loading', () => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.isLoading = true;
                    this.updateUI(tab);
                }
            });

            webview.addEventListener('did-stop-loading', () => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.isLoading = false;
                    tab.title = webview.getTitle() || 'Untitled';
                    this.updateUI(tab);
                    this.updateTabTitle(tabId, tab.title);
                }
                this.resizeWebview(webview);
            });

            webview.addEventListener('did-navigate', (e) => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.url = e.url;
                    tab.canGoBack = webview.canGoBack();
                    tab.canGoForward = webview.canGoForward();
                    this.updateUI(tab);
                    this.addToHistory(e.url, tab.title);
                }
            });

            webview.addEventListener('page-title-updated', (e) => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.title = e.title;
                    this.updateTabTitle(tabId, e.title);
                }
            });

            webview.addEventListener('page-favicon-updated', (e) => {
                const tab = this.tabs.get(tabId);
                if (tab && e.favicons && e.favicons.length > 0) {
                    tab.favicon = e.favicons[0];
                    this.updateTabFavicon(tabId, tab.favicon);
                }
            });

            if (window.ResizeObserver) {
                const resizeObserver = new ResizeObserver(() => {
                    this.resizeWebview(webview);
                });
                resizeObserver.observe(document.getElementById('webviewContainer'));
            }

            document.getElementById('webviewContainer').appendChild(webview);
        }

        webview.src = url;
        this.showWebview(tabId);
    }

    resizeWebview(webview) {
        if (webview && webview.style.display !== 'none') {
            const container = document.getElementById('webviewContainer');
            const rect = container.getBoundingClientRect();
            webview.style.width = rect.width + 'px';
            webview.style.height = rect.height + 'px';
            setTimeout(() => {
                try {
                    webview.executeJavaScript(`
                        window.dispatchEvent(new Event('resize'));
                    `).catch(err => console.log('Could not dispatch resize event:', err));
                } catch (err) {
                    console.log('Could not execute resize script:', err);
                }
            }, 100);
        }
    }

    showWebview(tabId) {
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.display = 'none';
        });
        document.getElementById('welcomeScreen').style.display = 'none';
        const webview = document.getElementById(`webview-${tabId}`);
        if (webview) {
            webview.style.display = 'flex';
            setTimeout(() => {
                this.resizeWebview(webview);
            }, 50);
        }
    }

    showWelcomeScreen() {
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.display = 'none';
        });
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.getElementById('urlInput').value = '';
        this.updateNavigationButtons(false, false);
    }

    updateUI(tab) {
        document.getElementById('urlInput').value = tab.url === 'netbird://welcome' ? '' : tab.url;
        this.updateNavigationButtons(tab.canGoBack, tab.canGoForward);
        const container = document.getElementById('webviewContainer');
        const existingIndicator = container.querySelector('.loading-indicator');
        if (tab.isLoading && !existingIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'loading-indicator';
            container.appendChild(indicator);
        } else if (!tab.isLoading && existingIndicator) {
            existingIndicator.remove();
        }
    }

    updateNavigationButtons(canGoBack, canGoForward) {
        document.getElementById('backBtn').disabled = !canGoBack;
        document.getElementById('forwardBtn').disabled = !canGoForward;
    }

    updateTabTitle(tabId, title) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-title`);
        if (tabElement) {
            tabElement.textContent = title || 'Untitled';
        }
    }

    updateTabFavicon(tabId, favicon) {
        const faviconElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-favicon`);
        if (faviconElement && favicon) {
            faviconElement.src = favicon;
        }
    }

    goBack() {
        if (this.activeTabId) {
            const webview = document.getElementById(`webview-${this.activeTabId}`);
            if (webview && webview.canGoBack()) {
                webview.goBack();
            }
        }
    }

    goForward() {
        if (this.activeTabId) {
            const webview = document.getElementById(`webview-${this.activeTabId}`);
            if (webview && webview.canGoForward()) {
                webview.goForward();
            }
        }
    }

    refresh() {
        if (this.activeTabId) {
            const webview = document.getElementById(`webview-${this.activeTabId}`);
            if (webview) {
                webview.reload();
            }
        }
    }

    async addToHistory(url, title) {
        const entry = {
            url: url,
            title: title || 'Untitled',
            timestamp: Date.now()
        };
        this.history.unshift(entry);
        if (this.history.length > 1000) {
            this.history.pop();
        }
        try {
            if (window.electronAPI) {
                await window.electronAPI.addHistory(entry);
            }
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    togglePanel(panelType) {
        const panel = document.getElementById('sidebarPanel');
        if (this.currentPanel === panelType) {
            panel.classList.remove('active');
            this.currentPanel = null;
            return;
        }
        this.currentPanel = panelType;
        panel.classList.add('active');
        switch (panelType) {
            case 'history':
                this.renderHistoryPanel();
                break;
            case 'bookmarks':
                this.renderBookmarksPanel();
                break;
            case 'extensions':
                this.renderExtensionsPanel();
                break;
        }
    }

    renderHistoryPanel() {
        const panel = document.getElementById('sidebarPanel');
        panel.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); font-weight: 600;">
                History
            </div>
            <div class="panel-content">
                ${this.history.slice(0, 50).map(entry => `
                    <div class="panel-item" onclick="app.navigate('${entry.url}')">
                        <div class="panel-item-title">${entry.title}</div>
                        <div class="panel-item-url">${entry.url}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderBookmarksPanel() {
        const panel = document.getElementById('sidebarPanel');
        panel.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); font-weight: 600;">
                Bookmarks
            </div>
            <div class="panel-content">
                ${this.bookmarks.map(bookmark => `
                    <div class="panel-item" onclick="app.navigate('${bookmark.url}')">
                        <div class="panel-item-title">${bookmark.title}</div>
                        <div class="panel-item-url">${bookmark.url}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderExtensionsPanel() {
        const panel = document.getElementById('sidebarPanel');
        panel.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); font-weight: 600;">
                Extensions
            </div>
            <div class="panel-content">
                ${this.extensions.map(ext => `
                    <div class="panel-item">
                        <div class="panel-item-title">${ext.name}</div>
                        <div class="panel-item-url">${ext.description}</div>
                    </div>
                `).join('')}
                <div class="panel-item" onclick="app.loadExtension()" style="color: var(--primary-color);">
                    <div class="panel-item-title">+ Load Extension</div>
                </div>
            </div>
        `;
    }

    renderExtensionButtons() {
        const container = document.getElementById('extensionActions');
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
                const tab = this.tabs.get(this.activeTabId);
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

    // Add these methods
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
                                    console.log('Script content preview:', jsContent.substring(0, 300));

                                    // Create a more robust injection method
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

                                    // Try to get more details about the error
                                    if (error.message.includes('Script failed to execute')) {
                                        console.error('This usually means there\'s a syntax error or runtime error in the script');
                                        console.error('Consider checking the content script for:');
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

    // Alternative method using try-catch for script validation
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

                                    // Use a more careful injection approach
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

    // Debug method to inspect what's actually in the content script
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

    // Method to enable console message forwarding from webview
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

    // Method to check if content script dependencies are available
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
    async loadExtension() {
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.loadExtension();
                if (result) {
                    this.extensions.push(result);
                    this.renderExtensionButtons();
                    this.renderExtensionsPanel();
                }
            } else {
                alert('Extension loading requires Electron environment');
            }
        } catch (error) {
            console.error('Failed to load extension:', error);
            alert('Failed to load extension: ' + error.message);
        }
    }

    async bookmarkCurrentPage() {
        if (!this.activeTabId) return;
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.url !== 'netbird://welcome') {
            const bookmark = {
                url: tab.url,
                title: tab.title,
                timestamp: Date.now()
            };
            this.bookmarks.push(bookmark);
            try {
                if (window.electronAPI) {
                    await window.electronAPI.addBookmark(bookmark);
                }
            } catch (error) {
                console.error('Failed to save bookmark:', error);
            }
        }
    }
}

function createNewTab(url) {
    app.createNewTab(url);
}

function showHistory() {
    app.togglePanel('history');
}

const app = new NetBirdApp();

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 't':
                e.preventDefault();
                app.createNewTab();
                break;
            case 'w':
                e.preventDefault();
                if (app.activeTabId) {
                    app.closeTab(app.activeTabId);
                }
                break;
            case 'r':
                e.preventDefault();
                app.refresh();
                break;
            case 'l':
                e.preventDefault();
                document.getElementById('urlInput').focus();
                document.getElementById('urlInput').select();
                break;
            case 'd':
                e.preventDefault();
                app.bookmarkCurrentPage();
                break;
        }
    }
});