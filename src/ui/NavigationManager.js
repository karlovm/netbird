// modules/NavigationManager.js
import { WebviewEvents } from './WebviewEvents.js';

export class NavigationManager {
    constructor(app) {
        this.app = app;
        this.webviewEvents = new WebviewEvents(app);
    }

    navigate(url) {
        if (!this.app.activeTabId) return;

        if (url === 'netbird://welcome' || url === '') {
            this.app.uiManager.showWelcomeScreen();
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

        const tab = this.app.tabManager.tabs.get(this.app.activeTabId);
        if (tab) {
            tab.url = url;
            tab.isLoading = true;
            this.app.uiManager.updateUI(tab);
            this.navigateWebview(this.app.activeTabId, url);
        }
    }

    navigateWebview(tabId, url) {
        let webview = document.getElementById(`webview-${tabId}`);

        if (!webview) {
            webview = this.createWebview(tabId);
            this.setupWebviewListeners(webview, tabId);
        }

        webview.src = url;
        this.showWebview(tabId);
    }

    createWebview(tabId) {
        const webview = document.createElement('webview');
        webview.id = `webview-${tabId}`;

        if (window.electronAPI) {
            const preloadPath = window.electronAPI.getPreloadPath();
            webview.setAttribute('webpreferences', `preload=${preloadPath}, contextIsolation=true, nodeIntegration=false, enableRemoteModule=false, webSecurity=false, allowRunningInsecureContent=true`);
        }

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

        document.getElementById('webviewContainer').appendChild(webview);

        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                this.resizeWebview(webview);
            });
            resizeObserver.observe(document.getElementById('webviewContainer'));
        }

        return webview;
    }

    setupWebviewListeners(webview, tabId) {
        webview.addEventListener('did-start-loading', () => {
            const tab = this.app.tabManager.tabs.get(tabId);
            if (tab) {
                tab.isLoading = true;
                this.app.uiManager.updateUI(tab);
            }
        });

        webview.addEventListener('did-stop-loading', () => {
            const tab = this.app.tabManager.tabs.get(tabId);
            if (tab) {
                tab.isLoading = false;
                tab.title = webview.getTitle() || 'Untitled';
                this.app.uiManager.updateUI(tab);
                this.app.tabManager.updateTabTitle(tabId, tab.title);
            }
            this.resizeWebview(webview);
            this.app.extensionManager.injectContentScripts(webview, webview.getURL());
            
            // Start key event listening after page loads using the new module
            this.webviewEvents.startEventListening(webview, tabId);
        });

        webview.addEventListener('did-navigate', (e) => {
            const tab = this.app.tabManager.tabs.get(tabId);
            if (tab) {
                tab.url = e.url;
                tab.canGoBack = webview.canGoBack();
                tab.canGoForward = webview.canGoForward();
                this.app.uiManager.updateUI(tab);
                this.app.dataManager.addToHistory(e.url, tab.title);
            }
        });

        webview.addEventListener('page-title-updated', (e) => {
            const tab = this.app.tabManager.tabs.get(tabId);
            if (tab) {
                tab.title = e.title;
                this.app.tabManager.updateTabTitle(tabId, e.title);
            }
        });

        webview.addEventListener('page-favicon-updated', (e) => {
            const tab = this.app.tabManager.tabs.get(tabId);
            if (tab && e.favicons && e.favicons.length > 0) {
                tab.favicon = e.favicons[0];
                this.app.tabManager.updateTabFavicon(tabId, tab.favicon);
            }
        });

        // Listen for custom events from injected scripts
        webview.addEventListener('console-message', (e) => {
            if (e.message.includes('netbird-create-tab')) {
                try {
                    const data = JSON.parse(e.message.replace('netbird-create-tab:', ''));
                    if (data.url) {
                        this.app.createNewTab(data.url);
                    }
                } catch (error) {
                    console.error('Failed to parse custom tab creation message:', error);
                }
            }
        });

        // Handle webview destruction
        webview.addEventListener('destroyed', () => {
            this.webviewEvents.stopEventListening(tabId);
        });
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

    goBack() {
        if (this.app.activeTabId) {
            const webview = document.getElementById(`webview-${this.app.activeTabId}`);
            if (webview && webview.canGoBack()) {
                webview.goBack();
            }
        }
    }

    goForward() {
        if (this.app.activeTabId) {
            const webview = document.getElementById(`webview-${this.app.activeTabId}`);
            if (webview && webview.canGoForward()) {
                webview.goForward();
            }
        }
    }

    refresh() {
        if (this.app.activeTabId) {
            const webview = document.getElementById(`webview-${this.app.activeTabId}`);
            if (webview) {
                webview.reload();
            }
        }
    }

    // Clean up method for when tabs are closed
    cleanupTab(tabId) {
        this.webviewEvents.stopEventListening(tabId);
        const webview = document.getElementById(`webview-${tabId}`);
        if (webview) {
            webview.remove();
        }
    }

    // Get all active listeners (for debugging)
    getActiveListeners() {
        return this.webviewEvents.getActiveListeners();
    }

    // Debug method to check listener states
    debugListeners() {
        this.webviewEvents.debugListeners();
    }
}