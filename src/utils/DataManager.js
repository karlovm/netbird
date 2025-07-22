// modules/DataManager.js
export class DataManager {
    constructor(app) {
        this.app = app;
        this.history = [];
        this.bookmarks = [];
    }

    async loadData() {
        try {
            if (window.electronAPI) {
                this.history = await window.electronAPI.getHistory() || [];
                this.bookmarks = await window.electronAPI.getBookmarks() || [];
            } else {
                console.warn('Electron API not available, running in fallback mode');
                this.history = [];
                this.bookmarks = [];
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            this.history = [];
            this.bookmarks = [];
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

    async bookmarkCurrentPage() {
        if (!this.app.activeTabId) return;
        
        const tab = this.app.tabManager.tabs.get(this.app.activeTabId);
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