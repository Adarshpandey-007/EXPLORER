// Enhanced Search functionality for Book Shelf Explorer
class EnhancedBookSearch {
    constructor() {
        // Initialize Google Books API integration
        this.googleBooks = null;
        this.searchHistory = this.getSearchHistory();
        this.popularSearches = ['fiction', 'science', 'history', 'romance', 'mystery', 'biography'];
        this.categoryMap = {
            'History': 'history',
            'Fiction': 'fiction',
            'Science': 'science',
            'Poetry': 'poetry',
            'Self-Help': 'self help',
            'Children': 'juvenile'
     }

// Global function for opening book reader
window.openBookReader = function(bookId, title) {
    if (window.googleBooks) {
        window.googleBooks.openBookReader(bookId, title);
    } else {
        console.warn('Book reader not available - Google Books integration not loaded');
        window.open(`https://books.google.com/books?id=${bookId}`, '_blank');
    }
};

// Initialize the search system
const bookSearch = new EnhancedBookSearch();

// Export for global use
window.EnhancedBookSearch = EnhancedBookSearch;
window.bookSearch = bookSearch;    this.init();
    }

    async init() {
        // Wait for Google Books API to be available
        await this.initializeGoogleBooks();
        this.initSearchForms();
        this.initAdvancedSearch();
        this.initSearchSuggestions();
        this.bindEvents();
    }

    async initializeGoogleBooks() {
        // Wait for the Google Books API to be loaded
        let attempts = 0;
        const maxAttempts = 50;
        
        while (!window.googleBooks && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.googleBooks) {
            this.googleBooks = window.googleBooks;
            console.log('Google Books API integration ready');
        } else {
            console.warn('Google Books API not available, falling back to local search');
        }
    }

    init() {
        this.initSearchForms();
        this.initAdvancedSearch();
        this.initSearchSuggestions();
        this.bindEvents();
    }

    initSearchForms() {
        const searchForms = document.querySelectorAll('form');
        searchForms.forEach(form => {
            const searchInput = form.querySelector('#search-input, .search-input');
            const submitButton = form.querySelector('#button, .search-button');
            
            if (searchInput && submitButton) {
                // Prevent default form submission
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const query = searchInput.value.trim();
                    if (query) {
                        this.performSearch(query);
                        this.addToSearchHistory(query);
                    } else {
                        this.showEmptySearchWarning();
                    }
                });

                // Add real-time search suggestions
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.trim();
                    if (query.length >= 2) {
                        this.showSearchSuggestions(query, searchInput);
                    } else {
                        this.hideSearchSuggestions(searchInput);
                    }
                });

                // Handle keyboard navigation
                searchInput.addEventListener('keydown', (e) => {
                    this.handleSearchKeydown(e, searchInput);
                });
            }
        });
    }

    initAdvancedSearch() {
        // Create advanced search modal if it doesn't exist
        if (!document.querySelector('#advanced-search-modal')) {
            this.createAdvancedSearchModal();
        }
    }

    initSearchSuggestions() {
        // Add search suggestions container to each search input
        document.querySelectorAll('#search-input, .search-input').forEach(input => {
            if (!input.nextElementSibling || !input.nextElementSibling.classList.contains('search-suggestions')) {
                const suggestions = document.createElement('div');
                suggestions.className = 'search-suggestions';
                input.parentNode.insertBefore(suggestions, input.nextSibling);
            }
        });
    }

    bindEvents() {
        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideAllSearchSuggestions();
            }
        });
    }

    async performSearch(query, filters = {}) {
        if (!query || query.trim() === '') {
            this.showEmptySearchWarning();
            return;
        }

        // Show loading state
        this.showSearchLoading(query);
        
        try {
            let results = [];
            
            if (this.googleBooks) {
                // Use Google Books API for real book search
                const category = filters.category || '';
                const maxResults = filters.maxResults || 16;
                results = await this.googleBooks.searchBooks(query.trim(), category, maxResults);
            } else {
                // Fallback to local search if Google Books API is not available
                results = this.searchLocalBooks(query, filters);
            }
            
            this.displayResults(query, results, filters);
            this.addToSearchHistory(query);
            
            // Track search analytics
            this.trackSearch(query, results.length);
            
        } catch (error) {
            console.error('Search error:', error);
            this.showSearchError(query, error.message);
        }
    }

    // Fallback local search function
    searchLocalBooks(query, filters = {}) {
        // This is kept as a fallback, but we primarily use Google Books API
        const localBooks = this.getLocalBookData();
        const queryLower = query.toLowerCase();
        
        return localBooks.filter(book => {
            const titleMatch = book.title.toLowerCase().includes(queryLower);
            const descriptionMatch = book.description && book.description.toLowerCase().includes(queryLower);
            const categoryMatch = book.category && book.category.toLowerCase().includes(queryLower);
            
            const textMatch = titleMatch || descriptionMatch || categoryMatch;
            
            // Filter matching
            let filterMatch = true;
            if (filters.category && filters.category !== 'all') {
                filterMatch = filterMatch && book.category.toLowerCase() === filters.category.toLowerCase();
            }
            
            return textMatch && filterMatch;
        });
    }

    async searchBooks(query, filters = {}) {
        // This method is kept for backward compatibility
        return await this.performSearch(query, filters);
    }

    displayResults(query, results, filters = {}) {
        // Create and show results in a modal
        this.createResultsModal(query, results, filters);
    }

    createResultsModal(query, results, filters) {
        // Remove existing modal if present
        const existingModal = document.querySelector('#search-results-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'search-results-modal';
        modal.className = 'search-modal';
        modal.innerHTML = this.generateResultsHTML(query, results, filters);

        document.body.appendChild(modal);

        // Show modal with animation
        setTimeout(() => modal.classList.add('show'), 10);

        // Bind modal events
        this.bindModalEvents(modal);
    }

    generateResultsHTML(query, results, filters) {
        const resultItems = results.map(book => {
            // Handle both Google Books API results and local book data
            const isGoogleBook = book.id && (book.id.includes('googlebooks') || book.volumeInfo);
            
            if (isGoogleBook) {
                // Google Books API result
                const info = book.volumeInfo || {};
                const title = info.title || book.title || 'Unknown Title';
                const authors = info.authors ? info.authors.join(', ') : 'Unknown Author';
                const description = info.description ? 
                    (info.description.length > 200 ? info.description.substring(0, 200) + '...' : info.description) : 
                    'No description available';
                const thumbnail = info.imageLinks ? 
                    (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : 
                    '/assets/images/book-placeholder.png';
                const categories = info.categories ? info.categories.join(', ') : 'General';
                const previewLink = info.previewLink || info.infoLink || '#';
                const publishedDate = info.publishedDate || 'Unknown';
                
                return `
                    <div class="search-result-item fade-in google-book" data-book-id="${book.id}">
                        <div class="book-thumbnail">
                            <img src="${thumbnail}" alt="${title}" loading="lazy" onerror="this.src='/assets/images/book-placeholder.png'">
                        </div>
                        <div class="result-content">
                            <h3 class="result-title">${this.highlightQuery(title, query)}</h3>
                            <p class="result-author">by ${this.highlightQuery(authors, query)}</p>
                            <p class="result-category">${categories}</p>
                            <p class="result-description">${this.highlightQuery(description, query)}</p>
                            <div class="book-meta">
                                <span class="publish-date">📅 ${publishedDate}</span>
                                <span class="book-source">📚 Google Books</span>
                            </div>
                        </div>
                        <div class="result-actions">
                            <button class="btn btn-primary btn-sm" onclick="openBookReader('${book.id}', '${title.replace(/'/g, "\\'")}')">
                                📖 Read Online
                            </button>
                            <a href="${previewLink}" target="_blank" class="btn btn-outline btn-sm">
                                🔗 View Details
                            </a>
                        </div>
                    </div>
                `;
            } else {
                // Local book result (fallback)
                return `
                    <div class="search-result-item fade-in local-book" data-book-id="${book.id}">
                        <div class="result-content">
                            <h3><a href="${book.page}" class="result-title">${this.highlightQuery(book.title, query)}</a></h3>
                            <p class="result-category">${book.category}</p>
                            <p class="result-description">${this.highlightQuery(book.description, query)}</p>
                            <div class="result-tags">
                                ${book.tags ? book.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : ''}
                            </div>
                        </div>
                        <div class="result-actions">
                            <a href="${book.page}" class="btn btn-primary btn-sm">View Category</a>
                        </div>
                    </div>
                `;
            }
        }).join('');

        return `
            <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Search Results</h2>
                    <button class="modal-close" onclick="this.closest('.search-modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="search-info">
                        <p><strong>Search query:</strong> "${query}"</p>
                        <p><strong>Results found:</strong> ${results.length}</p>
                        ${Object.keys(filters).length > 0 ? `<p><strong>Filters:</strong> ${JSON.stringify(filters)}</p>` : ''}
                        ${results.length > 0 && results[0].volumeInfo ? '<p><strong>Source:</strong> Google Books API 📚</p>' : ''}
                    </div>
                    
                    ${results.length > 0 ? `
                        <div class="search-results">
                            ${resultItems}
                        </div>
                        <div class="search-actions">
                            <button onclick="bookSearch.performSearch('${query}', {maxResults: ${(filters.maxResults || 16) + 8}})" class="btn btn-outline">
                                Load More Results
                            </button>
                        </div>
                    ` : `
                        <div class="no-results">
                            <div class="no-results-icon">📚</div>
                            <h3>No books found</h3>
                            <p>Try different keywords or browse our categories:</p>
                            <div class="category-suggestions">
                                <button onclick="bookSearch.performSearch('${query} fiction')" class="btn btn-outline">Fiction</button>
                                <button onclick="bookSearch.performSearch('${query} science')" class="btn btn-outline">Science</button>
                                <button onclick="bookSearch.performSearch('${query} history')" class="btn btn-outline">History</button>
                                <button onclick="bookSearch.performSearch('${query} poetry')" class="btn btn-outline">Poetry</button>
                                <button onclick="bookSearch.performSearch('${query} biography')" class="btn btn-outline">Biography</button>
                                <a href="pages/read-online.html" class="btn btn-primary">Browse All Books</a>
                            </div>
                        </div>
                    `}
                </div>
                <div class="modal-footer">
                    <button onclick="this.closest('.search-modal').remove()" class="btn btn-secondary">Close</button>
                    <button onclick="bookSearch.showAdvancedSearch()" class="btn btn-outline">Advanced Search</button>
                </div>
            </div>
        `;
    }

    showSearchSuggestions(query, input) {
        const suggestions = this.getSuggestions(query);
        const suggestionContainer = input.parentNode.querySelector('.search-suggestions');
        
        if (suggestions.length > 0 && suggestionContainer) {
            suggestionContainer.innerHTML = suggestions.map((suggestion, index) => `
                <div class="suggestion-item" data-index="${index}" onclick="bookSearch.selectSuggestion('${suggestion}', this)">
                    <span class="suggestion-text">${this.highlightQuery(suggestion, query)}</span>
                </div>
            `).join('');
            suggestionContainer.classList.add('show');
        }
    }

    getSuggestions(query) {
        const queryLower = query.toLowerCase();
        const suggestions = new Set();

        // Add matching book titles
        this.books.forEach(book => {
            if (book.title.toLowerCase().includes(queryLower)) {
                suggestions.add(book.title);
            }
            // Add matching categories
            if (book.category.toLowerCase().includes(queryLower)) {
                suggestions.add(book.category);
            }
            // Add matching tags
            book.tags.forEach(tag => {
                if (tag.toLowerCase().includes(queryLower)) {
                    suggestions.add(tag);
                }
            });
        });

        // Add popular searches if query matches
        this.popularSearches.forEach(popular => {
            if (popular.toLowerCase().includes(queryLower)) {
                suggestions.add(popular);
            }
        });

        return Array.from(suggestions).slice(0, 8);
    }

    selectSuggestion(suggestion, element) {
        const input = element.closest('.search-container').querySelector('#search-input, .search-input');
        input.value = suggestion;
        this.hideSearchSuggestions(input);
        this.performSearch(suggestion);
    }

    hideSearchSuggestions(input) {
        const suggestionContainer = input.parentNode.querySelector('.search-suggestions');
        if (suggestionContainer) {
            suggestionContainer.classList.remove('show');
        }
    }

    hideAllSearchSuggestions() {
        document.querySelectorAll('.search-suggestions').forEach(container => {
            container.classList.remove('show');
        });
    }

    highlightQuery(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    bindModalEvents(modal) {
        // Close modal when clicking backdrop
        modal.querySelector('.modal-backdrop').addEventListener('click', () => {
            modal.remove();
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                modal.remove();
            }
        });
    }

    createAdvancedSearchModal() {
        // This would create an advanced search interface
        // Implementation can be expanded based on needs
    }

    showAdvancedSearch() {
        // Show advanced search modal
        this.showNotification('Advanced search coming soon!', 'info');
    }

    showSearchLoading(query) {
        // Create and show loading modal
        const existingModal = document.querySelector('#search-results-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'search-results-modal';
        modal.className = 'search-modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Searching...</h2>
                </div>
                <div class="modal-body">
                    <div class="search-loading">
                        <div class="loading-spinner"></div>
                        <p>Searching for "${query}" in our book database...</p>
                        <small>Using Google Books API to find the best results</small>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
    }

    showSearchError(query, errorMessage) {
        const modal = document.createElement('div');
        modal.id = 'search-results-modal';
        modal.className = 'search-modal';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Search Error</h2>
                    <button class="modal-close" onclick="this.closest('.search-modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="search-error">
                        <div class="error-icon">⚠️</div>
                        <h3>Search Failed</h3>
                        <p>Sorry, there was an error searching for "${query}".</p>
                        <details>
                            <summary>Error Details</summary>
                            <p>${errorMessage}</p>
                        </details>
                        <div class="error-actions">
                            <button onclick="bookSearch.performSearch('${query}')" class="btn btn-primary">
                                Try Again
                            </button>
                            <a href="pages/read-online.html" class="btn btn-outline">
                                Browse Categories
                            </a>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button onclick="this.closest('.search-modal').remove()" class="btn btn-secondary">Close</button>
                </div>
            </div>
        `;

        // Remove loading modal
        const existingModal = document.querySelector('#search-results-modal');
        if (existingModal) {
            existingModal.remove();
        }

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
    }

    showEmptySearchWarning() {
        this.showNotification('Please enter a search term', 'warning');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 10);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    getLocalBookData() {
        // Fallback book data for when Google Books API is not available
        return [
            { id: 1, title: 'History Collection', category: 'History', page: 'pages/history.html', description: 'Explore historical books and biographies' },
            { id: 2, title: 'Fiction Library', category: 'Fiction', page: 'pages/fiction.html', description: 'Discover amazing fictional stories' },
            { id: 3, title: 'Science Resources', category: 'Science', page: 'pages/science.html', description: 'Learn about science and nature' },
            { id: 4, title: 'Poetry Classics', category: 'Poetry', page: 'pages/poetry.html', description: 'Beautiful poetry and classic literature' },
            { id: 5, title: 'Self-Help Guides', category: 'Self-Help', page: 'pages/selfhelp.html', description: 'Personal development and self-improvement' },
            { id: 6, title: 'Children\'s Books', category: 'Children', page: 'pages/childrens.html', description: 'Fun and educational books for kids' }
        ];
    }

    // Search history management
    getSearchHistory() {
        return JSON.parse(localStorage.getItem('bookshelf_search_history') || '[]');
    }

    addToSearchHistory(query) {
        let history = this.getSearchHistory();
        history = history.filter(item => item !== query); // Remove if already exists
        history.unshift(query); // Add to beginning
        history = history.slice(0, 10); // Keep only last 10
        localStorage.setItem('bookshelf_search_history', JSON.stringify(history));
    }

    trackSearch(query, resultCount) {
        // Analytics tracking (can be expanded)
        console.log(`Search: "${query}" - Results: ${resultCount}`);
    }

    handleSearchKeydown(e, input) {
        const suggestions = input.parentNode.querySelector('.search-suggestions');
        if (!suggestions || !suggestions.classList.contains('show')) return;

        const items = suggestions.querySelectorAll('.suggestion-item');
        let activeIndex = -1;
        
        items.forEach((item, index) => {
            if (item.classList.contains('active')) {
                activeIndex = index;
            }
        });

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                activeIndex = (activeIndex + 1) % items.length;
                break;
            case 'ArrowUp':
                e.preventDefault();
                activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
                break;
            case 'Enter':
                if (activeIndex >= 0) {
                    e.preventDefault();
                    items[activeIndex].click();
                }
                return;
            case 'Escape':
                this.hideSearchSuggestions(input);
                return;
            default:
                return;
        }

        // Update active item
        items.forEach(item => item.classList.remove('active'));
        if (items[activeIndex]) {
            items[activeIndex].classList.add('active');
        }
    }
}

// Initialize search functionality
const bookSearch = new EnhancedBookSearch();

// Export for global use
window.EnhancedBookSearch = EnhancedBookSearch;
window.bookSearch = bookSearch;