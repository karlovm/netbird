const Store = require('electron-store');

class BookmarkManager {
    constructor() {
        this.store = new Store({
            name: 'bookmarks',
            defaults: {
                bookmarks: []
            }
        });
    }

    addBookmark(url, title, folder = 'default') {
        const bookmarks = this.store.get('bookmarks', []);
        const bookmark = {
            id: this.generateId(),
            url,
            title,
            folder,
            timestamp: Date.now()
        };

        bookmarks.push(bookmark);
        this.store.set('bookmarks', bookmarks);
        return bookmark;
    }

    getBookmarks() {
        return this.store.get('bookmarks', []);
    }

    removeBookmark(id) {
        const bookmarks = this.store.get('bookmarks', []);
        const filteredBookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
        this.store.set('bookmarks', filteredBookmarks);
    }

    updateBookmark(id, updates) {
        const bookmarks = this.store.get('bookmarks', []);
        const index = bookmarks.findIndex(bookmark => bookmark.id === id);
        
        if (index >= 0) {
            bookmarks[index] = { ...bookmarks[index], ...updates };
            this.store.set('bookmarks', bookmarks);
            return bookmarks[index];
        }
        
        return null;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

module.exports = BookmarkManager;