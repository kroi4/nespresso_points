/**
 * Nespresso Rewards Catalog
 * JavaScript Application
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    apiUrl: 'https://www.nespresso.com/il/he/customer/account/getPointsCatalog',
    imageBaseUrl: 'https://www.nespresso.com/il/he/media/catalog/product',
    fallbackImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23555"%3E%3Crect width="100" height="100" fill="%231a1a1a"/%3E%3Cpath d="M35 30 L65 30 L65 75 L35 75 Z" fill="%23333" stroke="%23444" stroke-width="2"/%3E%3Cellipse cx="50" cy="30" rx="15" ry="5" fill="%23444"/%3E%3C/svg%3E'
};

// ============================================
// STATE
// ============================================
let allProducts = [];
let categories = [];
let filteredProducts = [];
let autoRefreshTimer = null;
let lastFetchTime = null;

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    productsGrid: document.getElementById('productsGrid'),
    searchFilter: document.getElementById('searchFilter'),
    categoryFilter: document.getElementById('categoryFilter'),
    brandFilter: document.getElementById('brandFilter'),
    stockFilter: document.getElementById('stockFilter'),
    sortFilter: document.getElementById('sortFilter'),
    minPoints: document.getElementById('minPoints'),
    maxPoints: document.getElementById('maxPoints'),
    affordableBtn: document.getElementById('affordableBtn'),
    userPoints: document.getElementById('userPoints'),
    totalProducts: document.getElementById('totalProducts'),
    inStockProducts: document.getElementById('inStockProducts'),
    affordableProducts: document.getElementById('affordableProducts'),
    displayedProducts: document.getElementById('displayedProducts'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalBody: document.getElementById('modalBody')
};

// Affordable filter state
let affordableFilterActive = false;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    loadSettings(); // Load saved settings
    loadData();
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Filter change events
    elements.searchFilter.addEventListener('input', debounce(applyFilters, 300));
    elements.categoryFilter.addEventListener('change', applyFilters);
    elements.brandFilter.addEventListener('change', applyFilters);
    elements.stockFilter.addEventListener('change', applyFilters);
    elements.sortFilter.addEventListener('change', applyFilters);
    elements.minPoints.addEventListener('input', debounce(applyFilters, 300));
    elements.maxPoints.addEventListener('input', debounce(applyFilters, 300));
    elements.userPoints.addEventListener('input', debounce(handleUserPointsChange, 300));
    
    // Keyboard events for modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeSettings();
        }
    });
}

// ============================================
// DATA LOADING
// ============================================
async function loadData() {
    showLoading();
    
    try {
        // Try to fetch from API with CORS proxy or direct
        let data = await fetchWithFallback();
        
        if (data && Array.isArray(data)) {
            processData(data);
            showProducts();
        } else {
            throw new Error('Invalid data format received');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

async function fetchWithFallback() {
    // Try with CORS proxy first for fresh data
    const corsProxies = [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url='
    ];
    
    for (const proxy of corsProxies) {
        try {
            const response = await fetch(proxy + encodeURIComponent(CONFIG.apiUrl));
            if (response.ok) {
                const data = await response.json();
                console.log('Loaded fresh data via proxy');
                return data;
            }
        } catch (e) {
            console.log(`Proxy ${proxy} failed`);
        }
    }
    
    // Try direct fetch (might work if CORS is enabled)
    try {
        const response = await fetch(CONFIG.apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'he-IL,he;q=0.9',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
        });
        
        if (response.ok) {
            console.log('Loaded data directly from API');
            return await response.json();
        }
    } catch (e) {
        console.log('Direct fetch failed...');
    }
    
    // Fallback to local data.json file (with cache busting)
    try {
        const response = await fetch('data.json?t=' + Date.now());
        if (response.ok) {
            console.log('Loaded data from local file');
            return await response.json();
        }
    } catch (e) {
        console.log('Local data.json not found');
    }
    
    // If all else fails, use the sample data
    console.log('Using embedded sample data');
    return getSampleData();
}

// ============================================
// DATA PROCESSING
// ============================================
function processData(data) {
    categories = [];
    allProducts = [];
    
    data.forEach(category => {
        if (category.catName && category.products) {
            categories.push({
                id: category.catId,
                name: category.catName,
                maxProducts: category.maxProductsOfThisCategory
            });
            
            category.products.forEach(product => {
                // points_product_status: true = available on official site
                // points_product_status: false = not available
                const isAvailable = product.points_product_status === true;
                
                allProducts.push({
                    ...product,
                    categoryId: category.catId,
                    categoryName: category.catName,
                    points: parseInt(product.points_value) || 0,
                    fullImageUrl: getImageUrl(product.image),
                    brandDisplay: getBrandDisplay(product.gtm_brand),
                    typeDisplay: getTypeDisplay(product.type),
                    is_in_stock: isAvailable // Override with points_product_status
                });
            });
        }
    });
    
    populateCategoryFilter();
    updateStats();
    filteredProducts = [...allProducts];
}

function getImageUrl(imagePath) {
    if (!imagePath) return CONFIG.fallbackImage;
    if (imagePath.startsWith('http')) return imagePath;
    return CONFIG.imageBaseUrl + imagePath;
}

function getBrandDisplay(brand) {
    if (!brand || typeof brand !== 'string') return '';
    const brands = {
        'original': 'Original',
        'vertuo': 'Vertuo',
        'professional': 'Professional'
    };
    return brands[brand.toLowerCase()] || brand;
}

function getTypeDisplay(type) {
    if (!type || typeof type !== 'string') return '';
    const types = {
        'capsule': 'קפסולות',
        'accessory': 'אביזרים',
        'machine': 'מכונות',
        'gift': 'מתנות'
    };
    return types[type.toLowerCase()] || type;
}

// ============================================
// FILTERING
// ============================================
function applyFilters() {
    const searchTerm = (elements.searchFilter.value || '').trim().toLowerCase();
    const filters = {
        search: searchTerm,
        category: elements.categoryFilter.value,
        brand: elements.brandFilter.value,
        stock: elements.stockFilter.value,
        sort: elements.sortFilter.value,
        minPoints: parseInt(elements.minPoints.value) || 0,
        maxPoints: parseInt(elements.maxPoints.value) || Infinity,
        affordableOnly: affordableFilterActive,
        userPoints: parseInt(elements.userPoints.value) || 0
    };
    
    filteredProducts = allProducts.filter(product => {
        // Text search filter
        if (filters.search) {
            const searchFields = [
                product.display_name,
                product.sku,
                product.categoryName,
                product.gtm_brand,
                product.type
            ].map(f => (typeof f === 'string' ? f : '').toLowerCase()).join(' ');
            
            if (!searchFields.includes(filters.search)) {
                return false;
            }
        }
        
        // Category filter
        if (filters.category !== 'all' && product.categoryId !== filters.category) {
            return false;
        }
        
        // Brand filter
        if (filters.brand !== 'all') {
            const productBrand = (typeof product.gtm_brand === 'string' ? product.gtm_brand : '').toLowerCase();
            if (productBrand !== filters.brand) {
                return false;
            }
        }
        
        // Stock filter (based on points_product_status via is_in_stock)
        if (filters.stock === 'available' && !product.is_in_stock) {
            return false;
        }
        if (filters.stock === 'unavailable' && product.is_in_stock) {
            return false;
        }
        
        // Points range filter
        if (product.points < filters.minPoints) {
            return false;
        }
        if (filters.maxPoints !== Infinity && product.points > filters.maxPoints) {
            return false;
        }
        
        // Affordable filter
        if (filters.affordableOnly && (product.points > filters.userPoints || !product.is_in_stock)) {
            return false;
        }
        
        return true;
    });
    
    // Apply sorting
    if (filters.sort === 'points-asc') {
        filteredProducts.sort((a, b) => a.points - b.points);
    } else if (filters.sort === 'points-desc') {
        filteredProducts.sort((a, b) => b.points - a.points);
    }
    
    renderProducts();
    updateDisplayedCount();
    saveFilters(); // Save filters to localStorage
}

// Toggle affordable filter
function toggleAffordableFilter() {
    affordableFilterActive = !affordableFilterActive;
    const btn = elements.affordableBtn;
    if (btn) {
        if (affordableFilterActive) {
            btn.style.background = '#4caf50';
            btn.style.borderColor = '#4caf50';
            btn.style.color = '#fff';
        } else {
            btn.style.background = '#222';
            btn.style.borderColor = '#444';
            btn.style.color = '#4caf50';
        }
    }
    applyFilters();
}

function resetFilters() {
    elements.searchFilter.value = '';
    elements.categoryFilter.value = 'all';
    elements.brandFilter.value = 'all';
    elements.stockFilter.value = 'all';
    elements.sortFilter.value = 'default';
    elements.minPoints.value = '';
    elements.maxPoints.value = '';
    
    // Reset affordable filter
    affordableFilterActive = false;
    const btn = elements.affordableBtn;
    if (btn) {
        btn.style.background = '#222';
        btn.style.borderColor = '#444';
        btn.style.color = '#4caf50';
    }
    
    applyFilters();
}

function handleUserPointsChange() {
    updateStats();
    saveFilters(); // Save user points
    if (affordableFilterActive) {
        applyFilters();
    } else {
        renderProducts(); // Re-render to update affordable badges
    }
}

// ============================================
// UI UPDATES
// ============================================
function populateCategoryFilter() {
    elements.categoryFilter.innerHTML = '<option value="all">כל הקטגוריות</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        elements.categoryFilter.appendChild(option);
    });
}

function updateStats() {
    const userPoints = parseInt(elements.userPoints.value) || 0;
    const inStock = allProducts.filter(p => p.is_in_stock).length;
    const affordable = allProducts.filter(p => p.is_in_stock && p.points <= userPoints).length;
    
    animateNumber(elements.totalProducts, allProducts.length);
    animateNumber(elements.inStockProducts, inStock);
    animateNumber(elements.affordableProducts, affordable);
}

function updateDisplayedCount() {
    animateNumber(elements.displayedProducts, filteredProducts.length);
}

function animateNumber(element, target) {
    const current = parseInt(element.textContent) || 0;
    const diff = target - current;
    const duration = 300;
    const steps = 20;
    const increment = diff / steps;
    let step = 0;
    
    const timer = setInterval(() => {
        step++;
        element.textContent = Math.round(current + (increment * step));
        if (step >= steps) {
            clearInterval(timer);
            element.textContent = target;
        }
    }, duration / steps);
}

// ============================================
// RENDERING
// ============================================
function renderProducts() {
    const userPoints = parseInt(elements.userPoints.value) || 0;
    
    if (filteredProducts.length === 0) {
        elements.productsGrid.innerHTML = `
            <div class="no-results">
                <h3>לא נמצאו מתנות</h3>
                <p>נסו לשנות את הגדרות הסינון</p>
            </div>
        `;
        return;
    }
    
    // If no explicit sorting, apply default: available first, then affordable
    const sortValue = elements.sortFilter.value;
    let productsToRender = [...filteredProducts];
    
    if (sortValue === 'default') {
        productsToRender.sort((a, b) => {
            // Available first
            if (a.is_in_stock && !b.is_in_stock) return -1;
            if (!a.is_in_stock && b.is_in_stock) return 1;
            
            // Then affordable first
            const aAffordable = a.is_in_stock && a.points <= userPoints && userPoints > 0;
            const bAffordable = b.is_in_stock && b.points <= userPoints && userPoints > 0;
            if (aAffordable && !bAffordable) return -1;
            if (!aAffordable && bAffordable) return 1;
            
            // Then by points
            return a.points - b.points;
        });
    }
    
    elements.productsGrid.innerHTML = productsToRender.map(product => 
        createProductCard(product, userPoints)
    ).join('');
}

function createProductCard(product, userPoints) {
    const isAffordable = product.is_in_stock && product.points <= userPoints && userPoints > 0;
    const cardClasses = [
        'product-card',
        !product.is_in_stock ? 'out-of-stock' : '',
        isAffordable ? 'affordable' : ''
    ].filter(Boolean).join(' ');
    
    return `
        <article class="${cardClasses}" onclick="openModal(${JSON.stringify(product).replace(/"/g, '&quot;')})">
            <div class="product-image">
                <img src="${product.fullImageUrl}" 
                     alt="${escapeHtml(product.display_name)}"
                     onerror="this.onerror=null;this.src='${CONFIG.fallbackImage}'"
                     loading="lazy">
                ${product.brandDisplay ? `<span class="product-brand">${product.brandDisplay}</span>` : ''}
            </div>
            <div class="product-info">
                <div class="product-category">${escapeHtml(product.categoryName)}</div>
                <h3 class="product-name">${escapeHtml(product.display_name)}</h3>
                <div class="product-footer">
                    <div class="product-points">
                        ${product.points.toLocaleString()}
                        <span>נקודות</span>
                    </div>
                    <span class="product-stock ${product.is_in_stock ? 'in-stock' : 'out-of-stock'}">
                        ${product.is_in_stock ? '✓ במלאי' : 'אזל'}
                    </span>
                </div>
            </div>
        </article>
    `;
}

// ============================================
// MODAL
// ============================================
function openModal(product) {
    const userPoints = parseInt(elements.userPoints.value) || 0;
    const isAffordable = product.is_in_stock && product.points <= userPoints && userPoints > 0;
    
    // Clean description HTML
    let description = product.description || product.short_description || '';
    description = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (description.length > 300) {
        description = description.substring(0, 300) + '...';
    }
    
    elements.modalBody.innerHTML = `
        <div class="modal-image">
            <img src="${product.fullImageUrl}" 
                 alt="${escapeHtml(product.display_name)}"
                 onerror="this.src='${CONFIG.fallbackImage}'">
        </div>
        <div class="modal-details">
            <span class="modal-category">${escapeHtml(product.categoryName)}</span>
            <h2 class="modal-title">${escapeHtml(product.display_name)}</h2>
            <div class="modal-points">
                <span class="star">★</span>
                ${product.points.toLocaleString()} נקודות
            </div>
            <div class="modal-stock ${product.is_in_stock ? 'in-stock' : 'out-of-stock'}">
                ${product.is_in_stock ? '✓ במלאי' : '✗ אזל מהמלאי'}
            </div>
            ${isAffordable ? '<div class="modal-stock in-stock">🎁 ניתן לממש עם הנקודות שלך!</div>' : ''}
            ${description ? `<p class="modal-description">${escapeHtml(description)}</p>` : ''}
            <div class="modal-meta">
                ${product.brandDisplay ? `
                    <div class="meta-item">
                        <span class="meta-label">מותג</span>
                        <span class="meta-value">${product.brandDisplay}</span>
                    </div>
                ` : ''}
                ${product.typeDisplay ? `
                    <div class="meta-item">
                        <span class="meta-label">סוג</span>
                        <span class="meta-value">${product.typeDisplay}</span>
                    </div>
                ` : ''}
                ${product.sku ? `
                    <div class="meta-item">
                        <span class="meta-label">מק"ט</span>
                        <span class="meta-value">${product.sku}</span>
                    </div>
                ` : ''}
                ${product.points_max_order_qty ? `
                    <div class="meta-item">
                        <span class="meta-label">מקסימום להזמנה</span>
                        <span class="meta-value">${product.points_max_order_qty} יח'</span>
                    </div>
                ` : ''}
            </div>
            ${product.url ? `
                <a href="${product.url}" target="_blank" rel="noopener noreferrer" class="modal-link">
                    צפייה באתר נספרסו
                </a>
            ` : ''}
        </div>
    `;
    
    elements.modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    elements.modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// UI STATE MANAGEMENT
// ============================================
function showLoading() {
    elements.loadingState.style.display = 'block';
    elements.errorState.style.display = 'none';
    elements.productsGrid.style.display = 'none';
}

function showError(message) {
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'block';
    elements.errorMessage.textContent = message;
    elements.productsGrid.style.display = 'none';
}

function showProducts() {
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.productsGrid.style.display = 'grid';
    loadFilters(); // Load saved filters
    applyFilters(); // Apply filters (this also renders products)
    updateLastFetchTime();
    applySettings(); // Apply grid settings
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
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

// ============================================
// SAMPLE DATA (Fallback)
// ============================================
function getSampleData() {
    return [
        {
            "catId": "1166",
            "catName": "קפסולות מתנה",
            "maxProductsOfThisCategory": "3",
            "products": [
                {
                    "store_id": "1",
                    "lobby_description": "<div>אספרסו כפול חלק וקטיפתי</div>",
                    "is_in_stock": true,
                    "display_name": "דאבל אספרסו דולצ'ה",
                    "image": "/d/o/double_dolce_120x120.png",
                    "points_value": "200",
                    "type": "capsule",
                    "gtm_brand": "vertuo",
                    "url": "https://www.nespresso.com/il/he/double-espresso-dolce-vuo-v40",
                    "sku": "7044.10",
                    "points_max_order_qty": "3"
                },
                {
                    "store_id": "1",
                    "lobby_description": "<div>קפה קרמי ועשיר בטעם קינוח אגוזי לוז</div>",
                    "is_in_stock": true,
                    "display_name": "פרלינה אגוזי לוז",
                    "image": "/h/a/hazelnut_120x120.png",
                    "points_value": "200",
                    "type": "capsule",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/barista-creation-roasted-hazelnut-ol",
                    "sku": "7858.10",
                    "points_max_order_qty": "3"
                },
                {
                    "store_id": "1",
                    "lobby_description": "<div>קפה קרמי בטעם פודינג וניל מתקתק</div>",
                    "is_in_stock": true,
                    "display_name": "בטעם וניל מתקתק Sweet Vanilla",
                    "image": "/s/w/sweet_vanilla_120x120.png",
                    "points_value": "200",
                    "type": "capsule",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/barista-creations-sweet-vanilla-ol",
                    "sku": "7854.10",
                    "points_max_order_qty": "3"
                },
                {
                    "store_id": "1",
                    "lobby_description": "<div>קטיפתי וקרמלי בטעם טופי קרמל</div>",
                    "is_in_stock": false,
                    "display_name": "בטעם טופי קרמל Caramel Toffee",
                    "image": "/c/a/carameltoffe__vl_120x120.png",
                    "points_value": "200",
                    "type": "capsule",
                    "gtm_brand": "vertuo",
                    "url": "https://www.nespresso.com/il/he/barista-creation-caramel-toffee-vl",
                    "sku": "7295.10",
                    "points_max_order_qty": "3"
                },
                {
                    "store_id": "1",
                    "lobby_description": "<div>טעמים מדוייקים של קפה עדין ומתקתק</div>",
                    "is_in_stock": true,
                    "display_name": "ביאנקו דופיו",
                    "image": "/1/-/1-40-22_120x120_2_1.png",
                    "points_value": "200",
                    "type": "capsule",
                    "gtm_brand": "vertuo",
                    "url": "https://www.nespresso.com/il/he/barista-bianco-doppio-3680",
                    "sku": "7016.10",
                    "points_max_order_qty": "3"
                }
            ]
        },
        {
            "catId": "3256",
            "catName": "מארז טעימות",
            "maxProductsOfThisCategory": "5",
            "products": [
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "מארז טעימות קפה ORIGINAL",
                    "image": "/5/5/55586-a-nespressoxevrit_original_600x540.png",
                    "points_value": "100",
                    "type": "capsule",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/ol-7-caps",
                    "sku": "136055",
                    "points_max_order_qty": "5"
                },
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "מארז טעימות קפה VERTUO",
                    "image": "/6/0/600x540_vertuo.jpg",
                    "points_value": "100",
                    "type": "capsule",
                    "gtm_brand": "vertuo",
                    "url": "https://www.nespresso.com/il/he/2020-vl-sustainable-winset-r4-3357",
                    "sku": "141000",
                    "points_max_order_qty": "5"
                },
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "סט טעימות ארפג'יו",
                    "image": "/s/a/sampling_kit_purple_open_600x540.png",
                    "points_value": "175",
                    "type": "capsule",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/mini-display-4100",
                    "sku": "145006",
                    "points_max_order_qty": "5"
                }
            ]
        },
        {
            "catId": "1167",
            "catName": "אביזרים",
            "maxProductsOfThisCategory": "1",
            "products": [
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "כוס אספרסו VIEW",
                    "image": "/v/i/view_espresso_cup_600x540.png",
                    "points_value": "300",
                    "type": "accessory",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/view-espresso-cup",
                    "sku": "ACC001",
                    "points_max_order_qty": "1"
                },
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "כוס לאטה VIEW",
                    "image": "/v/i/view_latte_cup_600x540.png",
                    "points_value": "400",
                    "type": "accessory",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/view-latte-cup",
                    "sku": "ACC002",
                    "points_max_order_qty": "1"
                },
                {
                    "store_id": "1",
                    "is_in_stock": false,
                    "display_name": "מארז 2 כוסות זכוכית",
                    "image": "/g/l/glass_cups_set_600x540.png",
                    "points_value": "500",
                    "type": "accessory",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/glass-cups-set",
                    "sku": "ACC003",
                    "points_max_order_qty": "1"
                },
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "מקציף חלב Aeroccino",
                    "image": "/a/e/aeroccino_600x540.png",
                    "points_value": "1500",
                    "type": "accessory",
                    "gtm_brand": "original",
                    "url": "https://www.nespresso.com/il/he/aeroccino",
                    "sku": "ACC004",
                    "points_max_order_qty": "1"
                }
            ]
        },
        {
            "catId": "1168",
            "catName": "מתנות מיוחדות",
            "maxProductsOfThisCategory": "1",
            "products": [
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "שובר 50₪ להזמנה הבאה",
                    "image": "/v/o/voucher_50_600x540.png",
                    "points_value": "800",
                    "type": "gift",
                    "gtm_brand": "",
                    "url": "https://www.nespresso.com/il/he/voucher-50",
                    "sku": "GIFT001",
                    "points_max_order_qty": "1"
                },
                {
                    "store_id": "1",
                    "is_in_stock": true,
                    "display_name": "שובר 100₪ להזמנה הבאה",
                    "image": "/v/o/voucher_100_600x540.png",
                    "points_value": "1500",
                    "type": "gift",
                    "gtm_brand": "",
                    "url": "https://www.nespresso.com/il/he/voucher-100",
                    "sku": "GIFT002",
                    "points_max_order_qty": "1"
                },
                {
                    "store_id": "1",
                    "is_in_stock": false,
                    "display_name": "סט מתנה Premium",
                    "image": "/p/r/premium_gift_set_600x540.png",
                    "points_value": "2500",
                    "type": "gift",
                    "gtm_brand": "",
                    "url": "https://www.nespresso.com/il/he/premium-gift-set",
                    "sku": "GIFT003",
                    "points_max_order_qty": "1"
                }
            ]
        }
    ];
}

// Refresh data function - fetches fresh data from API
async function refreshData(silent = false) {
    const icon = document.getElementById('refreshIcon');
    if (icon) {
        icon.style.animation = 'spin 1s linear infinite';
    }
    
    if (!silent) showLoading();
    
    // Clear cache
    allProducts = [];
    categories = [];
    filteredProducts = [];
    
    try {
        // Try CORS proxies for fresh data
        const corsProxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url='
        ];
        
        let data = null;
        for (const proxy of corsProxies) {
            try {
                const response = await fetch(proxy + encodeURIComponent(CONFIG.apiUrl));
                if (response.ok) {
                    data = await response.json();
                    console.log('Fresh data loaded via proxy');
                    break;
                }
            } catch (e) {
                console.log(`Proxy ${proxy} failed`);
            }
        }
        
        if (data && Array.isArray(data)) {
            processData(data);
            showProducts();
            updateLastFetchTime();
            if (!silent) {
                showToast('הנתונים עודכנו בהצלחה! ✓');
            }
        } else {
            throw new Error('Failed to fetch fresh data');
        }
    } catch (error) {
        console.error('Refresh failed:', error);
        // Fallback to local data
        await loadData();
        updateLastFetchTime();
        if (!silent) {
            showToast('משתמש בנתונים מקומיים');
        }
    }
    
    if (icon) {
        icon.style.animation = '';
    }
}

// Update last fetch time display
function updateLastFetchTime() {
    lastFetchTime = new Date();
    const el = document.getElementById('lastUpdate');
    if (el) {
        const time = lastFetchTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        el.textContent = `עודכן: ${time}`;
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;animation:fadeIn 0.3s;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============================================
// SETTINGS
// ============================================
function openSettings() {
    document.getElementById('settingsOverlay').classList.add('active');
    loadSettings();
    setupSettingsListeners();
}

function closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('active');
    saveSettings();
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('nespressoSettings') || '{}');
    
    const imageSize = document.getElementById('imageSize');
    const cardSize = document.getElementById('cardSize');
    const autoRefresh = document.getElementById('autoRefresh');
    const refreshInterval = document.getElementById('refreshInterval');
    const imageSizeValue = document.getElementById('imageSizeValue');
    const cardSizeValue = document.getElementById('cardSizeValue');
    
    if (imageSize) imageSize.value = settings.imageSize || 100;
    if (cardSize) cardSize.value = settings.cardSize || 320;
    if (autoRefresh) autoRefresh.checked = settings.autoRefresh || false;
    if (refreshInterval) refreshInterval.value = settings.refreshInterval || 300000;
    if (imageSizeValue) imageSizeValue.textContent = (settings.imageSize || 100) + '%';
    if (cardSizeValue) cardSizeValue.textContent = (settings.cardSize || 320) + 'px';
    
    if (autoRefresh) toggleAutoRefreshOptions();
    applySettings();
}

function saveSettings() {
    const settings = {
        imageSize: parseInt(document.getElementById('imageSize').value),
        cardSize: parseInt(document.getElementById('cardSize').value),
        autoRefresh: document.getElementById('autoRefresh').checked,
        refreshInterval: parseInt(document.getElementById('refreshInterval').value)
    };
    localStorage.setItem('nespressoSettings', JSON.stringify(settings));
    applySettings();
}

// Save filters to localStorage
function saveFilters() {
    const filters = {
        search: elements.searchFilter?.value || '',
        category: elements.categoryFilter?.value || 'all',
        brand: elements.brandFilter?.value || 'all',
        stock: elements.stockFilter?.value || 'all',
        sort: elements.sortFilter?.value || 'default',
        minPoints: elements.minPoints?.value || '',
        maxPoints: elements.maxPoints?.value || '',
        userPoints: elements.userPoints?.value || '0',
        affordableActive: affordableFilterActive
    };
    localStorage.setItem('nespressoFilters', JSON.stringify(filters));
}

// Default filter values
const DEFAULT_FILTERS = {
    search: '',
    category: 'all',
    brand: 'all',
    stock: 'available',      // Default: show only available
    sort: 'points-desc',     // Default: high to low
    minPoints: '',
    maxPoints: '',
    userPoints: '0',
    affordableActive: false
};

// Load filters from localStorage
function loadFilters() {
    const saved = JSON.parse(localStorage.getItem('nespressoFilters') || '{}');
    
    // Use saved values or defaults
    if (elements.searchFilter) elements.searchFilter.value = saved.search ?? DEFAULT_FILTERS.search;
    if (elements.categoryFilter) elements.categoryFilter.value = saved.category ?? DEFAULT_FILTERS.category;
    if (elements.brandFilter) elements.brandFilter.value = saved.brand ?? DEFAULT_FILTERS.brand;
    if (elements.stockFilter) elements.stockFilter.value = saved.stock ?? DEFAULT_FILTERS.stock;
    if (elements.sortFilter) elements.sortFilter.value = saved.sort ?? DEFAULT_FILTERS.sort;
    if (elements.minPoints) elements.minPoints.value = saved.minPoints ?? DEFAULT_FILTERS.minPoints;
    if (elements.maxPoints) elements.maxPoints.value = saved.maxPoints ?? DEFAULT_FILTERS.maxPoints;
    if (elements.userPoints) elements.userPoints.value = saved.userPoints ?? DEFAULT_FILTERS.userPoints;
    
    affordableFilterActive = saved.affordableActive ?? DEFAULT_FILTERS.affordableActive;
    if (affordableFilterActive) {
        const btn = elements.affordableBtn;
        if (btn) {
            btn.style.background = '#4caf50';
            btn.style.borderColor = '#4caf50';
            btn.style.color = '#fff';
        }
    }
}

function applySettings() {
    const settings = JSON.parse(localStorage.getItem('nespressoSettings') || '{}');
    
    // Apply image size
    const imageSize = settings.imageSize || 100;
    document.documentElement.style.setProperty('--image-scale', imageSize / 100);
    
    // Apply card size
    const cardSize = settings.cardSize || 320;
    const grid = document.getElementById('productsGrid');
    if (grid) {
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${cardSize}px, 1fr))`;
    }
    
    // Apply auto refresh
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    
    if (settings.autoRefresh && settings.refreshInterval) {
        const interval = parseInt(settings.refreshInterval);
        autoRefreshTimer = setInterval(() => refreshData(true), interval);
        console.log(`Auto refresh enabled: every ${interval/60000} minutes`);
    }
}

function setupSettingsListeners() {
    const imageSlider = document.getElementById('imageSize');
    const cardSlider = document.getElementById('cardSize');
    const autoRefreshCheck = document.getElementById('autoRefresh');
    
    imageSlider.oninput = function() {
        document.getElementById('imageSizeValue').textContent = this.value + '%';
        document.documentElement.style.setProperty('--image-scale', this.value / 100);
    };
    
    cardSlider.oninput = function() {
        document.getElementById('cardSizeValue').textContent = this.value + 'px';
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.value}px, 1fr))`;
        }
    };
    
    autoRefreshCheck.onchange = function() {
        toggleAutoRefreshOptions();
    };
}

function toggleAutoRefreshOptions() {
    const checkbox = document.getElementById('autoRefresh');
    const options = document.getElementById('autoRefreshOptions');
    const toggle = document.getElementById('autoRefreshToggle');
    
    if (!checkbox || !options || !toggle) return;
    
    const isChecked = checkbox.checked;
    options.style.display = isChecked ? 'block' : 'none';
    
    // Update toggle visual
    const bgSpan = checkbox.parentElement.querySelector('span:first-of-type');
    if (isChecked) {
        toggle.style.transform = 'translateX(-24px)';
        toggle.style.backgroundColor = '#c9a227';
        if (bgSpan) bgSpan.style.backgroundColor = '#3a3520';
    } else {
        toggle.style.transform = 'translateX(0)';
        toggle.style.backgroundColor = 'white';
        if (bgSpan) bgSpan.style.backgroundColor = '#444';
    }
}

// Make functions globally available
window.openModal = openModal;
window.closeModal = closeModal;
window.resetFilters = resetFilters;
window.loadData = loadData;
window.refreshData = refreshData;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleAffordableFilter = toggleAffordableFilter;

