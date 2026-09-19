<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
set_time_limit(300);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/database.php';
if (file_exists(__DIR__ . '/FalService.php')) {
    require_once __DIR__ . '/FalService.php';
}

if (!$conn) {
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?: $_POST;

$generationId = !empty($input['generation_id']) ? (int)$input['generation_id'] : (!empty($input['history_id']) ? (int)$input['history_id'] : 0);
$userId       = !empty($input['user_id']) ? (int)$input['user_id'] : 0;
$image        = !empty($input['image']) ? trim($input['image']) : (!empty($input['image_url']) ? trim($input['image_url']) : '');
$gender       = !empty($input['gender']) ? strtolower(trim($input['gender'])) : 'male';
$outfitId     = !empty($input['outfit_id']) ? (int)$input['outfit_id'] : null;
$outfitTitle  = !empty($input['outfit_title']) ? trim($input['outfit_title']) : (!empty($input['title']) ? trim($input['title']) : null);
$category     = !empty($input['category']) ? trim($input['category']) : 'collection';

// If outfit title not supplied, attempt to resolve from database
if (empty($outfitTitle) && $outfitId > 0) {
    try {
        $gStmt = $conn->prepare("SELECT title, category, gender FROM garment WHERE id = :gid");
        $gStmt->execute([':gid' => $outfitId]);
        $gRow = $gStmt->fetch(PDO::FETCH_ASSOC);
        if ($gRow) {
            $outfitTitle = $gRow['title'] ?? $outfitTitle;
            $category = $gRow['category'] ?? $category;
            $gender = $gRow['gender'] ?? $gender;
        }
    } catch (Exception $e) {}
}

// ── 1. Prepare Base64 Image & Compute Image MD5 Hash for Caching ──
$cleanBase64 = '';
if (strpos($image, 'data:image') === 0) {
    $cleanBase64 = preg_replace('/^data:image\/\w+;base64,/', '', $image);
} elseif (filter_var($image, FILTER_VALIDATE_URL)) {
    $imgData = @file_get_contents($image);
    if (!$imgData) {
        $chImg = curl_init($image);
        curl_setopt_array($chImg, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false
        ]);
        $imgData = curl_exec($chImg);
        curl_close($chImg);
    }
    if ($imgData) {
        $cleanBase64 = base64_encode($imgData);
    }
} elseif (!empty($image)) {
    $localPath = dirname(__DIR__) . '/' . ltrim($image, '/');
    if (file_exists($localPath)) {
        $cleanBase64 = base64_encode(file_get_contents($localPath));
    } elseif (strlen($image) > 100 && !preg_match('/\s/', $image)) {
        $cleanBase64 = $image;
    }
}

$imageHash = !empty($cleanBase64) ? md5($cleanBase64) : (!empty($image) ? md5($image) : null);

// ── 2. Credit Preservation & DB Caching Check (Prevent Wasting Free Credits) ──
// Check user_3d_models table first
if ($generationId > 0 || !empty($imageHash)) {
    try {
        // Query by tryon_history_id
        if ($generationId > 0) {
            $cacheStmt = $conn->prepare("
                SELECT id, task_id, model_url, preview_image_url, outfit_title
                FROM user_3d_models 
                WHERE tryon_history_id = :hid 
                  AND model_url IS NOT NULL 
                  AND TRIM(model_url) != ''
                  AND (model_url LIKE '%.glb%' OR model_url LIKE '%.gltf%')
                  AND model_url NOT LIKE '%lace_gown%'
                  AND model_url NOT LIKE '%charcoal_suit%'
                  AND model_url NOT LIKE '%sampleman%'
                ORDER BY id DESC LIMIT 1
            ");
            $cacheStmt->execute([':hid' => $generationId]);
            $cachedModel = $cacheStmt->fetch(PDO::FETCH_ASSOC);

            if ($cachedModel && !empty($cachedModel['model_url'])) {
                echo json_encode([
                    'status'          => 'success',
                    'cached'          => true,
                    'message'         => 'Loaded cached 3D model.',
                    'model_url'       => $cachedModel['model_url'],
                    'glb_url'         => $cachedModel['model_url'],
                    'task_id'         => $cachedModel['task_id'] ?? ('cached_' . $cachedModel['id']),
                    'has_3d_mesh'     => true,
                    'generation_id'   => $generationId,
                    'history_id'      => $generationId,
                    'already_existed' => true
                ]);
                exit;
            }
        }

        // Query by image_hash
        if (!empty($imageHash)) {
            $hashStmt = $conn->prepare("
                SELECT id, task_id, model_url, preview_image_url, outfit_title
                FROM user_3d_models 
                WHERE image_hash = :hash 
                  AND model_url IS NOT NULL 
                  AND TRIM(model_url) != ''
                  AND (model_url LIKE '%.glb%' OR model_url LIKE '%.gltf%')
                  AND model_url NOT LIKE '%lace_gown%'
                  AND model_url NOT LIKE '%charcoal_suit%'
                  AND model_url NOT LIKE '%sampleman%'
                ORDER BY id DESC LIMIT 1
            ");
            $hashStmt->execute([':hash' => $imageHash]);
            $cachedByHash = $hashStmt->fetch(PDO::FETCH_ASSOC);

            if ($cachedByHash && !empty($cachedByHash['model_url'])) {
                $rawModel = $cachedByHash['model_url'];
                $proxyGlb = '/backend/proxy_glb.php?id=u3d_' . $cachedByHash['id'];
                echo json_encode([
                    'status'          => 'success',
                    'cached'          => true,
                    'message'         => 'Loaded cached 3D model for this image.',
                    'model_url'       => $proxyGlb,
                    'glb_url'         => $proxyGlb,
                    'raw_model_url'   => $rawModel,
                    'task_id'         => $cachedByHash['task_id'] ?? ('cached_hash_' . $cachedByHash['id']),
                    'has_3d_mesh'     => true,
                    'generation_id'   => $generationId,
                    'history_id'      => $generationId,
                    'already_existed' => true
                ]);
                exit;
            }
        }

        // Also check try_on_history for existing genuine 3D model
        if ($generationId > 0) {
            $histStmt = $conn->prepare("SELECT id, result_3d_url FROM try_on_history WHERE id = :id");
            $histStmt->execute([':id' => $generationId]);
            $histRow = $histStmt->fetch(PDO::FETCH_ASSOC);

            if ($histRow && !empty($histRow['result_3d_url'])) {
                $h3d = trim($histRow['result_3d_url']);
                if (preg_match('/(\.glb|\.gltf)(\?|$)/i', $h3d) &&
                    !preg_match('/(lace_gown|charcoal_suit|sampleman_avatar)/i', $h3d)) {
                    $proxyGlb = '/backend/proxy_glb.php?id=tryon_' . $generationId;
                    echo json_encode([
                        'status'          => 'success',
                        'cached'          => true,
                        'message'         => 'Loaded cached 3D model from history.',
                        'model_url'       => $proxyGlb,
                        'glb_url'         => $proxyGlb,
                        'raw_model_url'   => $h3d,
                        'task_id'         => 'tryon_hist_' . $generationId,
                        'has_3d_mesh'     => true,
                        'generation_id'   => $generationId,
                        'history_id'      => $generationId,
                        'already_existed' => true
                    ]);
                    exit;
                }
            }
        }
    } catch (PDOException $e) {
        error_log("[Style360 3D] Database cache check error: " . $e->getMessage());
    }
}

// ── 3. Validate Tripo3D API Key from Environment Configuration ──
$tripoApiKey = '';
if (defined('TRIPO3D_API_KEY') && !empty(TRIPO3D_API_KEY)) {
    $tripoApiKey = TRIPO3D_API_KEY;
} elseif (defined('TRIPO_API_KEY') && !empty(TRIPO_API_KEY)) {
    $tripoApiKey = TRIPO_API_KEY;
} elseif (!empty(getenv('TRIPO3D_API_KEY'))) {
    $tripoApiKey = getenv('TRIPO3D_API_KEY');
} elseif (!empty(getenv('TRIPO_API_KEY'))) {
    $tripoApiKey = getenv('TRIPO_API_KEY');
} elseif (!empty($_ENV['TRIPO3D_API_KEY'])) {
    $tripoApiKey = $_ENV['TRIPO3D_API_KEY'];
} elseif (!empty($_ENV['TRIPO_API_KEY'])) {
    $tripoApiKey = $_ENV['TRIPO_API_KEY'];
}

if (empty($tripoApiKey)) {
    echo json_encode([
        'status'  => 'error',
        'message' => '❌ Tripo3D API key is not configured in .env file.'
    ]);
    exit;
}

if (empty($cleanBase64)) {
    echo json_encode([
        'status'  => 'error',
        'message' => '❌ Invalid or missing 2D try-on image for 3D reconstruction.'
    ]);
    exit;
}

// ── 4. Automated Background Removal Pipeline (Isolate Subject & Garment) ──
// Remove complex studio background (walls, doors, floors) to prevent blocky 3D mesh artifacts
$tripoSubjectBase64 = $cleanBase64;
$isolatedSubjectUrl = null;

try {
    if (class_exists('FalService')) {
        $inputForRmbg = !empty($image) ? $image : ('data:image/png;base64,' . $cleanBase64);
        $rmbg = FalService::removeBackground($inputForRmbg);
        if (!empty($rmbg['status']) && $rmbg['status'] === 'success' && !empty($rmbg['base64'])) {
            $tripoSubjectBase64 = $rmbg['base64'];
            $isolatedSubjectUrl = $rmbg['image_url'] ?? null;
            error_log("[Style360 3D] Automated background removal succeeded; sending clean transparent subject to Tripo3D.");
        } else {
            error_log("[Style360 3D] Background removal note: " . ($rmbg['message'] ?? 'Fallback to direct input'));
        }
    }
} catch (Exception $bgEx) {
    error_log("[Style360 3D] Background removal exception: " . $bgEx->getMessage());
}

// ── 5. Tripo3D V3 High-Detail Geometry Payload (Fast ~10-12s Direct Base64 Submission) ──
// Image upscaling tools are intentionally skipped to maintain fast turnaround (~10-12s) while gaining max mesh detail
$modelUrl = null;
$taskId = null;
$generationSuccess = false;
$tripoErrorDetail = null;

try {
    // High-Detail Geometry Payload: Geometry topology as subdivision/high quality (face_limit: 80000, model_version: v3.0-20240417)
    $tripoPayloadData = [
        "type"          => "image_to_model",
        "file"          => [
            "type" => "png",
            "data" => $tripoSubjectBase64
        ],
        "model_version" => "v3.0-20240417",
        "face_limit"    => 80000,
        "texture"       => true,
        "pbr"           => true
    ];
    $tripoPayload = json_encode($tripoPayloadData);

    // Primary V3 task creation endpoint
    $v3TaskEndpoint     = "https://api.tripo3d.ai/v3/openapi/task";
    $v2FallbackEndpoint = "https://api.tripo3d.ai/v2/openapi/task";
    $activePollBase     = $v3TaskEndpoint;

    $ch = curl_init($v3TaskEndpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $tripoPayload,
        CURLOPT_HTTPHEADER     => [
            "Content-Type: application/json",
            "Authorization: Bearer " . $tripoApiKey
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    $createResp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Failover to gateway if V3 endpoint returns 404
    if ($httpCode === 404 || !$createResp) {
        error_log("[Style360 3D] Tripo3D V3 endpoint returned HTTP {$httpCode}; executing gateway failover with High-Detail V3 parameters.");
        $activePollBase = $v2FallbackEndpoint;
        $chFallback = curl_init($v2FallbackEndpoint);
        curl_setopt_array($chFallback, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $tripoPayload,
            CURLOPT_HTTPHEADER     => [
                "Content-Type: application/json",
                "Authorization: Bearer " . $tripoApiKey
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false
        ]);
        $createResp = curl_exec($chFallback);
        $httpCode = curl_getinfo($chFallback, CURLINFO_HTTP_CODE);
        curl_close($chFallback);
    }

    // If Tripo returns code 2017 ("The version value is invalid"), adapt to active production V3 release
    if ($createResp) {
        $cDataCheck = json_decode($createResp, true);
        if (!empty($cDataCheck['code']) && $cDataCheck['code'] === 2017) {
            error_log("[Style360 3D] Version v3.0-20240417 tag needs v3.0 release version; adapting to active V3 engine.");
            $tripoPayloadData['model_version'] = "v3.0-20250812";
            $activePollBase = $v2FallbackEndpoint;
            $chRetry = curl_init($v2FallbackEndpoint);
            curl_setopt_array($chRetry, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode($tripoPayloadData),
                CURLOPT_HTTPHEADER     => [
                    "Content-Type: application/json",
                    "Authorization: Bearer " . $tripoApiKey
                ],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false
            ]);
            $createResp = curl_exec($chRetry);
            $httpCode = curl_getinfo($chRetry, CURLINFO_HTTP_CODE);
            curl_close($chRetry);
        }
    }

    if ($createResp) {
        $cData = json_decode($createResp, true);
        if (!empty($cData['data']['task_id'])) {
            $taskId = $cData['data']['task_id'];

            // ── 6. Poll Tripo3D V3 Task Status until Completed (SUCCESS) ──
            $startTime = time();
            $maxPollTime = 180; // up to 180 seconds for high-fidelity V3 neural mesh
            $pollUrl = $activePollBase . "/" . $taskId;

            while (time() - $startTime < $maxPollTime) {
                sleep(2);
                $pch = curl_init($pollUrl);
                curl_setopt_array($pch, [
                    CURLOPT_HTTPGET        => true,
                    CURLOPT_HTTPHEADER     => [
                        "Authorization: Bearer " . $tripoApiKey
                    ],
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT        => 15,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => false
                ]);
                $pollResp = curl_exec($pch);
                $pCode = curl_getinfo($pch, CURLINFO_HTTP_CODE);
                curl_close($pch);

                // If poll returns 404, try alternate gateway
                if ($pCode === 404 || !$pollResp) {
                    $altPollUrl = ($activePollBase === $v3TaskEndpoint ? $v2FallbackEndpoint : $v3TaskEndpoint) . "/" . $taskId;
                    $pch = curl_init($altPollUrl);
                    curl_setopt_array($pch, [
                        CURLOPT_HTTPGET        => true,
                        CURLOPT_HTTPHEADER     => [
                            "Authorization: Bearer " . $tripoApiKey
                        ],
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT        => 15,
                        CURLOPT_SSL_VERIFYPEER => false,
                        CURLOPT_SSL_VERIFYHOST => false
                    ]);
                    $pollResp = curl_exec($pch);
                    curl_close($pch);
                }

                if ($pollResp) {
                    $pollData = json_decode($pollResp, true);
                    $taskStatus = strtolower($pollData['data']['status'] ?? '');

                    if ($taskStatus === 'success') {
                        $output = $pollData['data']['output'] ?? [];
                        // Prefer PBR model for maximum rendering quality, then base model
                        $candidate = $output['pbr_model'] ?? ($output['model'] ?? ($output['base_model'] ?? null));

                        if (!empty($candidate) && preg_match('/(\.glb|\.gltf)(\?|$)/i', $candidate)) {
                            $modelUrl = $candidate;
                            $generationSuccess = true;
                        }
                        break;
                    } elseif ($taskStatus === 'failed' || $taskStatus === 'cancelled') {
                        $tripoErrorDetail = $pollData['data']['message'] ?? $taskStatus;
                        error_log("[Style360 3D] Tripo3D V3 task {$taskStatus}: " . json_encode($pollData));
                        break;
                    }
                }
            }
        } else {
            $tripoErrorDetail = $cData['message'] ?? 'Task creation returned no ID';
            error_log("[Style360 3D] Tripo3D V3 task creation error (HTTP {$httpCode}): " . $createResp);
        }
    }
} catch (Exception $ex) {
    $tripoErrorDetail = $ex->getMessage();
    error_log("[Style360 3D] Tripo3D API exception: " . $ex->getMessage());
}

// ── 8. Strict Creation Gate & Error Response ──
$isFunctionalGlb = $generationSuccess &&
                   !empty($modelUrl) &&
                   strlen($modelUrl) > 8 &&
                   preg_match('/(\.glb|\.gltf)(\?|$)/i', $modelUrl) &&
                   !preg_match('/(lace_gown|charcoal_suit|sampleman_avatar)/i', $modelUrl);

if (!$isFunctionalGlb) {
    // ON FAILURE: Do NOT insert any record into user_3d_models. Clean up any stale values.
    if ($generationId > 0) {
        try {
            $cleanStmt = $conn->prepare("UPDATE try_on_history SET result_3d_url = NULL WHERE id = :id");
            $cleanStmt->execute([':id' => $generationId]);
        } catch (Exception $e) {}
    }

    $failMsg = '❌ 3D Generation failed.';
    if (!empty($tripoErrorDetail)) {
        error_log("[Style360 3D] Underlying Tripo failure detail: " . $tripoErrorDetail);
    }

    echo json_encode([
        'status'         => 'error',
        'message'        => $failMsg,
        'has_3d_mesh'    => false,
        'generation_id'  => $generationId,
        'history_id'     => $generationId
    ]);
    exit;
}

// ── 9. Store Authenticated GLB into user_3d_models & try_on_history ──
try {
    // Store in user_3d_models
    $ins3d = $conn->prepare("
        INSERT INTO user_3d_models (
            user_id,
            tryon_history_id,
            task_id,
            image_hash,
            model_url,
            preview_image_url,
            outfit_id,
            outfit_title,
            category,
            gender,
            created_at
        ) VALUES (
            :user_id,
            :history_id,
            :task_id,
            :image_hash,
            :model_url,
            :preview_url,
            :outfit_id,
            :outfit_title,
            :category,
            :gender,
            NOW()
        )
    ");
    $ins3d->execute([
        ':user_id'      => ($userId > 0 ? $userId : null),
        ':history_id'   => ($generationId > 0 ? $generationId : null),
        ':task_id'      => ($taskId ?: ('tripo_' . uniqid())),
        ':image_hash'   => $imageHash,
        ':model_url'    => $modelUrl,
        ':preview_url'  => ($isolatedSubjectUrl ?: ((strlen($image) < 500 && filter_var($image, FILTER_VALIDATE_URL)) ? $image : null)),
        ':outfit_id'    => ($outfitId > 0 ? $outfitId : null),
        ':outfit_title' => $outfitTitle,
        ':category'     => $category,
        ':gender'       => $gender
    ]);

    // Also update try_on_history if generationId exists
    if ($generationId > 0) {
        $upStmt = $conn->prepare("UPDATE try_on_history SET result_3d_url = :murl WHERE id = :id");
        $upStmt->execute([':murl' => $modelUrl, ':id' => $generationId]);
    }
} catch (PDOException $dbEx) {
    error_log("[Style360 3D] Database insert error: " . $dbEx->getMessage());
}

$proxyGlb = '/backend/proxy_glb.php?url=' . urlencode($modelUrl);
if ($generationId > 0) {
    $proxyGlb = '/backend/proxy_glb.php?id=tryon_' . $generationId;
}

echo json_encode([
    'status'         => 'success',
    'cached'         => false,
    'message'        => '3D mesh reconstructed successfully with Tripo3D!',
    'model_url'      => $proxyGlb,
    'glb_url'        => $proxyGlb,
    'raw_model_url'  => $modelUrl,
    'task_id'        => $taskId,
    'has_3d_mesh'    => true,
    'generation_id'  => $generationId,
    'history_id'     => $generationId
]);
