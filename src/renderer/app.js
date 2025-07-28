// Main app entry point - app.js
import { TabManager } from '../tabs/TabManager.js';
import { NavigationManager } from '../ui/NavigationManager.js';
import { ExtensionManager } from '../modules/ExtensionManager.js';
import { UIManager } from '../ui/UIManager.js';
import { DataManager } from '../utils/DataManager.js';
import { EventManager } from '../modules/EventManager.js';

class NetBirdApp {
    constructor() {
        console.log('Initializing NetBird App...');
        
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
        console.log('Starting app initialization...');
        
        try {
            // Load data first
            await this.dataManager.loadData();
            
  
            
            // Create initial tab
            this.tabManager.createInitialTab();
            
            // Load and render extensions (this was the missing piece!)
            console.log('Loading extensions...');
            await this.extensionManager.loadExtensions();
              // Bind events
            this.eventManager.bindEvents();
            
            console.log('App initialization complete');
            
        } catch (error) {
            console.error('Error during app initialization:', error);
        }
    }

    setupMessageHandlers() {
        // Listen for postMessage from webviews
        window.addEventListener('message', (event) => {
            // Security check - make sure message is from a webview
            if (event.source && event.data && event.data.type === 'CREATE_NEW_TAB') {
                console.log('Received CREATE_NEW_TAB message:', event.data);
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
    createNewTab(url) { 
        return this.tabManager.createNewTab(url); 
    }
    
    closeTab(tabId) { 
        return this.tabManager.closeTab(tabId); 
    }
    
    switchToTab(tabId) { 
        return this.tabManager.switchToTab(tabId); 
    }
    
    navigate(url) { 
        return this.navigationManager.navigate(url); 
    }
    
    goBack() { 
        return this.navigationManager.goBack(); 
    }
    
    goForward() { 
        return this.navigationManager.goForward(); 
    }
    
    refresh() { 
        return this.navigationManager.refresh(); 
    }
    
    togglePanel(panelType) { 
        return this.uiManager.togglePanel(panelType); 
    }
    
    bookmarkCurrentPage() { 
        return this.dataManager.bookmarkCurrentPage(); 
    }
    
    loadExtension() { 
        return this.extensionManager.loadExtension(); 
    }
    
    showExtensionPopup(extensionId) { 
        return this.extensionManager.showExtensionPopup(extensionId); 
    }
    
    // Getter methods for managers to access shared data
    getTabs() { 
        return this.tabManager.tabs; 
    }
    
    getHistory() { 
        return this.dataManager.history; 
    }
    
    getBookmarks() { 
        return this.dataManager.bookmarks; 
    }
    
    getExtensions() { 
        return this.extensionManager.extensions; 
    }

    // Debug method to help troubleshoot extension issues
    debugExtensions() {
        console.log('=== APP EXTENSION DEBUG ===');
        console.log('Extension Manager:', this.extensionManager);
        console.log('Extensions loaded:', this.extensionManager.extensions.length);
        
        // Check if extension container exists
        const container = document.getElementById('extensionActions');
        console.log('Extension container found:', !!container);
        if (!container) {
            console.error('Extension container with ID "extensionActions" not found in DOM!');
            console.log('Available elements with class "extension":', document.querySelectorAll('[class*="extension"]'));
            console.log('Available elements with id containing "extension":', document.querySelectorAll('[id*="extension"]'));
        }
        
        // Test extension manager debug
        this.extensionManager.debugExtensions();
        console.log('==========================');
    }
}

// Global app instance
window.app = new NetBirdApp();

// Add global debug function
window.debugExtensions = () => window.app.debugExtensions();

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
                const urlInput = document.getElementById('urlInput');
                if (urlInput) {
                    urlInput.focus();
                    urlInput.select();
                }
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

// Add some CSS for extension buttons if not already present
const addExtensionButtonStyles = () => {
    const styleId = 'extension-button-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .extension-btn {
            background: none;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 4px;
            margin: 0 2px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        
        .extension-btn:hover {
            opacity: 1;
            border-color: #999;
        }
        
        .extension-btn img {
            width: 16px;
            height: 16px;
            display: block;
        }
        
        #extensionActions {
            display: flex;
            align-items: center;
            gap: 2px;
        }
    `;
    document.head.appendChild(style);
};

// Add styles when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addExtensionButtonStyles);
} else {
    addExtensionButtonStyles();
}