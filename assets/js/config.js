// Configuration Manager - Handles environment variables and app settings
class ConfigManager {
    constructor() {
        this.config = {
            // Default configuration values
            googleBooksApiKey: '',
            googleBooksBaseUrl: 'https://www.googleapis.com/books/v1/volumes',
            maxRequestsPerMinute: 100,
            cacheDuration: 300000, // 5 minutes
            debugMode: false,
            enableOfflineMode: true,
            enableUserPreferences: true,
            enableReadingProgress: false
        };
        
        this.loadConfig();
    }

    // Load configuration from various sources
    loadConfig() {
        // Try to load from localStorage (for client-side storage)
        this.loadFromLocalStorage();
        
        // Try to load from meta tags (for server-rendered pages)
        this.loadFromMetaTags();
        
        // Try to load from global window object (for inline scripts)
        this.loadFromGlobal();
        
        // Validate required configuration
        this.validateConfig();
    }

    // Load configuration from localStorage
    loadFromLocalStorage() {
        try {
            const storedConfig = localStorage.getItem('bookShelfConfig');
            if (storedConfig) {
                const parsedConfig = JSON.parse(storedConfig);
                this.config = { ...this.config, ...parsedConfig };
            }
        } catch (error) {
            console.warn('Could not load configuration from localStorage:', error);
        }
    }

    // Load configuration from meta tags
    loadFromMetaTags() {
        const metaTags = document.querySelectorAll('meta[name^="app-config-"]');
        metaTags.forEach(tag => {
            const configKey = tag.name.replace('app-config-', '');
            const configValue = tag.content;
            
            // Convert string values to appropriate types
            let value = configValue;
            if (configValue === 'true') value = true;
            else if (configValue === 'false') value = false;
            else if (!isNaN(configValue)) value = Number(configValue);
            
            this.config[configKey] = value;
        });
    }

    // Load configuration from global window object
    loadFromGlobal() {
        if (window.APP_CONFIG) {
            this.config = { ...this.config, ...window.APP_CONFIG };
        }
    }

    // Validate required configuration
    validateConfig() {
        if (!this.config.googleBooksApiKey) {
            console.warn('Google Books API key not configured. Some features may not work properly.');
            // Set a fallback that will work with limited functionality
            this.config.googleBooksApiKey = null;
        }
    }

    // Get configuration value
    get(key) {
        return this.config[key];
    }

    // Set configuration value and persist
    set(key, value) {
        this.config[key] = value;
        this.saveToLocalStorage();
    }

    // Save current configuration to localStorage
    saveToLocalStorage() {
        try {
            localStorage.setItem('bookShelfConfig', JSON.stringify(this.config));
        } catch (error) {
            console.warn('Could not save configuration to localStorage:', error);
        }
    }

    // Get all configuration
    getAll() {
        return { ...this.config };
    }

    // Check if a feature is enabled
    isFeatureEnabled(feature) {
        return this.config[`enable${feature.charAt(0).toUpperCase() + feature.slice(1)}`] || false;
    }

    // Get API configuration specifically for Google Books
    getGoogleBooksConfig() {
        return {
            apiKey: this.config.googleBooksApiKey,
            baseUrl: this.config.googleBooksBaseUrl,
            maxRequestsPerMinute: this.config.maxRequestsPerMinute,
            cacheDuration: this.config.cacheDuration
        };
    }

    // Initialize configuration with environment-like setup
    static async initializeFromEnv() {
        // This would typically load from a server endpoint in production
        // For now, we'll use the meta tag approach or direct configuration
        
        const config = new ConfigManager();
        
        // Try to load from a JSON configuration file (optional)
        try {
            const response = await fetch('../config.json');
            if (response.ok) {
                const envConfig = await response.json();
                Object.keys(envConfig).forEach(key => {
                    config.set(key, envConfig[key]);
                });
            }
        } catch (error) {
            // Config file doesn't exist, continue with other methods
        }
        
        return config;
    }
}

// Create global configuration instance
const appConfig = new ConfigManager();

// Set the Google Books API key
appConfig.set('googleBooksApiKey', 'AIzaSyApsDZIcO1cDZRE3oAbL_XdMoWggRHCRhM');

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigManager;
}

// Make available globally
window.appConfig = appConfig;