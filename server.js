const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'techshop_secret_key_2024';

const dbPath = path.join(__dirname, 'data', 'techshop.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function saveDb() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function dbGet(sql, params = []) {
    const rows = dbAll(sql, params);
    return rows[0];
}

function dbRun(sql, params = []) {
    db.run(sql, params);
    saveDb();
    const result = db.exec("SELECT last_insert_rowid()");
    return { changes: db.getRowsModified(), lastInsertRowid: result[0]?.values[0][0] };
}

function dbExec(sql) {
    db.exec(sql);
    saveDb();
}

const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'aniketigade@gmail.com',
        pass: process.env.EMAIL_PASS || 'uzyfmzytucafqnaa'
    },
    tls: { rejectUnauthorized: false },
    logger: true,
    debug: true
});

async function sendOrderConfirmationEmail(email, orderId, items, total) {
    const itemList = items.map(i => `<li>${i.product_name} x${i.quantity} - ₹${i.product_price * i.quantity}</li>`).join('');
    try {
        await emailTransporter.sendMail({
            from: 'Tech Shop <aniketigade@gmail.com>',
            to: email,
            subject: `Order Confirmed - ${orderId} | Tech Shop`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#2874f0;">✅ Order Confirmed!</h2>
                <p>Dear Customer,</p>
                <p>Your order <strong>${orderId}</strong> has been confirmed successfully.</p>
                <h3>Order Details:</h3>
                <ul>${itemList}</ul>
                <p><strong>Total: ₹${total}</strong></p>
                <p>📦 Your order is being processed and will be shipped soon!</p>
                <p style="margin-top:20px;color:#6b7280;">Thank you for shopping with Tech Shop!</p>
            </div>`
        });
        console.log('Order confirmation email sent to:', email);
    } catch (e) {
        console.log('Email error:', e.message);
    }
}

async function sendOrderCancellationEmail(email, orderId, reason, refundAmount) {
    try {
        await emailTransporter.sendMail({
            from: 'Tech Shop <aniketigade@gmail.com>',
            to: email,
            subject: `Order Cancelled - ${orderId} | Tech Shop`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#dc2626;">❌ Order Cancelled</h2>
                <p>Dear Customer,</p>
                <p>Your order <strong>${orderId}</strong> has been cancelled.</p>
                <p><strong>Refund Amount: ₹${refundAmount}</strong></p>
                <p>Reason: ${reason || 'Not specified'}</p>
                <p>💰 Refund will be credited within 5-7 business days.</p>
                <p style="margin-top:20px;color:#6b7280;">Thank you for shopping with Tech Shop!</p>
            </div>`
        });
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
    db.run("PRAGMA foreign_keys = ON");
    dbExec(`CREATE TABLE IF NOT EXISTS users (
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
    )`);
    dbExec(`CREATE TABLE IF NOT EXISTS otp_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    dbExec(`CREATE TABLE IF NOT EXISTS orders (
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
    )`);
    dbExec(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        product_price REAL NOT NULL,
        original_price REAL,
        quantity INTEGER NOT NULL,
        category TEXT,
        image_url TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )`);
    dbExec(`CREATE TABLE IF NOT EXISTS order_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    dbExec(`CREATE TABLE IF NOT EXISTS cart_items (
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
    )`);
    dbExec(`CREATE TABLE IF NOT EXISTS wishlist_items (
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
    )`);
    console.log('✅ Database & tables created!');
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Login required' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired' });
        req.user = user;
        next();
    });
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==================== API ROUTES ====================

app.get('/api/cart', authenticateToken, (req, res) => {
    try {
        const items = dbAll('SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json({ success: true, cart: items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

app.post('/api/cart', authenticateToken, (req, res) => {
    try {
        const { productId, productName, productPrice, productImage, category, quantity } = req.body;
        dbRun(`INSERT INTO cart_items (user_id, product_id, product_name, product_price, product_image, category, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + 1`,
            [req.user.id, productId, productName, productPrice, productImage, category, quantity || 1]);
        res.json({ success: true, message: 'Added to cart' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

app.put('/api/cart/:productId', authenticateToken, (req, res) => {
    try {
        const { quantity } = req.body;
        if (quantity <= 0) {
            dbRun('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
        } else {
            dbRun('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?', [quantity, req.user.id, req.params.productId]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

app.delete('/api/cart/:productId', authenticateToken, (req, res) => {
    try {
        dbRun('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
        res.json({ success: true, message: 'Removed from cart' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from cart' });
    }
});

app.delete('/api/cart', authenticateToken, (req, res) => {
    try {
        dbRun('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
        res.json({ success: true, message: 'Cart cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

app.get('/api/wishlist', authenticateToken, (req, res) => {
    try {
        const items = dbAll('SELECT * FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json({ success: true, wishlist: items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});

app.post('/api/wishlist', authenticateToken, (req, res) => {
    try {
        const { productId, productName, productPrice, productImage, category } = req.body;
        dbRun(`INSERT INTO wishlist_items (user_id, product_id, product_name, product_price, product_image, category)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, product_id) DO UPDATE SET product_name = product_name`,
            [req.user.id, productId, productName, productPrice, productImage, category]);
        res.json({ success: true, message: 'Added to wishlist' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});

app.delete('/api/wishlist/:productId', authenticateToken, (req, res) => {
    try {
        dbRun('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
        res.json({ success: true, message: 'Removed from wishlist' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.get('/api/auth/check', authenticateToken, (req, res) => {
    try {
        const user = dbGet('SELECT id, email, first_name, last_name, phone FROM users WHERE id = ?', [req.user.id]);
        if (user) {
            res.json({ isLoggedIn: true, user: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), phone: user.phone } });
        } else {
            res.status(404).json({ isLoggedIn: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password } = req.body;
        if (!firstName || !email || !password) {
            return res.status(400).json({ error: 'First name, email and password are required' });
        }
        if (dbGet('SELECT id FROM users WHERE email = ?', [email])) {
            return res.status(400).json({ error: 'Email already registered. Please login.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        dbRun('INSERT INTO users (first_name, last_name, email, phone, password) VALUES (?, ?, ?, ?, ?)',
            [firstName, lastName || '', email, phone || '', hashedPassword]);
        const otp = generateOTP();
        console.log('\n📧 OTP for ' + email + ' (signup): ' + otp + '\n');
        dbRun('INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES (?, ?, ?, ?)',
            [email, otp, 'signup', new Date(Date.now() + 10 * 60000).toISOString()]);
        emailTransporter.sendMail({
            from: 'Tech Shop <aniketigade@gmail.com>',
            to: email,
            subject: 'Tech Shop - Verify Your Account',
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#2874f0,#0a46b3);color:white;padding:20px;text-align:center;border-radius:10px 10px 0 0;"><h1>Tech Shop</h1></div>
                <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;text-align:center;">
                    <h2>Verify Your Email</h2>
                    <p>Your verification code is:</p>
                    <div style="background:#2874f0;color:white;font-size:32px;font-weight:bold;padding:15px 30px;border-radius:8px;display:inline-block;letter-spacing:5px;margin:20px 0;">${otp}</div>
                    <p style="color:#666;font-size:14px;">This code expires in 10 minutes.</p>
                </div>
            </div>`
        }).then(() => console.log('📧 Email sent to ' + email)).catch(e => console.error('📧 Email send failed:', e.message));
        const tempToken = jwt.sign({ email, type: 'signup' }, JWT_SECRET, { expiresIn: '10m' });
        res.json({ success: true, message: 'Account created. Enter OTP to verify.', email, token: tempToken });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Signup failed: ' + error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        const userRow = dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!userRow || !(await bcrypt.compare(password, userRow.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const otp = generateOTP();
        console.log('\n📧 OTP for ' + email + ' (login): ' + otp + '\n');
        dbRun('INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES (?, ?, ?, ?)',
            [email, otp, 'login', new Date(Date.now() + 10 * 60000).toISOString()]);
        emailTransporter.sendMail({
            from: 'Tech Shop <aniketigade@gmail.com>',
            to: email,
            subject: 'Tech Shop - Login Verification',
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#2874f0,#0a46b3);color:white;padding:20px;text-align:center;border-radius:10px 10px 0 0;"><h1>Tech Shop</h1></div>
                <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;text-align:center;">
                    <h2>Login Verification</h2>
                    <p>Your verification code is:</p>
                    <div style="background:#16a34a;color:white;font-size:32px;font-weight:bold;padding:15px 30px;border-radius:8px;display:inline-block;letter-spacing:5px;margin:20px 0;">${otp}</div>
                    <p style="color:#666;font-size:14px;">This code expires in 10 minutes.</p>
                </div>
            </div>`
        }).then(() => console.log('📧 Email sent to ' + email)).catch(e => console.error('📧 Email send failed:', e.message));
        const tempToken = jwt.sign({ email, type: 'login' }, JWT_SECRET, { expiresIn: '10m' });
        res.json({ success: true, message: 'OTP sent to email', email, token: tempToken });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

app.post('/api/auth/verify-otp', (req, res) => {
    try {
        const { email, otp, type } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
        const otpRow = dbGet("SELECT * FROM otp_verifications WHERE email = ? AND type = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1", [email, type]);
        if (!otpRow) return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
        if (otpRow.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
        dbRun('DELETE FROM otp_verifications WHERE id = ?', [otpRow.id]);
        if (type === 'signup') dbRun('UPDATE users SET is_verified = 1 WHERE email = ?', [email]);
        const user = dbGet('SELECT id, email, first_name, last_name, phone FROM users WHERE email = ?', [email]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: type === 'signup' ? 'Account verified!' : 'Login successful!', token,
            user: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), phone: user.phone } });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/api/auth/resend-otp', (req, res) => {
    try {
        const { email, type } = req.body;
        dbRun('DELETE FROM otp_verifications WHERE email = ? AND type = ?', [email, type]);
        const otp = generateOTP();
        dbRun('INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES (?, ?, ?, ?)',
            [email, otp, type, new Date(Date.now() + 10 * 60000).toISOString()]);
        console.log('\n📧 New OTP (' + email + '): ' + otp + '\n');
        res.json({ success: true, message: 'OTP resent' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resend OTP' });
    }
});

app.post('/api/orders', authenticateToken, (req, res) => {
    try {
        const { items, paymentMethod, subtotal, discount, shipping, totalAmount, shippingAddress, shippingCity, shippingState, shippingPincode } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });
        if (!shippingAddress || !shippingPincode) return res.status(400).json({ error: 'Delivery address required' });
        const orderId = 'TS' + Date.now();
        const deliveryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        const result = dbRun(
            'INSERT INTO orders (user_id, order_id, subtotal, discount, shipping, total_amount, payment_method, payment_status, order_status, delivery_date, shipping_address, shipping_city, shipping_state, shipping_pincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, orderId, subtotal || totalAmount, discount || 0, shipping || 0, totalAmount, paymentMethod, 'completed', 'confirmed', deliveryDate, shippingAddress, shippingCity, shippingState, shippingPincode]
        );
        const dbOrderId = result.lastInsertRowid;
        const insertStmt = db.prepare('INSERT INTO order_items (order_id, product_name, product_price, original_price, quantity, category, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const item of items) {
            insertStmt.bind([dbOrderId, item.name, item.price, item.originalPrice || item.price, item.quantity, item.category, item.image || '']);
            insertStmt.step();
            insertStmt.reset();
        }
        insertStmt.free();
        saveDb();
        dbRun('INSERT INTO order_tracking (order_id, status, description) VALUES (?, ?, ?)', [dbOrderId, 'confirmed', 'Order confirmed and being processed']);
        const user = dbGet('SELECT email FROM users WHERE id = ?', [req.user.id]);
        if (user) sendOrderConfirmationEmail(user.email, orderId, items, totalAmount);
        res.json({ success: true, orderId, message: 'Order placed successfully!' });
    } catch (error) {
        console.error('Order error:', error);
        res.status(500).json({ error: 'Failed to create order: ' + error.message });
    }
});

app.get('/api/orders', authenticateToken, (req, res) => {
    try {
        const orders = dbAll('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        for (const order of orders) {
            order.items = dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
            order.tracking = dbAll('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
        }
        res.json({ orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

app.post('/api/orders/:orderId/cancel', authenticateToken, (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const order = dbGet('SELECT * FROM orders WHERE order_id = ? AND user_id = ?', [orderId, req.user.id]);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (['delivered', 'cancelled', 'returned'].includes(order.order_status)) return res.status(400).json({ error: 'Cannot cancel this order' });
        dbRun("UPDATE orders SET order_status = 'cancelled', payment_status = 'refunded' WHERE id = ?", [order.id]);
        dbRun("INSERT INTO order_tracking (order_id, status, description) VALUES (?, 'cancelled', ?)", [order.id, reason || 'Order cancelled by user']);
        const user = dbGet('SELECT email FROM users WHERE id = ?', [req.user.id]);
        if (user) sendOrderCancellationEmail(user.email, orderId, reason, order.total_amount);
        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

app.post('/api/orders/:orderId/return', authenticateToken, (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const order = dbGet('SELECT * FROM orders WHERE order_id = ? AND user_id = ?', [orderId, req.user.id]);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.order_status !== 'delivered') return res.status(400).json({ error: 'Only delivered orders can be returned' });
        dbRun("UPDATE orders SET order_status = 'returned', payment_status = 'refunded' WHERE id = ?", [order.id]);
        dbRun("INSERT INTO order_tracking (order_id, status, description) VALUES (?, 'returned', ?)", [order.id, reason || 'Return requested']);
        res.json({ success: true, message: 'Return request submitted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process return' });
    }
});

app.get('/api/user/profile', authenticateToken, (req, res) => {
    try {
        const user = dbGet('SELECT id, email, first_name, last_name, phone, address, city, state, pincode, is_verified, created_at FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: {
            id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), phone: user.phone || '',
            address: user.address || '', city: user.city || '', state: user.state || '', pincode: user.pincode || '',
            isVerified: !!user.is_verified, createdAt: user.created_at
        }});
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.put('/api/user/profile', authenticateToken, (req, res) => {
    try {
        const { firstName, lastName, phone, address, city, state, pincode } = req.body;
        dbRun('UPDATE users SET first_name = ?, last_name = ?, phone = ?, address = ?, city = ?, state = ?, pincode = ? WHERE id = ?',
            [firstName || '', lastName || '', phone || '', address || '', city || '', state || '', pincode || '', req.user.id]);
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ==================== ADMIN ROUTES ====================

const ADMIN_TOKEN = 'admin_secret_token_techshop_2024';

function adminAuth(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Admin access denied' });
    next();
}

app.get('/api/admin/all', adminAuth, (req, res) => {
    try {
        const orders = dbAll('SELECT o.*, u.email as user_email, u.phone as user_phone, u.first_name, u.last_name FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC');
        const users = dbAll('SELECT * FROM users ORDER BY created_at DESC');
        for (const order of orders) order.items = dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
        res.json({ orders, users });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.post('/api/admin/products/save', adminAuth, (req, res) => {
    try {
        const { products } = req.body;
        if (!products) return res.status(400).json({ error: 'No products data provided', success: false });
        fs.writeFileSync(path.join(__dirname, 'data', 'products.json'), JSON.stringify(products, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message, success: false });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = req.body.category || 'mobiles';
        const uploadDir = path.join(__dirname, 'images', category);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/admin/products/upload', adminAuth, upload.array('images', 5), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded', success: false });
        const fileNames = req.files.map(f => f.filename);
        res.json({ success: true, files: fileNames, message: `Uploaded ${req.files.length} image(s)` });
    } catch (error) {
        res.status(500).json({ error: error.message, success: false });
    }
});

app.delete('/api/admin/products/delete', adminAuth, (req, res) => {
    try {
        const { category, id } = req.query;
        const productsPath = path.join(__dirname, 'data', 'products.json');
        if (!fs.existsSync(productsPath)) return res.status(404).json({ error: 'Products file not found' });
        let products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
        if (!products[category]) return res.status(404).json({ error: 'Category not found' });
        const idx = products[category].findIndex(p => p.id == id);
        if (idx === -1) return res.status(404).json({ error: 'Product not found' });
        const product = products[category][idx];
        if (product.images) product.images.forEach(img => {
            const imgPath = path.join(__dirname, 'images', category, img);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        });
        products[category].splice(idx, 1);
        fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
        res.json({ success: true, message: 'Product deleted!' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

app.post('/api/admin/update-order', adminAuth, (req, res) => {
    try {
        const { orderId, status } = req.body;
        const order = dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        const paymentStatus = status === 'cancelled' ? 'refunded' : order.payment_status;
        dbRun('UPDATE orders SET order_status = ?, payment_status = ? WHERE order_id = ?', [status, paymentStatus, orderId]);
        const msgs = { confirmed: 'Order confirmed', shipped: 'Order shipped', delivered: 'Order delivered', cancelled: 'Order cancelled' };
        dbRun('INSERT INTO order_tracking (order_id, status, description) VALUES (?, ?, ?)', [order.id, status, msgs[status] || 'Status updated']);
        res.json({ success: true, message: (msgs[status] || 'Status') + ' successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/signup', (req, res) => res.sendFile(__dirname + '/signup.html'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/login.html'));
app.get('/otp', (req, res) => res.sendFile(__dirname + '/otp.html'));
app.get('/payment', (req, res) => res.sendFile(__dirname + '/payment.html'));
app.get('/order-success', (req, res) => res.sendFile(__dirname + '/order-success.html'));
app.get('/orders', (req, res) => res.sendFile(__dirname + '/orders.html'));
app.get('/profile', (req, res) => res.sendFile(__dirname + '/profile.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

async function start() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        db = new SQL.Database(fs.readFileSync(dbPath));
    } else {
        db = new SQL.Database();
    }
    initDatabase();
    app.listen(PORT, () => {
        console.log('\n🚀 Tech Shop running at http://localhost:' + PORT + '\n');
    });
}

start().catch(err => {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
});
