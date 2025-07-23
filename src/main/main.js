// main\main.js (modified)

const { app, BrowserWindow, ipcMain, session, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const ExtensionManager = require('./extension-manager');

class NetBirdBrowser {
  constructor() {
    this.windows = new Map();
    this.extensions = new Map();
    this.extensionManager = new ExtensionManager();
    this.setupApp();
  }

  setupApp() {
    app.whenReady().then(async () => {
      await this.extensionManager.initializeFromConfig();
      this.createMainWindow();
      this.setupIPC();
      this.setupMenu();
      await this.loadExtensions();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
  }

  createMainWindow() {
    const mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      icon: path.join(__dirname, '../../build/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: false,
        enableRemoteModule: false,
        webviewTag: true,
        allowRunningInsecureContent: true,
        experimentalFeatures: true,
        sandbox: false
      },
      titleBarStyle: 'hidden',
      frame: false,
      show: false
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
      }
    });

    mainWindow.webContents.on("did-attach-webview", (_, contents) => {
      contents.setWindowOpenHandler((details) => {

        let url = details.url;
        if (url.length > 0) {
          mainWindow.webContents.send('create-new-tab', { url: url });
        }

        return { action: 'deny' }
      })
    })

    mainWindow.on('closed', () => {
      this.windows.delete('main');
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    this.windows.set('main', mainWindow);
    return mainWindow;
  }

  setupIPC() {


    // Webview key event handler
    ipcMain.handle('webview-key-event', async (event, tabId, keyEventData) => {
      try {

        console.log(`Webview key event from tab ${tabId}:`, keyEventData);

        // Get the window that sent this event
        const win = BrowserWindow.fromWebContents(event.sender);
        const windowId = this.getWindowId(win);

        if (!windowId) {
          console.error('Could not identify window for key event');
          return { success: false };
        }

        // Store/update the key event data
        const windowHandlers = this.webviewKeyEventHandlers.get(windowId);
        if (windowHandlers) {
          windowHandlers.set(tabId, {
            lastKeyEvent: keyEventData,
            timestamp: Date.now()
          });
        }

        // Handle specific key combinations or patterns here
        await this.handleWebviewKeyEvent(windowId, tabId, keyEventData);

        return { success: true };
      } catch (error) {
        console.error('Error handling webview key event:', error);
        return { success: false, error: error.message };
      }
    });

    // Register key event handler
    ipcMain.handle('register-webview-key-handler', async (event, tabId, handlerName) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const windowId = this.getWindowId(win);

        if (!windowId) {
          return { success: false, error: 'Window not found' };
        }

        console.log(`Registered key handler "${handlerName}" for tab ${tabId} in window ${windowId}`);
        return { success: true };
      } catch (error) {
        console.error('Error registering key handler:', error);
        return { success: false, error: error.message };
      }
    });

    // Get key event history for a tab
    ipcMain.handle('get-webview-key-history', async (event, tabId, limit = 10) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const windowId = this.getWindowId(win);

        if (!windowId) {
          return { success: false, error: 'Window not found' };
        }

        const windowHandlers = this.webviewKeyEventHandlers.get(windowId);
        const tabHandler = windowHandlers ? windowHandlers.get(tabId) : null;

        return {
          success: true,
          data: tabHandler ? [tabHandler.lastKeyEvent] : []
        };
      } catch (error) {
        console.error('Error getting key history:', error);
        return { success: false, error: error.message };
      }
    });

    // Window control handlers




    ipcMain.handle('window-minimize', (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
          win.minimize();
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error minimizing window:', error);
        return false;
      }
    });

    ipcMain.handle('window-maximize', (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
          if (win.isMaximized()) {
            win.unmaximize();
          } else {
            win.maximize();
          }
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error maximizing window:', error);
        return false;
      }
    });

    ipcMain.handle('window-close', (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
          win.close();
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error closing window:', error);
        return false;
      }
    });



    ipcMain.handle('close-tab', async (event, tabId) => {
      console.log('Closing tab:', tabId);
      return { success: true };
    });

    ipcMain.handle('navigate-tab', async (event, tabId, url) => {
      console.log('Navigating tab:', tabId, 'to:', url);
      return { success: true };
    });

    ipcMain.handle('get-history', async () => {
      return store.get('history', []);
    });

    ipcMain.handle('add-history', async (event, entry) => {
      const history = store.get('history', []);
      history.unshift(entry);
      if (history.length > 1000) history.pop();
      store.set('history', history);
      return { success: true };
    });

    ipcMain.handle('get-bookmarks', async () => {
      return store.get('bookmarks', []);
    });

    ipcMain.handle('add-bookmark', async (event, bookmark) => {
      const bookmarks = store.get('bookmarks', []);
      bookmarks.push(bookmark);
      store.set('bookmarks', bookmarks);
      return { success: true };
    });

    ipcMain.handle('load-extension', async (event, extensionPath) => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Extension Folder'
        });

        if (!result.canceled && result.filePaths.length > 0) {
          return await this.extensionManager.loadExtension(result.filePaths[0]);
        }
        return null;
      } catch (error) {
        console.error('Failed to load extension:', error);
        throw error;
      }
    });

    ipcMain.handle('get-extensions', async () => {
      return this.extensionManager.getExtensions();
    });

    ipcMain.handle('show-extension-popup', async (event, extensionId, currentUrl) => {
      console.log('IPC show-extension-popup called with extensionId:', extensionId, 'currentUrl:', currentUrl);
      try {
        const mainWindow = this.windows.get('main');
        if (!mainWindow) {
          console.error('Main window not found');
          return { success: false, error: 'Main window not found' };
        }
        const result = await this.extensionManager.showExtensionPopup(extensionId, mainWindow, currentUrl);
        console.log('IPC show-extension-popup response:', result);
        return result;
      } catch (error) {
        console.error('Failed to show extension popup:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-extension-file-content', async (event, extensionId, relativePath) => {
      try {
        const extension = this.extensionManager.getExtension(extensionId);
        if (!extension) {
          throw new Error('Extension not found');
        }
        const fullPath = path.join(extension.path, relativePath);
        if (!fs.existsSync(fullPath)) {
          throw new Error('File not found');
        }
        return fs.readFileSync(fullPath, 'utf8');
      } catch (error) {
        console.error('Failed to get extension file content:', error);
        throw error;
      }
    });
    ipcMain.handle('extension-storage-get', async (event, extensionId, keys) => {
      return this.extensionManager.getStorage(extensionId, keys);
    });

    ipcMain.handle('extension-storage-set', async (event, extensionId, items) => {
      await this.extensionManager.setStorage(extensionId, items);  // Changed from netbird.extensionManager
      return { success: true };
    });

    ipcMain.handle('get-extension-api-script', async (event, extensionId, currentUrl = '') => {
      try {
        const extension = this.extensionManager.getExtension(extensionId);
        if (!extension) {
          throw new Error('Extension not found');
        }
        const safeExtension = JSON.parse(JSON.stringify(extension));
        if (!safeExtension.manifest || typeof safeExtension.manifest !== 'object') {
          throw new Error('Invalid extension manifest');
        }
        let manifestString = JSON.stringify(safeExtension.manifest);
        const escapedCurrentUrl = currentUrl.replace(/'/g, "\\'");
        const apiScript = `
      (function() {
        try {
          window.chrome = window.chrome || {};
          window.chrome.extension = window.chrome.extension || {};
          window.chrome.extension.getURL = window.chrome.extension.getURL || function(path) {
            return 'chrome-extension-${safeExtension.id}://' + path;
          };
          window.chrome.runtime = window.chrome.runtime || {};
          window.chrome.runtime.getManifest = window.chrome.runtime.getManifest || function() {
            return ${manifestString};
          };
          window.chrome.runtime.id = '${safeExtension.id}';
          window.chrome.runtime.lastError = undefined;
          window.chrome.runtime.sendMessage = function(...args) {
            let id, message, options, responseCallback;
            if (args.length === 1) {
              message = args[0];
            } else if (args.length === 2) {
              if (typeof args[1] === 'function') {
                message = args[0];
                responseCallback = args[1];
              } else {
                id = args[0];
                message = args[1];
              }
            } else if (args.length === 3) {
              if (typeof args[2] === 'function') {
                id = args[0];
                message = args[1];
                responseCallback = args[2];
              } else {
                id = args[0];
                message = args[1];
                options = args[2];
              }
            } else if (args.length === 4) {
              id = args[0];
              message = args[1];
              options = args[2];
              responseCallback = args[3];
            }
            if (responseCallback) {
              responseCallback({});
            } else {
              return Promise.resolve({});
            }
          };
          window.chrome.runtime.onMessage = window.chrome.runtime.onMessage || {
            addListener: function(fn) {},
            removeListener: function(fn) {},
            hasListener: function(fn) { return false; },
            hasListeners: function() { return false; }
          };
          window.chrome.runtime.onConnect = window.chrome.runtime.onConnect || {
            addListener: function(fn) {},
            removeListener: function(fn) {},
            hasListener: function(fn) { return false; },
            hasListeners: function() { return false; }
          };
          window.chrome.runtime.connect = window.chrome.runtime.connect || function(extensionId, connectInfo) {
            return {
              name: connectInfo ? connectInfo.name : '',
              postMessage: function(msg) {},
              disconnect: function() {},
              onDisconnect: {
                addListener: function(fn) {},
                removeListener: function(fn) {},
                hasListener: function(fn) { return false; }
              },
              onMessage: {
                addListener: function(fn) {},
                removeListener: function(fn) {},
                hasListener: function(fn) { return false; }
              }
            };
          };
          window.chrome.i18n = window.chrome.i18n || {};
          window.chrome.i18n.getMessage = window.chrome.i18n.getMessage || function(key, substitutions) {
            return key;
          };
          if (!window.browser) {
            window.browser = window.chrome;
          }
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
            const promise = window.electronAPI.extensionStorageGet('${safeExtension.id}', keys);
            if (typeof callback === 'function') {
              promise.then(result => callback(result)).catch(err => console.error('Storage get error:', err));
            } else {
              return promise;
            }
          };
          window.chrome.storage.local.set = function(...args) {
            let items = null, callback = null;
            if (args.length === 0) {
              items = {};
            } else if (args.length === 1) {
              if (typeof args[0] === 'function') {
                callback = args[0];
                items = {};
              } else {
                items = args[0];
              }
            } else if (args.length === 2) {
              items = args[0];
              callback = args[1];
            }
            const promise = window.electronAPI.extensionStorageSet('${safeExtension.id}', items);
            if (typeof callback === 'function') {
              promise.then(() => callback()).catch(err => console.error('Storage set error:', err));
            } else {
              return promise;
            }
          };
          window.chrome.tabs = window.chrome.tabs || {};
          window.chrome.tabs.query = function(queryInfo, callback) {
            if (typeof queryInfo === 'function') {
              callback = queryInfo;
              queryInfo = {};
            }
            const exec = () => {
              const result = [];
              const hasCurrent = (queryInfo.currentWindow === undefined || queryInfo.currentWindow) && (queryInfo.active === undefined || queryInfo.active);
              const currentUrl = '${escapedCurrentUrl}';
              if (hasCurrent && currentUrl) {
                result.push({
                  id: 1,
                  index: 0,
                  windowId: 1,
                  active: true,
                  url: currentUrl,
                  title: 'Current Tab'
                });
              }
              return result;
            };
            if (callback) {
              callback(exec());
            } else {
              return Promise.resolve(exec());
            }
          };
          window.chrome.tabs.getCurrent = function(callback) {
            const exec = () => undefined;
            if (callback) {
              callback(exec());
            } else {
              return Promise.resolve(exec());
            }
          };
        } catch (error) {
          console.error('Extension API injection failed:', error);
        }
      })();
    `;
        return apiScript;
      } catch (error) {
        console.error('Failed to get extension api script:', error);
        throw error;
      }
    });

    ipcMain.handle('webview-permission', async (event, permission, origin) => {
      console.log('Webview permission requested:', permission, 'for:', origin);
      return true;
    });

    // Add window control IPC handlers
    ipcMain.on('minimize-window', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.minimize();
    });

    ipcMain.on('maximize-window', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      }
    });

    ipcMain.on('close-window', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close();
    });
  }

  setupMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Tab',
            accelerator: 'CmdOrCtrl+T',
            click: () => {
              const mainWindow = this.windows.get('main');
              if (mainWindow) {
                // mainWindow.webContents.send('create-new-tab');
              }
            }
          },
          {
            label: 'New Window',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.createMainWindow();
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  async loadExtensions() {
    try {
      const extensionsPath = path.join(__dirname, '../extensions');
      console.log('Extensions path:', extensionsPath);

      if (!fs.existsSync(extensionsPath)) {
        console.log('Extensions directory does not exist, creating it...');
        fs.mkdirSync(extensionsPath, { recursive: true });
        return;
      }

      const files = await fs.promises.readdir(extensionsPath, { withFileTypes: true });
      const extensionFolders = files.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

      console.log('Found extension folders:', extensionFolders);

      for (const folder of extensionFolders) {
        const extensionDir = path.join(extensionsPath, folder);
        try {
          await this.extensionManager.loadExtension(extensionDir);
        } catch (error) {
          console.error(`Failed to load extension from ${folder}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Failed to load extensions:', error);
    }
  }
}

const store = new Store();
const netbird = new NetBirdBrowser();

// Export the netbird instance for global access
module.exports = { netbird };