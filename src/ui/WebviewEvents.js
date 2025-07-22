// Modified WebviewEvents.js - Direct event distribution instead of queue-based
export class WebviewEvents {
    constructor(app) {
        this.app = app;
        this.eventListeners = new Map();
        this.addressBarTimeout = null;
    }

    async startEventListening(webview, tabId) {
        this.stopEventListening(tabId);

        const listenerObj = {
            active: true,
            webview: webview,
            keyPromise: null,
            mousePromise: null,
            scrollPromise: null,
            injected: false
        };

        this.eventListeners.set(tabId, listenerObj);

        try {
            console.log(`Starting event listening for tab ${tabId}`);

            // Wait for page to be ready before injection
            await this.waitForPageReady(webview);

            // Use direct event listeners approach
            this.startDirectEventListening(webview, tabId);

        } catch (error) {
            console.error(`Event listening failed for tab ${tabId}:`, error);
            this.eventListeners.delete(tabId);
        }
    }

    async waitForPageReady(webview) {
        try {
            await webview.executeJavaScript(`
                new Promise((resolve) => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        window.addEventListener('load', resolve);
                        // Fallback timeout
                        setTimeout(resolve, 2000);
                    }
                })
            `);
        } catch (error) {
            console.log('Page ready check failed, continuing anyway:', error.message);
        }
    }

    async startDirectEventListening(webview, tabId) {
        const listener = this.eventListeners.get(tabId);
        if (!listener) return;

        // Start all event listeners in parallel
        listener.keyPromise = this.createKeyEventListener(webview, tabId);
        listener.mousePromise = this.createMouseEventListener(webview, tabId);
        listener.scrollPromise = this.createScrollEventListener(webview, tabId);

        // Handle cleanup when any promise completes/fails
        Promise.allSettled([
            listener.keyPromise,
            listener.mousePromise,
            listener.scrollPromise
        ]).then(() => {
            console.log(`All event listeners completed for tab ${tabId}`);
        }).catch(error => {
            console.log(`Event listening ended for tab ${tabId}:`, error.message);
        });
    }

    async createKeyEventListener(webview, tabId) {
        while (this.eventListeners.has(tabId) && this.eventListeners.get(tabId).active) {
            const listener = this.eventListeners.get(tabId);
            if (!listener || !listener.active) break;

            try {
                const keyEvent = await Promise.race([
                    webview.executeJavaScript(`
                        new Promise((resolve, reject) => {
                            const timeoutId = setTimeout(() => {
                                reject(new Error('Key event timeout'));
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
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('External timeout')), 3000)
                    )
                ]);

                // Process the event directly
                this.processEvent(keyEvent, webview, tabId);

            } catch (error) {
                if (error.message.includes('timeout')) {
                    continue;
                }
                if (error.message.includes('destroyed') || error.message.includes('crashed')) {
                    console.log(`Webview destroyed, stopping key listener for tab ${tabId}`);
                    break;
                }
                console.log(`Key event error for tab ${tabId}:`, error.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async createMouseEventListener(webview, tabId) {
        while (this.eventListeners.has(tabId) && this.eventListeners.get(tabId).active) {
            const listener = this.eventListeners.get(tabId);
            if (!listener || !listener.active) break;

            try {
                const mouseEvent = await Promise.race([
                    webview.executeJavaScript(`
                        new Promise((resolve, reject) => {
                            const timeoutId = setTimeout(() => {
                                reject(new Error('Mouse event timeout'));
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
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('External timeout')), 3000)
                    )
                ]);

                // Process the event directly
                this.processEvent(mouseEvent, webview, tabId);

            } catch (error) {
                if (error.message.includes('timeout')) {
                    continue;
                }
                if (error.message.includes('destroyed') || error.message.includes('crashed')) {
                    console.log(`Webview destroyed, stopping mouse listener for tab ${tabId}`);
                    break;
                }
                console.log(`Mouse event error for tab ${tabId}:`, error.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async createScrollEventListener(webview, tabId) {
        while (this.eventListeners.has(tabId) && this.eventListeners.get(tabId).active) {
            const listener = this.eventListeners.get(tabId);
            if (!listener || !listener.active) break;

            try {
                const scrollEvent = await Promise.race([
                    webview.executeJavaScript(`
                        new Promise((resolve, reject) => {
                            const timeoutId = setTimeout(() => {
                                reject(new Error('Scroll event timeout'));
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
                            document.addEventListener("scroll", scrollHandler, true);
                        })
                    `),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('External timeout')), 3000)
                    )
                ]);

                // Process the event directly
                this.processEvent(scrollEvent, webview, tabId);

            } catch (error) {
                if (error.message.includes('timeout')) {
                    continue;
                }
                if (error.message.includes('destroyed') || error.message.includes('crashed')) {
                    console.log(`Webview destroyed, stopping scroll listener for tab ${tabId}`);
                    break;
                }
                console.log(`Scroll event error for tab ${tabId}:`, error.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // Unified event processing method
    processEvent(eventData, webview, tabId) {
        const currentWebview = document.getElementById(`webview-${this.app.activeTabId}`);
        const isActiveWebview = currentWebview && currentWebview === webview;

        if (!isActiveWebview || document.activeElement !== webview) {
            console.log(`Skipping event for inactive webview ${tabId}`);
            return;
        }

        console.log(`Processing ${eventData.type} event for active webview ${tabId}`);

        try {
            // Handle hotkeys first
            if (eventData.type === 'hotkey') {
                console.log("Processing hotkey event");
                this.handleHotkey(eventData, tabId);
                return;
            }

            // Send to main process via IPC
            if (window.electronAPI) {
                if (eventData.type === 'keyboard' && window.electronAPI.sendWebviewKeyEvent) {
                    window.electronAPI.sendWebviewKeyEvent(tabId, eventData);
                } else if (eventData.type === 'mouse' && window.electronAPI.sendWebviewMouseEvent) {
                    window.electronAPI.sendWebviewMouseEvent(tabId, eventData);
                } else if (eventData.type === 'scroll' && window.electronAPI.sendWebviewScrollEvent) {
                    window.electronAPI.sendWebviewScrollEvent(tabId, eventData);
                }
            }

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

    // Fixed dispatchScrollEvent method in WebviewEvents.js
    dispatchScrollEvent(eventData, tabId) {
        console.log("Dispatching scroll event");

        let customEvent;

        if (eventData.eventType === 'wheel') {
            // Create a custom event instead of WheelEvent to ensure sourceTabId is preserved
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

            // Add properties directly to the event object for compatibility
            Object.defineProperty(customEvent, 'deltaY', {
                value: eventData.deltaY || 0,
                writable: false,
                enumerable: true
            });
            Object.defineProperty(customEvent, 'deltaX', {
                value: eventData.deltaX || 0,
                writable: false,
                enumerable: true
            });
            Object.defineProperty(customEvent, 'sourceTabId', {
                value: tabId,
                writable: false,
                enumerable: true
            });
            Object.defineProperty(customEvent, 'scrollTop', {
                value: eventData.scrollTop || 0,
                writable: false,
                enumerable: true
            });

        } else if (eventData.eventType === 'scroll') {

            console.log("event distibuted")

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

            console.log(`Dispatched ${eventData.eventType} event from webview tab ${tabId}`, {
                deltaY: eventData.deltaY,
                scrollTop: eventData.scrollTop,
                eventType: eventData.eventType,
                hasSourceTabId: !!customEvent.sourceTabId
            });
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
            Object.defineProperty(customEvent, 'sourceTabId', {
                value: tabId,
                writable: false,
                enumerable: true
            });
            Object.defineProperty(customEvent, 'sourceTarget', {
                value: eventData.target,
                writable: false,
                enumerable: true
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

    stopEventListening(tabId) {
        const listener = this.eventListeners.get(tabId);
        if (listener) {
            console.log(`Stopping event listening for tab ${tabId}`);
            listener.active = false;

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
        for (const [tabId, listener] of this.eventListeners.entries()) {
            console.log(`Tab ${tabId}: active=${listener.active}, webview=${!!listener.webview}`);
        }
    }

    cleanup() {
        console.log('WebviewEvents: Starting cleanup...');

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