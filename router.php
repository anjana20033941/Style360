<?php
/**
 * Style360 Local Development Server Router
 * Automatically handles routing for root, /frontend, /backend, and /style360 paths.
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rawurldecode($uri);

// Strip leading /style360 if present
$cleanUri = $uri;
if (strpos($cleanUri, '/style360/') === 0) {
    $cleanUri = substr($cleanUri, 9);
} elseif ($cleanUri === '/style360') {
    $cleanUri = '/';
}

// 1. Root routing -> frontend/index.html
if ($cleanUri === '/' || $cleanUri === '') {
    $cleanUri = '/frontend/index.html';
}

// Dedicated friendly routes
if ($cleanUri === '/try-on' || $cleanUri === '/try-on.html' || $cleanUri === '/tryon') {
    $cleanUri = '/frontend/try-on.html';
}

if ($cleanUri === '/login' || $cleanUri === '/login.html' || $cleanUri === '/signin') {
    $cleanUri = '/frontend/login.html';
}

if ($cleanUri === '/profile' || $cleanUri === '/profile.html') {
    $cleanUri = '/frontend/profile.html';
}

if ($cleanUri === '/3d-studio' || $cleanUri === '/3d-studio.html') {
    $target3dId = !empty($_GET['load_3d']) ? $_GET['load_3d'] : (!empty($_GET['model_id']) ? $_GET['model_id'] : '');
    if (!empty($target3dId)) {
        header('Location: /frontend/my-3d-models.html?load_3d=' . urlencode($target3dId));
        exit;
    }
    $cleanUri = '/frontend/my-3d-models.html';
}

if ($cleanUri === '/my-3d-models' || $cleanUri === '/my-3d-models.html' || $cleanUri === '/frontend/my 3d models.html' || $cleanUri === '/frontend/my%203d%20models.html' || $cleanUri === '/my 3d models.html') {
    $cleanUri = '/frontend/my-3d-models.html';
}

if ($cleanUri === '/history' || $cleanUri === '/history.html' || $cleanUri === '/my-history') {
    $cleanUri = '/frontend/history.html';
}

if ($cleanUri === '/api/proxy-glb' || $cleanUri === '/api/proxy_glb' || $cleanUri === '/backend/proxy_glb.php') {
    require __DIR__ . '/backend/proxy_glb.php';
    exit;
}

if ($cleanUri === '/api/generate-3d' || $cleanUri === '/api/generate_3d' || $cleanUri === '/api/reconstruct-3d' || $cleanUri === '/backend/generate_3d.php') {
    require __DIR__ . '/backend/generate_3d.php';
    exit;
}

if ($cleanUri === '/api/chat' || $cleanUri === '/api/chat/') {
    require __DIR__ . '/backend/chat.php';
    exit;
}

if ($cleanUri === '/api/chat-multimodal' || $cleanUri === '/api/chat-multimodal/') {
    require __DIR__ . '/backend/chat_multimodal.php';
    exit;
}

if ($cleanUri === '/api/validate-gender' || $cleanUri === '/api/validate-gender/') {
    require __DIR__ . '/backend/validate_gender.php';
    exit;
}

if ($cleanUri === '/api/verify-garment' || $cleanUri === '/api/verify-garment/' || $cleanUri === '/api/verify_garment' || $cleanUri === '/api/verify_garment/' || $cleanUri === '/backend/verify_garment.php') {
    require __DIR__ . '/backend/verify_garment.php';
    exit;
}

if ($cleanUri === '/api/recolor' || $cleanUri === '/api/recolor/' || $cleanUri === '/api/recolor-outfit' || $cleanUri === '/api/recolor-outfit/') {
    require __DIR__ . '/backend/recolor.php';
    exit;
}

if ($cleanUri === '/api/try-on' || $cleanUri === '/api/try-on/' || $cleanUri === '/api/tryon' || $cleanUri === '/api/tryon/') {
    require __DIR__ . '/backend/tryon.php';
    exit;
}

if ($cleanUri === '/api/custom-request' || $cleanUri === '/api/custom-request/' || $cleanUri === '/api/custom-requests' || $cleanUri === '/api/custom-requests/') {
    require __DIR__ . '/backend/custom_requests.php';
    exit;
}

if ($cleanUri === '/api/notifications' || $cleanUri === '/api/notifications/' || $cleanUri === '/api/get_notifications' || $cleanUri === '/api/get-notifications' || $cleanUri === '/backend/get_notifications.php') {
    require __DIR__ . '/backend/get_notifications.php';
    exit;
}

if ($cleanUri === '/api/get-history' || $cleanUri === '/api/get-history/') {
    require __DIR__ . '/backend/get_history.php';
    exit;
}

if ($cleanUri === '/api/get-3d-models' || $cleanUri === '/api/get-3d-models/') {
    require __DIR__ . '/backend/get_3d_models.php';
    exit;
}

if ($cleanUri === '/api/check_session' || $cleanUri === '/api/check-session' || $cleanUri === '/api/check_session/' || $cleanUri === '/backend/check_session.php') {
    require __DIR__ . '/backend/check_session.php';
    exit;
}

if ($cleanUri === '/api/auth' || $cleanUri === '/api/auth/' || $cleanUri === '/api/login' || $cleanUri === '/api/signin') {
    require __DIR__ . '/backend/auth.php';
    exit;
}

if ($cleanUri === '/api/logout' || $cleanUri === '/api/logout/' || $cleanUri === '/api/signout' || $cleanUri === '/logout' || $cleanUri === '/backend/logout.php') {
    require __DIR__ . '/backend/logout.php';
    exit;
}

if ($cleanUri === '/admin-requests' || $cleanUri === '/admin-requests.php') {
    require __DIR__ . '/admin-requests.php';
    exit;
}

// Clean up /frontend/uploads/ if requested from inside frontend pages
if (strpos($cleanUri, '/frontend/uploads/') === 0) {
    $cleanUri = substr($cleanUri, 9);
}

// 2. Candidate file paths to check
$rel = ltrim($cleanUri, '/');
$candidates = [
    __DIR__ . '/' . $rel,
    __DIR__ . '/frontend/' . $rel,
    __DIR__ . '/backend/' . $rel
];

$targetFile = null;
foreach ($candidates as $cand) {
    if (file_exists($cand) && is_file($cand)) {
        $targetFile = $cand;
        break;
    } elseif (is_dir($cand)) {
        if (file_exists($cand . '/index.html')) {
            $targetFile = $cand . '/index.html';
            break;
        }
    }
}

// 3. If file not found directly, try adding .html or .php extensions
if (!$targetFile) {
    foreach ($candidates as $cand) {
        if (file_exists($cand . '.html')) {
            $targetFile = $cand . '.html';
            break;
        } elseif (file_exists($cand . '.php')) {
            $targetFile = $cand . '.php';
            break;
        }
    }
}

if ($targetFile && file_exists($targetFile)) {
    // If PHP script, execute it
    if (pathinfo($targetFile, PATHINFO_EXTENSION) === 'php') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
        require $targetFile;
        exit;
    }

    // Static file serving with proper MIME types
    $ext = strtolower(pathinfo($targetFile, PATHINFO_EXTENSION));
    $mimes = [
        'html' => 'text/html; charset=UTF-8',
        'css'  => 'text/css; charset=UTF-8',
        'js'   => 'application/javascript; charset=UTF-8',
        'json' => 'application/json; charset=UTF-8',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif'  => 'image/gif',
        'svg'  => 'image/svg+xml',
        'webp' => 'image/webp',
        'glb'  => 'model/gltf-binary',
        'gltf' => 'model/gltf+json',
        'obj'  => 'text/plain',
        'woff' => 'font/woff',
        'woff2'=> 'font/woff2',
        'ttf'  => 'font/ttf'
    ];

    $mime = $mimes[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-cache, must-revalidate');
    readfile($targetFile);
    exit;
}

// 404 handler
http_response_code(404);
header('Content-Type: text/plain');
echo "404 Not Found: " . htmlspecialchars($uri);
?>
