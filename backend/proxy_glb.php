<?php
/**
 * Style360 - proxy_glb.php
 * High-performance binary streaming proxy for 3D GLB/GLTF assets.
 * 1. Solves CORS header absence on remote CDN endpoints (e.g., Tripo3D CloudFront)
 * 2. Caches binary GLB models on local disk (temp/glb_cache_*.glb) for instant repeat loads
 * 3. Supports resolution via direct ?url= or database ?id= / ?model_id=
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Range, Authorization, X-Requested-With');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

set_time_limit(180);

$targetUrl = '';

// 1. Resolve via direct ?url= parameter
if (!empty($_GET['url'])) {
    $targetUrl = trim($_GET['url']);
}

// 2. Resolve via ?id= or ?model_id= parameter
$modelId = !empty($_GET['id']) ? trim($_GET['id']) : (!empty($_GET['model_id']) ? trim($_GET['model_id']) : '');
if (empty($targetUrl) && !empty($modelId)) {
    require_once __DIR__ . '/database.php';
    if (isset($conn) && $conn) {
        try {
            // Check tryon_{id} pattern
            if (preg_match('/^tryon_(\d+)$/i', $modelId, $m)) {
                $hid = (int)$m[1];
                $stmt = $conn->prepare('SELECT result_3d_url FROM try_on_history WHERE id = :id LIMIT 1');
                $stmt->execute([':id' => $hid]);
                $targetUrl = $stmt->fetchColumn() ?: '';
                if (empty($targetUrl)) {
                    $stmt = $conn->prepare('SELECT model_url FROM user_3d_models WHERE tryon_history_id = :id ORDER BY id DESC LIMIT 1');
                    $stmt->execute([':id' => $hid]);
                    $targetUrl = $stmt->fetchColumn() ?: '';
                }
            } elseif (preg_match('/^u3d_(\d+)$/i', $modelId, $m)) {
                $uid = (int)$m[1];
                $stmt = $conn->prepare('SELECT model_url FROM user_3d_models WHERE id = :id LIMIT 1');
                $stmt->execute([':id' => $uid]);
                $targetUrl = $stmt->fetchColumn() ?: '';
            } else {
                $stmt = $conn->prepare('SELECT model_url FROM user_3d_models WHERE task_id = :tid OR id = :id2 LIMIT 1');
                $stmt->execute([':tid' => $modelId, ':id2' => (int)$modelId]);
                $targetUrl = $stmt->fetchColumn() ?: '';
                if (empty($targetUrl)) {
                    $stmt = $conn->prepare('SELECT result_3d_url FROM try_on_history WHERE id = :id LIMIT 1');
                    $stmt->execute([':id' => (int)$modelId]);
                    $targetUrl = $stmt->fetchColumn() ?: '';
                }
            }
        } catch (Exception $e) {
            error_log('[Style360 Proxy GLB] DB resolution error: ' . $e->getMessage());
        }
    }
}

if (empty($targetUrl)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Missing GLB URL or valid model ID.']);
    exit;
}

// 3. Ensure local temp cache directory exists
$cacheDir = dirname(__DIR__) . '/temp/glb_cache';
if (!file_exists($cacheDir)) {
    @mkdir($cacheDir, 0777, true);
}

$cacheKey  = md5($targetUrl);
$cacheFile = $cacheDir . '/model_' . $cacheKey . '.glb';

// Check if cached locally and non-empty (min 1KB)
$isCached = file_exists($cacheFile) && filesize($cacheFile) > 1024;

if (!$isCached && !preg_match('/^https?:\/\//i', $targetUrl)) {
    $candLocal = realpath($targetUrl) ?: realpath(dirname(__DIR__) . '/' . ltrim($targetUrl, '/\\'));
    if ($candLocal && file_exists($candLocal) && filesize($candLocal) > 1024) {
        $cacheFile = $candLocal;
        $isCached = true;
    }
}

if (!$isCached) {
    // Download binary stream from remote URL via cURL
    $ch = curl_init($targetUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 90,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Style360/2.0'
    ]);
    $binary = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $binary && strlen($binary) > 1024) {
        file_put_contents($cacheFile, $binary);
        $isCached = true;
    } else {
        error_log('[Style360 Proxy GLB] Remote download failed (HTTP ' . $httpCode . '): ' . substr($targetUrl, 0, 100));
        http_response_code($httpCode ?: 502);
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => 'Failed to retrieve 3D mesh binary from source.']);
        exit;
    }
}

// 4. Serve binary GLB with full CORS and caching headers
$fileSize = filesize($cacheFile);
header('Content-Type: model/gltf-binary');
header('Content-Disposition: inline; filename="model_' . $cacheKey . '.glb"');
header('Content-Length: ' . $fileSize);
header('Accept-Ranges: bytes');
header('Cache-Control: public, max-age=86400');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') {
    exit;
}

readfile($cacheFile);
exit;
