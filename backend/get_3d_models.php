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

// 1. Clean up any orphan or dummy/mock 3D records from DB immediately
try {
    // Nullify dummy/mock fallback 3D URLs in try_on_history
    $conn->exec("
        UPDATE try_on_history 
        SET result_3d_url = NULL 
        WHERE result_3d_url LIKE '%lace_gown.glb%' 
           OR result_3d_url LIKE '%charcoal_suit.glb%' 
           OR result_3d_url LIKE '%sampleman_avatar%' 
           OR result_3d_url = 'null' 
           OR result_3d_url = 'undefined'
           OR (result_3d_url IS NOT NULL AND TRIM(result_3d_url) != '' AND result_3d_url NOT LIKE '%.glb%' AND result_3d_url NOT LIKE '%.gltf%');
    ");
    // Delete orphan records where both 2D and 3D are missing
    $conn->exec("
        DELETE FROM try_on_history 
        WHERE (result_image_url IS NULL OR TRIM(result_image_url) = '' OR result_image_url = 'null') 
          AND (result_2d_url IS NULL OR TRIM(result_2d_url) = '' OR result_2d_url = 'null') 
          AND (result_3d_url IS NULL OR TRIM(result_3d_url) = '' OR result_3d_url = 'null');
    ");

    // Clean up dummy models in user_3d_models if any
    $conn->exec("
        DELETE FROM user_3d_models 
        WHERE model_url LIKE '%lace_gown%' 
           OR model_url LIKE '%charcoal_suit%' 
           OR model_url LIKE '%sampleman%' 
           OR (model_url NOT LIKE '%.glb%' AND model_url NOT LIKE '%.gltf%');
    ");
} catch (Exception $cleanupEx) {
    error_log("[Style360 3D] Orphan cleanup notice: " . $cleanupEx->getMessage());
}

// 2. User Resolution via Session and Request Parameter
$currentUserId = 0;
if (!empty($_GET['user_id'])) {
    $currentUserId = (int)$_GET['user_id'];
    $_SESSION['user_id'] = $currentUserId;
} elseif (!empty($_POST['user_id'])) {
    $currentUserId = (int)$_POST['user_id'];
    $_SESSION['user_id'] = $currentUserId;
} elseif (!empty($_SESSION['user_id'])) {
    $currentUserId = (int)$_SESSION['user_id'];
}

try {
    $models = [];
    $seenUrls = [];

    // 3. Query user_3d_models (Primary Tripo3D Storage)
    try {
        $u3dSql = "
            SELECT 
                u.id,
                u.user_id,
                u.tryon_history_id,
                u.task_id,
                u.model_url,
                u.preview_image_url,
                u.outfit_id,
                u.outfit_title,
                u.category,
                u.gender,
                u.created_at
            FROM user_3d_models u
            WHERE (u.user_id = :current_user_id OR :current_user_id = 0 OR u.user_id IS NULL)
              AND u.model_url IS NOT NULL 
              AND TRIM(u.model_url) != ''
              AND (u.model_url LIKE '%.glb%' OR u.model_url LIKE '%.gltf%')
              AND u.model_url NOT LIKE '%lace_gown%'
              AND u.model_url NOT LIKE '%charcoal_suit%'
              AND u.model_url NOT LIKE '%sampleman%'
            ORDER BY u.id DESC
        ";
        $u3dStmt = $conn->prepare($u3dSql);
        $u3dStmt->execute([':current_user_id' => $currentUserId]);
        $u3dRows = $u3dStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($u3dRows as $r) {
            $glbUrl = trim($r['model_url'] ?? '');
            if (empty($glbUrl) || isset($seenUrls[$glbUrl])) continue;
            $seenUrls[$glbUrl] = true;

            $cat = !empty($r['category']) ? strtolower(trim($r['category'])) : 'collection';
            $title = !empty($r['outfit_title']) ? ($r['outfit_title'] . ' (3D Mesh)') : ('Tripo3D Model #' . $r['id']);

            $mid = "u3d_" . $r['id'];
            $proxyGlb = "/backend/proxy_glb.php?id=" . urlencode($mid);

            $models[] = [
                "id"               => $mid,
                "u3d_id"           => (int)$r['id'],
                "tryon_history_id" => !empty($r['tryon_history_id']) ? (int)$r['tryon_history_id'] : null,
                "model_file"       => $proxyGlb,
                "glb_url"          => $proxyGlb,
                "raw_model_url"    => $glbUrl,
                "task_id"          => $r['task_id'] ?? $mid,
                "title"            => $title,
                "category"         => $cat,
                "category_label"   => ucfirst($cat),
                "gender"           => ucfirst($r['gender'] ?: 'Unspecified'),
                "preview_image"    => !empty($r['preview_image_url']) ? $r['preview_image_url'] : '',
                "created_at"       => $r['created_at'],
                "specs"            => "Tripo3D AI Neural Mesh • 360° Orbit • GLTF 2.0"
            ];
        }
    } catch (Exception $eU3d) {
        error_log("[Style360 3D] user_3d_models query note: " . $eU3d->getMessage());
    }

    // 4. Also Query try_on_history for any additional genuine 3D entries
    if ($currentUserId > 0) {
        $sql = "
            SELECT 
                t.id,
                t.user_id,
                t.garment_id,
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
                  AND result_3d_url IS NOT NULL 
                  AND TRIM(result_3d_url) != ''
                  AND TRIM(result_3d_url) != 'null'
                  AND TRIM(result_3d_url) != 'undefined'
                  AND result_3d_url NOT LIKE '%lace_gown%'
                  AND result_3d_url NOT LIKE '%charcoal_suit%'
                  AND result_3d_url NOT LIKE '%sampleman_avatar%'
                  AND (result_3d_url LIKE '%.glb%' OR result_3d_url LIKE '%.gltf%')
                GROUP BY result_3d_url
            ) latest ON t.id = latest.max_id
            WHERE t.user_id = :current_user_id
              AND t.result_3d_url IS NOT NULL
              AND TRIM(t.result_3d_url) != ''
              AND TRIM(t.result_3d_url) != 'null'
              AND TRIM(t.result_3d_url) != 'undefined'
              AND t.result_3d_url NOT LIKE '%lace_gown%'
              AND t.result_3d_url NOT LIKE '%charcoal_suit%'
              AND t.result_3d_url NOT LIKE '%sampleman_avatar%'
              AND (t.result_3d_url LIKE '%.glb%' OR t.result_3d_url LIKE '%.gltf%')
            ORDER BY t.id DESC
        ";

        $stmt = $conn->prepare($sql);
        $stmt->execute([':current_user_id' => $currentUserId]);
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($records as $r) {
            $glbUrl = trim($r['result_3d_url'] ?? '');
            if (empty($glbUrl) || isset($seenUrls[$glbUrl])) continue;
            if (!preg_match('/(\.glb|\.gltf)(\?|$)/i', $glbUrl)) continue;
            if (preg_match('/(lace_gown|charcoal_suit|sampleman_avatar)/i', $glbUrl)) continue;

            $seenUrls[$glbUrl] = true;
            $garmentTitle = trim($r['garment_title'] ?? '');

            $cat = !empty($r['garment_category']) ? strtolower(trim($r['garment_category'])) : 'western';
            $title = !empty($garmentTitle) ? ($garmentTitle . ' (3D Mesh)') : ('Personalized 3D Model #' . $r['id']);

            $mid = "tryon_" . $r['id'];
            $proxyGlb = "/backend/proxy_glb.php?id=" . urlencode($mid);

            $models[] = [
                "id"               => $mid,
                "tryon_history_id" => (int)$r['id'],
                "model_file"       => $proxyGlb,
                "glb_url"          => $proxyGlb,
                "raw_model_url"    => $glbUrl,
                "task_id"          => $mid,
                "title"            => $title,
                "category"         => $cat,
                "category_label"   => ucfirst($cat),
                "gender"           => ucfirst($r['garment_gender'] ?: 'Unspecified'),
                "preview_image"    => !empty($r['result_2d_url']) ? $r['result_2d_url'] : '',
                "created_at"       => $r['created_at'],
                "specs"            => "Tripo3D AI Neural Mesh • 360° Orbit • GLTF 2.0"
            ];
        }
    }

    echo json_encode([
        "status"    => "success",
        "user_id"   => $currentUserId,
        "count"     => count($models),
        "models_3d" => $models
    ], JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Query failed: " . $e->getMessage()]);
}
?>
