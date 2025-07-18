const { contextBridge, ipcRenderer } = require('electron');

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