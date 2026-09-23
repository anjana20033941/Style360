<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

header('Content-Type: application/json');

$hostsToTry = ["127.0.0.1", "localhost", "127.0.0.1;port=3306", "127.0.0.1;port=3307"];
$username = "root";
$password = "";

$pdo = null;
$lastErr = null;

foreach ($hostsToTry as $h) {
    try {
        $pdo = new PDO("mysql:host=$h", $username, $password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        break;
    } catch (PDOException $e) {
        $lastErr = $e->getMessage();
    }
}

if (!$pdo) {
    echo json_encode([
        "status" => "error",
        "message" => "Database init failed (MySQL server not running or wrong port): " . $lastErr
    ]);
    exit;
}

try {

    // Create database style360_db
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `style360_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
    $pdo->exec("USE `style360_db`;");

    // Drop redundant/legacy duplicate tables if present
    $pdo->exec("DROP TABLE IF EXISTS `user_profiles`;");
    $pdo->exec("DROP TABLE IF EXISTS `try_on_history`;");
    $pdo->exec("DROP TABLE IF EXISTS `users`;");

    // Table 1: User (with First_Name and Last_Name)
    $pdo->exec("CREATE TABLE IF NOT EXISTS `User` (
        `Id` INT AUTO_INCREMENT PRIMARY KEY,
        `First_Name` VARCHAR(100) NULL,
        `Last_Name` VARCHAR(100) NULL,
        `Email` VARCHAR(255) NOT NULL UNIQUE,
        `Password` VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB;");

    // Add First_Name column if not existing
    try {
        $pdo->exec("ALTER TABLE `User` ADD COLUMN `First_Name` VARCHAR(100) NULL AFTER `Id`;");
    } catch (Exception $e) {}

    // Add Last_Name column if not existing
    try {
        $pdo->exec("ALTER TABLE `User` ADD COLUMN `Last_Name` VARCHAR(100) NULL AFTER `First_Name`;");
    } catch (Exception $e) {}

    // Table 2: Session
    $pdo->exec("CREATE TABLE IF NOT EXISTS `Session` (
        `Id` INT AUTO_INCREMENT PRIMARY KEY,
        `User_id` INT NOT NULL,
        `Created` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `User_Image_URL` VARCHAR(500) NULL,
        `Avater_URL` VARCHAR(500) NULL,
        `Gender` VARCHAR(50) NULL,
        FOREIGN KEY (`User_id`) REFERENCES `User`(`Id`) ON DELETE CASCADE
    ) ENGINE=InnoDB;");

    // Add User_Image_URL column if not existing
    try {
        $pdo->exec("ALTER TABLE `Session` ADD COLUMN `User_Image_URL` VARCHAR(500) NULL AFTER `Created`;");
    } catch (Exception $e) {}

    // Table 3: Garment
    $pdo->exec("CREATE TABLE IF NOT EXISTS `Garment` (
        `Id` INT AUTO_INCREMENT PRIMARY KEY,
        `Gender` VARCHAR(50) NULL,
        `DressAssetURL` VARCHAR(500) NOT NULL
    ) ENGINE=InnoDB;");

    // Table 4: TryOn
    $pdo->exec("CREATE TABLE IF NOT EXISTS `TryOn` (
        `Id` INT AUTO_INCREMENT PRIMARY KEY,
        `S_id` INT NOT NULL,
        `D_id` INT NOT NULL,
        FOREIGN KEY (`S_id`) REFERENCES `Session`(`Id`) ON DELETE CASCADE,
        FOREIGN KEY (`D_id`) REFERENCES `Garment`(`Id`) ON DELETE CASCADE
    ) ENGINE=InnoDB;");

    echo json_encode([
        "status" => "success",
        "message" => "Cleaned redundant tables (users, user_profiles, try_on_history). Active tables: User, Session, Garment, TryOn."
    ]);
} catch (PDOException $e) {
    echo json_encode([
        "status" => "error",
        "message" => "Database init failed: " . $e->getMessage()
    ]);
}
?>
