<?php
/**
 * Style360 - User Notifications API Endpoint (/api/notifications or /backend/notifications.php)
 * Handles retrieving user notifications, unread count badge, and mark-as-read updates.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once __DIR__ . '/database.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database connection failed."]);
    exit();
}

$method = $_SERVER['REQUEST_METHOD'];

// ── 1. GET: List notifications for a user ─────────────────────────────────────
if ($method === 'GET') {
    $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;

    if ($userId <= 0) {
        // Return empty array if not logged in
        echo json_encode([
            "status"        => "success",
            "unread_count"  => 0,
            "notifications" => []
        ]);
        exit();
    }

    try {
        $stmt = $conn->prepare("SELECT id, user_id, title, message, is_read, created_at 
                                FROM notifications 
                                WHERE user_id = :uid 
                                ORDER BY created_at DESC 
                                LIMIT 30");
        $stmt->execute([':uid' => $userId]);
        $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countStmt = $conn->prepare("SELECT COUNT(*) as unread_cnt FROM notifications WHERE user_id = :uid AND is_read = 0");
        $countStmt->execute([':uid' => $userId]);
        $countRow = $countStmt->fetch(PDO::FETCH_ASSOC);
        $unreadCount = $countRow ? (int)$countRow['unread_cnt'] : 0;

        echo json_encode([
            "status"        => "success",
            "unread_count"  => $unreadCount,
            "notifications" => $notifications
        ], JSON_PRETTY_PRINT);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to fetch notifications: " . $e->getMessage()]);
    }
    exit();
}

// ── 2. POST: Mark as read / mark all as read ───────────────────────────────────
if ($method === 'POST') {
    $rawInput = file_get_contents("php://input");
    $input = json_decode($rawInput, true) ?: $_POST;
    $action = $input['action'] ?? 'mark_read';

    if ($action === 'mark_all_read') {
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        if ($userId <= 0) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Valid user_id required."]);
            exit();
        }

        try {
            $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = :uid");
            $stmt->execute([':uid' => $userId]);

            echo json_encode(["status" => "success", "message" => "All notifications marked as read."]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Failed to update notifications: " . $e->getMessage()]);
        }
        exit();
    }

    // Default: mark single notification read
    $notifId = isset($input['id']) ? (int)$input['id'] : 0;
    if ($notifId <= 0) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Valid notification ID required."]);
        exit();
    }

    try {
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = :id");
        $stmt->execute([':id' => $notifId]);

        echo json_encode(["status" => "success", "message" => "Notification marked as read."]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to update notification: " . $e->getMessage()]);
    }
    exit();
}
