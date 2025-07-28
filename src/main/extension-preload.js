// extension-preload.js

const { contextBridge, ipcRenderer } = require('electron');

console.log('Extension preload script executing...');

// Get extension initialization data synchronously before any scripts load
let extensionData = null;
let currentUrl = '';

try {
    // Use synchronous IPC to get extension data immediately
    const initData = ipcRenderer.sendSync('get-popup-init-data');
    if (initData) {
        extensionData = initData.extension;
        currentUrl = initData.currentUrl || 'about:blank';
        console.log('Preload: Received extension data for:', extensionData?.id);
        console.log('Preload: Current URL:', currentUrl);
    }
} catch (error) {
    console.error('Preload: Failed to get popup init data:', error);
    currentUrl = 'about:blank';
}

// Helper functions for URL parsing
function getHostnameFromUrl(url) {
    try {
        if (!url || url === 'about:blank') return '';
        const urlObj = new URL(url);
        return urlObj.hostname || '';
    } catch (error) {
        return '';
    }
}

function getDomainFromUrl(url) {
    try {
        if (!url || url === 'about:blank') return '';
        const hostname = getHostnameFromUrl(url);
        return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    } catch (error) {
        return '';
    }
}

function getOriginFromUrl(url) {
    try {
        if (!url || url === 'about:blank') return '';
        const urlObj = new URL(url);
        return urlObj.origin || '';
    } catch (error) {
        return '';
    }
}

function getProtocolFromUrl(url) {
    try {
        if (!url || url === 'about:blank') return '';
        const urlObj = new URL(url);
        return urlObj.protocol || '';
    } catch (error) {
        return '';
    }
}

// Pre-inject Chrome extension APIs BEFORE any extension scripts load
if (extensionData) {
    console.log('Preload: Injecting Chrome APIs for extension:', extensionData.id);
    
    // Extract URL components
    const hostname = getHostnameFromUrl(currentUrl);
    const domain = getDomainFromUrl(currentUrl);
    const origin = getOriginFromUrl(currentUrl);
    const protocol = getProtocolFromUrl(currentUrl);

    // Initialize chrome object globally
    window.chrome = window.chrome || {};
    window.chrome._extensionId = extensionData.id;
    window.chrome._injectedAt = Date.now();
    window.chrome._preloadInjected = true;

    // Runtime APIs
    window.chrome.runtime = {
        id: extensionData.id,
        getManifest: function() {
            return extensionData.manifest;
        },
        getURL: function(path) {
            return `chrome-extension-${extensionData.id}://${path}`;
        },
        sendMessage: function(message, callback) {
            console.log('Preload: Extension message:', message);
            
            let response = {};
            
            if (message && typeof message === 'object') {
                // Handle uBlock Origin's getPopupData request
                if (message.what === 'getPopupData') {
                    response = {
                        tabId: 1,
                        tabTitle: 'Current Tab',
                        tabURL: currentUrl,
                        hostname: hostname,
                        domain: domain,
                        origin: origin,
                        protocol: protocol,
                        canElementPicker: false,
                        canElementZapper: false,
                        noPopups: false,
                        popupBlockedCount: 0,
                        globallyBlockedRequestCount: 0,
                        locallyBlockedRequestCount: 0,
                        blockedRequestCount: 0,
                        allowedRequestCount: 0,
                        noStrict: false,
                        firewallPaneMinimized: true,
                        globalAllowedRequestCount: 0,
                        globalBlockedRequestCount: 0,
                        netFilteringSwitch: true,
                        cosmeticFilteringSwitch: true,
                        advancedUserEnabled: false,
                        dfEnabled: false,
                        uiEnabled: true,
                        pageURL: currentUrl,
                        pageHostname: hostname,
                        pageDomain: domain,
                        rawURL: currentUrl
                    };
                    console.log('Preload: Returning popup data:', response);
                } else if (message.what === 'hasPopupContentChanged') {
                    response = { contentChanged: false };
                } else if (message.what === 'getStats') {
                    response = { blockedRequestCount: 0, allowedRequestCount: 0 };
                } else {
                    response = {};
                }
            }
            
            if (callback) {
                setTimeout(() => callback(response), 0);
            }
            return Promise.resolve(response);
        }
    };

    // Storage APIs
    window.chrome.storage = {
        local: {
            get: function(...args) {
                let keys = null, callback = null;
                
                if (args.length === 0) {
                    keys = null;
                } else if (args.length === 1) {
                    if (typeof args[0] === 'function') {
                        callback = args[0];
                        keys = null;
                    } else {
                        keys = args[0];
                    }
                } else if (args.length === 2) {
                    keys = args[0];
                    callback = args[1];
                }
                
                const handleResult = (result) => {
                    if (callback) {
                        setTimeout(() => callback(result), 0);
                    }
                    return result;
                };
                
                // Use async storage if available
                if (window.electronAPI && window.electronAPI.extensionStorageGet) {
                    const promise = window.electronAPI.extensionStorageGet(extensionData.id, keys);
                    if (callback) {
                        promise.then(handleResult).catch(err => {
                            console.error('Storage get error:', err);
                            handleResult({});
                        });
                        return;
                    }
                    return promise;
                } else {
                    const result = {};
                    return Promise.resolve(handleResult(result));
                }
            },
            set: function(...args) {
                let items = args[0] || {}, callback = args[1];
                
                if (args.length === 1 && typeof args[0] === 'function') {
                    callback = args[0];
                    items = {};
                }
                
                const handleSuccess = () => {
                    if (callback) {
                        setTimeout(callback, 0);
                    }
                };
                
                if (window.electronAPI && window.electronAPI.extensionStorageSet) {
                    const promise = window.electronAPI.extensionStorageSet(extensionData.id, items);
                    if (callback) {
                        promise.then(handleSuccess).catch(err => {
                            console.error('Storage set error:', err);
                            handleSuccess();
                        });
                        return;
                    }
                    return promise;
                } else {
                    setTimeout(handleSuccess, 0);
                    return Promise.resolve();
                }
            },
            remove: function(keys, callback) {
                if (callback) {
                    setTimeout(callback, 0);
                }
                return Promise.resolve();
            },
            clear: function(callback) {
                if (callback) {
                    setTimeout(callback, 0);
                }
                return Promise.resolve();
            }
        }
    };

    // Tabs API - Critical for uBlock Origin and other extensions
    window.chrome.tabs = {
        query: function(queryInfo, callback) {
            if (typeof queryInfo === 'function') {
                callback = queryInfo;
                queryInfo = {};
            }
            
            const tabs = [];
            if (queryInfo.active !== false && queryInfo.currentWindow !== false) {
                tabs.push({
                    id: 1,
                    index: 0,
                    windowId: 1,
                    active: true,
                    url: currentUrl,
                    title: 'Current Tab',
                    favIconUrl: '',
                    status: 'complete',
                    hostname: hostname,
                    domain: domain,
                    origin: origin,
                    protocol: protocol,
                    incognito: false,
                    selected: true,
                    highlighted: true,
                    pinned: false,
                    audible: false,
                    discarded: false,
                    autoDiscardable: true,
                    mutedInfo: { muted: false }
                });
            }
            
            if (callback) {
                setTimeout(() => callback(tabs), 0);
            }
            return Promise.resolve(tabs);
        },
        getCurrent: function(callback) {
            const result = undefined; // getCurrent returns undefined in popup context
            if (callback) {
                setTimeout(() => callback(result), 0);
            }
            return Promise.resolve(result);
        },
        getSelected: function(windowId, callback) {
            if (typeof windowId === 'function') {
                callback = windowId;
                windowId = null;
            }
            
            const result = {
                id: 1,
                index: 0,
                windowId: 1,
                active: true,
                url: currentUrl,
                title: 'Current Tab',
                favIconUrl: '',
                status: 'complete'
            };
            
            if (callback) {
                setTimeout(() => callback(result), 0);
            }
            return Promise.resolve(result);
        },
        update: function(tabId, updateProperties, callback) {
            if (typeof tabId === 'object') {
                callback = updateProperties;
                updateProperties = tabId;
                tabId = null;
            }
            
            const result = {
                id: tabId || 1,
                index: 0,
                windowId: 1,
                active: true,
                url: updateProperties?.url || currentUrl,
                title: 'Current Tab',
                favIconUrl: '',
                status: 'complete'
            };
            
            if (callback) {
                setTimeout(() => callback(result), 0);
            }
            return Promise.resolve(result);
        },
        create: function(createProperties, callback) {
            console.log('chrome.tabs.create called with:', createProperties);
            
            // Generate a new tab ID
            const newTabId = Math.floor(Math.random() * 1000000) + 2;
            
            const newTab = {
                id: newTabId,
                index: 1,
                windowId: createProperties?.windowId || 1,
                active: createProperties?.active !== false,
                url: createProperties?.url || 'about:blank',
                title: createProperties?.url ? 'New Tab' : 'New Tab',
                favIconUrl: '',
                status: 'loading',
                incognito: false,
                selected: createProperties?.active !== false,
                highlighted: createProperties?.active !== false,
                pinned: createProperties?.pinned || false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                mutedInfo: { muted: false },
                openerTabId: createProperties?.openerTabId
            };
            
            // Simulate opening the URL in the main process if needed
            if (createProperties?.url && window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(createProperties.url);
            } else if (createProperties?.url) {
                // Fallback - try to open in system browser
                console.log('Would open URL:', createProperties.url);
                // In a real implementation, this would communicate with the main process
                // to open the URL in a new tab or external browser
            }
            
            if (callback) {
                setTimeout(() => callback(newTab), 0);
            }
            return Promise.resolve(newTab);
        },
        remove: function(tabIds, callback) {
            if (typeof tabIds === 'number') {
                tabIds = [tabIds];
            }
            
            console.log('chrome.tabs.remove called for tabs:', tabIds);
            
            if (callback) {
                setTimeout(callback, 0);
            }
            return Promise.resolve();
        },
        get: function(tabId, callback) {
            const tab = {
                id: tabId,
                index: 0,
                windowId: 1,
                active: tabId === 1,
                url: tabId === 1 ? currentUrl : 'about:blank',
                title: tabId === 1 ? 'Current Tab' : 'Tab',
                favIconUrl: '',
                status: 'complete',
                incognito: false,
                selected: tabId === 1,
                highlighted: tabId === 1,
                pinned: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                mutedInfo: { muted: false }
            };
            
            if (callback) {
                setTimeout(() => callback(tab), 0);
            }
            return Promise.resolve(tab);
        },
        duplicate: function(tabId, callback) {
            const newTabId = Math.floor(Math.random() * 1000000) + 2;
            const duplicatedTab = {
                id: newTabId,
                index: 1,
                windowId: 1,
                active: false,
                url: tabId === 1 ? currentUrl : 'about:blank',
                title: tabId === 1 ? 'Current Tab' : 'Tab',
                favIconUrl: '',
                status: 'loading',
                incognito: false,
                selected: false,
                highlighted: false,
                pinned: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                mutedInfo: { muted: false }
            };
            
            if (callback) {
                setTimeout(() => callback(duplicatedTab), 0);
            }
            return Promise.resolve(duplicatedTab);
        },
        reload: function(tabId, reloadProperties, callback) {
            if (typeof tabId === 'object') {
                callback = reloadProperties;
                reloadProperties = tabId;
                tabId = null;
            }
            if (typeof reloadProperties === 'function') {
                callback = reloadProperties;
                reloadProperties = {};
            }
            
            console.log('chrome.tabs.reload called for tab:', tabId || 'current');
            
            if (callback) {
                setTimeout(callback, 0);
            }
            return Promise.resolve();
        }
    };

    // Other essential APIs
    window.chrome.extension = {
        getURL: window.chrome.runtime.getURL
    };

    window.chrome.i18n = {
        getMessage: function(key, substitutions) {
            return key; // Fallback - return key as-is
        }
    };

    window.chrome.windows = {
        getCurrent: function(callback) {
            const result = {
                id: 1,
                focused: true,
                top: 0,
                left: 0,
                width: 1920,
                height: 1080,
                incognito: false,
                type: 'normal',
                state: 'normal'
            };
            if (callback) {
                setTimeout(() => callback(result), 0);
            }
            return Promise.resolve(result);
        }
    };

    // Permissions API
    window.chrome.permissions = {
        contains: function(permissions, callback) {
            const result = true; // Assume all permissions granted
            if (callback) {
                setTimeout(() => callback(result), 0);
            }
            return Promise.resolve(result);
        }
    };

    // WebNavigation API stubs
    window.chrome.webNavigation = {
        onCommitted: {
            addListener: function(callback) {
                console.log('webNavigation.onCommitted listener added');
            },
            removeListener: function(callback) {
                console.log('webNavigation.onCommitted listener removed');
            }
        }
    };

    // WebRequest API stubs
    window.chrome.webRequest = {
        onBeforeRequest: {
            addListener: function(callback, filter, extraInfoSpec) {
                console.log('webRequest.onBeforeRequest listener added');
            },
            removeListener: function(callback) {
                console.log('webRequest.onBeforeRequest listener removed');
            }
        },
        onHeadersReceived: {
            addListener: function(callback, filter, extraInfoSpec) {
                console.log('webRequest.onHeadersReceived listener added');
            },
            removeListener: function(callback) {
                console.log('webRequest.onHeadersReceived listener removed');
            }
        }
    };

    // MISSING: vAPI implementation for uBlock Origin
    // This is critical for uBlock Origin's functionality
    window.vAPI = {
        // Extension context information
        app: {
            name: extensionData.name || 'Extension',
            version: extensionData.version || '1.0.0'
        },
        
        // Window/tab information
        tabId: 1,
        sessionId: Math.random().toString(36).substr(2, 9),
        
        // Messaging system
        messaging: {
            send: function(channelName, message, callback) {
                console.log('vAPI.messaging.send:', channelName, message);
                
                // Handle different message types
                let response = {};
                if (message && typeof message === 'object') {
                    if (message.what === 'getPopupData') {
                        response = {
                            tabId: 1,
                            tabTitle: 'Current Tab',
                            tabURL: currentUrl,
                            hostname: hostname,
                            domain: domain,
                            origin: origin,
                            protocol: protocol,
                            canElementPicker: false,
                            canElementZapper: false,
                            noPopups: false,
                            popupBlockedCount: 0,
                            globallyBlockedRequestCount: 0,
                            locallyBlockedRequestCount: 0,
                            blockedRequestCount: 0,
                            allowedRequestCount: 0,
                            noStrict: false,
                            firewallPaneMinimized: true,
                            globalAllowedRequestCount: 0,
                            globalBlockedRequestCount: 0,
                            netFilteringSwitch: true,
                            cosmeticFilteringSwitch: true,
                            advancedUserEnabled: false,
                            dfEnabled: false,
                            uiEnabled: true,
                            pageURL: currentUrl,
                            pageHostname: hostname,
                            pageDomain: domain,
                            rawURL: currentUrl
                        };
                    }
                }
                
                if (callback) {
                    setTimeout(() => callback(response), 0);
                }
                return Promise.resolve(response);
            },
            
            addChannelListener: function(channelName, callback) {
                console.log('vAPI.messaging.addChannelListener:', channelName);
            },
            
            removeChannelListener: function(channelName, callback) {
                console.log('vAPI.messaging.removeChannelListener:', channelName);
            }
        },
        
        // Local storage implementation - THIS IS THE MISSING PIECE
        localStorage: {
            // In-memory storage for this session
            _storage: new Map(),
            
            // Get item synchronously
            getItem: function(key) {
                const value = this._storage.get(key);
                console.log('vAPI.localStorage.getItem:', key, '->', value);
                return value !== undefined ? value : null;
            },
            
            // Set item synchronously
            setItem: function(key, value) {
                console.log('vAPI.localStorage.setItem:', key, '<-', value);
                this._storage.set(key, value);
                
                // Also persist to chrome.storage if available
                if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
                    window.chrome.storage.local.set({ [key]: value });
                }
            },
            
            // Remove item synchronously
            removeItem: function(key) {
                console.log('vAPI.localStorage.removeItem:', key);
                this._storage.delete(key);
                
                // Also remove from chrome.storage if available
                if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
                    window.chrome.storage.local.remove([key]);
                }
            },
            
            // Clear all items
            clear: function() {
                console.log('vAPI.localStorage.clear');
                this._storage.clear();
                
                // Also clear chrome.storage if available
                if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
                    window.chrome.storage.local.clear();
                }
            },
            
            // Async version - THIS FIXES THE ERROR
            getItemAsync: function(key) {
                return new Promise((resolve) => {
                    const value = this.getItem(key);
                    console.log('vAPI.localStorage.getItemAsync:', key, '->', value);
                    resolve(value);
                });
            },
            
            // Async set
            setItemAsync: function(key, value) {
                return new Promise((resolve) => {
                    this.setItem(key, value);
                    resolve();
                });
            },
            
            // Async remove
            removeItemAsync: function(key) {
                return new Promise((resolve) => {
                    this.removeItem(key);
                    resolve();
                });
            }
        },
        
        // DOM utilities that uBlock uses
        DOM: {
            loaded: function() {
                return document.readyState === 'complete' || document.readyState === 'interactive';
            }
        },
        
        // Shutdown handling
        shutdown: {
            add: function(callback) {
                console.log('vAPI.shutdown.add called');
                window.addEventListener('beforeunload', callback);
            },
            remove: function(callback) {
                console.log('vAPI.shutdown.remove called');
                window.removeEventListener('beforeunload', callback);
            }
        }
    };

    // MISSING: Additional DOM utilities that uBlock Origin uses
    // These are helper functions that the extension expects
    window.dom = {
        cl: {
            has: function(element, className) {
                if (typeof element === 'string') {
                    element = document.querySelector(element);
                }
                return element ? element.classList.contains(className) : false;
            },
            add: function(element, className) {
                if (typeof element === 'string') {
                    const elements = document.querySelectorAll(element);
                    elements.forEach(el => el.classList.add(className));
                } else if (element) {
                    element.classList.add(className);
                }
            },
            remove: function(element, className) {
                if (typeof element === 'string') {
                    const elements = document.querySelectorAll(element);
                    elements.forEach(el => el.classList.remove(className));
                } else if (element) {
                    element.classList.remove(className);
                }
            },
            toggle: function(element, className) {
                if (typeof element === 'string') {
                    element = document.querySelector(element);
                }
                if (element) {
                    element.classList.toggle(className);
                }
            }
        },
        on: function(selector, eventType, childSelector, handler) {
            if (typeof childSelector === 'function') {
                handler = childSelector;
                childSelector = null;
            }
            
            const elements = typeof selector === 'string' ? document.querySelectorAll(selector) : [selector];
            elements.forEach(element => {
                if (childSelector) {
                    // Event delegation
                    element.addEventListener(eventType, function(event) {
                        if (event.target && event.target.matches && event.target.matches(childSelector)) {
                            handler(event);
                        }
                    });
                } else {
                    element.addEventListener(eventType, handler);
                }
            });
        }
    };
    
    // MISSING: Query selector utilities
    window.qs$ = function(selector, context) {
        return (context || document).querySelector(selector);
    };
    
    window.qsa$ = function(selector, context) {
        return Array.from((context || document).querySelectorAll(selector));
    };

    // Set up global tab data that uBlock Origin expects
    window._currentTabData = {
        id: 1,
        url: currentUrl,
        hostname: hostname,
        domain: domain,
        origin: origin,
        protocol: protocol
    };

    // Also set up uBlock-specific global data
    window._uBlockTabData = {
        id: 1,
        url: currentUrl,
        title: 'Current Tab',
        hostname: hostname,
        domain: domain,
        origin: origin,
        protocol: protocol
    };

    // Browser compatibility
    window.browser = window.chrome;

    console.log('Preload: Chrome extension APIs injected for:', extensionData.id);
    console.log('Preload: Tab data available:', window._currentTabData);
    console.log('Preload: vAPI localStorage available:', !!window.vAPI.localStorage);
}

// Original API exposure plus extension data
const api = {
    extensionStorageGet: (extensionId, keys) => ipcRenderer.invoke('extension-storage-get', extensionId, keys),
    extensionStorageSet: (extensionId, items) => ipcRenderer.invoke('extension-storage-set', extensionId, items),
    getExtensionFileContent: (extensionId, relativePath) => ipcRenderer.invoke('get-extension-file-content', extensionId, relativePath),
};

if (contextBridge) {
    contextBridge.exposeInMainWorld('electronAPI', api);
} else {
    window.electronAPI = api;
}

console.log('Extension preload script complete');