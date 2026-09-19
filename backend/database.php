<?php
// Load .env file if present
$envPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $val) = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val, " \t\n\r\0\x0B\"'");
            if (!isset($_ENV[$key])) {
                $_ENV[$key] = $val;
                putenv("$key=$val");
            }
        }
    }
}

// Defaults for Style360 v2
$host = getenv('DB_HOST') ?: '127.0.0.1';
$db_name = getenv('DB_DATABASE') ?: 'style360_v2';
$username = getenv('DB_USERNAME') ?: 'root';
$password = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '';
$port = getenv('DB_PORT') ?: '3306';

// If DATABASE_URL is set, parse it
$dbUrl = getenv('DATABASE_URL');
if ($dbUrl) {
    $parsed = parse_url($dbUrl);
    if ($parsed) {
        $host = isset($parsed['host']) ? $parsed['host'] : $host;
        $port = isset($parsed['port']) ? $parsed['port'] : $port;
        $username = isset($parsed['user']) ? $parsed['user'] : $username;
        $password = isset($parsed['pass']) ? $parsed['pass'] : $password;
        if (!empty($parsed['path'])) {
            $db_name = ltrim($parsed['path'], '/');
        }
    }
}

$conn = null;
$hostsToTry = [
    $host,
    "127.0.0.1",
    "localhost",
    "127.0.0.1;port=" . $port
];

foreach ($hostsToTry as $h) {
    try {
        $conn = new PDO("mysql:host=" . $h . ";dbname=" . $db_name . ";charset=utf8mb4", $username, $password);
        $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        break;
    } catch (PDOException $e) {
        // Attempt auto-creation of style360_v2 if it doesn't exist yet
        try {
            $rootPdo = new PDO("mysql:host=" . $h, $username, $password);
            $rootPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $rootPdo->exec("CREATE DATABASE IF NOT EXISTS `" . $db_name . "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
            
            $conn = new PDO("mysql:host=" . $h . ";dbname=" . $db_name . ";charset=utf8mb4", $username, $password);
            $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            break;
        } catch (Exception $ex) {
            // Keep trying next host
        }
    }
}

if ($conn) {
    try {
        // 1. Custom Requests Table
        $conn->exec("CREATE TABLE IF NOT EXISTS custom_requests (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // Dynamic Column & Status Migration for existing tables
        try {
            $colCheck = $conn->query("SHOW COLUMNS FROM custom_requests LIKE 'result_image_url'")->fetch();
            if (!$colCheck) {
                $conn->exec("ALTER TABLE custom_requests ADD COLUMN result_image_url VARCHAR(500) NULL DEFAULT NULL AFTER notes");
            }
            $conn->exec("ALTER TABLE custom_requests MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'Pending Review'");
            $conn->exec("UPDATE custom_requests SET status = 'Pending Review' WHERE status = 'pending' OR status IS NULL OR status = ''");
            $conn->exec("UPDATE custom_requests SET status = 'Ready for Download' WHERE status = 'completed'");
        } catch (Exception $alterEx) {
            // Ignore if column/type already matches
        }

        // 2. Notifications Table
        $conn->exec("CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            is_read TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user (user_id),
            INDEX idx_is_read (is_read)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 3. Try-On History Migration & Static Mock Data Purge
        try {
            $colCheck = $conn->query("SHOW COLUMNS FROM try_on_history LIKE 'result_image_url'")->fetch();
            if (!$colCheck) {
                $conn->exec("ALTER TABLE try_on_history ADD COLUMN result_image_url VARCHAR(500) NULL DEFAULT NULL AFTER garment_id");
            }
            // Ensure result_3d_url is TEXT to support long signed CloudFront URLs (>900 chars)
            $conn->exec("ALTER TABLE try_on_history MODIFY COLUMN result_3d_url TEXT NULL DEFAULT NULL");
            // Populate result_image_url from result_2d_url for genuine generations
            $conn->exec("UPDATE try_on_history SET result_image_url = result_2d_url WHERE (result_image_url IS NULL OR result_image_url = '') AND result_2d_url IS NOT NULL AND result_2d_url != ''");
            
            // Completely purge static mock demo images (e.g. 'images/cat_wedding_men.png', 'images/g_men_formal_2.png')
            $conn->exec("DELETE FROM try_on_history WHERE result_image_url LIKE 'images/%' OR result_2d_url LIKE 'images/%' OR result_image_url LIKE '%cat_wedding%' OR result_image_url LIKE '%g_men_formal%' OR result_image_url LIKE '%g_wedding_gown%'");

            // Purge dummy/mock 3D models and orphan non-functional GLBs
            $conn->exec("UPDATE try_on_history SET result_3d_url = NULL WHERE result_3d_url LIKE '%lace_gown.glb%' OR result_3d_url LIKE '%charcoal_suit.glb%' OR result_3d_url LIKE '%sampleman_avatar%' OR result_3d_url = 'null' OR result_3d_url = 'undefined' OR (result_3d_url IS NOT NULL AND TRIM(result_3d_url) != '' AND result_3d_url NOT LIKE '%.glb%' AND result_3d_url NOT LIKE '%.gltf%')");

            // Delete completely orphan records with no 2D and no 3D
            $conn->exec("DELETE FROM try_on_history WHERE (result_image_url IS NULL OR TRIM(result_image_url) = '' OR result_image_url = 'null') AND (result_2d_url IS NULL OR TRIM(result_2d_url) = '' OR result_2d_url = 'null') AND (result_3d_url IS NULL OR TRIM(result_3d_url) = '' OR result_3d_url = 'null')");
        } catch (Exception $alterHist) {
            // Ignore if column already exists
        }

        // 4. User 3D Models Table (Tripo3D persistent storage & caching)
        try {
            $conn->exec("CREATE TABLE IF NOT EXISTS user_3d_models (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
        } catch (Exception $e3d) {
            // Silently ignore if already exists
        }
    } catch (Exception $e) {
        // Silently ignore if already exists
    }
}
?>
