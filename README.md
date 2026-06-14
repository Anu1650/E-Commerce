# Tech Shop - E-Commerce Website

A full-stack e-commerce website with Node.js backend and MySQL database.

## Features

- User signup with email verification
- Login with OTP verification
- Browse products by category
- Shopping cart
- Multiple payment methods (UPI, Card, Net Banking, Wallets)
- Order management

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Authentication**: JWT, Bcrypt
- **Email**: Nodemailer (OTP verification)

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- XAMPP/WAMP (for local MySQL) or MySQL Workbench

### 2. Database Setup

1. Open MySQL (via XAMPP or command line)
2. Create a database:

```sql
CREATE DATABASE techshop;
```

3. The tables will be created automatically when you start the server

Or run this SQL manually:

```sql
CREATE DATABASE IF NOT EXISTS techshop;
USE techshop;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(15),
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    type ENUM('signup', 'login', 'forgot') NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_id VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    order_status ENUM('processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_price DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL,
    category VARCHAR(100),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment

Copy `.env.example` to `.env` and update with your settings:

```bash
cp .env.example .env
```

Edit `.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=techshop
JWT_SECRET=your_secret_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_google_app_password
PORT=3000
```

### 5. Gmail App Password (for OTP)

1. Enable 2-Factor Authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an App Password for "Mail"
4. Use that password in EMAIL_PASS

### 6. Start the Server

```bash
npm start
```

Server will run on: http://localhost:3000

### 7. Demo Mode

If you don't configure email, OTPs will be logged to the console.

## Project Structure

```
├── server.js          # Express server with API routes
├── package.json       # Dependencies
├── .env.example       # Environment template
├── js/
│   └── products.js    # Product data and cart functions
├── index.html         # Main shop page
├── signup.html        # Registration page
├── login.html         # Login page
├── otp.html           # OTP verification page
├── payment.html       # Payment page
└── order-success.html # Order confirmation
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/auth/check | Check login status |
| POST | /api/auth/signup | Register new user |
| POST | /api/auth/login | Login user |
| POST | /api/auth/verify-otp | Verify OTP |
| POST | /api/auth/resend-otp | Resend OTP |
| POST | /api/auth/forgot-password | Forgot password |
| POST | /api/auth/reset-password | Reset password |
| POST | /api/orders | Create order |
| GET | /api/orders | Get user orders |
| PUT | /api/user/profile | Update profile |

## Usage Flow

1. **Signup**: Register with email → Verify OTP → Account created
2. **Login**: Enter credentials → Verify OTP → Logged in
3. **Shopping**: Browse products → Add to cart → Checkout
4. **Payment**: Select payment method → Complete payment → Order confirmed

## Note

For demo purposes without email setup, OTPs are printed to the server console. In production, configure proper email credentials.