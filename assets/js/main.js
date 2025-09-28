// Main JavaScript - Core functionality for Book Shelf Explorer
class BookShelfExplorer {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initAnimations();
        this.initScrollEffects();
        this.initNavigation();
        this.initAuthUI();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        // Wait for DOM to be fully loaded
        document.addEventListener('DOMContentLoaded', () => {
            this.animateOnLoad();
        });

        // Handle window resize
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));

        // Handle scroll events
        window.addEventListener('scroll', this.throttle(() => {
            this.handleScroll();
        }, 16));
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then(reg => {
                    // Listen for updates
                    if (reg.waiting) {
                        this.promptServiceWorkerUpdate(reg.waiting);
                    }
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    this.promptServiceWorkerUpdate(newWorker);
                                }
                            });
                        }
                    });
                }).catch(err => console.warn('SW registration failed', err));

                // Offline/online indicator events
                window.addEventListener('online', () => this.showConnectivityStatus(true));
                window.addEventListener('offline', () => this.showConnectivityStatus(false));

                // Initialize install prompt UX
                this.setupInstallPrompt();
            });
        }
    }

    setupInstallPrompt() {
        // Guard: only show once per session
        if (this._installSetup) return; this._installSetup = true;
        let deferredEvent = null;

        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent default mini-infobar on some browsers
            e.preventDefault();
            deferredEvent = e;
            this.showInstallBanner(() => {
                if (!deferredEvent) return;
                deferredEvent.prompt();
                deferredEvent.userChoice.then(choice => {
                    if (choice.outcome === 'accepted') {
                        this.replaceInstallBannerWithMessage('App installation started ✅');
                    } else {
                        this.replaceInstallBannerWithMessage('Install dismissed – you can install later from browser menu');
                    }
                    deferredEvent = null; // one-time
                });
            });
        });

        window.addEventListener('appinstalled', () => {
            this.replaceInstallBannerWithMessage('Installed! You now have offline access 🎉');
            localStorage.setItem('bse_installed', '1');
        });

        // If already installed (heuristic), skip.
        if (window.matchMedia('(display-mode: standalone)').matches || localStorage.getItem('bse_installed') === '1') {
            return; // no banner
        }

        // Fallback: after short delay, if no event fired yet, we might still show a soft hint (some browsers hide event until engagement)
        setTimeout(() => {
            if (!deferredEvent) {
                // Soft hint: clickable info that instructs manual install
                this.showInstallBanner(null, true);
            }
        }, 8000);
    }

    showInstallBanner(onInstallClick, isHint = false) {
        if (document.querySelector('.install-banner')) return; // avoid duplicates
        const banner = document.createElement('div');
        banner.className = 'install-banner';
        Object.assign(banner.style, {
            position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '0', width: 'clamp(280px, 90%, 640px)', background: 'linear-gradient(135deg,#0d6efd,#20c997)', color: '#fff', padding: '14px 18px', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', boxShadow: '0 -4px 12px rgba(0,0,0,.25)', zIndex: 9999, fontFamily: 'system-ui, sans-serif', display:'flex', flexDirection:'column', gap:'8px'
        });
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;">
              <div style="flex:1;min-width:180px;">
                <strong style="font-size:15px;display:block;margin-bottom:2px;">${isHint ? 'Add to your home screen' : 'Install Book Shelf Explorer'}</strong>
                <span style="font-size:13px;opacity:.9;">${isHint ? 'Use your browser menu to install this app for faster access.' : 'Get offline access & a full-screen experience.'}</span>
              </div>
              ${isHint ? '' : '<button class="install-action-btn" style="background:#fff;color:#0d6efd;border:none;padding:8px 14px;font-weight:600;border-radius:8px;cursor:pointer;">Install</button>'}
              <button class="install-dismiss-btn" style="background:rgba(255,255,255,0.18);color:#fff;border:none;padding:8px 12px;font-size:12px;font-weight:500;border-radius:8px;cursor:pointer;">Close</button>
            </div>`;
        document.body.appendChild(banner);
        const dismiss = banner.querySelector('.install-dismiss-btn');
        dismiss.addEventListener('click', () => banner.remove());
        const actionBtn = banner.querySelector('.install-action-btn');
        if (actionBtn && onInstallClick) {
            actionBtn.addEventListener('click', () => onInstallClick());
        }
    }

    replaceInstallBannerWithMessage(message) {
        const banner = document.querySelector('.install-banner');
        if (!banner) return;
        banner.innerHTML = `<div style="font-size:14px;font-weight:500;text-align:center;">${message}</div>`;
        setTimeout(() => banner.remove(), 4000);
    }

    promptServiceWorkerUpdate(worker) {
        const existing = document.querySelector('.sw-update-banner');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.className = 'sw-update-banner';
        banner.innerHTML = `New version available <button class="sw-refresh-btn">Update</button>`;
        Object.assign(banner.style, {
            position: 'fixed', bottom: '10px', right: '10px', background: '#222', color: '#fff', padding: '8px 14px', borderRadius: '6px', fontSize: '14px', zIndex: 9999, boxShadow: '0 4px 10px rgba(0,0,0,0.3)', display:'flex', gap:'8px', alignItems:'center'
        });
        document.body.appendChild(banner);
        banner.querySelector('.sw-refresh-btn').addEventListener('click', () => {
            worker.postMessage('SKIP_WAITING');
            setTimeout(() => window.location.reload(), 300);
        });
        // If the worker becomes controlling automatically
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }

    showConnectivityStatus(online) {
        const id = 'connectivity-indicator';
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            Object.assign(el.style, {
                position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', zIndex: 9999, transition: 'opacity .3s'
            });
            document.body.appendChild(el);
        }
        el.textContent = online ? 'Online' : 'Offline (Some features limited)';
        el.style.background = online ? '#2e7d32' : '#9e2a2a';
        el.style.color = '#fff';
        el.style.opacity = '1';
        clearTimeout(this._connTO);
        this._connTO = setTimeout(() => { el.style.opacity = '0'; }, 3500);
    }

    initAnimations() {
        // Add animation classes to elements as they come into view
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in');
                    this.observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe all cards and components
        this.observeElements('.card, .category-card, .form-container');
    }

    initScrollEffects() {
        // Add header shadow on scroll
        const header = document.querySelector('header');
        if (header) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 100) {
                    header.classList.add('header-scrolled');
                } else {
                    header.classList.remove('header-scrolled');
                }
            });
        }
    }

    initNavigation() {
        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Mobile menu toggle (if needed)
        this.initMobileMenu();
    }

    initMobileMenu() {
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        const nav = document.querySelector('nav');
        
        if (mobileToggle && nav) {
            mobileToggle.addEventListener('click', () => {
                nav.classList.toggle('nav-open');
                mobileToggle.classList.toggle('active');
            });
        }
    }

    animateOnLoad() {
        // Add staggered animations to cards
        const cards = document.querySelectorAll('.card, .category-card');
        cards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            card.classList.add('fade-in');
        });

        // Animate hero section
        const heroTitle = document.querySelector('.hero-title');
        const heroSubtitle = document.querySelector('.hero-subtitle');
        const ctaButton = document.querySelector('.cta-button');

        if (heroTitle) {
            setTimeout(() => heroTitle.classList.add('slide-in-left'), 100);
        }
        if (heroSubtitle) {
            setTimeout(() => heroSubtitle.classList.add('fade-in'), 300);
        }
        if (ctaButton) {
            setTimeout(() => ctaButton.classList.add('slide-in-right'), 500);
        }
    }

    observeElements(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => this.observer.observe(el));
    }

    handleResize() {
        // Handle responsive layout changes
        this.updateLayout();
    }

    handleScroll() {
        // Handle scroll-based animations and effects
        this.updateScrollProgress();
    }

    updateLayout() {
        // Recalculate layout if needed
        // This can be expanded for complex responsive features
    }

    updateScrollProgress() {
        // Update scroll progress indicator if present
        const progressBar = document.querySelector('.scroll-progress');
        if (progressBar) {
            const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
            progressBar.style.width = `${scrollPercent}%`;
        }
    }

    initAuthUI() {
        // Defer until DOM ready
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const loginLink = document.querySelector('.login-btn');
                const logoutBtn = document.querySelector('.logout-btn');
                const userDisplay = document.querySelector('.user-display') || this.injectUserDisplay();

                if (!loginLink && !logoutBtn) return; // nothing to do

                const update = () => {
                    const user = window.loginManager && window.loginManager.currentUser;
                    if (user) {
                        if (loginLink) loginLink.style.display = 'none';
                        if (logoutBtn) logoutBtn.style.display = 'inline-block';
                        if (userDisplay) {
                            userDisplay.style.display = 'inline-block';
                            userDisplay.textContent = `👤 ${user.name || user.email.split('@')[0]}`;
                        }
                        // Show My Library link if exists
                        document.querySelectorAll('a[href$="my_library.html"]').forEach(a=> a.style.display='inline-block');
                    } else {
                        if (loginLink) loginLink.style.display = 'inline-block';
                        if (logoutBtn) logoutBtn.style.display = 'none';
                        if (userDisplay) {
                            userDisplay.style.display = 'none';
                            userDisplay.textContent = '';
                        }
                        document.querySelectorAll('a[href$="my_library.html"]').forEach(a=> a.style.display='none');
                    }
                };

                // Initial update (loginManager might not be ready yet)
                setTimeout(update, 100);
                // Poll a little in case loginManager loads later
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    update();
                    if (attempts > 10) clearInterval(interval);
                }, 200);

                // Provide a global hook for login.js to call after state changes
                window.refreshAuthUI = update;
            } catch (e) {
                console.warn('Auth UI init failed:', e);
            }
        });
    }

    injectUserDisplay() {
        // Insert a user display span before logout button if not present
        const navAuth = document.querySelector('.nav-auth');
        if (navAuth && !navAuth.querySelector('.user-display')) {
            const span = document.createElement('span');
            span.className = 'user-display';
            span.style.display = 'none';
            navAuth.insertBefore(span, navAuth.querySelector('.logout-btn'));
            return span;
        }
        return null;
    }

    // Utility functions
    debounce(func, wait, immediate) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Loading state management
    showLoading(element) {
        if (element) {
            element.classList.add('loading-state');
            element.innerHTML = '<div class="loading"></div>';
        }
    }

    hideLoading(element, originalContent) {
        if (element) {
            element.classList.remove('loading-state');
            element.innerHTML = originalContent;
        }
    }

    // Notification system
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add notification styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    color: white;
                    font-weight: 600;
                    z-index: 10000;
                    animation: slideInNotification 0.3s ease-out;
                }
                .notification-success { background-color: #28a745; }
                .notification-error { background-color: #dc3545; }
                .notification-warning { background-color: #ffc107; color: #333; }
                .notification-info { background-color: #17a2b8; }
                @keyframes slideInNotification {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutNotification 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // Public API methods
    navigateTo(page) {
        window.location.href = page;
    }

    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    scrollToElement(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
}

// Initialize the application
const bookShelfApp = new BookShelfExplorer();

// Export for use in other modules
window.BookShelfExplorer = BookShelfExplorer;
window.bookShelfApp = bookShelfApp;

// Add some additional utility functions to window object
window.utils = {
    formatDate: (date) => new Date(date).toLocaleDateString(),
    capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
    truncateText: (text, length) => text.length > length ? text.substring(0, length) + '...' : text,
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
};