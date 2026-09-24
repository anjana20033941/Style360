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

require_once __DIR__ . '/database.php';

if (!$conn) {
    echo json_encode(["status" => "error", "message" => "Database connection failed."]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// ── 1. GET: Fetch user try-on history & 3D models ─────────────────────────
if ($method === 'GET') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $userId = 0;
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];
    } elseif (!empty($_GET['user_id'])) {
        $userId = (int)$_GET['user_id'];
        $_SESSION['user_id'] = $userId;
    }

    $type = isset($_GET['type']) ? trim($_GET['type']) : 'all'; // '2d', '3d', or 'all'

    if ($userId <= 0) {
        echo json_encode([
            "status"        => "success",
            "history_count" => 0,
            "history"       => [],
            "models_3d"     => []
        ]);
        exit;
    }

    try {
        // Strict user-scoped query: real try-on outputs only, discarding static catalog images
        $sql = "
            SELECT 
                t.id,
                t.user_id,
                t.garment_id,
                COALESCE(NULLIF(TRIM(t.result_image_url), ''), TRIM(t.result_2d_url)) AS result_image_url,
                t.result_2d_url,
                t.result_3d_url,
                t.created_at,
                g.title as garment_title,
                g.gender as garment_gender,
                g.category as garment_category,
                g.display_image_url as garment_img
            FROM try_on_history t
            LEFT JOIN garment g ON t.garment_id = g.id
            INNER JOIN (
                SELECT MAX(id) AS max_id
                FROM try_on_history
                WHERE user_id = :user_id
                  AND (
                      (result_image_url IS NOT NULL AND TRIM(result_image_url) != '' AND result_image_url NOT LIKE 'images/%')
                      OR 
                      (result_2d_url IS NOT NULL AND TRIM(result_2d_url) != '' AND result_2d_url NOT LIKE 'images/%')
                  )
                GROUP BY COALESCE(NULLIF(TRIM(result_image_url), ''), TRIM(result_2d_url))
            ) latest ON t.id = latest.max_id
            WHERE t.user_id = :user_id
              AND (
                  (t.result_image_url IS NOT NULL AND TRIM(t.result_image_url) != '' AND t.result_image_url NOT LIKE 'images/%')
                  OR 
                  (t.result_2d_url IS NOT NULL AND TRIM(t.result_2d_url) != '' AND t.result_2d_url NOT LIKE 'images/%')
              )
            ORDER BY t.id DESC
        ";

        $stmt = $conn->prepare($sql);
        $stmt->execute([':user_id' => $userId]);
        $rawRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $records = [];
        foreach ($rawRecords as $r) {
            $realImg = !empty($r['result_image_url']) ? trim($r['result_image_url']) : trim($r['result_2d_url'] ?? '');
            if (empty($realImg) || $realImg === 'null' || strpos($realImg, 'images/') === 0 || strpos($realImg, '/images/') === 0) {
                continue;
            }

            $raw3d = trim($r['result_3d_url'] ?? '');
            $has3d = !empty($raw3d) && 
                     $raw3d !== 'null' && 
                     $raw3d !== 'undefined' && 
                     strlen($raw3d) > 8 && 
                     preg_match('/(\.glb|\.gltf)(\?|$)/i', $raw3d) &&
                     !preg_match('/(lace_gown|charcoal_suit|sampleman_avatar)/i', $raw3d);
            $clean3d = $has3d ? $raw3d : null;

            $records[] = [
                "id"               => (int)$r['id'],
                "user_id"          => (int)$r['user_id'],
                "garment_id"       => (int)($r['garment_id'] ?? 0),
                "result_image_url" => $realImg,
                "vton_output_url"  => $realImg,
                "result_2d_url"    => $realImg,
                "result_3d_url"    => $clean3d,
                "model_3d_url"     => $clean3d,
                "has_3d_mesh"      => $has3d,
                "tripo_model_id"   => $has3d ? ('tryon_' . $r['id']) : null,
                "created_at"       => $r['created_at'],
                "garment_title"    => $r['garment_title'] ?: 'Custom Try-On Look',
                "garment_gender"   => $r['garment_gender'] ?: '',
                "garment_category" => $r['garment_category'] ?: 'western'
            ];
        }

        // Dynamic 3D models exclusively from current user's authenticated generations
        $dynamic3d = [];
        foreach ($records as $r) {
            $glb = trim($r['result_3d_url'] ?? '');
            if (!empty($glb) && $glb !== 'null' && $glb !== 'undefined' && strlen($glb) > 8 && preg_match('/(\.glb|\.gltf)(\?|$)/i', $glb) && !preg_match('/(lace_gown|charcoal_suit|sampleman_avatar)/i', $glb)) {
                $dynamic3d[] = [
                    "id"             => "tryon_" . $r['id'],
                    "model_file"     => $glb,
                    "glb_url"        => $glb,
                    "title"          => $r['garment_title'] ? ($r['garment_title'] . " (Generated 3D)") : ("Personalized 3D Model #" . $r['id']),
                    "category"       => $r['garment_category'] ?: "western",
                    "category_label" => ucfirst($r['garment_category'] ?: "Western"),
                    "gender"         => ucfirst($r['garment_gender'] ?: "Male"),
                    "preview_image"  => $r['result_image_url'],
                    "created_at"     => $r['created_at'],
                    "specs"          => "Custom Generated Mesh • 360° Orbit • GLTF 2.0"
                ];
            }
        }

        echo json_encode([
            "status"        => "success",
            "user_id"       => $userId,
            "total"         => count($records),
            "history_count" => count($records),
            "history"       => $records,
            "models_3d"     => $dynamic3d
        ], JSON_PRETTY_PRINT);

    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Query failed: " . $e->getMessage()]);
    }
    exit;
}

// ── 2. POST: Save new try-on history record ──────────────────────────────
if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?: $_POST;

    $userId      = isset($data['user_id']) ? (int)$data['user_id'] : null;
    $garmentId   = isset($data['garment_id']) ? (int)$data['garment_id'] : null;
    $result2dUrl = isset($data['result_2d_url']) ? trim($data['result_2d_url']) : '';
    $result3dUrl = isset($data['result_3d_url']) ? trim($data['result_3d_url']) : '';

    if (empty($result2dUrl) && empty($result3dUrl)) {
        echo json_encode(["status" => "error", "message" => "At least one result URL (2D or 3D) is required."]);
        exit;
    }

    try {
        $resultImg = isset($data['result_image_url']) ? trim($data['result_image_url']) : $result2dUrl;
        $stmt = $conn->prepare("INSERT INTO try_on_history (user_id, garment_id, result_image_url, result_2d_url, result_3d_url, created_at) VALUES (:user_id, :garment_id, :result_img, :result_2d, :result_3d, NOW())");
        $stmt->execute([
            ':user_id'    => $userId,
            ':garment_id' => $garmentId,
            ':result_img' => $resultImg,
            ':result_2d'  => $result2dUrl,
            ':result_3d'  => $result3dUrl
        ]);
        $newId = $conn->lastInsertId();

        echo json_encode([
            "status"     => "success",
            "message"    => "Try-on record saved to history!",
            "history_id" => (int)$newId
        ]);
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Insert failed: " . $e->getMessage()]);
    }
    exit;
}

echo json_encode(["status" => "error", "message" => "Unsupported request method."]);
?>
