// modules/errorTemplate.js
export const getErrorHtml = (errorCode, errorDescription, validatedURL) => {
    // Detect system language
    const systemLang = navigator.language || navigator.userLanguage || 'en';
    const isRussian = systemLang.toLowerCase().startsWith('ru');
    
    // Translation object
    const translations = {
        en: {
            title: "Error Loading Page",
            heading: "Oops! Page Failed to Load",
            message: "We encountered an issue while trying to load the page.",
            errorCodeLabel: "Error Code:",
            errorDescLabel: "Error Description:",
            tryAgain: "Try Again",
            goHome: "Go Home"
        },
        ru: {
            title: "Ошибка загрузки страницы",
            heading: "Упс! Не удалось загрузить страницу",
            message: "Мы столкнулись с проблемой при попытке загрузить страницу.",
            errorCodeLabel: "Код ошибки:",
            errorDescLabel: "Описание ошибки:",
            tryAgain: "Попробовать снова",
            goHome: "На главную"
        }
    };
    
    const t = translations[isRussian ? 'ru' : 'en'];
    
    return `
<!DOCTYPE html>
<html lang="${isRussian ? 'ru' : 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..900&display=swap');

        :root {
            --primary-color: #57A3FF;
            --secondary-color: #BFDBFF;
            --accent-color: #57A3FF;
            --light-accent-color: #bfdbff6c;
            --bg-primary: #ffffff;
            --bg-secondary: #a5a5a5a1;
            --bg-secondary-light: #a5a5a52f;
            --bg-tertiary: #f1f5f9;
            --text-primary: #2c2c2cd2;
            --text-secondary: #585858b6;
            --border-color: #e2e8f0;
            --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);
            --tab-border-radius: 36px;
            --transition: all 0.2s ease;
            --error-color: #ef4444;
            --error-bg: #fef2f2;
            --success-color: #10b981;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --primary-color: #60A5FA;
                --secondary-color: #3B82F6;
                --accent-color: #60A5FA;
                --light-accent-color: #3b82f66c;
                --bg-primary: #1F2937;
                --bg-secondary: #4B5563;
                --bg-secondary-light: #4b55632f;
                --bg-tertiary: #374151;
                --text-primary: #F3F4F6;
                --text-secondary: #9CA3AF;
                --border-color: #4B5563;
                --shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.2);
                --error-color: #f87171;
                --error-bg: #1f1f23;
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Golos Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, var(--bg-primary), var(--bg-tertiary));
            color: var(--text-primary);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 1rem;
            overflow-x: hidden;
        }

        .error-container {
            background: var(--bg-primary);
            padding: 2.5rem;
            border-radius: 16px;
            box-shadow: var(--shadow-lg);
            text-align: center;
            max-width: 32rem;
            width: 100%;
            position: relative;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid var(--border-color);
            backdrop-filter: blur(10px);
        }

        @keyframes fadeInUp {
            from { 
                opacity: 0; 
                transform: translateY(20px) scale(0.95); 
            }
            to { 
                opacity: 1; 
                transform: translateY(0) scale(1); 
            }
        }

        .error-icon {
            font-size: 4.5rem;
            margin-bottom: 1.5rem;
            display: flex;
            justify-content: center;
            position: relative;
        }

        .error-icon::before {
            content: "⚠️";
            animation: pulse 2s infinite;
            filter: drop-shadow(0 4px 8px rgba(239, 68, 68, 0.3));
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        h1 {
            font-size: 1.75rem;
            font-weight: 700;
            color: var(--error-color);
            margin: 0 0 1rem 0;
            line-height: 1.2;
        }

        .error-message {
            font-size: 1rem;
            margin: 1rem 0;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        .error-details {
            background: var(--error-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            margin: 1.5rem 0;
            text-align: left;
        }

        .error-detail {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 0.5rem 0;
            padding: 0.5rem 0;
        }

        .error-detail:not(:last-child) {
            border-bottom: 1px solid var(--border-color);
        }

        .error-label {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.9rem;
        }

        .error-value {
            font-family: 'Monaco', 'Menlo', monospace;
            background: var(--bg-secondary-light);
            padding: 0.25rem 0.5rem;
            border-radius: 6px;
            font-size: 0.85rem;
            color: var(--error-color);
            font-weight: 500;
        }

        .action-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
            flex-wrap: wrap;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 12px;
            font-weight: 600;
            font-size: 0.9rem;
            text-decoration: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            border: none;
            cursor: pointer;
            min-width: 120px;
            position: relative;
            overflow: hidden;
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }

        .btn:hover::before {
            left: 100%;
        }

        .btn-primary {
            background: var(--primary-color);
            color: white;
            box-shadow: 0 4px 12px rgba(87, 163, 255, 0.4);
        }

        .btn-primary:hover {
            background: var(--accent-color);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(87, 163, 255, 0.5);
        }

        .btn-secondary {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: var(--bg-secondary-light);
            transform: translateY(-1px);
            box-shadow: var(--shadow);
        }

        .tech-info {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border-color);
        }

        .tech-info details {
            text-align: left;
        }

        .tech-info summary {
            cursor: pointer;
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 0.85rem;
            padding: 0.5rem;
            border-radius: 8px;
            transition: var(--transition);
        }

        .tech-info summary:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .tech-details {
            margin-top: 1rem;
            padding: 1rem;
            background: var(--bg-tertiary);
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.8rem;
            color: var(--text-secondary);
            overflow-x: auto;
        }

        @media (max-width: 640px) {
            .error-container {
                padding: 1.5rem;
                margin: 1rem;
            }

            h1 {
                font-size: 1.5rem;
            }

            .error-icon {
                font-size: 3.5rem;
            }

            .action-buttons {
                flex-direction: column;
                align-items: stretch;
            }

            .btn {
                width: 100%;
            }
        }

        /* Accessibility improvements */
        @media (prefers-reduced-motion: reduce) {
            * {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }

        /* High contrast mode */
        @media (prefers-contrast: high) {
            :root {
                --border-color: #000000;
                --text-secondary: #000000;
            }
            
            .error-container {
                border: 2px solid var(--border-color);
            }
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon" role="img" aria-label="Error"></div>
        <h1>${t.heading}</h1>
        <p class="error-message">${t.message}</p>
        
        <div class="error-details">
            <div class="error-detail">
                <span class="error-label">${t.errorCodeLabel}</span>
                <span class="error-value">${errorCode}</span>
            </div>
            <div class="error-detail">
                <span class="error-label">${t.errorDescLabel}</span>
                <span class="error-value">${errorDescription}</span>
            </div>
        </div>

        <div class="action-buttons">
            <a href="${validatedURL}" class="btn btn-primary">
              
                ${t.tryAgain}
            </a>
            <a href="/" class="btn btn-secondary">
                <span>🏠</span>
                ${t.goHome}
            </a>
        </div>

        <div class="tech-info">
            <details>
                <summary>Technical Details</summary>
                <div class="tech-details">
                    URL: ${validatedURL}<br>
                    Error Code: ${errorCode}<br>
                    Description: ${errorDescription}<br>
                    Timestamp: ${new Date().toISOString()}<br>
                    User Agent: ${navigator.userAgent}
                </div>
            </details>
        </div>
    </div>

    <script>
        // Add some interactive enhancements
        document.addEventListener('DOMContentLoaded', function() {
            // Auto-retry after 10 seconds (optional)
            let countdown = 10;
            const tryAgainBtn = document.querySelector('.btn-primary');
            const originalText = tryAgainBtn.textContent;
            
            const countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    tryAgainBtn.innerHTML = \`<span>🔄</span> \${originalText} (\${countdown}s)\`;
                } else {
                    clearInterval(countdownInterval);
                    tryAgainBtn.innerHTML = \`<span>🔄</span> \${originalText}\`;
                }
            }, 1000);

            // Clear countdown on user interaction
            tryAgainBtn.addEventListener('click', () => {
                clearInterval(countdownInterval);
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', function(e) {
                if (e.key === 'r' || e.key === 'R' || (e.ctrlKey && e.key === 'r')) {
                    e.preventDefault();
                    window.location.reload();
                }
                if (e.key === 'h' || e.key === 'H') {
                    e.preventDefault();
                    window.location.href = '/';
                }
            });
        });
    </script>
</body>
</html>
`};