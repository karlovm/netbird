// Fixed WebviewEvents.js - Proper resource management with working events
export class WebviewEvents {
    constructor(app) {
        this.app = app;
        this.eventListeners = new Map();
        this.addressBarTimeout = null;
        this.debounceTimers = new Map();
        this.cleanupInterval = null;
        
        // Start periodic cleanup
        this.startPeriodicCleanup();
    }

    async startEventListening(webview, tabId) {
        this.stopEventListening(tabId);

        const listenerObj = {
            active: true,
            webview: webview,
            keyPromise: null,
            mousePromise: null,
            scrollPromise: null,
            injected: false,
            lastActivity: Date.now(),
            abortController: new AbortController()
        };

        this.eventListeners.set(tabId, listenerObj);

        try {
            console.log(`Starting event listening for tab ${tabId}`);

            // Wait for page to be ready before injection
            await this.waitForPageReady(webview);

            // Use the polling approach but with better resource management
            this.startManagedEventListening(webview, tabId);

        } catch (error) {
            console.error(`Event listening failed for tab ${tabId}:`, error);
            this.eventListeners.delete(tabId);
        }
    }

    async waitForPageReady(webview) {
        try {
            await Promise.race([
                webview.executeJavaScript(`
                    new Promise((resolve) => {
                        if (document.readyState === 'complete') {
                            resolve();
                        } else {
                            const handler = () => {
                                window.removeEventListener('load', handler);
                                resolve();
                            };
                            window.addEventListener('load', handler);
                        }
                    })
                `),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Page ready timeout')), 2000)
                )
            ]);
        } catch (error) {
            console.log('Page ready check failed, continuing anyway:', error.message);
        }
    }

    async startManagedEventListening(webview, tabId) {
        const listener = this.eventListeners.get(tabId);
        if (!listener) return;

        // Start all event listeners with proper error handling and cleanup
        listener.keyPromise = this.createManagedKeyEventListener(webview, tabId);
        listener.mousePromise = this.createManagedMouseEventListener(webview, tabId);
        listener.scrollPromise = this.createManagedScrollEventListener(webview, tabId);

        // Handle cleanup when any promise completes/fails
        Promise.allSettled([
            listener.keyPromise,
            listener.mousePromise,
            listener.scrollPromise
        ]).then(() => {
            console.log(`All event listeners completed for tab ${tabId}`);
        });
    }

    async createManagedKeyEventListener(webview, tabId) {
        let consecutiveErrors = 0;
        const maxErrors = 5;
        let backoffDelay = 1000;

        while (this.eventListeners.has(tabId) && this.eventListeners.get(tabId)?.active) {
            const listener = this.eventListeners.get(tabId);
            if (!listener || !listener.active) break;

            try {
                const keyEvent = await Promise.race([
                    webview.executeJavaScript(`
                        new Promise((resolve) => {
                            const timeoutId = setTimeout(() => {
                                resolve({ type: 'timeout' });
                            }, 2000);

                            const eventHandler = (e) => {
                                clearTimeout(timeoutId);
                                document.removeEventListener("keyup", eventHandler);
                                
                                if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyW' || e.keyCode === 87)) {
                                    resolve({
                                        type: 'hotkey',
                                        eventType: 'close-tab',
                                        timestamp: Date.now()
                                    });
                                    return;
                                }
                                
                                resolve({
                                    type: 'keyboard',
                                    eventType: 'keyup',
                                    key: e.key,
                                    code: e.code,
                                    keyCode: e.keyCode,
                                    which: e.which,
                                    repeat: e.repeat,
                                    altKey: e.altKey,
                                    ctrlKey: e.ctrlKey,
                                    metaKey: e.metaKey,
                                    shiftKey: e.shiftKey,
                                    timestamp: Date.now(),
                                    target: {
                                        tagName: e.target.tagName,
                                        type: e.target.type || null,
                                        id: e.target.id || null,
                                        className: e.target.className || null
                                    }
                                });
                            };
                            
                            document.addEventListener("keyup", eventHandler);
                        })
                    `),
                    new Promise((resolve) =>
                        setTimeout(() => resolve({ type: 'timeout' }), 3000)
                    )
                ]);

                // Handle timeout responses
                if (keyEvent.type === 'timeout') {
                    continue;
                }

                // Reset error count on success
                consecutiveErrors = 0;
                backoffDelay = 1000;

                // Update activity and process event
                if (listener.active) {
                    listener.lastActivity = Date.now();
                    this.processEvent(keyEvent, webview, tabId);
                }

            } catch (error) {
                if (error.message.includes('destroyed') || error.message.includes('crashed')) {
                    console.log(`Webview destroyed, stopping key listener for tab ${tabId}`);
                    break;
                }

                consecutiveErrors++;
                if (consecutiveErrors >= maxErrors) {
                    console.log(`Too many consecutive errors for key listener tab ${tabId}, stopping`);
                    break;
                }

                console.log(`Key event error for tab ${tabId} (${consecutiveErrors}/${maxErrors}):`, error.message);
                
                // Exponential backoff with jitter
                const jitter = Math.random() * 500;
                await new Promise(resolve => setTimeout(resolve, Math.min(backoffDelay + jitter, 5000)));
                backoffDelay = Math.min(backoffDelay * 1.5, 5000);
            }
        }
        console.log(`Key event listener stopped for tab ${tabId}`);
    }

    async createManagedMouseEventListener(webview, tabId) {
        let consecutiveErrors = 0;
        const maxErrors = 5;
        let backoffDelay = 1000;

        while (this.eventListeners.has(tabId) && this.eventListeners.get(tabId)?.active) {
            const listener = this.eventListeners.get(tabId);
            if (!listener || !listener.active) break;

            try {
                const mouseEvent = await Promise.race([
                    webview.executeJavaScript(`
                        new Promise((resolve) => {
                            const timeoutId = setTimeout(() => {
                                resolve({ type: 'timeout' });
                            }, 2000);

                            const eventHandler = (e) => {
                                clearTimeout(timeoutId);
                                document.removeEventListener("click", eventHandler);
                                resolve({
                                    type: 'mouse',
                                    eventType: 'click',
                                    button: e.button,
                                    buttons: e.buttons,
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                    pageX: e.pageX,
                                    pageY: e.pageY,
                                    altKey: e.altKey,
                                    ctrlKey: e.ctrlKey,
                                    metaKey: e.metaKey,
                                    shiftKey: e.shiftKey,
                                    timestamp: Date.now(),
                                    target: {
                                        tagName: e.target.tagName,
                                        type: e.target.type || null,
                                        id: e.target.id || null,
                                        className: e.target.className || null
                                    }
                                });
                            };
                            
                            document.addEventListener("click", eventHandler);
                        })
                    `),
                    new Promise((resolve) =>
                        setTimeout(() => resolve({ type: 'timeout' }), 3000)
                    )
                ]);

                // Handle timeout responses
                if (mouseEvent.type === 'timeout') {
                    continue;
                }

                consecutiveErrors = 0;
                backoffDelay = 1000;

                if (listener.active) {
                    listener.lastActivity = Date.now();
                    this.processEvent(mouseEvent, webview, tabId);
                }

            } catch (error) {
                if (error.message.includes('destroyed') || error.message.includes('crashed')) {
                    console.log(`Webview destroyed, stopping mouse listener for tab ${tabId}`);
                    break;
                }

                consecutiveErrors++;
                if (consecutiveErrors >= maxErrors) {
                    console.log(`Too many consecutive errors for mouse listener tab ${tabId}, stopping`);
                    break;
                }

                console.log(`Mouse event error for tab ${tabId} (${consecutiveErrors}/${maxErrors}):`, error.message);
                
                const jitter = Math.random() * 500;
                await new Promise(resolve => setTimeout(resolve, Math.min(backoffDelay + jitter, 5000)));
                backoffDelay = Math.min(backoffDelay * 1.5, 5000);
            }
        }
        console.log(`Mouse event listener stopped for tab ${tabId}`);
    }

    async createManagedScrollEventListener(webview, tabId) {
        let consecutiveErrors = 0;
        const maxErrors = 5;
        let backoffDelay = 1000;
        let lastScrollTime = 0;

        while (this.eventListeners.has(tabId) && this.eventListeners.get(tabId)?.active) {
            const listener = this.eventListeners.get(tabId);
            if (!listener || !listener.active) break;

            try {
                const scrollEvent = await Promise.race([
                    webview.executeJavaScript(`
                        new Promise((resolve) => {
                            const timeoutId = setTimeout(() => {
                                resolve({ type: 'timeout' });
                            }, 2000);

                            let wheelHandler, scrollHandler;
                            let eventCaptured = false;

                            const cleanup = () => {
                                if (wheelHandler) document.removeEventListener("wheel", wheelHandler);
                                if (scrollHandler) document.removeEventListener("scroll", scrollHandler);
                                clearTimeout(timeoutId);
                            };

                            wheelHandler = (e) => {
                                if (eventCaptured) return;
                                eventCaptured = true;
                                cleanup();
                                resolve({
                                    type: 'scroll',
                                    eventType: 'wheel',
                                    deltaY: e.deltaY,
                                    deltaX: e.deltaX,
                                    deltaZ: e.deltaZ,
                                    deltaMode: e.deltaMode,
                                    altKey: e.altKey,
                                    ctrlKey: e.ctrlKey,
                                    metaKey: e.metaKey,
                                    shiftKey: e.shiftKey,
                                    timestamp: Date.now(),
                                    scrollTop: window.pageYOffset || document.documentElement.scrollTop,
                                    target: {
                                        tagName: e.target.tagName,
                                        type: e.target.type || null,
                                        id: e.target.id || null,
                                        className: e.target.className || null
                                    }
                                });
                            };

                            scrollHandler = (e) => {
                                if (eventCaptured) return;
                                eventCaptured = true;
                                cleanup();
                                
                                const scrollTop = e.target === document ? 
                                    (window.pageYOffset || document.documentElement.scrollTop) : 
                                    e.target.scrollTop;
                                const scrollLeft = e.target === document ? 
                                    (window.pageXOffset || document.documentElement.scrollLeft) : 
                                    e.target.scrollLeft;
                                    
                                resolve({
                                    type: 'scroll',
                                    eventType: 'scroll',
                                    scrollTop: scrollTop,
                                    scrollLeft: scrollLeft,
                                    timestamp: Date.now(),
                                    target: {
                                        tagName: e.target.tagName || 'document',
                                        type: e.target.type || null,
                                        id: e.target.id || null,
                                        className: e.target.className || null
                                    }
                                });
                            };
                            
                            document.addEventListener("wheel", wheelHandler, { passive: true });
                            document.addEventListener("scroll", scrollHandler, { passive: true, capture: true });
                        })
                    `),
                    new Promise((resolve) =>
                        setTimeout(() => resolve({ type: 'timeout' }), 3000)
                    )
                ]);

                // Handle timeout responses
                if (scrollEvent.type === 'timeout') {
                    continue;
                }

                consecutiveErrors = 0;
                backoffDelay = 1000;

                if (listener.active) {
                    listener.lastActivity = Date.now();
                    
                    // Throttle scroll events to prevent overwhelming
                    const now = Date.now();
                    if (now - lastScrollTime > 16) { // ~60fps max
                        this.processEvent(scrollEvent, webview, tabId);
                        lastScrollTime = now;
                    }
                }

            } catch (error) {
                if (error.message.includes('destroyed') || error.message.includes('crashed')) {
                    console.log(`Webview destroyed, stopping scroll listener for tab ${tabId}`);
                    break;
                }

                consecutiveErrors++;
                if (consecutiveErrors >= maxErrors) {
                    console.log(`Too many consecutive errors for scroll listener tab ${tabId}, stopping`);
                    break;
                }

                console.log(`Scroll event error for tab ${tabId} (${consecutiveErrors}/${maxErrors}):`, error.message);
                
                const jitter = Math.random() * 500;
                await new Promise(resolve => setTimeout(resolve, Math.min(backoffDelay + jitter, 5000)));
                backoffDelay = Math.min(backoffDelay * 1.5, 5000);
            }
        }
        console.log(`Scroll event listener stopped for tab ${tabId}`);
    }

    // Unified event processing method with debouncing
    processEvent(eventData, webview, tabId) {
        const currentWebview = document.getElementById(`webview-${this.app.activeTabId}`);
        const isActiveWebview = currentWebview && currentWebview === webview;

        if (!isActiveWebview || document.activeElement !== webview) {
            return;
        }

        try {
            // Handle hotkeys first
            if (eventData.type === 'hotkey') {
                console.log("Processing hotkey event");
                this.handleHotkey(eventData, tabId);
                return;
            }

            // Send to main process via IPC with debouncing
            this.debouncedIpcSend(eventData, tabId);

            // Dispatch to main window
            if (eventData.type === 'scroll') {
                this.dispatchScrollEvent(eventData, tabId);
            } else {
                this.dispatchGenericEvent(eventData, tabId);
            }

        } catch (error) {
            console.error(`Error processing ${eventData.type} event for tab ${tabId}:`, error);
        }
    }

    debouncedIpcSend(eventData, tabId) {
        // Only debounce scroll events to reduce IPC overhead
        if (eventData.type !== 'scroll') {
            this.sendIpcEvent(eventData, tabId);
            return;
        }

        const key = `${tabId}-scroll-ipc`;
        
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }

        const timer = setTimeout(() => {
            this.sendIpcEvent(eventData, tabId);
            this.debounceTimers.delete(key);
        }, 50);

        this.debounceTimers.set(key, timer);
    }

    sendIpcEvent(eventData, tabId) {
        if (window.electronAPI) {
            try {
                if (eventData.type === 'keyboard' && window.electronAPI.sendWebviewKeyEvent) {
                    window.electronAPI.sendWebviewKeyEvent(tabId, eventData);
                } else if (eventData.type === 'mouse' && window.electronAPI.sendWebviewMouseEvent) {
                    window.electronAPI.sendWebviewMouseEvent(tabId, eventData);
                } else if (eventData.type === 'scroll' && window.electronAPI.sendWebviewScrollEvent) {
                    window.electronAPI.sendWebviewScrollEvent(tabId, eventData);
                }
            } catch (error) {
                console.error('IPC send error:', error);
            }
        }
    }

    dispatchScrollEvent(eventData, tabId) {
        let customEvent;

        if (eventData.eventType === 'wheel') {
            customEvent = new CustomEvent('wheel', {
                bubbles: true,
                cancelable: true,
                detail: {
                    deltaY: eventData.deltaY || 0,
                    deltaX: eventData.deltaX || 0,
                    deltaZ: eventData.deltaZ || 0,
                    deltaMode: eventData.deltaMode || 0,
                    altKey: eventData.altKey,
                    ctrlKey: eventData.ctrlKey,
                    metaKey: eventData.metaKey,
                    shiftKey: eventData.shiftKey,
                    scrollTop: eventData.scrollTop || 0,
                    sourceTabId: tabId,
                    eventType: 'wheel'
                }
            });

            Object.defineProperties(customEvent, {
                deltaY: { value: eventData.deltaY || 0, writable: false, enumerable: true },
                deltaX: { value: eventData.deltaX || 0, writable: false, enumerable: true },
                sourceTabId: { value: tabId, writable: false, enumerable: true },
                scrollTop: { value: eventData.scrollTop || 0, writable: false, enumerable: true }
            });

        } else if (eventData.eventType === 'scroll') {
            customEvent = new CustomEvent('webview-scroll', {
                bubbles: true,
                detail: {
                    scrollTop: eventData.scrollTop || 0,
                    scrollLeft: eventData.scrollLeft || 0,
                    target: eventData.target,
                    timestamp: eventData.timestamp,
                    sourceTabId: tabId,
                    eventType: 'scroll'
                }
            });
        }

        if (customEvent) {
            Object.defineProperty(customEvent, 'sourceTarget', {
                value: eventData.target,
                writable: false,
                enumerable: true
            });
            window.dispatchEvent(customEvent);
        }
    }

    dispatchGenericEvent(eventData, tabId) {
        let customEvent;

        if (eventData.type === 'keyboard') {
            customEvent = new KeyboardEvent(eventData.eventType, {
                key: eventData.key,
                code: eventData.code,
                repeat: eventData.repeat,
                altKey: eventData.altKey,
                ctrlKey: eventData.ctrlKey,
                metaKey: eventData.metaKey,
                shiftKey: eventData.shiftKey,
                bubbles: true
            });
        } else if (eventData.type === 'mouse') {
            customEvent = new MouseEvent(eventData.eventType, {
                button: eventData.button,
                buttons: eventData.buttons,
                clientX: eventData.clientX,
                clientY: eventData.clientY,
                altKey: eventData.altKey,
                ctrlKey: eventData.ctrlKey,
                metaKey: eventData.metaKey,
                shiftKey: eventData.shiftKey,
                bubbles: true
            });
        }

        if (customEvent) {
            Object.defineProperties(customEvent, {
                sourceTabId: { value: tabId, writable: false, enumerable: true },
                sourceTarget: { value: eventData.target, writable: false, enumerable: true }
            });
            window.dispatchEvent(customEvent);
        }
    }

    handleHotkey(eventData, tabId) {
        switch (eventData.eventType) {
            case 'close-tab':
                console.log(`Ctrl+W pressed in tab ${tabId}, closing tab`);
                if (this.app.tabManager && typeof this.app.tabManager.closeTab === 'function') {
                    this.app.tabManager.closeTab(tabId);
                } else {
                    console.warn('TabManager.closeTab method not available');
                }
                break;
            default:
                console.log(`Unknown hotkey: ${eventData.eventType}`);
        }
    }

    startPeriodicCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const timeout = 10 * 60 * 1000; // 10 minutes

            for (const [tabId, listener] of this.eventListeners.entries()) {
                if (!listener.active || (now - listener.lastActivity > timeout)) {
                    console.log(`Cleaning up inactive listener for tab ${tabId}`);
                    this.stopEventListening(tabId);
                }
            }

            // Clear orphaned debounce timers
            for (const [key, timer] of this.debounceTimers.entries()) {
                const tabId = key.split('-')[0];
                if (!this.eventListeners.has(tabId)) {
                    clearTimeout(timer);
                    this.debounceTimers.delete(key);
                }
            }
        }, 60000); // Run every minute
    }

    stopEventListening(tabId) {
        const listener = this.eventListeners.get(tabId);
        if (listener) {
            console.log(`Stopping event listening for tab ${tabId}`);
            listener.active = false;

            // Clear any debounce timers for this tab
            for (const [key, timer] of this.debounceTimers.entries()) {
                if (key.startsWith(`${tabId}-`)) {
                    clearTimeout(timer);
                    this.debounceTimers.delete(key);
                }
            }

            if (this.addressBarTimeout) {
                clearTimeout(this.addressBarTimeout);
                this.addressBarTimeout = null;
            }

            this.eventListeners.delete(tabId);
            console.log(`Stopped event listening for tab ${tabId}`);
        }
    }

    getActiveListeners() {
        return Array.from(this.eventListeners.keys());
    }

    debugListeners() {
        console.log('Active event listeners:');
        const now = Date.now();
        for (const [tabId, listener] of this.eventListeners.entries()) {
            const lastActivityAgo = now - listener.lastActivity;
            console.log(`Tab ${tabId}: active=${listener.active}, webview=${!!listener.webview}, lastActivity=${Math.round(lastActivityAgo/1000)}s ago`);
        }
        console.log(`Debounce timers: ${this.debounceTimers.size}`);
    }

    cleanup() {
        console.log('WebviewEvents: Starting cleanup...');

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        for (const tabId of this.eventListeners.keys()) {
            this.stopEventListening(tabId);
        }

        if (this.addressBarTimeout) {
            clearTimeout(this.addressBarTimeout);
            this.addressBarTimeout = null;
        }

        console.log('WebviewEvents: Cleanup completed');
    }
}