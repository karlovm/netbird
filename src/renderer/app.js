// Main app entry point - app.js
import { TabManager } from '../tabs/TabManager.js';
import { NavigationManager } from '../ui/NavigationManager.js';
import { ExtensionManager } from '../modules/ExtensionManager.js';
import { UIManager } from '../ui/UIManager.js';
import { DataManager } from '../utils/DataManager.js';
import { EventManager } from '../modules/EventManager.js';

class NetBirdApp {
    constructor() {
        // Initialize managers
        this.tabManager = new TabManager(this);
        this.navigationManager = new NavigationManager(this);
        this.extensionManager = new ExtensionManager(this);
        this.uiManager = new UIManager(this);
        this.dataManager = new DataManager(this);
        this.eventManager = new EventManager(this);
         this.setupMessageHandlers();
        // App state
        this.activeTabId = null;
        this.currentPanel = null;

        this.init();
    }

    async init() {
        await this.dataManager.loadData();
        this.eventManager.bindEvents();
        this.uiManager.setupWindowControls();
        this.uiManager.setupResizer();
        this.tabManager.createInitialTab();
        this.extensionManager.renderExtensionButtons();
    }

    
    setupMessageHandlers() {
        // Listen for postMessage from webviews
        window.addEventListener('message', (event) => {
            // Security check - make sure message is from a webview
            if (event.source && event.data && event.data.type === 'CREATE_NEW_TAB') {
                alert(1233)
                this.createNewTab(event.data.url);
            }
        });

        // Listen for IPC messages from main process
          if (window.electronAPI && window.electronAPI.onCreateNewTab) {
            window.electronAPI.onCreateNewTab((event, data) => {
                console.log('Received IPC create-new-tab:', data);
                if (data && data.url && data.url.length > 0) {
                    this.createNewTab(data.url);
                }
            });
        }

    }

    

    // Expose manager methods for backward compatibility
    createNewTab(url) { return this.tabManager.createNewTab(url); }
    closeTab(tabId) { return this.tabManager.closeTab(tabId); }
    switchToTab(tabId) { return this.tabManager.switchToTab(tabId); }
    navigate(url) { return this.navigationManager.navigate(url); }
    goBack() { return this.navigationManager.goBack(); }
    goForward() { return this.navigationManager.goForward(); }
    refresh() { return this.navigationManager.refresh(); }
    togglePanel(panelType) { return this.uiManager.togglePanel(panelType); }
    bookmarkCurrentPage() { return this.dataManager.bookmarkCurrentPage(); }
    loadExtension() { return this.extensionManager.loadExtension(); }
    showExtensionPopup(extensionId) { return this.extensionManager.showExtensionPopup(extensionId); }
    
    // Getter methods for managers to access shared data
    getTabs() { return this.tabManager.tabs; }
    getHistory() { return this.dataManager.history; }
    getBookmarks() { return this.dataManager.bookmarks; }
    getExtensions() { return this.extensionManager.extensions; }
}

// Global app instance
window.app = new NetBirdApp();

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.code) {
            case 'KeyT':
                e.preventDefault();
                window.app.createNewTab();
                break;
            case 'KeyW':
                e.preventDefault();
                if (window.app.activeTabId) {
                    window.app.closeTab(window.app.activeTabId);
                }
                break;
            case 'KeyR':
                e.preventDefault();
                window.app.refresh();
                break;
            case 'KeyL':
                e.preventDefault();
                document.getElementById('urlInput').focus();
                document.getElementById('urlInput').select();
                break;
            case 'KeyD':
                e.preventDefault();
                window.app.bookmarkCurrentPage();
                break;
        }
    }
});

// Global functions for HTML onclick handlers
window.createNewTab = (url) => window.app.createNewTab(url);
window.showHistory = () => window.app.togglePanel('history');