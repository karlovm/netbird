// main\preload.js

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

const api = {
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
  navigateTab: (tabId, url) => ipcRenderer.invoke('navigate-tab', tabId, url),
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  loadExtension: (path) => ipcRenderer.invoke('load-extension', path),
  getExtensions: () => ipcRenderer.invoke('get-extensions'),
  extensionStorageGet: (extensionId, keys) => ipcRenderer.invoke('extension-storage-get', extensionId, keys),
  extensionStorageSet: (extensionId, items) => ipcRenderer.invoke('extension-storage-set', extensionId, items),
  getPreloadPath: () => path.join(__dirname, 'preload.js'),
  onCreateNewTab: (callback) => ipcRenderer.on('create-new-tab', callback),
  onTabUpdate: (callback) => ipcRenderer.on('tab-update', callback),
  onExtensionAction: (callback) => ipcRenderer.on('extension-action', callback),
  showExtensionPopup: (extensionId, currentUrl) => ipcRenderer.invoke('show-extension-popup', extensionId, currentUrl),
  getExtensionFileContent: (extensionId, relativePath) => ipcRenderer.invoke('get-extension-file-content', extensionId, relativePath),
  getExtensionApiScript: (extensionId, currentUrl) => ipcRenderer.invoke('get-extension-api-script', extensionId, currentUrl),
};

if (contextBridge) {
  contextBridge.exposeInMainWorld('electronAPI', api);
} else {
  window.electronAPI = api;
}