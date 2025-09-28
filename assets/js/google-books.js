// Google Books Integration - Free online book reading
class GoogleBooksAPI {
    constructor() {
        // Initialize with fallback values first
        this.apiKey = 'AIzaSyApsDZIcO1cDZRE3oAbL_XdMoWggRHCRhM';
        this.baseURL = 'https://www.googleapis.com/books/v1/volumes';
        this.cache = new Map();
        this.requestCount = 0;
        this.requestWindow = Date.now();
        this.maxRequests = 100;
        // Throttle / backoff helpers
        this.lastRequestTime = 0;
        this.minIntervalMs = 1100; // at most ~1 req / 1.1s when no key (public quota is low)
        this.cooldown429Until = 0; // timestamp until which we pause after 429
        this._notiTimestamps = {};
        
        // Try to get values from config if available
        this.initializeConfig();
        this.init();
    }

    initializeConfig() {
        // For now, we'll use the API without a key since it needs to be enabled
        // The API key provided needs Books API enabled in Google Cloud Console
        this.apiKey = null; // Disable API key for now
        
        // Wait for config to be available and update values
        if (window.appConfig) {
            // Only use API key if specifically configured and working
            // this.apiKey = window.appConfig.get('googleBooksApiKey') || this.apiKey;
            this.baseURL = window.appConfig.get('googleBooksBaseUrl') || this.baseURL;
            this.maxRequests = window.appConfig.get('maxRequestsPerMinute') || this.maxRequests;
        } else {
            // Retry after a short delay if config is not ready
            setTimeout(() => this.initializeConfig(), 100);
        }
    }

    init() {
        this.setupEventListeners();
        // Fire a ready event quickly so pages can start searching without waiting for popular books
        setTimeout(() => {
            if (!this._readyDispatched) {
                this._readyDispatched = true;
                document.dispatchEvent(new CustomEvent('GoogleBooksReady', { detail: { ready: true } }));
            }
        }, 0);
        // Background load of popular books (non-blocking)
        this.loadPopularBooks();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.initBookReader();
        });
    }

    // Search for books using Google Books API
    async searchBooks(query, category = '', maxResults = 12) {
        const now = Date.now();
        // External 429 cooldown
        if (now < this.cooldown429Until) {
            this.showNotification('Cooling down after many requests… retrying soon.', 'warning', 4000);
            return [];
        }
        // Internal throttle (stagger requests, especially on fast typing & category preloads)
        const since = now - this.lastRequestTime;
        if (since < this.minIntervalMs) {
            return new Promise(resolve => {
                setTimeout(async () => {
                    resolve(await this.searchBooks(query, category, maxResults));
                }, this.minIntervalMs - since + 25);
            });
        }
        // Window based soft limit (still keep original logic but no noisy popup)
        if (!this.checkRateLimit()) {
            this.showNotification('Pausing briefly to respect rate limits…', 'warning');
            return [];
        }

        const cacheKey = `${query}-${category}-${maxResults}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            let searchQuery = query;
            if (category) {
                searchQuery += `+subject:${category}`;
            }

            // Build URL with or without API key
            let url = `${this.baseURL}?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}&printType=books`;
            if (this.apiKey) {
                url += `&key=${this.apiKey}`;
            }

            console.log('Searching for books with URL:', url);
            
            this.lastRequestTime = Date.now();
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Google Books API response:', data);
            
            // Handle API error responses
            if (data.error) {
                console.error('Google Books API error:', data.error);
                this.showNotification(`API Error: ${data.error.message || 'Unknown error'}`, 'error');
                return [];
            }

            // Check if we have items
            if (!data.items || data.items.length === 0) {
                console.log('No books found for query:', searchQuery);
                this.showNotification('No books found. Try a different search term.', 'info');
                return [];
            }

            const books = this.processBookData(data.items || []);
            this.cache.set(cacheKey, books);
            
            // Update request count
            this.requestCount++;
            
            console.log(`Found ${books.length} books`);
            return books;
        } catch (error) {
            console.error('Error fetching books:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // More specific error messages
            let errorMessage = 'Unable to search books. ';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage += 'Please check your internet connection.';
            } else if (error.message.includes('403')) {
                errorMessage += 'API key issue. Please contact support.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Too many requests. Applying short cooldown…';
                this.cooldown429Until = Date.now() + 15000; // 15s cool-down
            } else {
                errorMessage += 'Please try again later.';
            }
            
            this.showNotification(errorMessage, 'error');
            return [];
        }
    }

    // Check rate limiting
    checkRateLimit() {
        const now = Date.now();
        const windowDuration = 60 * 1000; // 1 minute
        
        // Reset counter if window has passed
        if (now - this.requestWindow > windowDuration) {
            this.requestCount = 0;
            this.requestWindow = now;
        }
        
        return this.requestCount < this.maxRequests;
    }

    // Process raw book data from API
    processBookData(items) {
        return items.map(item => {
            const volumeInfo = item.volumeInfo;
            const accessInfo = item.accessInfo;
            
            return {
                id: item.id,
                title: volumeInfo.title || 'Unknown Title',
                authors: volumeInfo.authors?.join(', ') || 'Unknown Author',
                description: volumeInfo.description || 'No description available',
                thumbnail: volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:') || '../assets/images/book-placeholder.png',
                publishedDate: volumeInfo.publishedDate || 'Unknown',
                pageCount: volumeInfo.pageCount || 'N/A',
                categories: volumeInfo.categories || [],
                rating: volumeInfo.averageRating || 0,
                language: volumeInfo.language || 'en',
                previewLink: volumeInfo.previewLink,
                infoLink: volumeInfo.infoLink,
                webReaderLink: accessInfo.webReaderLink,
                embeddable: accessInfo.embeddable,
                publicDomain: accessInfo.publicDomain,
                textToSpeechPermission: accessInfo.textToSpeechPermission,
                epub: accessInfo.epub,
                pdf: accessInfo.pdf
            };
        });
    }

    // Load popular free books by category
    async loadPopularBooks() {
        const categories = [
            ['fiction','fiction classics'],
            ['history','history biography'],
            ['science','science nature'],
            ['poetry','poetry literature'],
            ['children','children juvenile'],
            ['selfhelp','self-help personal development']
        ];
        for (const [key, category] of categories) {
            try {
                // small stagger to avoid burst
                await this.delay(250);
                const books = await this.searchBooks('', category, 6);
                this.displayCategoryBooks(key, books);
                await this.delay(300);
            } catch (error) {
                console.error(`Error loading ${key} books:`, error);
            }
        }
    }

    // Display books in category sections
    displayCategoryBooks(category, books) {
        const container = document.querySelector(`#${category}-books`);
        if (!container || books.length === 0) return;

        const booksHTML = books.map(book => this.createBookCard(book)).join('');
        container.innerHTML = booksHTML;
    }

    // Create a book card with read online functionality
    createBookCard(book) {
        const readButton = this.getReadButton(book);
        const rating = this.createStarRating(book.rating);
        
        return `
            <div class="google-book-card" data-book-id="${book.id}">
                <div class="book-cover">
                    <img src="${book.thumbnail}" alt="${book.title}" loading="lazy">
                    <div class="book-overlay">
                        ${readButton}
                        <button class="btn btn-outline preview-btn" onclick="googleBooks.previewBook('${book.id}')">
                            <i class="icon-eye"></i> Preview
                        </button>
                    </div>
                </div>
                <div class="book-info">
                    <h3 class="book-title">${this.truncateText(book.title, 50)}</h3>
                    <p class="book-author">${this.truncateText(book.authors, 40)}</p>
                    <div class="book-meta">
                        ${rating}
                        <span class="pages">${book.pageCount} pages</span>
                    </div>
                    <p class="book-description">${this.truncateText(book.description, 120)}</p>
                    <div class="book-actions">
                        <button class="btn btn-primary read-btn" onclick="googleBooks.readBook('${book.id}')">
                            <i class="icon-book-open"></i> Read Online
                        </button>
                        <button class="btn btn-secondary info-btn" onclick="googleBooks.showBookInfo('${book.id}')">
                            <i class="icon-info"></i> Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Determine the best read button based on book availability
    getReadButton(book) {
        if (book.webReaderLink) {
            return `<button class="btn btn-success read-online-btn" onclick="googleBooks.openReader('${book.webReaderLink}')">
                        <i class="icon-book-reader"></i> Read Free
                    </button>`;
        } else if (book.epub.isAvailable || book.pdf.isAvailable) {
            return `<button class="btn btn-primary download-btn" onclick="googleBooks.downloadBook('${book.id}')">
                        <i class="icon-download"></i> Download
                    </button>`;
        } else {
            return `<button class="btn btn-outline preview-btn" onclick="googleBooks.previewBook('${book.id}')">
                        <i class="icon-preview"></i> Preview Only
                    </button>`;
        }
    }

    // Open Google Books reader in new window
    openReader(readerLink) {
        const readerWindow = window.open(readerLink, 'googleBooksReader', 'width=1000,height=700,scrollbars=yes,resizable=yes');
        if (!readerWindow) {
            this.showNotification('Please allow popups to read books online', 'warning');
        }
    }

    // Open book preview
    previewBook(bookId) {
        const previewUrl = `https://books.google.com/books/reader?id=${bookId}&printsec=frontcover&output=reader`;
        this.openReader(previewUrl);
    }

    // Read book online
    async readBook(bookId) {
        try {
            const bookData = await this.getBookDetails(bookId);
            if (bookData.webReaderLink) {
                this.openReader(bookData.webReaderLink);
            } else {
                this.previewBook(bookId);
            }
        } catch (error) {
            console.error('Error reading book:', error);
            this.showNotification('Unable to open book reader', 'error');
        }
    }

    // Get detailed book information
    async getBookDetails(bookId) {
        if (!this.checkRateLimit()) {
            console.warn('Rate limit exceeded for book details request.');
            return null;
        }

        try {
            let url = `${this.baseURL}/${bookId}`;
            if (this.apiKey) {
                url += `?key=${this.apiKey}`;
            }
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.requestCount++;
            return await response.json();
        } catch (error) {
            console.error('Error fetching book details:', error);
            return null;
        }
    }

    // Show book information modal
    async showBookInfo(bookId) {
        try {
            const book = await this.getBookDetails(bookId);
            if (!book) return;

            const modal = this.createBookModal(book);
            document.body.appendChild(modal);
            modal.classList.add('show');
        } catch (error) {
            console.error('Error showing book info:', error);
        }
    }

    // Create book information modal
    createBookModal(book) {
        const volumeInfo = book.volumeInfo;
        const accessInfo = book.accessInfo;
        
        const modal = document.createElement('div');
        modal.className = 'book-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${volumeInfo.title}</h2>
                    <button class="close-btn" onclick="this.closest('.book-modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="book-details">
                        <div class="book-cover-large">
                            <img src="${volumeInfo.imageLinks?.large || volumeInfo.imageLinks?.thumbnail || '../assets/images/book-placeholder.png'}" alt="${volumeInfo.title}">
                        </div>
                        <div class="book-meta-detailed">
                            <p><strong>Authors:</strong> ${volumeInfo.authors?.join(', ') || 'Unknown'}</p>
                            <p><strong>Published:</strong> ${volumeInfo.publishedDate || 'Unknown'}</p>
                            <p><strong>Pages:</strong> ${volumeInfo.pageCount || 'Unknown'}</p>
                            <p><strong>Categories:</strong> ${volumeInfo.categories?.join(', ') || 'Unknown'}</p>
                            <p><strong>Language:</strong> ${volumeInfo.language || 'Unknown'}</p>
                            <p><strong>Rating:</strong> ${this.createStarRating(volumeInfo.averageRating || 0)}</p>
                        </div>
                    </div>
                    <div class="book-description-full">
                        <h3>Description</h3>
                        <p>${volumeInfo.description || 'No description available.'}</p>
                    </div>
                    <div class="book-actions-modal">
                        ${accessInfo.webReaderLink ? 
                            `<button class="btn btn-success" onclick="googleBooks.openReader('${accessInfo.webReaderLink}')">
                                <i class="icon-book-reader"></i> Read Online
                            </button>` : 
                            `<button class="btn btn-primary" onclick="googleBooks.previewBook('${book.id}')">
                                <i class="icon-preview"></i> Preview
                            </button>`
                        }
                        <a href="${volumeInfo.infoLink}" target="_blank" class="btn btn-outline">
                            <i class="icon-external"></i> View on Google Books
                        </a>
                    </div>
                </div>
            </div>
        `;

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        return modal;
    }

    // Create star rating display
    createStarRating(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let starsHTML = '';

        for (let i = 0; i < 5; i++) {
            if (i < fullStars) {
                starsHTML += '<span class="star filled">★</span>';
            } else if (i === fullStars && hasHalfStar) {
                starsHTML += '<span class="star half">☆</span>';
            } else {
                starsHTML += '<span class="star empty">☆</span>';
            }
        }

        return `<div class="rating">${starsHTML} <span class="rating-value">(${rating.toFixed(1)})</span></div>`;
    }

    // Utility function to truncate text
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // Show notification
    showNotification(message, type = 'info', ttl=3000) {
        // Suppress duplicates within 2s
        const now = Date.now();
        if (this._notiTimestamps[message] && now - this._notiTimestamps[message] < 2000) return;
        this._notiTimestamps[message] = now;
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        requestAnimationFrame(()=> notification.classList.add('show'));
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(()=> notification.remove(), 320);
        }, ttl);
    }

    // Initialize book reader interface
    initBookReader() {
        // Add Google Books search to existing search
        const searchInput = document.querySelector('#search-input');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(async (e) => {
                const query = e.target.value.trim();
                if (query.length > 2) {
                    await this.searchAndDisplayBooks(query);
                }
            }, 500));
        }
    }

    // Search and display books in results
    async searchAndDisplayBooks(query) {
        try {
            const books = await this.searchBooks(query, '', 8);
            const resultsContainer = document.querySelector('#google-books-results');
            
            if (resultsContainer && books.length > 0) {
                resultsContainer.innerHTML = `
                    <h3>Free Books Online</h3>
                    <div class="books-grid">
                        ${books.map(book => this.createBookCard(book)).join('')}
                    </div>
                `;
                resultsContainer.style.display = 'block';
            }
        } catch (error) {
            console.error('Error searching books:', error);
        }
    }

    // Debounce utility
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    delay(ms){ return new Promise(res=> setTimeout(res, ms)); }
}

// Initialize Google Books integration when DOM is ready
let googleBooks;

// Function to initialize Google Books
function initializeGoogleBooks() {
    if (!googleBooks) {
        googleBooks = new GoogleBooksAPI();
        // Attach to window explicitly for pages relying on it
        window.googleBooks = googleBooks;
        console.log('Google Books API initialized');
        // In case init dispatch missed due to timing
        document.dispatchEvent(new CustomEvent('GoogleBooksReady', { detail: { ready: true } }));
    } else if (!window.googleBooks) {
        window.googleBooks = googleBooks;
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGoogleBooks);
} else {
    // DOM is already loaded
    initializeGoogleBooks();
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoogleBooksAPI;
}