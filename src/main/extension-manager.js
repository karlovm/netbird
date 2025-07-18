const fs = require('fs');
const path = require('path');
const { session, BrowserWindow, protocol, app } = require('electron');

class ExtensionManager {
    constructor(userDataPath = null) {
        this.extensions = new Map();
        this.loadedExtensions = new Set();
        this.popupWindows = new Map();
        this.extensionStores = new Map();
        this.registeredProtocols = new Set();
        
        // Set up persistence
        this.userDataPath = userDataPath || app.getPath('userData');
        this.extensionsConfigPath = path.join(this.userDataPath, 'extensions.json');
        this.extensionsDataPath = path.join(this.userDataPath, 'extensions');
        
        // Ensure extensions directory exists
        if (!fs.existsSync(this.extensionsDataPath)) {
            fs.mkdirSync(this.extensionsDataPath, { recursive: true });
        }
        
        this.setupExtensionAPIs();
       
    }

    // Load extensions from saved configuration
    async initializeFromConfig() {
        try {
            if (fs.existsSync(this.extensionsConfigPath)) {
                const configData = fs.readFileSync(this.extensionsConfigPath, 'utf8');
                const config = JSON.parse(configData);
                
                console.log('Loading saved extensions configuration...');
                
                for (const extensionConfig of config.extensions || []) {
                    try {
                        // Check if extension path still exists
                        if (fs.existsSync(extensionConfig.path)) {
                            console.log(`Restoring extension: ${extensionConfig.name}`);
                            await this.loadExtension(extensionConfig.path);
                        } else {
                            console.warn(`Extension path no longer exists: ${extensionConfig.path}`);
                        }
                    } catch (error) {
                        console.error(`Failed to restore extension ${extensionConfig.name}:`, error);
                    }
                }
                
                console.log('Extension restoration complete');
            } else {
                console.log('No saved extensions configuration found');
            }
        } catch (error) {
            console.error('Failed to load extensions configuration:', error);
        }
    }

    // Save current extensions configuration
    saveConfiguration() {
        try {
            const config = {
                extensions: Array.from(this.extensions.values()).map(ext => ({
                    id: ext.id,
                    name: ext.name,
                    version: ext.version,
                    path: ext.path,
                    enabled: ext.enabled
                })),
                lastUpdated: new Date().toISOString()
            };
            
            fs.writeFileSync(this.extensionsConfigPath, JSON.stringify(config, null, 2));
            console.log('Extensions configuration saved');
        } catch (error) {
            console.error('Failed to save extensions configuration:', error);
        }
    }

    getExtensionStore(extensionId) {
        if (!this.extensionStores.has(extensionId)) {
            const Store = require('electron-store');
            this.extensionStores.set(extensionId, new Store({
                name: `extension_${extensionId}_storage`,
                defaults: {},
                cwd: this.extensionsDataPath
            }));
        }
        return this.extensionStores.get(extensionId);
    }

    async getStorage(extensionId, keys) {
        const store = this.getExtensionStore(extensionId);
        if (!keys) return store.store;
        if (typeof keys === 'string') return { [keys]: store.get(keys) ?? null };
        if (Array.isArray(keys)) {
            const result = {};
            keys.forEach(key => result[key] = store.get(key) ?? null);
            return result;
        }
        const result = {};
        for (const key in keys) {
            result[key] = store.get(key, keys[key]) ?? null;
        }
        return result;
    }

    async setStorage(extensionId, items) {
        const store = this.getExtensionStore(extensionId);
        for (const key in items) {
            store.set(key, items[key]);
        }
    }

    setupExtensionAPIs() {
        if (!this.schemesRegistered) {
            try {
                protocol.registerSchemesAsPrivileged([
                    {
                        scheme: 'chrome-extension',
                        privileges: {
                            standard: true,
                            secure: true,
                            allowServiceWorkers: true,
                            supportFetchAPI: true
                        }
                    }
                ]);
                this.schemesRegistered = true;
                console.log('Extension schemes registered');
            } catch (error) {
                console.error('Failed to register extension schemes:', error);
            }
        }
    }

    async injectExtensionAPIs(webContents, extension, currentUrl = '', isPopup = false) {
        try {
            if (!webContents || webContents.isDestroyed()) {
                console.warn('WebContents is destroyed, skipping API injection');
                return;
            }

            const safeExtension = JSON.parse(JSON.stringify(extension));
            console.log('Injecting APIs for extension:', safeExtension.id);

            if (!safeExtension.manifest || typeof safeExtension.manifest !== 'object') {
                throw new Error('Invalid extension manifest');
            }

            let manifestString;
            try {
                manifestString = JSON.stringify(safeExtension.manifest);
            } catch (error) {
                console.error('Failed to stringify manifest for extension:', safeExtension.id, error);
                throw new Error(`Failed to serialize manifest: ${error.message}`);
            }

            const escapedCurrentUrl = currentUrl.replace(/'/g, "\\'");

            let apiScript = `
            (function() {
                try {
                    // Prevent double injection
                    if (window.chrome && window.chrome._extensionId === '${safeExtension.id}') {
                        console.log('Extension APIs already injected for ${safeExtension.id}');
                        return;
                    }
                    
                    console.log('Injecting extension APIs for ${safeExtension.id}');
                    
                    window.chrome = window.chrome || {};
                    window.chrome._extensionId = '${safeExtension.id}';
                    window.chrome._injectedAt = Date.now();
            `;

            if (!extension.electronId) {
                apiScript += `
                    // Runtime APIs
                    window.chrome.runtime = window.chrome.runtime || {};
                    window.chrome.runtime.id = '${safeExtension.id}';
                    window.chrome.runtime.getManifest = function() {
                        return ${manifestString};
                    };
                    window.chrome.runtime.getURL = function(path) {
                        return 'chrome-extension-${safeExtension.id}://' + path;
                    };
                    window.chrome.runtime.sendMessage = function(message, callback) {
                        console.log('Extension message:', message);
                        if (callback) {
                            setTimeout(() => callback({}), 0);
                        }
                        return Promise.resolve({});
                    };
                    
                    // Extension APIs
                    window.chrome.extension = window.chrome.extension || {};
                    window.chrome.extension.getURL = window.chrome.runtime.getURL;
                    
                    // i18n APIs
                    window.chrome.i18n = window.chrome.i18n || {};
                    window.chrome.i18n.getMessage = function(key, substitutions) {
                        return key;
                    };
                    
                    // Storage APIs
                    window.chrome.storage = window.chrome.storage || {};
                    window.chrome.storage.local = window.chrome.storage.local || {};
                    
                    window.chrome.storage.local.get = function(...args) {
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
                        
                        if (window.electronAPI && window.electronAPI.extensionStorageGet) {
                            const promise = window.electronAPI.extensionStorageGet('${safeExtension.id}', keys);
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
                    };
                    
                    window.chrome.storage.local.set = function(...args) {
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
                            const promise = window.electronAPI.extensionStorageSet('${safeExtension.id}', items);
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
                    };
                    
                    window.chrome.storage.local.remove = function(keys, callback) {
                        // Simple implementation - in real scenario, you'd implement this in the main process
                        if (callback) {
                            setTimeout(callback, 0);
                        }
                        return Promise.resolve();
                    };
                    
                    window.chrome.storage.local.clear = function(callback) {
                        // Simple implementation - in real scenario, you'd implement this in the main process
                        if (callback) {
                            setTimeout(callback, 0);
                        }
                        return Promise.resolve();
                    };
                    
                    // Browser compatibility
                    if (!window.browser) {
                        window.browser = window.chrome;
                    }
                `;
            }

            apiScript += `
                    // Tabs API
                    window.chrome.tabs = window.chrome.tabs || {};
                    window.chrome.tabs.query = function(queryInfo, callback) {
                        if (typeof queryInfo === 'function') {
                            callback = queryInfo;
                            queryInfo = {};
                        }
                        
                        const getCurrentTab = () => {
                            const currentUrl = '${escapedCurrentUrl}';
                            const tabs = [];
                            
                            if (queryInfo.active !== false && queryInfo.currentWindow !== false && currentUrl) {
                                tabs.push({
                                    id: 1,
                                    index: 0,
                                    windowId: 1,
                                    active: true,
                                    url: currentUrl,
                                    title: document.title || 'Current Tab',
                                    favIconUrl: '',
                                    status: 'complete'
                                });
                            }
                            
                            return tabs;
                        };
                        
                        const result = getCurrentTab();
                        if (callback) {
                            setTimeout(() => callback(result), 0);
                        }
                        return Promise.resolve(result);
                    };
                    
                    window.chrome.tabs.getCurrent = function(callback) {
                        const result = undefined; // Content scripts don't have current tab
                        if (callback) {
                            setTimeout(() => callback(result), 0);
                        }
                        return Promise.resolve(result);
                    };
                    
                    console.log('Extension APIs successfully injected for ${safeExtension.id}');
                    
                } catch (error) {
                    console.error('Extension API injection failed for ${safeExtension.id}:', error);
                }
            })();
            `;

            await webContents.executeJavaScript(apiScript);
            console.log('Successfully injected APIs for extension:', safeExtension.id);
        } catch (error) {
            console.error('Failed to inject extension APIs for extension:', extension.id, error);
            throw error;
        }
    }

    async loadExtension(extensionPath) {
        try {
            const manifestPath = path.join(extensionPath, 'manifest.json');

            if (!fs.existsSync(manifestPath)) {
                throw new Error('manifest.json not found');
            }

            const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
            let manifest;
            try {
                manifest = JSON.parse(manifestRaw);
            } catch (error) {
                throw new Error(`Invalid manifest.json: ${error.message}`);
            }

            if (!manifest.name || !manifest.version) {
                throw new Error('Invalid manifest.json: missing name or version');
            }

            const extensionId = this.generateExtensionId(manifest.name);

            // Check if extension is already loaded
            if (this.extensions.has(extensionId)) {
                console.log('Extension already loaded, unloading first:', extensionId);
                await this.unloadExtension(extensionId);
            }

            const safeManifest = JSON.parse(JSON.stringify(manifest, (key, value) => {
                if (typeof value === 'function' || value === undefined) {
                    return undefined;
                }
                return value;
            }));

            const extension = {
                id: extensionId,
                name: manifest.name,
                version: manifest.version,
                description: manifest.description || '',
                path: extensionPath,
                manifest: safeManifest,
                enabled: true,
                icon: this.getExtensionIcon(extensionPath, safeManifest),
                popup: manifest.browser_action?.default_popup || manifest.action?.default_popup,
                loadedAt: new Date().toISOString()
            };

            // Try to load with Electron's extension system
            try {
                const loadedExtension = await session.defaultSession.loadExtension(extensionPath, {
                    allowFileAccess: true
                });
                extension.electronId = loadedExtension.id;
                console.log('Extension loaded with Electron ID:', loadedExtension.id);
            } catch (electronError) {
                console.warn('Failed to load extension with Electron session, using manual loading:', electronError.message);
            }

            this.extensions.set(extension.id, extension);
            this.loadedExtensions.add(extension.id);

            await this.setupExtensionProtocol(extension);

            // Save configuration after successful load
            this.saveConfiguration();

            console.log('Extension loaded successfully:', extension.name, 'v' + extension.version);
            return JSON.parse(JSON.stringify(extension));
        } catch (error) {
            console.error('Failed to load extension:', error);
            throw error;
        }
    }

    getExtensionIcon(extensionPath, manifest) {
        let iconRelativePath = null;

        if (manifest.icons) {
            const sizes = Object.keys(manifest.icons).map(Number).sort((a, b) => b - a);
            const largestSize = sizes[0];
            if (largestSize) {
                iconRelativePath = manifest.icons[largestSize];
            }
        } else if (manifest.browser_action?.default_icon) {
            const iconInfo = manifest.browser_action.default_icon;
            if (typeof iconInfo === 'string') {
                iconRelativePath = iconInfo;
            } else if (typeof iconInfo === 'object') {
                const sizes = Object.keys(iconInfo).map(Number).sort((a, b) => b - a);
                const largestSize = sizes[0];
                if (largestSize) {
                    iconRelativePath = iconInfo[largestSize];
                }
            }
        } else if (manifest.action?.default_icon) {
            const iconInfo = manifest.action.default_icon;
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

        if (iconRelativePath) {
            const iconPath = path.join(extensionPath, iconRelativePath);
            if (fs.existsSync(iconPath)) {
                try {
                    const iconData = fs.readFileSync(iconPath);
                    const ext = path.extname(iconPath).toLowerCase();
                    const mimeType = ext === '.png' ? 'image/png' :
                        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                            ext === '.svg' ? 'image/svg+xml' : 'image/png';
                    return `data:${mimeType};base64,${iconData.toString('base64')}`;
                } catch (error) {
                    console.error('Failed to read icon file:', iconPath, error);
                }
            }
        }

        return null;
    }

    async setupExtensionProtocol(extension) {
        const extensionScheme = `chrome-extension-${extension.id}`;

        if (this.registeredProtocols.has(extensionScheme)) {
            try {
                protocol.unregisterProtocol(extensionScheme);
            } catch (error) {
                console.warn('Failed to unregister existing protocol:', error.message);
            }
        }

        try {
            const success = protocol.registerFileProtocol(extensionScheme, (request, callback) => {
                const url = request.url.replace(`${extensionScheme}://`, '');
                const filePath = path.join(extension.path, url);
                
                // Security check - ensure file is within extension directory
                const resolvedPath = path.resolve(filePath);
                const extensionDir = path.resolve(extension.path);
                
                if (!resolvedPath.startsWith(extensionDir)) {
                    console.warn('Attempted to access file outside extension directory:', resolvedPath);
                    callback({ error: -6 }); // FILE_NOT_FOUND
                    return;
                }
                
                if (fs.existsSync(resolvedPath)) {
                    callback({ path: resolvedPath });
                } else {
                    console.warn('Extension file not found:', resolvedPath);
                    callback({ error: -6 }); // FILE_NOT_FOUND
                }
            });

            if (success) {
                this.registeredProtocols.add(extensionScheme);
                console.log('Successfully registered protocol:', extensionScheme);
            } else {
                console.warn('Failed to register protocol:', extensionScheme);
            }
        } catch (error) {
            console.error('Error registering protocol:', extensionScheme, error);
        }
    }

    async showExtensionPopup(extensionId, parentWindow, currentUrl = '') {
        console.log('showExtensionPopup called with extensionId:', extensionId);

        const extension = this.extensions.get(extensionId);
        if (!extension || !extension.popup) {
            console.log('No popup defined for extension:', extensionId);
            return { success: false, error: 'No popup defined for extension' };
        }

        // Fix: Derive currentUrl from parentWindow if not provided
        if (!currentUrl && parentWindow && parentWindow.webContents) {
            try {
                currentUrl = parentWindow.webContents.getURL();
                console.log('Derived currentUrl from parentWindow:', currentUrl);
            } catch (error) {
                console.warn('Failed to derive currentUrl from parentWindow:', error.message);
                currentUrl = '';  // Fallback to empty if derivation fails
            }
        }

        // Optional: Warn if still empty (helps catch caller issues)
        if (!currentUrl) {
            console.warn(`No currentUrl provided or derived for extension popup (${extensionId}). Tabs API may return empty URL.`);
        }

        if (this.popupWindows.has(extensionId)) {
            console.log('Closing existing popup for extension:', extensionId);
            try {
                const existingWindow = this.popupWindows.get(extensionId);
                if (!existingWindow.isDestroyed()) {
                    existingWindow.close();
                }
            } catch (error) {
                console.warn('Error closing existing popup:', error.message);
            }
            this.popupWindows.delete(extensionId);
        }

        const popupPath = path.join(extension.path, extension.popup);
        if (!fs.existsSync(popupPath)) {
            console.error('Popup file not found:', popupPath);
            return { success: false, error: 'Popup file not found' };
        }

        try {
            const popupWindow = new BrowserWindow({
                width: 400,
                height: 600,
                parent: parentWindow,
                modal: false,
                resizable: false,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    enableRemoteModule: false,
                    webSecurity: false,
                    allowRunningInsecureContent: true,
                    preload: path.join(__dirname, 'extension-preload.js')
                }
            });

            let loadUrl;
            if (extension.electronId) {
                loadUrl = `chrome-extension://${extension.electronId}/${extension.popup}`;
            } else {
                loadUrl = `chrome-extension-${extension.id}://${extension.popup}`;
            }

            popupWindow.webContents.once('dom-ready', async () => {
                try {
                    await this.injectExtensionAPIs(popupWindow.webContents, extension, currentUrl, true);
                    console.log('Successfully injected APIs for popup');
                } catch (error) {
                    console.error('Failed to inject APIs for popup:', error);
                }
            });

            await popupWindow.loadURL(loadUrl);

            setTimeout(async () => {
                try {
                    if (!popupWindow.isDestroyed()) {
                        const sizeCode = `
                            JSON.stringify({
                                width: Math.max(200, Math.min(800, Math.ceil(document.documentElement.scrollWidth))),
                                height: Math.max(200, Math.min(600, Math.ceil(document.documentElement.scrollHeight)))
                            })
                        `;
                        const sizeJson = await popupWindow.webContents.executeJavaScript(sizeCode);
                        const parsedSize = JSON.parse(sizeJson);
                        popupWindow.setSize(parsedSize.width, parsedSize.height);
                        popupWindow.center();
                        popupWindow.show();
                    }
                } catch (error) {
                    console.error('Error resizing popup:', error);
                    if (!popupWindow.isDestroyed()) {
                        popupWindow.show();
                    }
                }
            }, 100);

            popupWindow.on('closed', () => {
                console.log('Popup window closed for extension:', extensionId);
                this.popupWindows.delete(extensionId);
            });

            this.popupWindows.set(extensionId, popupWindow);
            return { success: true };
        } catch (error) {
            console.error('Error in showExtensionPopup:', error);
            return { success: false, error: error.message };
        }
    }

    async unloadExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (extension) {
            if (this.popupWindows.has(extensionId)) {
                try {
                    const popupWindow = this.popupWindows.get(extensionId);
                    if (!popupWindow.isDestroyed()) {
                        popupWindow.close();
                    }
                } catch (error) {
                    console.warn('Error closing popup during unload:', error.message);
                }
                this.popupWindows.delete(extensionId);
            }

            if (extension.electronId) {
                try {
                    await session.defaultSession.removeExtension(extension.electronId);
                } catch (error) {
                    console.warn('Failed to remove extension from session:', error.message);
                }
            }

            const extensionScheme = `chrome-extension-${extension.id}`;
            if (this.registeredProtocols.has(extensionScheme)) {
                try {
                    protocol.unregisterProtocol(extensionScheme);
                    this.registeredProtocols.delete(extensionScheme);
                } catch (error) {
                    console.warn('Failed to unregister protocol:', error.message);
                }
            }

            if (this.extensionStores.has(extensionId)) {
                this.extensionStores.delete(extensionId);
            }

            this.extensions.delete(extensionId);
            this.loadedExtensions.delete(extensionId);

            // Update saved configuration
            this.saveConfiguration();

            console.log('Extension unloaded:', extension.name);
        }
    }

    getExtensions() {
        return Array.from(this.extensions.values());
    }

    getExtension(extensionId) {
        return this.extensions.get(extensionId);
    }

    generateExtensionId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    async injectContentScripts(webview, url) {
        try {
            for (const extension of this.extensions.values()) {
                if (extension.electronId) continue;
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
                                    await webview.executeJavaScript(jsContent);
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

    async cleanup() {
        console.log('Cleaning up ExtensionManager...');
        
        for (const [extensionId, popupWindow] of this.popupWindows) {
            try {
                if (!popupWindow.isDestroyed()) {
                    popupWindow.close();
                }
            } catch (error) {
                console.warn('Error closing popup during cleanup:', error.message);
            }
        }
        this.popupWindows.clear();

        for (const extensionId of this.extensions.keys()) {
            await this.unloadExtension(extensionId);
        }

        console.log('ExtensionManager cleanup complete');
    }
}

module.exports = ExtensionManager;