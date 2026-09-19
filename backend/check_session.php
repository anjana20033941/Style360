<?php
/**
 * Style360 — Session Authentication Check API (check_session.php)
 * Checks the active PHP session and returns current user info or unauthenticated status.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?: $_POST;
$action = isset($data['action']) ? trim($data['action']) : (isset($_GET['action']) ? trim($_GET['action']) : 'check');

// 1. Logout Action
if ($action === 'logout' || $action === 'signout') {
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
    echo json_encode([
        "status" => "success",
        "authenticated" => false,
        "user" => null,
        "message" => "Logged out successfully."
    ]);
    exit;
}

// 2. Check Active Session (Strictly PHP session-bound, no dummy or query fallback)
$userId = (isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] > 0) ? (int)$_SESSION['user_id'] : 0;

if ($userId > 0 && isset($conn) && $conn) {
    try {
        $stmt = $conn->prepare("SELECT id, first_name, last_name, email, role FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            $_SESSION['user_id'] = (int)$user['id'];
            echo json_encode([
                "status" => "success",
                "authenticated" => true,
                "user" => [
                    "id"         => (int)$user['id'],
                    "first_name" => $user['first_name'] ?? '',
                    "last_name"  => $user['last_name'] ?? '',
                    "email"      => $user['email'],
                    "role"       => $user['role'] ?? 'user'
                ]
            ]);
            exit;
        }
    } catch (PDOException $e) {
        // Fall through to unauthenticated
    }
}

// Unauthenticated (Guest) Response
echo json_encode([
    "status" => "success",
    "authenticated" => false,
    "user" => null,
    "message" => "No active authenticated session."
]);
exit;
