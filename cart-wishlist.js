// Cart & Wishlist Functionality - cart-wishlist.js

let cart = [];
let wishlist = [];

// Load data from localStorage
function loadCartData() {
    const savedCart = localStorage.getItem('techshop_cart');
    const savedWishlist = localStorage.getItem('techshop_wishlist');
    
    if (savedCart) cart = JSON.parse(savedCart);
    if (savedWishlist) wishlist = JSON.parse(savedWishlist);
    
    updateCartBadge();
    updateWishlistBadge();
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('techshop_cart', JSON.stringify(cart));
    updateCartBadge();
    renderCartSidebar();
}

// Save wishlist to localStorage
function saveWishlist() {
    localStorage.setItem('techshop_wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
    renderWishlistSidebar();
}

// Update cart badge count
function updateCartBadge() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badges = document.querySelectorAll('#cartBadge, #cartBadge2');
    badges.forEach(badge => {
        if (badge) badge.textContent = totalItems;
    });
}

// Update wishlist badge count
function updateWishlistBadge() {
    const badge = document.getElementById('wishlistBadge');
    if (badge) badge.textContent = wishlist.length;
}

// Show toast notification
function showToast(message, duration = 2500) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Add to cart
function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        existingItem.quantity += 1;
        showToast(`✓ ${product.name} quantity updated`);
    } else {
        cart.push({
            ...product,
            quantity: 1
        });
        showToast(`✓ ${product.name} added to cart`);
    }
    
    saveCart();
}

// Add to wishlist
function addToWishlist(product) {
    const existingItem = wishlist.find(item => item.id === product.id);
    
    if (existingItem) {
        showToast(`${product.name} is already in wishlist`);
        return;
    }
    
    wishlist.push(product);
    saveWishlist();
    showToast(`❤️ ${product.name} added to wishlist`);
}

// Remove from cart
function removeFromCart(productId) {
    const index = cart.findIndex(item => item.id === productId);
    if (index !== -1) {
        const removed = cart[index];
        cart.splice(index, 1);
        saveCart();
        showToast(`🗑️ ${removed.name} removed from cart`);
    }
}

// Remove from wishlist
function removeFromWishlist(productId) {
    const index = wishlist.findIndex(item => item.id === productId);
    if (index !== -1) {
        const removed = wishlist[index];
        wishlist.splice(index, 1);
        saveWishlist();
        showToast(`❤️ ${removed.name} removed from wishlist`);
    }
}

// Update cart item quantity
function updateCartQuantity(productId, delta) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity += delta;
        
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            saveCart();
        }
    }
}

// Move item from wishlist to cart
function moveToCartFromWishlist(productId) {
    const wishlistItem = wishlist.find(item => item.id === productId);
    if (wishlistItem) {
        addToCart(wishlistItem);
        removeFromWishlist(productId);
    }
}

// Get cart total
function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// Clear entire cart
function clearCart() {
    if (confirm('Are you sure you want to clear your entire cart?')) {
        cart = [];
        saveCart();
        showToast('Cart cleared');
    }
}

// Open cart sidebar
function openCartSidebar() {
    renderCartSidebar();
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('cartOverlay').classList.add('show');
}

// Close cart sidebar
function closeCartSidebar() {
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('show');
}

// Open wishlist sidebar
function openWishlistSidebar() {
    renderWishlistSidebar();
    document.getElementById('wishlistSidebar').classList.add('open');
    document.getElementById('cartOverlay').classList.add('show');
}

// Close wishlist sidebar
function closeWishlistSidebar() {
    document.getElementById('wishlistSidebar').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('show');
}

// Render cart sidebar content
function renderCartSidebar() {
    const container = document.getElementById('cartItemsContainer');
    const footer = document.getElementById('cartFooter');
    
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-cart"></i>
                <p>Your cart is empty</p>
                <button class="shop-now-btn" onclick="closeCartSidebar();">Shop Now</button>
            </div>
        `;
        if (footer) footer.style.display = 'none';
        return;
    }
    
    container.innerHTML = cart.map(item => `
        <div class="cart-item-card">
            <img src="${item.image}" alt="${item.name}" class="cart-item-image" onerror="this.src='https://placehold.co/400x300/2874f0/white?text=Product'">
            <div class="cart-item-details">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">
                    ₹${item.price.toLocaleString()}
                    ${item.originalPrice ? `<span class="original-price-cart">₹${item.originalPrice.toLocaleString()}</span>` : ''}
                </div>
                <div class="cart-item-quantity">
                    <button class="qty-btn-cart" onclick="updateCartQuantity(${item.id}, -1)">-</button>
                    <span class="qty-value">${item.quantity}</span>
                    <button class="qty-btn-cart" onclick="updateCartQuantity(${item.id}, 1)">+</button>
                    <button class="remove-item-btn" onclick="removeFromCart(${item.id})">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    if (footer) {
        footer.style.display = 'block';
        const totalSpan = document.getElementById('cartTotalAmount');
        if (totalSpan) totalSpan.textContent = '₹' + getCartTotal().toLocaleString();
    }
}

// Render wishlist sidebar content
function renderWishlistSidebar() {
    const container = document.getElementById('wishlistItemsContainer');
    
    if (!container) return;
    
    if (wishlist.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-heart"></i>
                <p>Your wishlist is empty</p>
                <button class="shop-now-btn" onclick="closeWishlistSidebar();">Explore Products</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = wishlist.map(item => `
        <div class="wishlist-item-card">
            <img src="${item.image}" alt="${item.name}" class="wishlist-item-image" onerror="this.src='https://placehold.co/400x300/2874f0/white?text=Product'">
            <div class="wishlist-item-details">
                <div class="wishlist-item-name">${item.name}</div>
                <div class="wishlist-item-price">₹${item.price.toLocaleString()}</div>
                <div class="wishlist-actions">
                    <button class="move-to-cart-btn" onclick="moveToCartFromWishlist(${item.id})">
                        <i class="fas fa-shopping-cart"></i> Move to Cart
                    </button>
                    <button class="remove-wishlist-btn" onclick="removeFromWishlist(${item.id})">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Proceed to checkout
function proceedToCheckout() {
    if (cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('techshop_user') || '{}');
    if (!user.name) {
        showToast('Please login to checkout');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
        return;
    }
    
    // Process order
    const order = {
        orderId: 'ORD' + Date.now(),
        date: new Date().toISOString(),
        items: [...cart],
        total: getCartTotal(),
        address: user.address || 'No address saved'
    };
    
    // Save order to localStorage
    const orders = JSON.parse(localStorage.getItem('techshop_orders') || '[]');
    orders.unshift(order);
    localStorage.setItem('techshop_orders', JSON.stringify(orders));
    
    // Clear cart
    cart = [];
    saveCart();
    renderCartSidebar();
    closeCartSidebar();
    
    showToast(`Order placed! Total: ₹${order.total.toLocaleString()}`);
    setTimeout(() => {
        alert(`✅ Order Confirmed!\nOrder ID: ${order.orderId}\nTotal: ₹${order.total.toLocaleString()}\nItems: ${order.items.length} products`);
    }, 500);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCartData();
    
    // Event listeners
    const cartOverlay = document.getElementById('cartOverlay');
    if (cartOverlay) {
        cartOverlay.addEventListener('click', () => {
            closeCartSidebar();
            closeWishlistSidebar();
        });
    }
    
    // Listen for Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCartSidebar();
            closeWishlistSidebar();
        }
    });
});

// Export for global use
window.cart = cart;
window.wishlist = wishlist;
window.addToCart = addToCart;
window.addToWishlist = addToWishlist;
window.removeFromCart = removeFromCart;
window.removeFromWishlist = removeFromWishlist;
window.updateCartQuantity = updateCartQuantity;
window.moveToCartFromWishlist = moveToCartFromWishlist;
window.clearCart = clearCart;
window.openCartSidebar = openCartSidebar;
window.closeCartSidebar = closeCartSidebar;
window.openWishlistSidebar = openWishlistSidebar;
window.closeWishlistSidebar = closeWishlistSidebar;
window.proceedToCheckout = proceedToCheckout;
window.showToast = showToast;
window.getCartTotal = getCartTotal;