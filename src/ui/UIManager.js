// modules/UIManager.js
export class UIManager {
    constructor(app) {
        this.app = app;
        this.isResizing = false;
        this.addressBarTimeout = null;
        this.scrollDebounceTimeout = null;
        this.lastScrollPositions = new Map();
        this.expandedWidth = parseInt(localStorage.getItem('sidebarExpandedWidth')) || 250;
        this.mouseOverAddressBar = false;
        const isCollapsed = localStorage.getItem('sidebarCollapsed') !== 'false';

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            if (isCollapsed) {
                sidebar.style.width = '50px';
                sidebar.classList.add('collapsed');
            } else {
                sidebar.style.width = `${this.expandedWidth}px`;
                sidebar.classList.remove('collapsed');
            }
        }

        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark');
        }

        this.setupResizer();
        this.setupSidebarControls();
        this.setupSidebarScrollHandler();
        this.setupSidebarMiddleClick();
        this.setupWindowControls();
        this.setupAddressBarAutoHide();
        this.setupWebviewEventListeners();
        this.setupUrlInputHandlers(); // New method to handle URL input interactions
        this.setupThemeToggle();
    }

    // New method to set up theme toggle
    setupThemeToggle() {
        const themeBtn = document.getElementById('themeBtn');
        if (!themeBtn) return;

        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const isDark = document.body.classList.contains('dark');
            localStorage.setItem('darkMode', isDark.toString());
            console.log(`UIManager: Dark mode ${isDark ? 'enabled' : 'disabled'}`);
        });

        console.log('UIManager: Theme toggle setup complete');
    }

    // New method to set up URL input event listeners
    setupUrlInputHandlers() {
        const urlInput = document.getElementById('urlInput');
        if (!urlInput) return;

        // On focus, show the URL and select all text, and show bar
        urlInput.addEventListener('focus', () => {
            const tab = this.app.tabManager.tabs.get(this.app.activeTabId);
            if (tab && tab.url !== 'netbird://welcome') {
                urlInput.value = tab.url;
                urlInput.select(); // Auto-select all text
            }
            this.showBar(false);
        });

        // On blur (when user clicks away), revert to showing the tab title and handle hide
        urlInput.addEventListener('blur', () => {
            const tab = this.app.tabManager.tabs.get(this.app.activeTabId);
            if (tab) {
                urlInput.value = tab.url === 'netbird://welcome' ? '' : (tab.title || 'Untitled');
            }
            if (!this.mouseOverAddressBar) {
                this.startHideTimer();
            }
        });

        // On Enter key, navigate to the entered URL and revert to title
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = urlInput.value.trim();
                if (url) {
                    this.app.navigationManager.navigate(url);
                    urlInput.blur();
                    // After navigation, updateUI will handle setting the title
                }
            }
        });

        console.log('UIManager: URL input handlers setup complete');
    }

    updateUI(tab) {
        const urlInput = document.getElementById('urlInput');
        if (urlInput && document.activeElement !== urlInput) {
            // Display tab title instead of URL, unless it's the welcome screen
            urlInput.value = tab.url === 'netbird://welcome' ? '' : (tab.title || 'Untitled');
        }

        this.updateNavigationButtons(tab.canGoBack, tab.canGoForward);

        const container = document.getElementById('webviewContainer');
        const existingIndicator = container.querySelector('.loading-indicator');

        if (tab.isLoading && !existingIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'loading-indicator';
            container.appendChild(indicator);
        } else if (!tab.isLoading && existingIndicator) {
            existingIndicator.remove();
        }
    }

    setupWebviewEventListeners() {
        console.log('UIManager: Setting up webview event listeners...');
        
        // Bind methods to preserve 'this' context
        this.boundHandleWebviewScrollEvent = this.handleWebviewScrollEvent.bind(this);
        this.boundHandleWebviewWheelEvent = this.handleWebviewWheelEvent.bind(this);
        
        // Remove any existing listeners first
        window.removeEventListener('wheel', this.boundHandleWebviewWheelEvent);
        window.removeEventListener('webview-scroll', this.boundHandleWebviewScrollEvent);
        
        // Add event listeners
        window.addEventListener('wheel', this.boundHandleWebviewWheelEvent, { passive: false });
        window.addEventListener('webview-scroll', this.boundHandleWebviewScrollEvent, { passive: false });

        console.log('UIManager: Webview event listeners setup complete');
    }

    handleWebviewWheelEvent(event) {
        console.log('UIManager: handleWebviewWheelEvent called', {
            hasSourceTabId: !!event.sourceTabId,
            hasDetail: !!event.detail,
            deltaY: event.deltaY,
            detailDeltaY: event.detail?.deltaY,
            eventType: event.type,
            activeTabId: this.app.activeTabId
        });
        
        // Check for sourceTabId in both direct property and detail object
        const sourceTabId = event.sourceTabId || event.detail?.sourceTabId;
        
        // Only handle events from webviews (check for sourceTabId from WebviewEvents)
        if (!sourceTabId) {
            // Handle non-webview wheel events (native browser scrolling)
            const addressBarCon = document.querySelector('.address-bar-con');
            if (addressBarCon && event.deltaY < -50 && addressBarCon.classList.contains('collapsed')) {
                console.log('Non-webview scroll up detected, showing address bar');
                this.showBar(true);
            }
            return;
        }

        // Only process events from the active tab
        if (sourceTabId !== this.app.activeTabId) {
            console.log(`Ignoring wheel event from inactive tab ${sourceTabId}, active tab is ${this.app.activeTabId}`);
            return;
        }

        const addressBarCon = document.querySelector('.address-bar-con');
        if (!addressBarCon) return;

        // Debounce logic
        if (this.scrollDebounceTimeout) {
            clearTimeout(this.scrollDebounceTimeout);
        }
        
        this.scrollDebounceTimeout = setTimeout(() => {
            // Handle wheel events (scrolling up to show address bar)
            // Get deltaY from direct property or detail object
            const deltaY = event.deltaY || event.detail?.deltaY || 0;
            
            if (deltaY < -50 && addressBarCon.classList.contains('collapsed')) {
                console.log(`Webview wheel scroll up detected (deltaY: ${deltaY}), showing address bar`);
                this.showBar(true);
            }
        }, 50); // Reduced debounce for better responsiveness
    }

    handleWebviewScrollEvent(event) {
        console.log('UIManager: handleWebviewScrollEvent called', {
            hasDetail: !!event.detail,
            sourceTabId: event.detail?.sourceTabId,
            eventType: event.detail?.eventType,
            scrollTop: event.detail?.scrollTop,
            activeTabId: this.app.activeTabId
        });

        // Handle custom webview-scroll events dispatched by WebviewEvents
        const scrollData = event.detail;

        // Only handle events from webviews
        if (!scrollData || !scrollData.sourceTabId) {
            console.log('Ignoring scroll event: no sourceTabId');
            return;
        }

        // Only process events from the active tab
        if (scrollData.sourceTabId !== this.app.activeTabId) {
            console.log(`Ignoring scroll event from inactive tab ${scrollData.sourceTabId}, active tab is ${this.app.activeTabId}`);
            return;
        }

        const addressBarCon = document.querySelector('.address-bar-con');
        if (!addressBarCon) return;

        // Debounce logic
        if (this.scrollDebounceTimeout) {
            clearTimeout(this.scrollDebounceTimeout);
        }
        
        this.scrollDebounceTimeout = setTimeout(() => {
            // Handle scroll events
            if (scrollData.eventType === 'scroll') {
                const currentScrollTop = scrollData.scrollTop || 0;
                const tabId = scrollData.sourceTabId;
                const lastScrollTop = this.lastScrollPositions.get(tabId) || 0;
                
                console.log(`Scroll position change: ${lastScrollTop} -> ${currentScrollTop}`);
                
                // Show address bar if:
                // 1. Scrolled to the very top (scrollTop === 0), OR
                // 2. Scrolling up significantly (decreased by more than 100px)
                if (currentScrollTop === 0) {
                    if (addressBarCon.classList.contains('collapsed')) {
                        console.log(`Webview scrolled to top, showing address bar`);
                        this.showBar(true);
                    }
                } else if (lastScrollTop - currentScrollTop > 100 && addressBarCon.classList.contains('collapsed')) {
                    console.log(`Webview scrolled up significantly (${lastScrollTop - currentScrollTop}px), showing address bar`);
                    this.showBar(true);
                }
                
                // Update last scroll position
                this.lastScrollPositions.set(tabId, currentScrollTop);
            }
        }, 100); // 100ms debounce
    }

    setupAddressBarAutoHide() {
        const addressBarCon = document.querySelector('.address-bar-con');
        if (!addressBarCon) return;

        this.startHideTimer = () => {
            if (this.addressBarTimeout) {
                clearTimeout(this.addressBarTimeout);
            }
            this.addressBarTimeout = setTimeout(() => {
                addressBarCon.classList.add('collapsed');
                this.addressBarTimeout = null;
            }, 3000);
        };

        // Mouse interactions with address bar
        addressBarCon.addEventListener('mouseenter', () => {
            this.mouseOverAddressBar = true;
            this.showBar(false);
        });
        addressBarCon.addEventListener('mouseleave', () => {
            this.mouseOverAddressBar = false;
            const urlInput = document.getElementById('urlInput');
            if (document.activeElement !== urlInput) {
                this.startHideTimer();
            }
        });

        console.log('UIManager: Address bar auto-hide setup complete');
    }

    // Updated showBar method to be consistent with WebviewEvents
    showBar(autoHide = false) {
        const addressBarCon = document.querySelector('.address-bar-con');
        if (!addressBarCon) return;

        // Clear any existing timeout
        if (this.addressBarTimeout) {
            clearTimeout(this.addressBarTimeout);
            this.addressBarTimeout = null;
        }

        // Show the address bar
        addressBarCon.classList.remove('collapsed');
        console.log('Address bar shown', autoHide ? '(auto-hide enabled)' : '');

        // Set auto-hide timer if requested
        if (autoHide) {
            this.addressBarTimeout = setTimeout(() => {
                addressBarCon.classList.add('collapsed');
                this.addressBarTimeout = null;
                console.log('Address bar auto-hidden');
            }, 3000);
        }
    }

    // Method to manually hide the address bar
    hideBar() {
        const addressBarCon = document.querySelector('.address-bar-con');
        if (!addressBarCon) return;

        if (this.addressBarTimeout) {
            clearTimeout(this.addressBarTimeout);
            this.addressBarTimeout = null;
        }

        addressBarCon.classList.add('collapsed');
        console.log('Address bar manually hidden');
    }

    setupSidebarMiddleClick() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('auxclick', (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    this.app.tabManager.createNewTab();
                }
            });
        }
    }

    setupSidebarScrollHandler() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY;
                if (delta === 0) return;
                const direction = delta > 0 ? 1 : -1; // down: +1 (next), up: -1 (prev)
                this.switchTabByOffset(direction);
            }, { passive: false });
        }
    }

    switchTabByOffset(offset) {
        const tabElements = document.querySelectorAll('.tab-item');
        if (tabElements.length < 2) return;
        const activeTab = document.querySelector('.tab-item.active');
        if (!activeTab) return;
        const tabsArray = Array.from(tabElements);
        let currentIndex = tabsArray.findIndex(el => el === activeTab);
        if (currentIndex === -1) return;
        let newIndex = currentIndex + offset;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= tabsArray.length) newIndex = tabsArray.length - 1;
        const newTabId = tabsArray[newIndex].dataset.tabId;
        this.app.tabManager.switchToTab(newTabId);
    }

    setupSidebarControls() {
        const collapseBtn = document.getElementById('collapseBtn');
        const sidebar = document.querySelector('.sidebar');

        if (collapseBtn && sidebar) {
            collapseBtn.addEventListener('click', () => {
                const isCollapsed = sidebar.classList.contains('collapsed');
                if (isCollapsed) {
                    // Expand
                    sidebar.style.width = `${this.expandedWidth}px`;
                    sidebar.classList.remove('collapsed');
                } else {
                    // Collapse
                    const currentWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
                    this.expandedWidth = Math.max(50, currentWidth);
                    sidebar.style.width = '50px';
                    sidebar.classList.add('collapsed');
                }
                // Save state to localStorage
                this.saveSidebarState(sidebar);
                window.dispatchEvent(new Event('resize'));
            });
        }
    }

    setupResizer() {
        const resizer = document.querySelector('.resizer');
        if (!resizer) return;

        let startX = 0;
        let startWidth = 0;
        let sidebar = null;

        const startResize = (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.isResizing = true;
            startX = e.clientX;
            sidebar = document.querySelector('.sidebar');

            if (sidebar) {
                startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
                sidebar.classList.add('resizing');
            }

            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.body.style.pointerEvents = 'none';
            resizer.style.pointerEvents = 'auto';

            document.addEventListener('mousemove', handleResize, { passive: false });
            document.addEventListener('mouseup', stopResize, { passive: false });
            document.addEventListener('mouseleave', stopResize);

            if (resizer.setCapture) {
                resizer.setCapture();
            }
        };

        const handleResize = (e) => {
            if (!this.isResizing || !sidebar) return;

            e.preventDefault();
            e.stopPropagation();

            const deltaX = startX - e.clientX;
            let newWidth = Math.max(50, Math.min(500, startWidth + deltaX));
            sidebar.style.width = `${newWidth}px`;

            if (sidebar.classList.contains('collapsed') && newWidth > 50) {
                sidebar.classList.remove('collapsed');
            }

            if (!sidebar.classList.contains('collapsed')) {
                this.expandedWidth = newWidth;
            }
        };

        const stopResize = (e) => {
            if (!this.isResizing) return;

            this.isResizing = false;

            if (sidebar) {
                sidebar.classList.remove('resizing');
                // Save state to localStorage after resize
                this.saveSidebarState(sidebar);
            }

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';

            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('mouseleave', stopResize);

            if (document.releaseCapture) {
                document.releaseCapture();
            }

            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            window.dispatchEvent(new Event('resize'));
        };

        resizer.addEventListener('mousedown', startResize, { passive: false });

        resizer.addEventListener('dragstart', (e) => e.preventDefault());
        resizer.addEventListener('selectstart', (e) => e.preventDefault());
    }

    // New method to save sidebar state
    saveSidebarState(sidebar) {
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
        localStorage.setItem('sidebarExpandedWidth', this.expandedWidth.toString());
    }

    setupWindowControls() {
        const minimizeBtn = document.getElementById('minimizeBtn');
        const maximizeBtn = document.getElementById('maximizeBtn');
        const closeBtn = document.getElementById('closeBtn');

        // Debug logging
        console.log('Setting up window controls...');
        console.log('Buttons found:', { minimizeBtn: !!minimizeBtn, maximizeBtn: !!maximizeBtn, closeBtn: !!closeBtn });
        console.log('electronAPI available:', !!window.electronAPI);

        if (window.electronAPI) {
            console.log('electronAPI methods:', Object.keys(window.electronAPI));
        }

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                console.log('Minimize button clicked');
                if (window.electronAPI && window.electronAPI.minimizeWindow) {
                    window.electronAPI.minimizeWindow();
                } else if (window.electronAPI && window.electronAPI.minimize) {
                    window.electronAPI.minimize();
                } else {
                    console.error('electronAPI.minimizeWindow not available');
                    // Fallback - try direct IPC if available
                    if (window.ipcRenderer) {
                        window.ipcRenderer.send('window-minimize');
                    }
                }
            });
        } else {
            console.error('Minimize button not found');
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                console.log('Maximize button clicked');
                if (window.electronAPI && window.electronAPI.maximizeWindow) {
                    window.electronAPI.maximizeWindow();
                } else if (window.electronAPI && window.electronAPI.maximize) {
                    window.electronAPI.maximize();
                } else {
                    console.error('electronAPI.maximizeWindow not available');
                    // Fallback - try direct IPC if available
                    if (window.ipcRenderer) {
                        window.ipcRenderer.send('window-maximize');
                    }
                }
            });
        } else {
            console.error('Maximize button not found');
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('Close button clicked');
                if (window.electronAPI && window.electronAPI.closeWindow) {
                    window.electronAPI.closeWindow();
                } else if (window.electronAPI && window.electronAPI.close) {
                    window.electronAPI.close();
                } else {
                    console.error('electronAPI.closeWindow not available');
                    // Fallback - try direct IPC if available
                    if (window.ipcRenderer) {
                        window.ipcRenderer.send('window-close');
                    } else {
                        // Last resort - close the window directly (may not work in all contexts)
                        window.close();
                    }
                }
            });
        } else {
            console.error('Close button not found');
        }
    }



    updateNavigationButtons(canGoBack, canGoForward) {
        const backBtn = document.getElementById('backBtn');
        const forwardBtn = document.getElementById('forwardBtn');

        if (backBtn) backBtn.disabled = !canGoBack;
        if (forwardBtn) forwardBtn.disabled = !canGoForward;
    }

    showWelcomeScreen() {
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.display = 'none';
        });

        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'flex';
        }

        document.getElementById('urlInput').value = '';
        this.updateNavigationButtons(false, false);
    }

 
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Cleanup method to remove event listeners
    cleanup() {
        console.log('UIManager: Starting cleanup...');
        
        if (this.addressBarTimeout) {
            clearTimeout(this.addressBarTimeout);
            this.addressBarTimeout = null;
        }
        if (this.scrollDebounceTimeout) {
            clearTimeout(this.scrollDebounceTimeout);
            this.scrollDebounceTimeout = null;
        }
        
        // Remove global event listeners using bound references
        if (this.boundHandleWebviewScrollEvent) {
            window.removeEventListener('webview-scroll', this.boundHandleWebviewScrollEvent);
        }
        if (this.boundHandleWebviewWheelEvent) {
            window.removeEventListener('wheel', this.boundHandleWebviewWheelEvent);
        }
        
        // Clear scroll position tracking
        if (this.lastScrollPositions) {
            this.lastScrollPositions.clear();
        }
        
        console.log('UIManager: Cleanup completed');
    }
}