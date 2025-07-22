// modules/TabManager.js
export class TabManager {
    constructor(app) {
        this.app = app;
        this.tabs = new Map();
        this.tabCounter = 0;
    }

    createInitialTab() {
        this.createNewTab('netbird://welcome');
    }

    createNewTab(url = 'netbird://welcome') {

        if (url === 'netbird://welcome') {
            this.app.uiManager.showWelcomeScreen();
        } else {
            const tabId = `tab-${++this.tabCounter}`;
            const tab = {
                id: tabId,
                url: url,
                title: 'New Tab',
                favicon: null,
                canGoBack: false,
                canGoForward: false,
                isLoading: false
            };

            this.tabs.set(tabId, tab);
            this.renderTab(tab);
            this.switchToTab(tabId);

            this.app.navigationManager.navigate(url);
        }
    }

    renderTab(tab) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab-item';
        tabElement.dataset.tabId = tab.id;

        // Use template literal with proper escaping for onclick
        const escapedTabId = tab.id.replace(/'/g, "\\'");

        tabElement.innerHTML = `
            <img class="tab-favicon" src="${tab.favicon || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 16 16%22><circle cx=%228%22 cy=%228%22 r=%226%22 fill=%22%23999%22/></svg>'}" alt="">
            <span class="tab-title">${this.escapeHtml(tab.title)}</span>
            <button class="tab-close" type="button">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" stroke-width="2"/>
                </svg>
            </button>
        `;

        // Add event listeners properly
        const closeButton = tabElement.querySelector('.tab-close');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tab.id);
        });

        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchToTab(tab.id);
            }
        });

        tabElement.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                this.closeTab(tab.id);
            }
        });

        document.getElementById('tabsContainer').appendChild(tabElement);
    }

    switchToTab(tabId) {
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.classList.remove('active');
        });

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.classList.add('active');
        }

        this.app.activeTabId = tabId;
        const tab = this.tabs.get(tabId);
        if (tab) {
            this.app.uiManager.updateUI(tab);
            this.app.navigationManager.showWebview(tabId);

            setTimeout(() => {
                const webview = document.getElementById(`webview-${tabId}`);
                if (webview) {
                    this.app.navigationManager.resizeWebview(webview);
                }
            }, 100);
        }
    }

    closeTab(tabId) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.remove();
        }

        const webview = document.getElementById(`webview-${tabId}`);
        if (webview) {
            webview.remove();
        }

        this.tabs.delete(tabId);

        if (this.app.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[0]);
            } else {
                this.app.uiManager.showWelcomeScreen();
            }
        }
    }

    updateTabTitle(tabId, title) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-title`);
        if (tabElement) {
            tabElement.textContent = title || 'Untitled';
        }
    }

    updateTabFavicon(tabId, favicon) {
        const faviconElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-favicon`);
        if (faviconElement && favicon) {
            faviconElement.src = favicon;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}