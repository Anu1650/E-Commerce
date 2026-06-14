const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'techshop_secret_key_2024';

const dbPath = path.join(__dirname, 'data', 'techshop.db');
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'aniketigade@gmail.com',
        pass: process.env.EMAIL_PASS || 'uzyfmzytucafqnaa'
    }
});

async function sendOrderConfirmationEmail(email, orderId, items, total) {
    const itemList = items.map(i => `<li>${i.product_name} x${i.quantity} - ₹${i.product_price * i.quantity}</li>`).join('');
    const mailOptions = {
        from: 'Tech Shop <aniketigade@gmail.com>',
        to: email,
        subject: `Order Confirmed - ${orderId} | Tech Shop`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2874f0;">✅ Order Confirmed!</h2>
                <p>Dear Customer,</p>
                <p>Your order <strong>${orderId}</strong> has been confirmed successfully.</p>
                <h3>Order Details:</h3>
                <ul>${itemList}</ul>
                <p><strong>Total: ₹${total}</strong></p>
                <h3>What's Next?</h3>
                <p>📦 Your order is being processed and will be shipped soon!</p>
                <p>You can track your order status in your account.</p>
                <p style="margin-top: 20px; color: #6b7280;">Thank you for shopping with Tech Shop!</p>
            </div>
        `
    };
    try {
        await emailTransporter.sendMail(mailOptions);
        console.log('Order confirmation email sent to:', email);
    } catch (e) {
        console.log('Email error:', e.message);
    }
}

async function sendOrderCancellationEmail(email, orderId, reason, refundAmount) {
    const mailOptions = {
        from: 'Tech Shop <aniketigade@gmail.com>',
        to: email,
        subject: `Order Cancelled - ${orderId} | Tech Shop`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">❌ Order Cancelled</h2>
                <p>Dear Customer,</p>
                <p>Your order <strong>${orderId}</strong> has been cancelled as per your request.</p>
                <h3>Cancellation Details:</h3>
                <p><strong>Refund Amount: ₹${refundAmount}</strong></p>
                <p>Reason: ${reason || 'Not specified'}</p>
                <h3>Refund Information:</h3>
                <p>💰 The refund amount will be credited to your original payment method within <strong>5-7 business days</strong>.</p>
                <p style="margin-top: 20px; color: #6b7280;">Thank you for shopping with Tech Shop!</p>
                <p>We hope to see you again soon!</p>
            </div>
        `
    };
    try {
        await emailTransporter.sendMail(mailOptions);
        console.log('Cancellation email sent to:', email);
    } catch (e) {
        console.log('Email error:', e.message);
    }
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

console.log('🔄 Starting Tech Shop Server...');

function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password TEXT NOT NULL,
            first_name TEXT,
            last_name TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            is_verified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS otp_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            type TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            order_id TEXT UNIQUE NOT NULL,
            subtotal REAL NOT NULL,
            discount REAL DEFAULT 0,
            shipping REAL DEFAULT 0,
            total_amount REAL NOT NULL,
            payment_method TEXT,
            payment_status TEXT DEFAULT 'pending',
            order_status TEXT DEFAULT 'processing',
            delivery_date TEXT,
            shipping_address TEXT,
            shipping_city TEXT,
            shipping_state TEXT,
            shipping_pincode TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            product_price REAL NOT NULL,
            original_price REAL,
            quantity INTEGER NOT NULL,
            category TEXT,
            image_url TEXT,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS order_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS cart_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            product_price REAL NOT NULL,
            product_image TEXT,
            quantity INTEGER DEFAULT 1,
            category TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, product_id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS wishlist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            product_price REAL NOT NULL,
            product_image TEXT,
            category TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, product_id)
        )
    `);

    console.log('✅ Database & tables created!');
    return true;
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    console.log('Auth check - Token:', token ? token.substring(0, 20) + '...' : 'none');
    if (!token) return res.status(401).json({ error: 'Login required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        console.log('JWT verify result:', err ? err.message : 'success', user);
        if (err) return res.status(403).json({ error: 'Session expired' });
        req.user = user;
        next();
    });
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Cart APIs
app.get('/api/cart', authenticateToken, (req, res) => {
    try {
        const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
        res.json({ success: true, cart: items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

app.post('/api/cart', authenticateToken, (req, res) => {
    try {
        const { productId, productName, productPrice, productImage, category, quantity } = req.body;
        db.prepare(`
            INSERT INTO cart_items (user_id, product_id, product_name, product_price, product_image, category, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + 1
        `).run(req.user.id, productId, productName, productPrice, productImage, category, quantity || 1);
        res.json({ success: true, message: 'Added to cart' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

app.put('/api/cart/:productId', authenticateToken, (req, res) => {
    try {
        const { quantity } = req.body;
        if (quantity <= 0) {
            db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
        } else {
            db.prepare('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?').run(quantity, req.user.id, req.params.productId);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

app.delete('/api/cart/:productId', authenticateToken, (req, res) => {
    try {
        db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
        res.json({ success: true, message: 'Removed from cart' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from cart' });
    }
});

app.delete('/api/cart', authenticateToken, (req, res) => {
    try {
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
        res.json({ success: true, message: 'Cart cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

// Wishlist APIs
app.get('/api/wishlist', authenticateToken, (req, res) => {
    try {
        const items = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
        res.json({ success: true, wishlist: items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});

app.post('/api/wishlist', authenticateToken, (req, res) => {
    try {
        const { productId, productName, productPrice, productImage, category } = req.body;
        db.prepare(`
            INSERT INTO wishlist_items (user_id, product_id, product_name, product_price, product_image, category)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, product_id) DO UPDATE SET product_name = product_name
        `).run(req.user.id, productId, productName, productPrice, productImage, category);
        res.json({ success: true, message: 'Added to wishlist' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});

app.delete('/api/wishlist/:productId', authenticateToken, (req, res) => {
    try {
        db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
        res.json({ success: true, message: 'Removed from wishlist' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.get('/api/auth/check', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT id, email, first_name, last_name, phone FROM users WHERE id = ?').get(req.user.id);
        if (user) {
            res.json({
                isLoggedIn: true,
                user: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), phone: user.phone }
            });
        } else res.status(404).json({ isLoggedIn: false });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password } = req.body;

        if (!firstName || !email || !password) {
            return res.status(400).json({ error: 'First name, email and password are required' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered. Please login.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO users (first_name, last_name, email, phone, password) VALUES (?, ?, ?, ?, ?)').run(firstName, lastName || '', email, phone || '', hashedPassword);

        const otp = generateOTP();
        db.prepare('INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES (?, ?, ?, ?)').run(email, otp, 'signup', new Date(Date.now() + 10 * 60000).toISOString());

        emailTransporter.sendMail({
            from: 'Tech Shop <aniketigade@gmail.com>',
            to: email,
            subject: 'Tech Shop - Verify Your Account',
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#2874f0,#0a46b3);color:white;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
                    <h1>Tech Shop</h1>
                </div>
                <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;text-align:center;">
                    <h2>Verify Your Email</h2>
                    <p>Your verification code is:</p>
                    <div style="background:#2874f0;color:white;font-size:32px;font-weight:bold;padding:15px 30px;border-radius:8px;display:inline-block;letter-spacing:5px;margin:20px 0;">${otp}</div>
                    <p style="color:#666;font-size:14px;">This code expires in 10 minutes.</p>
                </div>
            </div>`
        }).then(() => console.log('📧 Email sent to ' + email)).catch(e => console.log('📧 OTP (email failed): ' + otp));

        const tempToken = jwt.sign({ email, type: 'signup' }, JWT_SECRET, { expiresIn: '10m' });
        res.json({ success: true, message: 'Account created. Enter OTP to verify.', email, token: tempToken });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Signup failed: ' + error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!userRow) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, userRow.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const otp = generateOTP();
        db.prepare('INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES (?, ?, ?, ?)').run(email, otp, 'login', new Date(Date.now() + 10 * 60000).toISOString());

        emailTransporter.sendMail({
            from: 'Tech Shop <aniketigade@gmail.com>',
            to: email,
            subject: 'Tech Shop - Login Verification',
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#2874f0,#0a46b3);color:white;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
                    <h1>Tech Shop</h1>
                </div>
                <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;text-align:center;">
                    <h2>Login Verification</h2>
                    <p>Your verification code is:</p>
                    <div style="background:#16a34a;color:white;font-size:32px;font-weight:bold;padding:15px 30px;border-radius:8px;display:inline-block;letter-spacing:5px;margin:20px 0;">${otp}</div>
                    <p style="color:#666;font-size:14px;">This code expires in 10 minutes. If this wasn't you, please ignore.</p>
                </div>
            </div>`
        }).then(() => console.log('📧 Email sent to ' + email)).catch(e => console.log('📧 OTP (email failed): ' + otp));

        const tempToken = jwt.sign({ email, type: 'login' }, JWT_SECRET, { expiresIn: '10m' });
        res.json({ success: true, message: 'OTP sent to email', email, token: tempToken });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp, type } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP required' });
        }

        const otpRow = db.prepare("SELECT * FROM otp_verifications WHERE email = ? AND type = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1").get(email, type);

        if (!otpRow) {
            return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
        }

        if (otpRow.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        db.prepare('DELETE FROM otp_verifications WHERE id = ?').run(otpRow.id);

        if (type === 'signup') {
            db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(email);
        }

        const user = db.prepare('SELECT id, email, first_name, last_name, phone FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            message: type === 'signup' ? 'Account verified!' : 'Login successful!',
            token,
            user: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), phone: user.phone }
        });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Resend OTP
app.post('/api/auth/resend-otp', (req, res) => {
    try {
        const { email, type } = req.body;

        db.prepare('DELETE FROM otp_verifications WHERE email = ? AND type = ?').run(email, type);

        const otp = generateOTP();
        db.prepare('INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES (?, ?, ?, ?)').run(email, otp, type, new Date(Date.now() + 10 * 60000).toISOString());

        console.log('\n📧 New OTP (' + email + '): ' + otp + '\n');

        res.json({ success: true, message: 'OTP resent' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resend OTP' });
    }
});

// Create Order
app.post('/api/orders', authenticateToken, (req, res) => {
    try {
        const { items, paymentMethod, subtotal, discount, shipping, totalAmount, shippingAddress, shippingCity, shippingState, shippingPincode } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        if (!shippingAddress || !shippingPincode) {
            return res.status(400).json({ error: 'Delivery address required' });
        }

        const orderId = 'TS' + Date.now();
        const deliveryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

        const result = db.prepare(
            'INSERT INTO orders (user_id, order_id, subtotal, discount, shipping, total_amount, payment_method, payment_status, order_status, delivery_date, shipping_address, shipping_city, shipping_state, shipping_pincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(req.user.id, orderId, subtotal || totalAmount, discount || 0, shipping || 0, totalAmount, paymentMethod, 'completed', 'confirmed', deliveryDate, shippingAddress, shippingCity, shippingState, shippingPincode);

        const dbOrderId = result.lastInsertRowid;

        const insertItem = db.prepare(
            'INSERT INTO order_items (order_id, product_name, product_price, original_price, quantity, category, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        for (const item of items) {
            insertItem.run(dbOrderId, item.name, item.price, item.originalPrice || item.price, item.quantity, item.category, item.image || '');
        }

        db.prepare('INSERT INTO order_tracking (order_id, status, description) VALUES (?, ?, ?)').run(dbOrderId, 'confirmed', 'Order confirmed and being processed');

        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
        if (user) {
            sendOrderConfirmationEmail(user.email, orderId, items, totalAmount);
        }

        res.json({ success: true, orderId, message: 'Order placed successfully!' });
    } catch (error) {
        console.error('Order error:', error);
        res.status(500).json({ error: 'Failed to create order: ' + error.message });
    }
});

// Get Orders
app.get('/api/orders', authenticateToken, (req, res) => {
    try {
        const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

        for (const order of orders) {
            order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
            order.tracking = db.prepare('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at ASC').all(order.id);
        }

        res.json({ orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Cancel Order
app.post('/api/orders/:orderId/cancel', authenticateToken, (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        const order = db.prepare('SELECT * FROM orders WHERE order_id = ? AND user_id = ?').get(orderId, req.user.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (['delivered', 'cancelled', 'returned'].includes(order.order_status)) {
            return res.status(400).json({ error: 'Cannot cancel this order' });
        }

        db.prepare("UPDATE orders SET order_status = 'cancelled', payment_status = 'refunded' WHERE id = ?").run(order.id);
        db.prepare("INSERT INTO order_tracking (order_id, status, description) VALUES (?, 'cancelled', ?)").run(order.id, reason || 'Order cancelled by user');

        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
        if (user) {
            sendOrderCancellationEmail(user.email, orderId, reason, order.total_amount);
        }

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

// Return Order
app.post('/api/orders/:orderId/return', authenticateToken, (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        const order = db.prepare('SELECT * FROM orders WHERE order_id = ? AND user_id = ?').get(orderId, req.user.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.order_status !== 'delivered') {
            return res.status(400).json({ error: 'Only delivered orders can be returned' });
        }

        db.prepare("UPDATE orders SET order_status = 'returned', payment_status = 'refunded' WHERE id = ?").run(order.id);
        db.prepare("INSERT INTO order_tracking (order_id, status, description) VALUES (?, 'returned', ?)").run(order.id, reason || 'Return requested');

        res.json({ success: true, message: 'Return request submitted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process return' });
    }
});

// User Profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
    console.log('Profile request for user id:', req.user.id);
    try {
        const user = db.prepare('SELECT id, email, first_name, last_name, phone, address, city, state, pincode, is_verified, created_at FROM users WHERE id = ?').get(req.user.id);

        console.log('User found:', !!user);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                phone: user.phone || '',
                address: user.address || '',
                city: user.city || '',
                state: user.state || '',
                pincode: user.pincode || '',
                isVerified: !!user.is_verified,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
    }
});

app.put('/api/user/profile', authenticateToken, (req, res) => {
    try {
        const { firstName, lastName, phone, address, city, state, pincode } = req.body;

        db.prepare('UPDATE users SET first_name = ?, last_name = ?, phone = ?, address = ?, city = ?, state = ?, pincode = ? WHERE id = ?').run(firstName || '', lastName || '', phone || '', address || '', city || '', state || '', pincode || '', req.user.id);

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ==================== ADMIN ROUTES ====================

const ADMIN_TOKEN = 'admin_secret_token_techshop_2024';

function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Admin access denied' });
    }
    next();
}

app.get('/api/admin/all', adminAuth, (req, res) => {
    try {
        const orders = db.prepare(`
            SELECT o.*, u.email as user_email, u.phone as user_phone, u.first_name, u.last_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        `).all();

        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

        for (const order of orders) {
            order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
        }

        res.json({ orders, users });
    } catch (error) {
        console.error('Admin fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.post('/api/admin/products/save', adminAuth, (req, res) => {
    try {
        const { products } = req.body;

        if (!products) {
            return res.status(400).json({ error: 'No products data provided', success: false });
        }

        const productsPath = path.join(__dirname, 'data', 'products.json');
        fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));

        console.log('Products saved successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Save products error:', error);
        res.status(500).json({ error: error.message, success: false });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = req.body.category || 'mobiles';
        const uploadDir = path.join(__dirname, 'images', category);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/admin/products/upload', adminAuth, upload.array('images', 5), (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded', success: false });
        }

        const category = req.body.category || 'mobiles';
        const fileNames = files.map(f => f.filename);

        console.log(`Uploaded ${files.length} images to images/${category}/`);
        res.json({
            success: true,
            files: fileNames,
            message: `Uploaded ${files.length} image(s) to images/${category}/`
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message, success: false });
    }
});

app.delete('/api/admin/products/delete', adminAuth, (req, res) => {
    try {
        const { category, id } = req.query;

        const productsPath = path.join(__dirname, 'data', 'products.json');
        if (!fs.existsSync(productsPath)) {
            return res.status(404).json({ error: 'Products file not found' });
        }

        let products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

        if (!products[category]) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const productIndex = products[category].findIndex(p => p.id == id);
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[category][productIndex];

        if (product.images) {
            product.images.forEach(img => {
                const imgPath = path.join(__dirname, 'images', category, img);
                if (fs.existsSync(imgPath)) {
                    fs.unlinkSync(imgPath);
                }
            });
        }

        products[category].splice(productIndex, 1);

        fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));

        res.json({ success: true, message: 'Product deleted!' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

app.post('/api/admin/update-order', adminAuth, (req, res) => {
    try {
        const { orderId, status } = req.body;

        const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        let paymentStatus = order.payment_status;
        if (status === 'cancelled') {
            paymentStatus = 'refunded';
        }

        db.prepare('UPDATE orders SET order_status = ?, payment_status = ? WHERE order_id = ?').run(status, paymentStatus, orderId);

        const statusMessages = {
            'confirmed': 'Order confirmed',
            'shipped': 'Order shipped',
            'delivered': 'Order delivered',
            'cancelled': 'Order cancelled'
        };

        db.prepare('INSERT INTO order_tracking (order_id, status, description) VALUES (?, ?, ?)').run(order.id, status, statusMessages[status] || 'Status updated');

        res.json({ success: true, message: statusMessages[status] + ' successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Static files
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/signup', (req, res) => res.sendFile(__dirname + '/signup.html'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/login.html'));
app.get('/otp', (req, res) => res.sendFile(__dirname + '/otp.html'));
app.get('/payment', (req, res) => res.sendFile(__dirname + '/payment.html'));
app.get('/order-success', (req, res) => res.sendFile(__dirname + '/order-success.html'));
app.get('/orders', (req, res) => res.sendFile(__dirname + '/orders.html'));
app.get('/profile', (req, res) => res.sendFile(__dirname + '/profile.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

// Start server
try {
    initDatabase();
    app.listen(PORT, () => {
        console.log('\n🚀 Tech Shop running at http://localhost:' + PORT + '\n');
    });
} catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    process.exit(1);
}
