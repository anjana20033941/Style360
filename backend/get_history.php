<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';

if (!$conn) {
    echo json_encode(["status" => "error", "message" => "Database connection failed."]);
    exit;
}

// 1. Strict User Resolution via Session and Request Parameter
$currentUserId = 0;
if (!empty($_SESSION['user_id'])) {
    $currentUserId = (int)$_SESSION['user_id'];
} elseif (!empty($_GET['user_id'])) {
    $currentUserId = (int)$_GET['user_id'];
    $_SESSION['user_id'] = $currentUserId;
} elseif (!empty($_POST['user_id'])) {
    $currentUserId = (int)$_POST['user_id'];
    $_SESSION['user_id'] = $currentUserId;
}

// If unauthenticated or no valid user ID, return clean empty response with total: 0 (no mock data)
if ($currentUserId <= 0) {
    echo json_encode([
        "status"        => "success",
        "total"         => 0,
        "history_count" => 0,
        "history"       => []
    ]);
    exit;
}

try {
    // 2. Strict Query for REAL Try-On Results ONLY
    // Filters specifically for: WHERE user_id = :user_id AND result_image_url IS NOT NULL AND result_image_url != ''
    // Discards static catalog mock images (images/%) and eliminates duplicates
    $sql = "
        SELECT 
            t.id,
            t.user_id,
            t.garment_id,
            COALESCE(NULLIF(TRIM(t.result_image_url), ''), TRIM(t.result_2d_url)) AS result_image_url,
            t.result_2d_url,
            t.result_3d_url,
            t.created_at,
            g.title AS garment_title,
            g.gender AS garment_gender,
            g.category AS garment_category,
            g.display_image_url AS garment_img
        FROM try_on_history t
        LEFT JOIN garment g ON t.garment_id = g.id
        INNER JOIN (
            SELECT MAX(id) AS max_id
            FROM try_on_history
            WHERE user_id = :current_user_id
              AND (
                  (result_image_url IS NOT NULL AND TRIM(result_image_url) != '' AND result_image_url NOT LIKE 'images/%')
                  OR 
                  (result_2d_url IS NOT NULL AND TRIM(result_2d_url) != '' AND result_2d_url NOT LIKE 'images/%')
              )
            GROUP BY COALESCE(NULLIF(TRIM(result_image_url), ''), TRIM(result_2d_url))
        ) latest ON t.id = latest.max_id
        WHERE t.user_id = :current_user_id
          AND (
              (t.result_image_url IS NOT NULL AND TRIM(t.result_image_url) != '' AND t.result_image_url NOT LIKE 'images/%')
              OR 
              (t.result_2d_url IS NOT NULL AND TRIM(t.result_2d_url) != '' AND t.result_2d_url NOT LIKE 'images/%')
          )
        ORDER BY t.id DESC
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':current_user_id' => $currentUserId]);
    $rawRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Strict filtering - strictly discard any mock fallback images or packshots
    $records = [];
    foreach ($rawRecords as $r) {
        $realImg = !empty($r['result_image_url']) ? trim($r['result_image_url']) : trim($r['result_2d_url'] ?? '');
        // Omit any empty, null, or static catalog images
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

    // If query yields no user records, return clean empty response ([] with total: 0)
    echo json_encode([
        "status"        => "success",
        "user_id"       => $currentUserId,
        "total"         => count($records),
        "history_count" => count($records),
        "history"       => $records
    ], JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Query failed: " . $e->getMessage()]);
}
?>
