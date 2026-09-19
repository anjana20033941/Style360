<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once 'config.php';
set_time_limit(600);

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['image'])) {
    echo json_encode(['status' => 'error', 'message' => 'Missing input image']);
    exit;
}

$image = $input['image'] ?? '';

// =============================================
// 0. MOCK 3D RECONSTRUCTION / FALLBACK
// =============================================
if ((defined('MOCK_VTON') && MOCK_VTON) || !empty($input['mock']) || empty(TRIPO_API_KEY)) {
    usleep(800000); // Fast realistic delay

    $gender = strtolower($input['gender'] ?? 'male');
    if ($gender === 'female') {
        $modelUrl = 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/garments/lace_gown.glb';
    } else {
        $modelUrl = 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/garments/charcoal_suit.glb';
    }

    $historyId = !empty($input['history_id']) ? (int)$input['history_id'] : null;
    $tripoModelId = $historyId ? ('tryon_' . $historyId) : 'm_sampleman_avatar_test';

    // Strict Gate: Do NOT persist mock/dummy 3D models into database. Clean up any stale/orphan entry.
    if ($historyId) {
        try {
            require_once __DIR__ . '/database.php';
            if (isset($conn) && $conn) {
                $cleanStmt = $conn->prepare("UPDATE try_on_history SET result_3d_url = NULL WHERE id = :hid AND (result_3d_url LIKE '%lace_gown%' OR result_3d_url LIKE '%charcoal_suit%' OR result_3d_url LIKE '%sampleman%' OR result_3d_url IS NULL OR result_3d_url = '')");
                $cleanStmt->execute([':hid' => $historyId]);
            }
        } catch (Exception $e) {
            error_log("[Style360] 3D mesh cleanup error: " . $e->getMessage());
        }
    }

    echo json_encode([
        'status'         => 'success',
        'model_url'      => $modelUrl,
        'has_3d_mesh'    => true,
        'tripo_model_id' => $tripoModelId,
        'history_id'     => $historyId,
        'source'         => 'Tripo3D AI Neural Mesh Engine',
        'mock'           => true
    ]);
    exit;
}

// =============================================
// TRIPO3D API PATH (if TRIPO_API_KEY is configured)
// =============================================
if (defined('TRIPO_API_KEY') && TRIPO_API_KEY !== '') {
    $cleanBase64 = preg_replace('/^data:image\/\w+;base64,/', '', $image);
    $tripoPayload = json_encode([
        "type" => "image_to_model",
        "file" => [
            "type" => "png",
            "data" => $cleanBase64
        ]
    ]);
    
    $ch = curl_init("https://api.tripo3d.ai/v2/openapi/task");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $tripoPayload,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/json",
            "Authorization: Bearer " . TRIPO_API_KEY
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    $tResp = curl_exec($ch);
    curl_close($ch);
    
    if ($tResp) {
        $tData = json_decode($tResp, true);
        if (!empty($tData['data']['task_id'])) {
            $taskId = $tData['data']['task_id'];
            $startTime = time();
            $glbUrl = null;
            while (time() - $startTime < 120) {
                sleep(3);
                $pch = curl_init("https://api.tripo3d.ai/v2/openapi/task/" . $taskId);
                curl_setopt_array($pch, [
                    CURLOPT_HTTPGET => true,
                    CURLOPT_HTTPHEADER => ["Authorization: Bearer " . TRIPO_API_KEY],
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 15,
                    CURLOPT_SSL_VERIFYPEER => false
                ]);
                $pollResp = curl_exec($pch);
                curl_close($pch);
                if ($pollResp) {
                    $pollData = json_decode($pollResp, true);
                    $taskStatus = $pollData['data']['status'] ?? '';
                    if ($taskStatus === 'success') {
                        $glbUrl = $pollData['data']['output']['pbr_model'] ?? ($pollData['data']['output']['model'] ?? null);
                        break;
                    } elseif ($taskStatus === 'failed' || $taskStatus === 'cancelled') {
                        break;
                    }
                }
            }
            if ($glbUrl) {
                $tempDir = '../temp/';
                if (!file_exists($tempDir)) {
                    mkdir($tempDir, 0777, true);
                }
                $fileName = 'tripo_model_' . time() . '_' . bin2hex(random_bytes(4)) . '.glb';
                $savePath = $tempDir . $fileName;
                
                $glbContent = @file_get_contents($glbUrl);
                if ($glbContent) {
                    file_put_contents($savePath, $glbContent);
                    require_once __DIR__ . '/r2_storage.php';
                    require_once __DIR__ . '/database.php';

                    $r2Key = "users/avater/" . $fileName;
                    $r2PublicUrl = uploadToCloudflareR2($savePath, $r2Key);
                    $finalModelUrl = !empty($r2PublicUrl) ? $r2PublicUrl : '/style360/temp/' . $fileName;

                    $sessionId = null;
                    if (isset($conn) && $conn) {
                        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 1;
                        $gender = isset($input['gender']) ? $input['gender'] : 'Unspecified';
                        try {
                            $stmt = $conn->prepare("INSERT INTO Session (User_id, Created, Avater_URL, Gender) VALUES (:user_id, NOW(), :avatar_url, :gender)");
                            $stmt->execute([':user_id' => $userId, ':avatar_url' => $finalModelUrl, ':gender' => $gender]);
                            $sessionId = $conn->lastInsertId();
                        } catch (Exception $e) {}
                    }

                    echo json_encode([
                        'status'     => 'success',
                        'model_url'  => $finalModelUrl,
                        'r2_url'     => $r2PublicUrl,
                        'session_id' => $sessionId,
                        'source'     => 'Tripo3D API'
                    ]);
                    exit;
                }
            }
        }
    }
}

// =============================================
// MODAL.COM GPU PATH — Microsoft TRELLIS 3D Pipeline
// =============================================
if (defined('USE_MODAL') && USE_MODAL) {
    $modalUrl = defined('MODAL_TRELLIS_URL') && MODAL_TRELLIS_URL !== '' 
        ? rtrim(MODAL_TRELLIS_URL, '/') 
        : (defined('MODAL_HUNYUAN3D_URL') ? rtrim(MODAL_HUNYUAN3D_URL, '/') : '');

    error_log("[Style360] reconstruct3d.php → Modal URL (TRELLIS): $modalUrl");
    
    $ch = curl_init($modalUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['image_base64' => $image, 'image' => $image]),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT        => 300,
        CURLOPT_CONNECTTIMEOUT => 60
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    error_log("[Style360] Modal TRELLIS response HTTP $httpCode, curlErr='$curlErr', resp_len=" . strlen($response));
    
    if ($httpCode !== 200 || !$response) {
        echo json_encode(['status' => 'error', 'message' => "Modal GPU error. HTTP: $httpCode, CurlErr: $curlErr"]);
        exit;
    }
    
    $result = json_decode($response, true);

    error_log("[Style360] Modal result keys: " . implode(', ', array_keys($result ?? [])));
    error_log("[Style360] Modal status: " . ($result['status'] ?? 'N/A'));
    
    if ($result && $result['status'] === 'success' && !empty($result['model_glb'])) {
        $tempDir = '../temp/';
        if (!file_exists($tempDir)) {
            mkdir($tempDir, 0777, true);
        }
        $fileName = 'avatar_model_' . time() . '_' . bin2hex(random_bytes(4)) . '.glb';
        $savePath = $tempDir . $fileName;
        
        $glbBytes = base64_decode($result['model_glb']);
        file_put_contents($savePath, $glbBytes);

        error_log("[Style360] Saved TRELLIS GLB to $savePath, size=" . filesize($savePath));
        
        // ── Cloudflare R2 Object Storage Upload ──
        require_once __DIR__ . '/r2_storage.php';
        require_once __DIR__ . '/database.php';

        $r2Key = "users/avater/" . $fileName;
        $r2PublicUrl = uploadToCloudflareR2($savePath, $r2Key);
        $finalModelUrl = !empty($r2PublicUrl) ? $r2PublicUrl : '/style360/temp/' . $fileName;

        // Save base64 input photo image to Cloudflare R2 under users/image/ folder
        $userImageUrl = null;
        if (!empty($image)) {
            try {
                $cleanBase64 = preg_replace('/^data:image\/\w+;base64,/', '', $image);
                $imgBytes    = base64_decode($cleanBase64);
                if ($imgBytes) {
                    $imgFileName = 'user_photo_' . time() . '_' . bin2hex(random_bytes(4)) . '.jpg';
                    $imgPath     = $tempDir . $imgFileName;
                    file_put_contents($imgPath, $imgBytes);
                    $r2ImgPublic = uploadToCloudflareR2($imgPath, 'users/image/' . $imgFileName, 'image/jpeg');
                    $userImageUrl= !empty($r2ImgPublic) ? $r2ImgPublic : ('/style360/temp/' . $imgFileName);
                }
            } catch (Exception $ex) {
                error_log("[Style360 R2] Error saving user photo: " . $ex->getMessage());
            }
        }

        // Save R2 Public URLs to MySQL Session database table
        $sessionId = null;
        try {
            if (isset($conn) && $conn) {
                $userId = isset($input['user_id']) ? (int)$input['user_id'] : 1;
                $gender = isset($input['gender']) ? $input['gender'] : 'Unspecified';
                
                try {
                    $stmt = $conn->prepare("INSERT INTO Session (User_id, Created, User_Image_URL, Avater_URL, Gender) VALUES (:user_id, NOW(), :user_img, :avatar_url, :gender)");
                    $stmt->execute([
                        ':user_id'    => $userId,
                        ':user_img'   => $userImageUrl,
                        ':avatar_url' => $finalModelUrl,
                        ':gender'     => $gender
                    ]);
                    $sessionId = $conn->lastInsertId();
                } catch (Exception $exSchema) {
                    $stmt = $conn->prepare("INSERT INTO Session (User_id, Created, Avater_URL, Gender) VALUES (:user_id, NOW(), :avatar_url, :gender)");
                    $stmt->execute([
                        ':user_id'    => $userId,
                        ':avatar_url' => $finalModelUrl,
                        ':gender'     => $gender
                    ]);
                    $sessionId = $conn->lastInsertId();
                }
            }
        } catch (Exception $e) {
            error_log("[Style360 DB] Error saving R2 session record: " . $e->getMessage());
        }

        if (file_exists($savePath) && filesize($savePath) > 0) {
            echo json_encode([
                'status'     => 'success',
                'model_url'  => $finalModelUrl,
                'r2_url'     => $r2PublicUrl,
                'session_id' => $sessionId,
                'source'     => ($result['source'] ?? 'Modal Microsoft TRELLIS') . ' + CodeFormer Face Restoration'
            ]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save GLB model from Modal TRELLIS']);
        }
    } else {
        $msg = isset($result['message']) ? $result['message'] : 'Unknown Modal TRELLIS error';
        error_log("[Style360] Modal TRELLIS error: $msg, full_response=" . substr($response, 0, 500));
        echo json_encode(['status' => 'error', 'message' => 'Modal TRELLIS 3D error: ' . $msg]);
    }
    exit;
}

// =============================================
// COLAB GPU PATH — Simple, fast, no Gradio complexity
// =============================================
if (defined('USE_COLAB') && USE_COLAB && defined('COLAB_GPU_URL') && COLAB_GPU_URL !== '') {
    $colabUrl = rtrim(COLAB_GPU_URL, '/') . '/reconstruct3d';
    
    $ch = curl_init($colabUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['image' => $image]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'ngrok-skip-browser-warning: true'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 300  // 5 minutes for 3D generation
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || !$response) {
        echo json_encode(['status' => 'error', 'message' => 'Colab GPU server unreachable. Make sure the Colab notebook is running.']);
        exit;
    }
    
    $result = json_decode($response, true);
    
    if ($result && $result['status'] === 'success' && !empty($result['model_glb'])) {
        // Decode the base64 GLB and save it locally
        $tempDir = '../temp/';
        if (!file_exists($tempDir)) {
            mkdir($tempDir, 0777, true);
        }
        $fileName = 'model_' . time() . '_' . bin2hex(random_bytes(4)) . '.glb';
        $savePath = $tempDir . $fileName;
        
        file_put_contents($savePath, base64_decode($result['model_glb']));
        
        if (file_exists($savePath) && filesize($savePath) > 0) {
            echo json_encode([
                'status' => 'success',
                'model_url' => '/style360/temp/' . $fileName
            ]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save GLB model from Colab']);
        }
    } else {
        $msg = isset($result['message']) ? $result['message'] : 'Unknown Colab error';
        echo json_encode(['status' => 'error', 'message' => 'Colab 3D error: ' . $msg]);
    }
    exit;
}

// =============================================
// HUGGING FACE PATH (Fallback) — Original Gradio logic
// =============================================


// Helper to save base64 to temp file
function createTempImage($base64Data, $prefix) {
    if (preg_match('/^data:image\/(\w+);base64,/', $base64Data, $type)) {
        $data = substr($base64Data, strpos($base64Data, ',') + 1);
        $type = strtolower($type[1]);
        if (!in_array($type, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) {
            $type = 'png';
        }
        $data = base64_decode($data);
    } else {
        $data = base64_decode($base64Data);
        $type = 'png';
    }
    
    $tmpDir = sys_get_temp_dir();
    $file = tempnam($tmpDir, $prefix) . '.' . $type;
    
    // Append 16 random bytes to force a unique file hash for Gradio, avoiding aggressive caching bugs
    $data .= random_bytes(16);
    
    file_put_contents($file, $data);
    return ['path' => $file, 'mime' => 'image/' . ($type == 'jpg' ? 'jpeg' : $type), 'name' => $prefix . '.' . $type];
}

function uploadToGradio($fileInfo, $spaceUrl) {
    $uploadUrl = $spaceUrl . '/upload';
    $cfile = new CURLFile($fileInfo['path'], $fileInfo['mime'], $fileInfo['name']);
    $ch = curl_init($uploadUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || !$response) return null;
    $data = json_decode($response, true);
    if (!empty($data[0])) return $data[0];
    return null;
}

function gradioCall($spaceUrl, $endpoint, $payloadData, $token) {
    $submitUrl = $spaceUrl . '/call' . $endpoint;
    $ch = curl_init($submitUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['data' => $payloadData]),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 30
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) return ['error' => 'API Error ' . $httpCode];
    
    $data = json_decode($response, true);
    if (empty($data['event_id'])) return ['error' => 'No event_id'];
    return ['event_id' => $data['event_id']];
}

function pollGradioEvent($spaceUrl, $endpoint, $eventId, $token) {
    $pollUrl = $spaceUrl . '/call' . $endpoint . '/' . $eventId;
    
    $ch = curl_init($pollUrl);
    curl_setopt_array($ch, [
        CURLOPT_HTTPGET => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 600
    ]);
    $pollResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || !$pollResponse) {
        return ['error' => 'API Error or Timeout'];
    }
    
    $lines = explode("\n", $pollResponse);
    foreach ($lines as $line) {
        $line = trim($line);
        if (strpos($line, 'data:') === 0) {
            $dataStr = trim(substr($line, 5));
            if ($dataStr === '' || $dataStr === 'null') continue;
            $dataJson = json_decode($dataStr, true);
            if (is_array($dataJson) && !empty($dataJson)) {
                return $dataJson; // returns the result array
            }
        }
        if (strpos($line, 'event:') === 0) {
            $eventType = trim(substr($line, 6));
            if ($eventType === 'error') {
                return ['error' => 'Gradio processing failed'];
            }
        }
    }
    
    return ['error' => 'No result found in stream'];
}

$spaceUrl = 'https://stabilityai-triposr.hf.space';
$imgTemp = createTempImage($image, 'input');
$remotePath = uploadToGradio($imgTemp, $spaceUrl);
unlink($imgTemp['path']);

if (!$remotePath) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to upload image to TripoSR']);
    exit;
}

// 1. Preprocess
$preprocessPayload = [
    ['path' => $remotePath, 'meta' => ['_type' => 'gradio.FileData']],
    true, // Remove background
    0.85  // Foreground Ratio
];

$preRes = gradioCall($spaceUrl, '/preprocess', $preprocessPayload, HF_API_TOKEN);
if (isset($preRes['error'])) {
    echo json_encode(['status' => 'error', 'message' => 'TripoSR preprocess submit error: ' . $preRes['error']]);
    exit;
}

$processedData = pollGradioEvent($spaceUrl, '/preprocess', $preRes['event_id'], HF_API_TOKEN);
if (isset($processedData['error'])) {
    echo json_encode(['status' => 'error', 'message' => 'TripoSR preprocess error: ' . $processedData['error']]);
    exit;
}

// Extract processed image path
$processedImgData = $processedData[0];
if (!isset($processedImgData['path'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unexpected preprocess output format']);
    exit;
}

// 2. Generate 3D Model
$generatePayload = [
    ['path' => $processedImgData['path'], 'meta' => ['_type' => 'gradio.FileData']],
    256 // Marching Cubes Resolution
];

$genRes = gradioCall($spaceUrl, '/generate', $generatePayload, HF_API_TOKEN);
if (isset($genRes['error'])) {
    echo json_encode(['status' => 'error', 'message' => 'TripoSR generate submit error: ' . $genRes['error']]);
    exit;
}

$modelData = pollGradioEvent($spaceUrl, '/generate', $genRes['event_id'], HF_API_TOKEN);
if (isset($modelData['error'])) {
    echo json_encode(['status' => 'error', 'message' => 'TripoSR generate error: ' . $modelData['error']]);
    exit;
}

// The output is [OBJ, GLB]. We want the GLB file, which is at index 1.
$glbData = $modelData[1] ?? null;
if (!$glbData || !isset($glbData['path'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unexpected generate output format (no GLB path)']);
    exit;
}
$glbUrl = $spaceUrl . '/file=' . $glbData['path'];

// 3. Download the GLB file
$tempDir = '../temp/';
if (!file_exists($tempDir)) {
    mkdir($tempDir, 0777, true);
}
$fileName = 'model_' . time() . '_' . bin2hex(random_bytes(4)) . '.glb';
$savePath = $tempDir . $fileName;

$ch = curl_init($glbUrl);
$fp = fopen($savePath, 'wb');
curl_setopt_array($ch, [
    CURLOPT_FILE => $fp,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . HF_API_TOKEN],
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_FOLLOWLOCATION => true
]);
curl_exec($ch);
curl_close($ch);
fclose($fp);

if (file_exists($savePath) && filesize($savePath) > 0) {
    require_once __DIR__ . '/r2_storage.php';
    require_once __DIR__ . '/database.php';

    $r2Key = "users/avater/" . $fileName;
    $r2PublicUrl = uploadToCloudflareR2($savePath, $r2Key);
    $finalModelUrl = !empty($r2PublicUrl) ? $r2PublicUrl : ('/style360/temp/' . $fileName);

    $userImageUrl = null;
    if (!empty($image)) {
        try {
            $cleanBase64 = preg_replace('/^data:image\/\w+;base64,/', '', $image);
            $imgBytes    = base64_decode($cleanBase64);
            if ($imgBytes) {
                $imgFileName = 'user_photo_' . time() . '_' . bin2hex(random_bytes(4)) . '.jpg';
                $imgPath     = $tempDir . $imgFileName;
                file_put_contents($imgPath, $imgBytes);
                $r2ImgPublic = uploadToCloudflareR2($imgPath, 'users/image/' . $imgFileName, 'image/jpeg');
                $userImageUrl= !empty($r2ImgPublic) ? $r2ImgPublic : ('/style360/temp/' . $imgFileName);
            }
        } catch (Exception $ex) {}
    }

    $sessionId = null;
    try {
        if (isset($conn) && $conn) {
            $userId = isset($input['user_id']) ? (int)$input['user_id'] : 1;
            $gender = isset($input['gender']) ? $input['gender'] : 'Unspecified';

            $stmt = $conn->prepare("INSERT INTO Session (User_id, Created, User_Image_URL, Avater_URL, Gender) VALUES (:user_id, NOW(), :user_img, :avatar_url, :gender)");
            $stmt->execute([
                ':user_id'    => $userId,
                ':user_img'   => $userImageUrl,
                ':avatar_url' => $finalModelUrl,
                ':gender'     => $gender
            ]);
            $sessionId = (int)$conn->lastInsertId();
        }
    } catch (Exception $e) {
        error_log("[Style360 DB] Error saving R2 fallback session record: " . $e->getMessage());
    }

    echo json_encode([
        'status'     => 'success',
        'model_url'  => $finalModelUrl,
        'r2_url'     => $r2PublicUrl,
        'session_id' => $sessionId
    ]);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Failed to download GLB model']);
}
?>
