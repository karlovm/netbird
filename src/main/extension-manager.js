// main/extension-manager.js - Fixed popup window cleanup

const fs = require('fs');
const path = require('path');
const { session, BrowserWindow, protocol, app, ipcMain } = require('electron');

class ExtensionManager {
    constructor(userDataPath = null) {
        this.extensions = new Map();
        this.loadedExtensions = new Set();
        this.popupWindows = new Map();
        this.extensionStores = new Map();
        this.registeredProtocols = new Set();
        
        // Store popup initialization data for preload script
        this.popupInitData = new Map();

        // Set up persistence
        this.userDataPath = userDataPath || app.getPath('userData');
        this.extensionsConfigPath = path.join(this.userDataPath, 'extensions.json');
        this.extensionsDataPath = path.join(this.userDataPath, 'extensions');

        // Ensure extensions directory exists
        if (!fs.existsSync(this.extensionsDataPath)) {
            fs.mkdirSync(this.extensionsDataPath, { recursive: true });
        }

        this.setupExtensionAPIs();
        this.setupPopupIPC();
    }

    // Setup synchronous IPC handler for popup initialization data
    setupPopupIPC() {
        // Remove existing listener if it exists
        try {
            ipcMain.removeAllListeners('get-popup-init-data');
        } catch (error) {
            // Ignore if no listeners exist
        }

        // Synchronous IPC handler for popup initialization data
        ipcMain.on('get-popup-init-data', (event) => {
            try {
                const webContentsId = event.sender.id;
                const popupData = this.popupInitData.get(webContentsId);
                
                if (popupData) {
                    console.log('Returning popup init data for webContents:', webContentsId);
                    event.returnValue = popupData;
                } else {
                    console.warn('No popup init data found for webContents:', webContentsId);
                    event.returnValue = null;
                }
            } catch (error) {
                console.error('Error in get-popup-init-data handler:', error);
                event.returnValue = null;
            }
        });
    }

    // FIXED: Safe popup window cleanup
    safeClosePopup(extensionId) {
        const popupWindow = this.popupWindows.get(extensionId);
        if (popupWindow) {
            try {
                // Check if window is destroyed before accessing it
                if (!popupWindow.isDestroyed()) {
                    // Clean up popup data first
                    const webContentsId = popupWindow.webContents?.id;
                    if (webContentsId) {
                        this.popupInitData.delete(webContentsId);
                    }
                    
                    // Remove all listeners to prevent memory leaks
                    popupWindow.removeAllListeners();
                    
                    // Close the window
                    popupWindow.close();
                } else {
                    // Window already destroyed, just clean up data
                    console.log('Popup window already destroyed for extension:', extensionId);
                }
            } catch (error) {
                console.warn('Error during popup cleanup for extension', extensionId, ':', error.message);
            } finally {
                // Always remove from tracking maps
                this.popupWindows.delete(extensionId);
            }
        }
    }

    // FIXED: Enhanced showExtensionPopup with better cleanup handling
    async showExtensionPopup(extensionId, parentWindow, currentUrl = '') {
        console.log('showExtensionPopup called with extensionId:', extensionId);

        const extension = this.extensions.get(extensionId);
        if (!extension || !extension.popup) {
            console.log('No popup defined for extension:', extensionId);
            return { success: false, error: 'No popup defined for extension' };
        }

        // Derive currentUrl from parentWindow if not provided
        if (!currentUrl && parentWindow && parentWindow.webContents) {
            try {
                currentUrl = parentWindow.webContents.getURL();
                console.log('Derived currentUrl from parentWindow:', currentUrl);
            } catch (error) {
                console.warn('Failed to derive currentUrl from parentWindow:', error.message);
                currentUrl = 'about:blank';
            }
        }

        // Ensure we have a valid URL
        if (!currentUrl || currentUrl === '') {
            currentUrl = 'about:blank';
            console.warn(`No currentUrl provided for extension popup (${extensionId}). Using about:blank.`);
        }

        // Validate URL format
        try {
            new URL(currentUrl);
        } catch (error) {
            console.warn('Invalid URL format, using about:blank:', currentUrl);
            currentUrl = 'about:blank';
        }

        // Close existing popup safely
        if (this.popupWindows.has(extensionId)) {
            console.log('Closing existing popup for extension:', extensionId);
            this.safeClosePopup(extensionId);
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
                resizable: true,
                
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

            // Store popup initialization data BEFORE loading the page
            this.popupInitData.set(popupWindow.webContents.id, {
                extension: {
                    id: extension.id,
                    name: extension.name,
                    version: extension.version,
                    manifest: extension.manifest,
                    path: extension.path
                },
                currentUrl: currentUrl
            });

            console.log('Stored popup init data for webContents:', popupWindow.webContents.id);

            // FIXED: Enhanced event handlers with proper cleanup
            let isClosing = false;

            const handleClosed = () => {
                if (isClosing) return; // Prevent multiple cleanup calls
                isClosing = true;
                
                console.log('Popup window closed for extension:', extensionId);
                
                try {
                    // Clean up stored data
                    const webContentsId = popupWindow.webContents?.id;
                    if (webContentsId) {
                        this.popupInitData.delete(webContentsId);
                    }
                } catch (error) {
                    console.warn('Error cleaning up popup data:', error.message);
                }
                
                // Remove from tracking
                this.popupWindows.delete(extensionId);
            };

            const handleBeforeUnload = (event) => {
                console.log('Popup window before-unload for extension:', extensionId);
                // Allow the window to close normally
                // Cleanup will happen in 'closed' event
            };

            // Add event listeners
            popupWindow.once('closed', handleClosed);
            popupWindow.once('before-unload', handleBeforeUnload);

            // Handle webContents destruction separately
            popupWindow.webContents.once('destroyed', () => {
                console.log('Popup webContents destroyed for extension:', extensionId);
                // Additional cleanup if needed
            });

            let loadUrl;
            if (extension.electronId) {
                loadUrl = `chrome-extension://${extension.electronId}/${extension.popup}`;
            } else {
                loadUrl = `chrome-extension-${extension.id}://${extension.popup}`;
            }

            // Load the popup URL
            await popupWindow.loadURL(loadUrl);

            // Store reference before showing
            this.popupWindows.set(extensionId, popupWindow);

            // Resize and show window after content loads
            setTimeout(async () => {
                try {
                    // Check if window is still valid before resizing
                    if (!popupWindow.isDestroyed()) {
                        const sizeCode = `
                            JSON.stringify({
                                width: Math.max(400, Math.min(800, Math.ceil(document.documentElement.scrollWidth))),
                                height: Math.max(300, Math.min(600, Math.ceil(document.documentElement.scrollHeight)))
                            })
                        `;
                        
                        try {
                            const sizeJson = await popupWindow.webContents.executeJavaScript(sizeCode);
                            const parsedSize = JSON.parse(sizeJson);
                            
                            const finalWidth = Math.max(400, parsedSize.width);
                            const finalHeight = Math.max(300, parsedSize.height);
                            
                            if (!popupWindow.isDestroyed()) {
                                popupWindow.setSize(finalWidth, finalHeight);
                                popupWindow.center();
                                popupWindow.show();
                            }
                        } catch (jsError) {
                            console.warn('Failed to execute resize script, showing with default size:', jsError.message);
                            if (!popupWindow.isDestroyed()) {
                                popupWindow.show();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error resizing popup:', error);
                    try {
                        if (!popupWindow.isDestroyed()) {
                            popupWindow.show();
                        }
                    } catch (showError) {
                        console.error('Error showing popup after resize failure:', showError);
                    }
                }
            }, 200);

            return { success: true };
        } catch (error) {
            console.error('Error in showExtensionPopup:', error);
            return { success: false, error: error.message };
        }
    }

    // FIXED: Safe extension unloading
    async unloadExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (extension) {
            // Close popup safely
            if (this.popupWindows.has(extensionId)) {
                this.safeClosePopup(extensionId);
            }

            // Remove from Electron session
            if (extension.electronId) {
                try {
                    await session.defaultSession.removeExtension(extension.electronId);
                } catch (error) {
                    console.warn('Failed to remove extension from session:', error.message);
                }
            }

            // Unregister protocol
            const extensionScheme = `chrome-extension-${extension.id}`;
            if (this.registeredProtocols.has(extensionScheme)) {
                try {
                    protocol.unregisterProtocol(extensionScheme);
                    this.registeredProtocols.delete(extensionScheme);
                } catch (error) {
                    console.warn('Failed to unregister protocol:', error.message);
                }
            }

            // Clean up storage
            if (this.extensionStores.has(extensionId)) {
                this.extensionStores.delete(extensionId);
            }

            // Remove from tracking
            this.extensions.delete(extensionId);
            this.loadedExtensions.delete(extensionId);

            // Update saved configuration
            this.saveConfiguration();

            console.log('Extension unloaded:', extension.name);
        }
    }

    // FIXED: Enhanced cleanup with better error handling
    async cleanup() {
        console.log('Cleaning up ExtensionManager...');

        // Clean up popup windows safely
        const popupPromises = [];
        for (const extensionId of this.popupWindows.keys()) {
            try {
                this.safeClosePopup(extensionId);
            } catch (error) {
                console.warn('Error during popup cleanup for extension', extensionId, ':', error.message);
            }
        }

        // Clear all popup tracking
        this.popupWindows.clear();
        this.popupInitData.clear();

        // Unload all extensions
        const unloadPromises = [];
        for (const extensionId of this.extensions.keys()) {
            unloadPromises.push(
                this.unloadExtension(extensionId).catch(error => {
                    console.warn('Error unloading extension', extensionId, ':', error.message);
                })
            );
        }

        // Wait for all unload operations to complete
        await Promise.allSettled(unloadPromises);

        // Remove IPC listeners
        try {
            ipcMain.removeAllListeners('get-popup-init-data');
        } catch (error) {
            console.warn('Error removing IPC listeners:', error.message);
        }

        console.log('ExtensionManager cleanup complete');
    }

    // ... (rest of the methods remain the same)
    async initializeFromConfig() {
        try {
            if (fs.existsSync(this.extensionsConfigPath)) {
                const configData = fs.readFileSync(this.extensionsConfigPath, 'utf8');
                const config = JSON.parse(configData);

                console.log('Loading saved extensions configuration...');

                for (const extensionConfig of config.extensions || []) {
                    try {
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

    // Helper methods for URL parsing
    getHostnameFromUrl(url) {
        try {
            if (!url || url === 'about:blank') return '';
            const urlObj = new URL(url);
            return urlObj.hostname || '';
        } catch (error) {
            return '';
        }
    }

    getDomainFromUrl(url) {
        try {
            if (!url || url === 'about:blank') return '';
            const hostname = this.getHostnameFromUrl(url);
            return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
        } catch (error) {
            return '';
        }
    }

    getOriginFromUrl(url) {
        try {
            if (!url || url === 'about:blank') return '';
            const urlObj = new URL(url);
            return urlObj.origin || '';
        } catch (error) {
            return '';
        }
    }

    getProtocolFromUrl(url) {
        try {
            if (!url || url === 'about:blank') return '';
            const urlObj = new URL(url);
            return urlObj.protocol || '';
        } catch (error) {
            return '';
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

                const resolvedPath = path.resolve(filePath);
                const extensionDir = path.resolve(extension.path);

                if (!resolvedPath.startsWith(extensionDir)) {
                    console.warn('Attempted to access file outside extension directory:', resolvedPath);
                    callback({ error: -6 });
                    return;
                }

                if (fs.existsSync(resolvedPath)) {
                    callback({ path: resolvedPath });
                } else {
                    console.warn('Extension file not found:', resolvedPath);
                    callback({ error: -6 });
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
}

module.exports = ExtensionManager;