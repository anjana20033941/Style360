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
