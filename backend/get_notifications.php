<?php
/**
 * Style360 — User Notifications Fetcher & Status Manager (backend/get_notifications.php)
 * Returns user alerts, unread counts, and supports mark-as-read actions.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database connection failed."]);
    exit();
}

$rawInput = file_get_contents("php://input");
$input = json_decode($rawInput, true) ?: $_POST;

// Determine User ID from Request or Session
$userId = 0;
if (isset($_GET['user_id']) && (int)$_GET['user_id'] > 0) {
    $userId = (int)$_GET['user_id'];
} elseif (isset($input['user_id']) && (int)$input['user_id'] > 0) {
    $userId = (int)$input['user_id'];
} elseif (isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] > 0) {
    $userId = (int)$_SESSION['user_id'];
}

$action = $input['action'] ?? ($_GET['action'] ?? 'get');

// ── 1. POST Action: Mark All Read ─────────────────────────────────────────────
if ($action === 'mark_all_read') {
    if ($userId <= 0) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Valid user_id required."]);
        exit();
    }

    try {
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = :uid");
        $stmt->execute([':uid' => $userId]);

        echo json_encode([
            "status" => "success",
            "message" => "All notifications marked as read.",
            "unread_count" => 0
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to update notifications: " . $e->getMessage()]);
    }
    exit();
}

// ── 2. POST Action: Mark Single Read ──────────────────────────────────────────
if ($action === 'mark_read') {
    $notifId = isset($input['id']) ? (int)$input['id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);
    if ($notifId <= 0) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Valid notification ID required."]);
        exit();
    }

    try {
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = :id");
        $stmt->execute([':id' => $notifId]);

        // Recount unread
        $unreadCnt = 0;
        if ($userId > 0) {
            $cntStmt = $conn->prepare("SELECT COUNT(*) as cnt FROM notifications WHERE user_id = :uid AND is_read = 0");
            $cntStmt->execute([':uid' => $userId]);
            $cntRow = $cntStmt->fetch(PDO::FETCH_ASSOC);
            $unreadCnt = $cntRow ? (int)$cntRow['cnt'] : 0;
        }

        echo json_encode([
            "status" => "success",
            "message" => "Notification marked as read.",
            "unread_count" => $unreadCnt
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to update notification: " . $e->getMessage()]);
    }
    exit();
}

// ── 3. GET Notifications List & Unread Count ──────────────────────────────────
if ($userId <= 0) {
    echo json_encode([
        "status"        => "success",
        "unread_count"  => 0,
        "notifications" => []
    ]);
    exit();
}

try {
    // Auto-sync custom requests into notifications table so users always get real-time request alerts
    $crStmt = $conn->prepare("SELECT r.id, r.status, g.title as outfit_title, r.created_at 
                              FROM custom_requests r 
                              LEFT JOIN garment g ON r.outfit_id = g.id 
                              WHERE r.user_id = :uid");
    $crStmt->execute([':uid' => $userId]);
    $crs = $crStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($crs as $cr) {
        $reqId = (int)$cr['id'];
        $st = $cr['status'] ?: 'Pending Review';
        $chk = $conn->prepare("SELECT id FROM notifications WHERE user_id = :uid AND message LIKE :match LIMIT 1");
        $chk->execute([':uid' => $userId, ':match' => "%REQ #{$reqId}%"]);
        if (!$chk->fetch()) {
            $outfitTitle = $cr['outfit_title'] ?: "Custom Outfit";
            $title = "Request Status Updated ✨";
            $msg = "Your custom request REQ #{$reqId} status changed to {$st}.";
            $ins = $conn->prepare("INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (:uid, :title, :msg, 0, :created)");
            $ins->execute([
                ':uid' => $userId,
                ':title' => $title,
                ':msg' => $msg,
                ':created' => $cr['created_at'] ?: date('Y-m-d H:i:s')
            ]);
        }
    }

    $stmt = $conn->prepare("SELECT id, user_id, title, message, is_read, created_at 
                            FROM notifications 
                            WHERE user_id = :uid 
                            ORDER BY created_at DESC 
                            LIMIT 40");
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
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to fetch notifications: " . $e->getMessage()]);
}
exit();
