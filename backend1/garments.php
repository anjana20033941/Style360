<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once __DIR__ . '/database.php';

if (!$conn) {
    echo json_encode(["status" => "error", "message" => "Database connection failed."]);
    exit;
}

$baseDir = dirname(__DIR__);
$displayUploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'display';
$falUploadDir     = $baseDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'fal';

if (!is_dir($displayUploadDir)) mkdir($displayUploadDir, 0777, true);
if (!is_dir($falUploadDir))     mkdir($falUploadDir, 0777, true);

$method = $_SERVER['REQUEST_METHOD'];

// ── 1. GET: Fetch garments with optional filtering ────────────────────────
if ($method === 'GET') {
    $gender   = isset($_GET['gender']) ? strtolower(trim($_GET['gender'])) : 'all';
    $category = isset($_GET['category']) ? strtolower(trim($_GET['category'])) : 'all';
    $status   = isset($_GET['status']) ? strtolower(trim($_GET['status'])) : 'active';
    $search   = isset($_GET['search']) ? trim($_GET['search']) : '';

    $sql = "SELECT id, title, gender, category, display_image_url, fal_image_url, status, created_at FROM garment WHERE 1=1";
    $params = [];

    if ($status !== 'all') {
        $sql .= " AND status = :status";
        $params[':status'] = $status;
    }

    if ($gender !== 'all' && in_array($gender, ['male', 'female', 'unisex'])) {
        $sql .= " AND (gender = :gender OR gender = 'unisex')";
        $params[':gender'] = $gender;
    }

    if ($category !== 'all' && in_array($category, ['western', 'bridal', 'casual', 'suits', 'indian', 'traditional'])) {
        $sql .= " AND category = :category";
        $params[':category'] = $category;
    }

    if (!empty($search)) {
        $sql .= " AND title LIKE :search";
        $params[':search'] = '%' . $search . '%';
    }

    $sql .= " ORDER BY id DESC";

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $garments = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Normalize category labels for frontend display
        $catLabels = [
            'western'     => 'Western',
            'bridal'      => 'Bridal & Formal',
            'casual'      => 'Casual',
            'suits'       => 'Suits & Blazers',
            'indian'      => 'Indian / Ethnic',
            'traditional' => 'Traditional / Cultural'
        ];

        foreach ($garments as &$g) {
            $g['id'] = (int)$g['id'];
            $g['category_label'] = $catLabels[$g['category']] ?? ucfirst($g['category']);
        }

        echo json_encode([
            "status"   => "success",
            "count"    => count($garments),
            "garments" => $garments
        ], JSON_PRETTY_PRINT);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Query failed: " . $e->getMessage()]);
    }
    exit;
}

// ── 2. POST: Upload new garment (Admin) ────────────────────────────────────
if ($method === 'POST') {
    $title    = isset($_POST['title']) ? trim($_POST['title']) : '';
    $gender   = isset($_POST['gender']) ? strtolower(trim($_POST['gender'])) : 'unisex';
    $category = isset($_POST['category']) ? strtolower(trim($_POST['category'])) : 'western';
    $status   = isset($_POST['status']) ? strtolower(trim($_POST['status'])) : 'active';

    if (empty($title)) {
        echo json_encode(["status" => "error", "message" => "Garment title is required."]);
        exit;
    }

    $validGenders = ['male', 'female', 'unisex'];
    $validCategories = ['western', 'bridal', 'casual', 'suits', 'indian', 'traditional'];

    if (!in_array($gender, $validGenders)) {
        echo json_encode(["status" => "error", "message" => "Invalid gender selection."]);
        exit;
    }

    if (!in_array($category, $validCategories)) {
        echo json_encode(["status" => "error", "message" => "Invalid category selection."]);
        exit;
    }

    $displayImageUrl = '';
    $falImageUrl     = '';

    // Handle Display Image Upload
    if (isset($_FILES['display_image']) && $_FILES['display_image']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['display_image'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'];

        if (!in_array($ext, $allowedExts)) {
            echo json_encode(["status" => "error", "message" => "Invalid display image format. Allowed: PNG, JPG, JPEG, WEBP."]);
            exit;
        }

        $newFileName = 'display_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $targetPath = $displayUploadDir . DIRECTORY_SEPARATOR . $newFileName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $displayImageUrl = 'uploads/display/' . $newFileName;
        } else {
            echo json_encode(["status" => "error", "message" => "Failed to save display image."]);
            exit;
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Display image file is required."]);
        exit;
    }

    // Handle Fal.ai Image Upload (if provided, otherwise copies/uses display image)
    if (isset($_FILES['fal_image']) && $_FILES['fal_image']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['fal_image'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'];

        if (!in_array($ext, $allowedExts)) {
            echo json_encode(["status" => "error", "message" => "Invalid Fal.ai image format. Allowed: PNG, JPG, JPEG, WEBP."]);
            exit;
        }

        $newFileName = 'fal_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $targetPath = $falUploadDir . DIRECTORY_SEPARATOR . $newFileName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $falImageUrl = 'uploads/fal/' . $newFileName;
        } else {
            $falImageUrl = $displayImageUrl;
        }
    } else {
        // Default to display image if no separate fal image was uploaded
        $falImageUrl = $displayImageUrl;
    }

    try {
        $stmt = $conn->prepare("INSERT INTO garment (title, gender, category, display_image_url, fal_image_url, status, created_at) VALUES (:title, :gender, :category, :display, :fal, :status, NOW())");
        $stmt->execute([
            ':title'    => $title,
            ':gender'   => $gender,
            ':category' => $category,
            ':display'  => $displayImageUrl,
            ':fal'      => $falImageUrl,
            ':status'   => $status
        ]);
        $newId = $conn->lastInsertId();

        echo json_encode([
            "status"  => "success",
            "message" => "Garment successfully uploaded and saved to style360_v2 database!",
            "garment" => [
                "id"                => (int)$newId,
                "title"             => $title,
                "gender"            => $gender,
                "category"          => $category,
                "display_image_url" => $displayImageUrl,
                "fal_image_url"     => $falImageUrl,
                "status"            => $status
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Database insert error: " . $e->getMessage()]);
    }
    exit;
}

// ── 3. DELETE: Remove a garment ───────────────────────────────────────────
if ($method === 'DELETE') {
    parse_str(file_get_contents("php://input"), $delParams);
    $id = isset($_GET['id']) ? (int)$_GET['id'] : (isset($delParams['id']) ? (int)$delParams['id'] : 0);

    if ($id <= 0) {
        echo json_encode(["status" => "error", "message" => "Garment ID required for deletion."]);
        exit;
    }

    try {
        $fetchStmt = $conn->prepare("SELECT display_image_url, fal_image_url FROM garment WHERE id = :id");
        $fetchStmt->execute([':id' => $id]);
        $garment = $fetchStmt->fetch(PDO::FETCH_ASSOC);

        if (!$garment) {
            echo json_encode(["status" => "error", "message" => "Garment not found."]);
            exit;
        }

        // Delete from database
        $delStmt = $conn->prepare("DELETE FROM garment WHERE id = :id");
        $delStmt->execute([':id' => $id]);

        // Remove local upload files if they are in uploads/
        if (!empty($garment['display_image_url']) && strpos($garment['display_image_url'], 'uploads/') === 0) {
            $filePath = $baseDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $garment['display_image_url']);
            if (file_exists($filePath)) @unlink($filePath);
        }
        if (!empty($garment['fal_image_url']) && strpos($garment['fal_image_url'], 'uploads/') === 0) {
            $filePath = $baseDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $garment['fal_image_url']);
            if (file_exists($filePath)) @unlink($filePath);
        }

        echo json_encode(["status" => "success", "message" => "Garment #{$id} deleted successfully."]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Database delete error: " . $e->getMessage()]);
    }
    exit;
}

// ── 4. PATCH: Toggle garment status ───────────────────────────────────────
if ($method === 'PATCH') {
    $rawInput = file_get_contents('php://input');
    $patchData = json_decode($rawInput, true) ?: [];

    $id = isset($patchData['id']) ? (int)$patchData['id'] : 0;
    $newStatus = isset($patchData['status']) ? strtolower(trim($patchData['status'])) : 'active';

    if ($id <= 0 || !in_array($newStatus, ['active', 'inactive'])) {
        echo json_encode(["status" => "error", "message" => "Invalid ID or status."]);
        exit;
    }

    try {
        $stmt = $conn->prepare("UPDATE garment SET status = :status WHERE id = :id");
        $stmt->execute([':status' => $newStatus, ':id' => $id]);

        echo json_encode(["status" => "success", "message" => "Garment #{$id} status updated to '{$newStatus}'."]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Update failed: " . $e->getMessage()]);
    }
    exit;
}

echo json_encode(["status" => "error", "message" => "Unsupported request method."]);
?>
