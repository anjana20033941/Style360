<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

require_once __DIR__ . '/database.php';

if (!$conn) {
    die("Database connection failed\n");
}

echo "=== Running Style360 v2 Database Migration ===\n";

// 1. Create uploads directories if they don't exist
$baseDir = dirname(__DIR__);
$displayDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'display';
$falDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'fal';

if (!is_dir($displayDir)) {
    mkdir($displayDir, 0777, true);
    echo "Created: {$displayDir}\n";
}
if (!is_dir($falDir)) {
    mkdir($falDir, 0777, true);
    echo "Created: {$falDir}\n";
}

// 2. Drop old/conflicting tables or recreate according to new schema
$conn->exec("SET FOREIGN_KEY_CHECKS = 0;");
$conn->exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS User; DROP TABLE IF EXISTS Session; DROP TABLE IF EXISTS session; DROP TABLE IF EXISTS TryOn; DROP TABLE IF EXISTS tryon; DROP TABLE IF EXISTS try_on_history; DROP TABLE IF EXISTS garment;");
$conn->exec("
    CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");
echo "Table `users` created.\n";

// Drop old simple garment table if structure is legacy and recreate new consolidated schema
try {
    $checkCols = $conn->query("DESCRIBE garment")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('display_image_url', $checkCols)) {
        echo "Dropping legacy garment table...\n";
        $conn->exec("DROP TABLE IF EXISTS tryon; DROP TABLE IF EXISTS try_on_history; DROP TABLE IF EXISTS garment;");
    }
} catch (Exception $e) {
    // table might not exist
}

$conn->exec("
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
");
echo "Table `garment` checked/created.\n";

$conn->exec("
    CREATE TABLE IF NOT EXISTS try_on_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        garment_id INT NULL,
        result_2d_url VARCHAR(500) NULL,
        result_3d_url VARCHAR(500) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_garment (garment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");
echo "Table `try_on_history` checked/created.\n";

// 3. Seed initial sample outfits into `garment` if empty
$count = $conn->query("SELECT COUNT(*) FROM garment")->fetchColumn();
if ($count == 0) {
    echo "Seeding initial sample outfits into `garment` table...\n";
    $initialGarments = [
        // Women's Western
        ['title' => 'Elegant A-Line Western Gown', 'gender' => 'female', 'category' => 'western', 'display' => 'images/g_women_dress_1.png', 'fal' => 'images/g_women_dress_1.png'],
        ['title' => 'Floral Evening Cocktail Dress', 'gender' => 'female', 'category' => 'western', 'display' => 'images/cat_women_dress.png', 'fal' => 'images/cat_women_dress.png'],

        // Women's Indian / Ethnic
        ['title' => 'Royal Crimson Bridal Lehenga', 'gender' => 'female', 'category' => 'indian', 'display' => 'images/g_wedding_gown_2.png', 'fal' => 'images/g_wedding_gown_2.png'],
        ['title' => 'Pastel Floral Festive Anarkali', 'gender' => 'female', 'category' => 'indian', 'display' => 'images/cat_women_dress.png', 'fal' => 'images/cat_women_dress.png'],

        // Women's Traditional / Cultural
        ['title' => 'Exquisite Silk Qipao Gown', 'gender' => 'female', 'category' => 'traditional', 'display' => 'images/g_women_dress_2.png', 'fal' => 'images/g_women_dress_2.png'],

        // Women's Bridal & Formal
        ['title' => 'Lace Cathedral Bridal Gown', 'gender' => 'female', 'category' => 'bridal', 'display' => 'images/cat_wedding_women.png', 'fal' => 'images/cat_wedding_women.png'],
        ['title' => 'Elaborate Silk Bridal Dress', 'gender' => 'female', 'category' => 'bridal', 'display' => 'images/g_wedding_gown_2.png', 'fal' => 'images/g_wedding_gown_2.png'],

        // Women's Casual
        ['title' => 'Modern Ribbed Knit Top', 'gender' => 'female', 'category' => 'casual', 'display' => 'images/g_women_top_1.png', 'fal' => 'images/g_women_top_1.png'],
        ['title' => 'Breezy Summer Floral Blouse', 'gender' => 'female', 'category' => 'casual', 'display' => 'images/cat_women_tops.png', 'fal' => 'images/cat_women_tops.png'],

        // Men's Western
        ['title' => 'Executive Charcoal Italian Wool Suit', 'gender' => 'male', 'category' => 'western', 'display' => 'images/g_men_formal_2.png', 'fal' => 'images/g_men_formal_2.png'],
        ['title' => 'Modern Midnight Navy Tuxedo', 'gender' => 'male', 'category' => 'western', 'display' => 'images/g_men_formal_1.png', 'fal' => 'images/g_men_formal_1.png'],
        ['title' => 'Signature Slate Grey Business Suit', 'gender' => 'male', 'category' => 'western', 'display' => 'images/g_men_formal_3.png', 'fal' => 'images/g_men_formal_3.png'],

        // Men's Indian / Ethnic
        ['title' => 'Embroidered Elegance Sherwani', 'gender' => 'male', 'category' => 'indian', 'display' => 'images/g_embroidered_elegance_1786825168.jpg', 'fal' => 'images/g_embroidered_elegance_1786825168.jpg'],
        ['title' => 'Exquisite Silk Heritage Sherwani', 'gender' => 'male', 'category' => 'indian', 'display' => 'images/g_wedding_suit_1.png', 'fal' => 'images/g_wedding_suit_1.png'],

        // Men's Traditional / Cultural
        ['title' => 'Cultural Batik Heritage Shirt', 'gender' => 'male', 'category' => 'traditional', 'display' => 'images/g_men_casual_1.png', 'fal' => 'images/g_men_casual_1.png'],

        // Men's Bridal & Formal
        ['title' => 'Royal Ivory Wedding Tuxedo', 'gender' => 'male', 'category' => 'bridal', 'display' => 'images/cat_wedding_men.png', 'fal' => 'images/cat_wedding_men.png'],
        ['title' => 'Classic Black Wedding Tuxedo Suit', 'gender' => 'male', 'category' => 'bridal', 'display' => 'images/g_wedding_suit_2.png', 'fal' => 'images/g_wedding_suit_2.png'],

        // Men's Casual
        ['title' => 'Relaxed Urban Denim Jacket', 'gender' => 'male', 'category' => 'casual', 'display' => 'images/g_men_casual_2.png', 'fal' => 'images/g_men_casual_2.png'],
        ['title' => 'Minimalist Summer Linen Shirt', 'gender' => 'male', 'category' => 'casual', 'display' => 'images/g_men_casual_3.png', 'fal' => 'images/g_men_casual_3.png']
    ];

    $stmt = $conn->prepare("INSERT INTO garment (title, gender, category, display_image_url, fal_image_url, status) VALUES (?, ?, ?, ?, ?, 'active')");
    foreach ($initialGarments as $g) {
        $stmt->execute([$g['title'], $g['gender'], $g['category'], $g['display'], $g['fal']]);
    }
    echo "Successfully seeded " . count($initialGarments) . " garments.\n";
} else {
    echo "Garment table already has {$count} items.\n";
}

// 4. Create default admin account if not exists
$adminExists = $conn->query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")->fetch();
if (!$adminExists) {
    $adminPass = password_hash('admin123', PASSWORD_DEFAULT);
    $adminStmt = $conn->prepare("INSERT INTO users (first_name, last_name, email, password, role) VALUES ('Admin', 'Style360', 'admin@style360.com', ?, 'admin')");
    $adminStmt->execute([$adminPass]);
    echo "Created default admin account: admin@style360.com / admin123\n";
}

// 5. Seed test 3D avatar model into try_on_history table
try {
    $histCount = $conn->query("SELECT COUNT(*) FROM try_on_history WHERE result_3d_url LIKE '%sampleman_avatar%'")->fetchColumn();
    if ($histCount == 0) {
        $firstGarmentId = $conn->query("SELECT id FROM garment LIMIT 1")->fetchColumn() ?: 1;
        $histStmt = $conn->prepare("INSERT INTO try_on_history (user_id, garment_id, result_2d_url, result_3d_url, created_at) VALUES (1, ?, 'images/cat_western_men.png', 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/users/avater/sampleman_avatar_1786821873.glb', NOW())");
        $histStmt->execute([$firstGarmentId]);
        echo "Seeded test 3D avatar model into `try_on_history` table.\n";
    }
} catch (Exception $e) {
    // Ignore if table not yet ready
}

$conn->exec("SET FOREIGN_KEY_CHECKS = 1;");
echo "=== Migration Complete! ===\n";
