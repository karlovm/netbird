const Store = require('electron-store');

class HistoryManager {
    constructor() {
        this.store = new Store({
            name: 'history',
            defaults: {
                entries: []
            }
        });
    }

    addEntry(url, title) {
        const entries = this.store.get('entries', []);
        const entry = {
            url,
            title,
            timestamp: Date.now(),
            visitCount: 1
        };

        // Check if URL already exists
        const existingIndex = entries.findIndex(e => e.url === url);
        if (existingIndex >= 0) {
            entries[existingIndex].timestamp = Date.now();
            entries[existingIndex].visitCount++;
        } else {
            entries.unshift(entry);
        }

        // Keep only last 10000 entries
        if (entries.length > 10000) {
            entries.splice(10000);
        }

        this.store.set('entries', entries);
        return entry;
    }

    getEntries(limit = 1000) {
        return this.store.get('entries', []).slice(0, limit);
    }

    searchEntries(query) {
        const entries = this.store.get('entries', []);
        return entries.filter(entry => 
            entry.title.toLowerCase().includes(query.toLowerCase()) ||
            entry.url.toLowerCase().includes(query.toLowerCase())
        );
    }

    clearHistory() {
        this.store.set('entries', []);
    }

    removeEntry(url) {
        const entries = this.store.get('entries', []);
        const filteredEntries = entries.filter(entry => entry.url !== url);
        this.store.set('entries', filteredEntries);
    }
}

module.exports = HistoryManager;