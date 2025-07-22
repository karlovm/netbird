// modules/EventManager.js

export class EventManager {
    constructor(app) {
        this.app = app;
    }

    bindEvents() {
        this.bindNavigationEvents();
        this.bindTabEvents();
        this.bindElectronEvents();
    }

    bindNavigationEvents() {
        // Back button
        document.getElementById('backBtn').addEventListener('click', () => {
            this.app.goBack();
        });

        // Forward button
        document.getElementById('forwardBtn').addEventListener('click', () => {
            this.app.goForward();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.app.refresh();
        });

        // URL input - navigate on Enter
        const urlInput = document.getElementById('urlInput');
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.app.navigate(urlInput.value);
            }
        });
    }

    bindTabEvents() {
        // New tab button
        document.getElementById('newTabBtn').addEventListener('click', () => {
            this.app.createNewTab();
        });
    }

   

}