-- Style360 v2 Consolidated Database Schema
CREATE DATABASE IF NOT EXISTS style360_v2 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE style360_v2;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Garment Table (Consolidated)
CREATE TABLE IF NOT EXISTS garment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    gender ENUM('male', 'female', 'unisex') NOT NULL,
    category ENUM('western', 'indian', 'traditional', 'bridal', 'casual') NOT NULL,
    display_image_url VARCHAR(500) NOT NULL,
    fal_image_url VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Try On History Table
CREATE TABLE IF NOT EXISTS try_on_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    garment_id INT NULL,
    result_image_url VARCHAR(500) NULL,
    result_2d_url VARCHAR(500) NULL,
    result_3d_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_garment (garment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Custom Outfit Requests Table
CREATE TABLE IF NOT EXISTS custom_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    outfit_id INT NULL,
    top_color VARCHAR(100) NULL,
    bottom_color VARCHAR(100) NULL,
    notes TEXT NULL,
    result_image_url VARCHAR(500) NULL DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'Pending Review',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_outfit (outfit_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. User Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_is_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. User 3D Models Table
CREATE TABLE IF NOT EXISTS user_3d_models (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    tryon_history_id INT NULL,
    task_id VARCHAR(100) NULL,
    image_hash VARCHAR(64) NULL,
    model_url VARCHAR(1000) NOT NULL,
    preview_image_url VARCHAR(1000) NULL,
    outfit_id INT NULL,
    outfit_title VARCHAR(255) NULL,
    category VARCHAR(100) NULL,
    gender VARCHAR(50) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_history (tryon_history_id),
    INDEX idx_task (task_id),
    INDEX idx_hash (image_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Seed Initial Catalog Garments (Matches repository images)
INSERT INTO garment (title, gender, category, display_image_url, fal_image_url, status) VALUES
('Elegant A-Line Western Gown', 'female', 'western', 'images/g_women_dress_1.png', 'images/g_women_dress_1.png', 'active'),
('Floral Evening Cocktail Dress', 'female', 'western', 'images/cat_women_dress.png', 'images/cat_women_dress.png', 'active'),
('Royal Crimson Bridal Lehenga', 'female', 'indian', 'images/g_wedding_gown_2.png', 'images/g_wedding_gown_2.png', 'active'),
('Pastel Floral Festive Anarkali', 'female', 'indian', 'images/cat_women_dress.png', 'images/cat_women_dress.png', 'active'),
('Exquisite Silk Qipao Gown', 'female', 'traditional', 'images/g_women_dress_2.png', 'images/g_women_dress_2.png', 'active'),
('Lace Cathedral Bridal Gown', 'female', 'bridal', 'images/cat_wedding_women.png', 'images/cat_wedding_women.png', 'active'),
('Elaborate Silk Bridal Dress', 'female', 'bridal', 'images/g_wedding_gown_2.png', 'images/g_wedding_gown_2.png', 'active'),
('Modern Ribbed Knit Top', 'female', 'casual', 'images/g_women_top_1.png', 'images/g_women_top_1.png', 'active'),
('Breezy Summer Floral Blouse', 'female', 'casual', 'images/cat_women_tops.png', 'images/cat_women_tops.png', 'active'),
('Executive Charcoal Italian Wool Suit', 'male', 'western', 'images/g_men_formal_2.png', 'images/g_men_formal_2.png', 'active'),
('Modern Midnight Navy Tuxedo', 'male', 'western', 'images/g_men_formal_1.png', 'images/g_men_formal_1.png', 'active'),
('Signature Slate Grey Business Suit', 'male', 'western', 'images/g_men_formal_3.png', 'images/g_men_formal_3.png', 'active'),
('Embroidered Elegance Sherwani', 'male', 'indian', 'images/g_embroidered_elegance_1786825168.jpg', 'images/g_embroidered_elegance_1786825168.jpg', 'active'),
('Exquisite Silk Heritage Sherwani', 'male', 'indian', 'images/g_wedding_suit_1.png', 'images/g_wedding_suit_1.png', 'active'),
('Cultural Batik Heritage Shirt', 'male', 'traditional', 'images/g_men_casual_1.png', 'images/g_men_casual_1.png', 'active'),
('Royal Ivory Wedding Tuxedo', 'male', 'bridal', 'images/cat_wedding_men.png', 'images/cat_wedding_men.png', 'active'),
('Classic Black Wedding Tuxedo Suit', 'male', 'bridal', 'images/g_wedding_suit_2.png', 'images/g_wedding_suit_2.png', 'active'),
('Relaxed Urban Denim Jacket', 'male', 'casual', 'images/g_men_casual_2.png', 'images/g_men_casual_2.png', 'active'),
('Minimalist Summer Linen Shirt', 'male', 'casual', 'images/g_men_casual_3.png', 'images/g_men_casual_3.png', 'active')
ON DUPLICATE KEY UPDATE title=VALUES(title);

-- 8. Seed Default Admin Account (admin@style360.com / admin123)
INSERT INTO users (first_name, last_name, email, password, role) VALUES
('Admin', 'Style360', 'admin@style360.com', '$2y$10$e7m0g8i07Yw1iWvN0w64ueeGq7h0Q5c/8i4t1Y9x6O0k4W0G3w3Ue', 'admin')
ON DUPLICATE KEY UPDATE first_name=VALUES(first_name);
