<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
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

$action = isset($data['action']) ? trim($data['action']) : (isset($_POST['action']) ? trim($_POST['action']) : (isset($_GET['action']) ? trim($_GET['action']) : ''));

if (!$conn) {
    echo json_encode(["status" => "error", "message" => "Database connection failed. Please ensure MySQL is running."]);
    exit;
}

// ── 1. SIGN UP (Captures first_name, last_name, email, password) ──────────
if ($action === 'signup') {
    $firstName       = isset($data['first_name']) ? trim($data['first_name']) : '';
    $lastName        = isset($data['last_name']) ? trim($data['last_name']) : '';
    $email           = isset($data['email']) ? trim($data['email']) : '';
    $password        = isset($data['password']) ? trim($data['password']) : '';
    $confirmPassword = isset($data['confirm_password']) ? trim($data['confirm_password']) : '';

    if (empty($firstName) || empty($lastName)) {
        echo json_encode(["status" => "error", "message" => "First Name and Last Name are required."]);
        exit;
    }

    if (empty($email) || empty($password)) {
        echo json_encode(["status" => "error", "message" => "Email and Password are required."]);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(["status" => "error", "message" => "Invalid email format."]);
        exit;
    }

    if (!empty($confirmPassword) && $password !== $confirmPassword) {
        echo json_encode(["status" => "error", "message" => "Passwords do not match. Please verify your password."]);
        exit;
    }

    try {
        // Check if user already exists
        $stmt = $conn->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(:email)");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            echo json_encode(["status" => "error", "message" => "An account with this email already exists. Please Sign In."]);
            exit;
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        $insert = $conn->prepare("INSERT INTO users (first_name, last_name, email, password, role, created_at) VALUES (:first_name, :last_name, :email, :password, 'user', NOW())");
        $insert->execute([
            ':first_name' => $firstName,
            ':last_name'  => $lastName,
            ':email'      => $email,
            ':password'   => $passwordHash
        ]);
        $userId = $conn->lastInsertId();
        $_SESSION['user_id'] = (int)$userId;

        echo json_encode([
            "status" => "success",
            "message" => "Account created successfully! Welcome to Style360.",
            "user" => [
                "id"         => (int)$userId,
                "first_name" => $firstName,
                "last_name"  => $lastName,
                "email"      => $email,
                "role"       => "user"
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// ── 2. SIGN IN ───────────────────────────────────────────────────────────
if ($action === 'signin') {
    $email    = isset($data['email']) ? trim($data['email']) : '';
    $password = isset($data['password']) ? trim($data['password']) : '';

    if (empty($email) || empty($password)) {
        echo json_encode(["status" => "error", "message" => "Email and Password are required."]);
        exit;
    }

    try {
        $stmt = $conn->prepare("SELECT id, first_name, last_name, email, password, role FROM users WHERE LOWER(email) = LOWER(:email)");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(["status" => "error", "message" => "No account found with this email. Please Sign Up first."]);
            exit;
        }

        $valid = password_verify($password, $user['password']) || ($password === $user['password']);
        if (!$valid) {
            echo json_encode(["status" => "error", "message" => "Incorrect password. Please try again."]);
            exit;
        }

        $_SESSION['user_id'] = (int)$user['id'];

        // Fetch try-on history count
        $tryCountStmt = $conn->prepare("SELECT COUNT(id) as tryon_count FROM try_on_history WHERE user_id = :user_id");
        $tryCountStmt->execute([':user_id' => $user['id']]);
        $tryCountRes = $tryCountStmt->fetch(PDO::FETCH_ASSOC);
        $tryonCount = $tryCountRes ? (int)$tryCountRes['tryon_count'] : 0;

        echo json_encode([
            "status" => "success",
            "message" => "Sign in successful! Welcome back.",
            "user" => [
                "id"          => (int)$user['id'],
                "first_name"  => $user['first_name'] ?? '',
                "last_name"   => $user['last_name'] ?? '',
                "email"       => $user['email'],
                "role"        => $user['role'] ?? 'user',
                "tryon_count" => $tryonCount
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// ── 3. GET PROFILE ────────────────────────────────────────────────────────
if ($action === 'get_profile') {
    $userId = isset($data['user_id']) ? (int)$data['user_id'] : 0;

    if ($userId <= 0) {
        echo json_encode(["status" => "error", "message" => "User ID required."]);
        exit;
    }

    try {
        $stmt = $conn->prepare("SELECT id, first_name, last_name, email, role FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(["status" => "error", "message" => "User not found."]);
            exit;
        }

        $tryStmt = $conn->prepare("
            SELECT t.id, t.created_at, t.result_2d_url, t.result_3d_url, g.title, g.display_image_url, g.gender, g.category
            FROM try_on_history t
            LEFT JOIN garment g ON t.garment_id = g.id
            WHERE t.user_id = :user_id
            ORDER BY t.id DESC
        ");
        $tryStmt->execute([':user_id' => $userId]);
        $tryons = $tryStmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            "status" => "success",
            "user" => [
                "id"            => (int)$user['id'],
                "first_name"    => $user['first_name'] ?? '',
                "last_name"     => $user['last_name'] ?? '',
                "email"         => $user['email'],
                "role"          => $user['role'] ?? 'user',
                "tryon_history" => $tryons
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// ── 4. UPDATE PROFILE (First Name, Last Name, Email, Password) ────────────
if ($action === 'update_profile') {
    $userId          = isset($data['user_id']) ? (int)$data['user_id'] : 0;
    $firstName       = isset($data['first_name']) ? trim($data['first_name']) : '';
    $lastName        = isset($data['last_name']) ? trim($data['last_name']) : '';
    $email           = isset($data['email']) ? trim($data['email']) : '';
    $newPassword     = isset($data['new_password']) ? trim($data['new_password']) : '';

    if ($userId <= 0) {
        echo json_encode(["status" => "error", "message" => "User ID is required."]);
        exit;
    }

    if (empty($firstName) || empty($lastName)) {
        echo json_encode(["status" => "error", "message" => "First Name and Last Name cannot be empty."]);
        exit;
    }

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(["status" => "error", "message" => "Valid email address is required."]);
        exit;
    }

    try {
        // Check if email taken by another user
        $stmt = $conn->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(:email) AND id != :id");
        $stmt->execute([':email' => $email, ':id' => $userId]);
        if ($stmt->fetch()) {
            echo json_encode(["status" => "error", "message" => "This email is already in use by another account."]);
            exit;
        }

        if (!empty($newPassword)) {
            $passHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $upd = $conn->prepare("UPDATE users SET first_name = :first_name, last_name = :last_name, email = :email, password = :password WHERE id = :id");
            $upd->execute([
                ':first_name' => $firstName,
                ':last_name'  => $lastName,
                ':email'      => $email,
                ':password'   => $passHash,
                ':id'         => $userId
            ]);
        } else {
            $upd = $conn->prepare("UPDATE users SET first_name = :first_name, last_name = :last_name, email = :email WHERE id = :id");
            $upd->execute([
                ':first_name' => $firstName,
                ':last_name'  => $lastName,
                ':email'      => $email,
                ':id'         => $userId
            ]);
        }

        echo json_encode([
            "status" => "success",
            "message" => "Profile updated successfully!",
            "user" => [
                "id"         => $userId,
                "first_name" => $firstName,
                "last_name"  => $lastName,
                "email"      => $email
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// ── 5. CHECK SESSION ───────────────────────────────────────────────────────
if ($action === 'check_session' || $action === 'check') {
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
            // Fall through
        }
    }

    echo json_encode([
        "status" => "success",
        "authenticated" => false,
        "user" => null
    ]);
    exit;
}

// ── 6. LOGOUT / SIGNOUT ────────────────────────────────────────────────────
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

echo json_encode(["status" => "error", "message" => "Invalid action specified."]);
?>

