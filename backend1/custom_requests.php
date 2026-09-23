<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

/**
 * Style360 - Custom Outfit Requests API Endpoint (/api/custom-request or /backend/custom_requests.php)
 * Handles customer bespoke tailoring requests: top/bottom colors, specific customization notes,
 * 3-stage status lifecycle ('Pending Review', 'In Design', 'Ready for Download'), completed image uploads,
 * and user notifications. Integrates with MySQL style360_v2.custom_requests & notifications tables.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS");
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

// Parse incoming input (supports both JSON payload and multipart form data)
$rawInput = file_get_contents("php://input");
$jsonData = json_decode($rawInput, true) ?: [];
$input = array_merge($jsonData, $_POST);

function normalizeStatus($st) {
    $clean = strtolower(trim($st));
    if ($clean === 'pending review' || $clean === 'pending' || $clean === 'pending_review') {
        return 'Pending Review';
    }
    if ($clean === 'in design' || $clean === 'in_design' || $clean === 'indesign') {
        return 'In Design';
    }
    if ($clean === 'ready for download' || $clean === 'ready_for_download' || $clean === 'completed' || $clean === 'ready') {
        return 'Ready for Download';
    }
    return 'Pending Review';
}

// ── 1. GET: List custom requests with optional filtering ──────────────────────
if ($method === 'GET') {
    $statusFilter = isset($_GET['status']) ? strtolower(trim($_GET['status'])) : 'all';
    $userIdFilter = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
    $search       = isset($_GET['search']) ? trim($_GET['search']) : '';

    $sql = "SELECT r.id, r.user_id, r.outfit_id, r.top_color, r.bottom_color, r.notes, r.result_image_url, r.status, r.created_at,
                   u.first_name, u.last_name, u.email,
                   g.title as outfit_title, g.category as outfit_category, g.gender as outfit_gender, g.display_image_url as outfit_image
            FROM custom_requests r
            LEFT JOIN users u ON r.user_id = u.id
            LEFT JOIN garment g ON r.outfit_id = g.id
            WHERE 1=1";
    $params = [];

    if ($statusFilter !== 'all') {
        if ($statusFilter === 'pending' || $statusFilter === 'pending review' || $statusFilter === 'pending_review') {
            $sql .= " AND (r.status = 'Pending Review' OR r.status = 'pending')";
        } elseif ($statusFilter === 'in design' || $statusFilter === 'in_design') {
            $sql .= " AND r.status = 'In Design'";
        } elseif ($statusFilter === 'ready' || $statusFilter === 'ready for download' || $statusFilter === 'ready_for_download' || $statusFilter === 'completed') {
            $sql .= " AND (r.status = 'Ready for Download' OR r.status = 'completed')";
        } else {
            $sql .= " AND r.status = :status";
            $params[':status'] = $statusFilter;
        }
    }

    if ($userIdFilter > 0) {
        $sql .= " AND r.user_id = :user_id";
        $params[':user_id'] = $userIdFilter;
    }

    if (!empty($search)) {
        $sql .= " AND (g.title LIKE :search OR u.email LIKE :search OR u.first_name LIKE :search OR r.notes LIKE :search)";
        $params[':search'] = '%' . $search . '%';
    }

    $sql .= " ORDER BY r.created_at DESC";

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $requests = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Compute counts across all 3 lifecycle stages
        $countStmt = $conn->query("SELECT status, COUNT(*) as cnt FROM custom_requests GROUP BY status");
        $counts = [
            'all'                => 0,
            'pending_review'     => 0,
            'in_design'          => 0,
            'ready_for_download' => 0,
            // Backwards compatibility keys
            'pending'            => 0,
            'completed'          => 0
        ];

        while ($row = $countStmt->fetch(PDO::FETCH_ASSOC)) {
            $st = normalizeStatus($row['status']);
            $cnt = (int)$row['cnt'];
            $counts['all'] += $cnt;

            if ($st === 'Pending Review') {
                $counts['pending_review'] += $cnt;
                $counts['pending'] += $cnt;
            } elseif ($st === 'In Design') {
                $counts['in_design'] += $cnt;
            } elseif ($st === 'Ready for Download') {
                $counts['ready_for_download'] += $cnt;
                $counts['completed'] += $cnt;
            }
        }

        echo json_encode([
            "status"   => "success",
            "count"    => count($requests),
            "counts"   => $counts,
            "requests" => $requests
        ], JSON_PRETTY_PRINT);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to fetch custom requests: " . $e->getMessage()]);
    }
    exit();
}

// ── 2. POST: Create new custom request OR update status ───────────────────────
if ($method === 'POST') {
    $action = $input['action'] ?? 'create';

    // Update Status Action (Admin)
    if ($action === 'update_status') {
        $reqId     = isset($input['id']) ? (int)$input['id'] : 0;
        $rawStatus = isset($input['status']) ? trim($input['status']) : '';
        $newStatus = normalizeStatus($rawStatus);

        if ($reqId <= 0) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Valid request ID is required."]);
            exit();
        }

        // Handle uploaded completed dress image file if provided
        $resultImageUrl = null;

        if (!empty($_FILES['result_image']) && $_FILES['result_image']['error'] === UPLOAD_ERR_OK) {
            $uploadDir = __DIR__ . '/../uploads/custom_results/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }
            $ext = strtolower(pathinfo($_FILES['result_image']['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                $ext = 'png';
            }
            $filename = 'result_' . $reqId . '_' . time() . '.' . $ext;
            $destPath = $uploadDir . $filename;
            if (move_uploaded_file($_FILES['result_image']['tmp_name'], $destPath)) {
                $resultImageUrl = 'uploads/custom_results/' . $filename;
            }
        }

        // Alternatively check for image URL string / base64 in input
        if (!$resultImageUrl && !empty($input['result_image_url'])) {
            $rawImg = trim($input['result_image_url']);
            if (strpos($rawImg, 'data:image') === 0) {
                $uploadDir = __DIR__ . '/../uploads/custom_results/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0777, true);
                }
                $parts = explode(',', $rawImg);
                $imgData = base64_decode($parts[1] ?? '');
                if ($imgData) {
                    $filename = 'result_' . $reqId . '_' . time() . '.png';
                    file_put_contents($uploadDir . $filename, $imgData);
                    $resultImageUrl = 'uploads/custom_results/' . $filename;
                }
            } else {
                $resultImageUrl = $rawImg;
            }
        }

        try {
            if ($resultImageUrl) {
                $stmt = $conn->prepare("UPDATE custom_requests SET status = :status, result_image_url = :img WHERE id = :id");
                $stmt->execute([':status' => $newStatus, ':img' => $resultImageUrl, ':id' => $reqId]);
            } else {
                $stmt = $conn->prepare("UPDATE custom_requests SET status = :status WHERE id = :id");
                $stmt->execute([':status' => $newStatus, ':id' => $reqId]);
            }

            // Automatic Customer Notification when status transitions to 'Ready for Download'
            $notifiedUser = false;
            if ($newStatus === 'Ready for Download') {
                $infoStmt = $conn->prepare("SELECT cr.user_id, g.title as outfit_title 
                                            FROM custom_requests cr 
                                            LEFT JOIN garment g ON cr.outfit_id = g.id 
                                            WHERE cr.id = :id");
                $infoStmt->execute([':id' => $reqId]);
                $reqInfo = $infoStmt->fetch(PDO::FETCH_ASSOC);

                if ($reqInfo && !empty($reqInfo['user_id'])) {
                    $outfitName = !empty($reqInfo['outfit_title']) ? $reqInfo['outfit_title'] : "Custom Outfit #{$reqId}";
                    $notifTitle = "Your Custom Outfit is Ready! ✨";
                    $notifMsg   = "Your bespoke custom outfit request for " . $outfitName . " has been tailored by our atelier and is ready for high-resolution download.";

                    $notifStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (:uid, :title, :msg, 0, NOW())");
                    $notifStmt->execute([
                        ':uid'   => (int)$reqInfo['user_id'],
                        ':title' => $notifTitle,
                        ':msg'   => $notifMsg
                    ]);
                    $notifiedUser = true;
                }
            }

            echo json_encode([
                "status"           => "success",
                "message"          => "Request #{$reqId} status updated to " . $newStatus . ".",
                "new_status"       => $newStatus,
                "result_image_url" => $resultImageUrl,
                "notified_user"    => $notifiedUser
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Failed to update status: " . $e->getMessage()]);
        }
        exit();
    }

    // Create New Custom Request (Customer)
    $userId      = isset($input['user_id']) && !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $outfitId    = isset($input['outfit_id']) && !empty($input['outfit_id']) ? (int)$input['outfit_id'] : null;
    $topColor    = trim($input['top_color'] ?? '#D4AF37');
    $bottomColor = trim($input['bottom_color'] ?? '#1B2A4A');
    $notes       = trim($input['notes'] ?? '');

    // Fallback: If outfit_id wasn't passed directly, try finding garment by title/name
    if (!$outfitId && !empty($input['outfit_title'])) {
        $findStmt = $conn->prepare("SELECT id FROM garment WHERE title = :title LIMIT 1");
        $findStmt->execute([':title' => trim($input['outfit_title'])]);
        $found = $findStmt->fetch(PDO::FETCH_ASSOC);
        if ($found) {
            $outfitId = (int)$found['id'];
        }
    }

    // Default if still null: pick first active garment
    if (!$outfitId) {
        $defaultStmt = $conn->query("SELECT id FROM garment WHERE status = 'active' ORDER BY id DESC LIMIT 1");
        $def = $defaultStmt->fetch(PDO::FETCH_ASSOC);
        if ($def) {
            $outfitId = (int)$def['id'];
        }
    }

    try {
        $stmt = $conn->prepare("INSERT INTO custom_requests (user_id, outfit_id, top_color, bottom_color, notes, status, created_at)
                                VALUES (:user_id, :outfit_id, :top_color, :bottom_color, :notes, 'Pending Review', NOW())");
        $stmt->execute([
            ':user_id'      => $userId,
            ':outfit_id'    => $outfitId,
            ':top_color'    => $topColor,
            ':bottom_color' => $bottomColor,
            ':notes'        => $notes
        ]);

        $requestId = (int)$conn->lastInsertId();

        // Also notify user that request has been submitted for review
        if ($userId) {
            try {
                $confirmStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (:uid, :title, :msg, 0, NOW())");
                $confirmStmt->execute([
                    ':uid'   => $userId,
                    ':title' => "Custom Request Received ✂️",
                    ':msg'   => "We received your bespoke tailoring request #{$requestId}. Our design atelier is reviewing your chosen colors and specifications."
                ]);
            } catch (Exception $e) {}
        }

        echo json_encode([
            "status"     => "success",
            "message"    => "Custom outfit request submitted successfully! Our design team has received your order.",
            "request_id" => $requestId,
            "data"       => [
                "id"           => $requestId,
                "user_id"      => $userId,
                "outfit_id"    => $outfitId,
                "top_color"    => $topColor,
                "bottom_color" => $bottomColor,
                "notes"        => $notes,
                "status"       => "Pending Review"
            ]
        ], JSON_PRETTY_PRINT);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Database insert error: " . $e->getMessage()]);
    }
    exit();
}

// ── 3. DELETE: Remove request ────────────────────────────────────────────────
if ($method === 'DELETE') {
    $reqId = isset($_GET['id']) ? (int)$_GET['id'] : (isset($input['id']) ? (int)$input['id'] : 0);

    if ($reqId <= 0) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Valid request ID required."]);
        exit();
    }

    try {
        $stmt = $conn->prepare("DELETE FROM custom_requests WHERE id = :id");
        $stmt->execute([':id' => $reqId]);

        echo json_encode(["status" => "success", "message" => "Request #{$reqId} deleted successfully."]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to delete request: " . $e->getMessage()]);
    }
    exit();
}
