<?php
/**
 * Style360 - Virtual Try-On API Endpoint
 * Supports Modal.com AI pipeline, Fal.ai VTON, and HuggingFace fallback.
 * Saves results to Cloudflare R2 and style360_v2 MySQL database.
 */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/FalService.php";

set_time_limit(0);
ini_set('max_execution_time', 0);
ini_set('default_socket_timeout', 900);

function json_error($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(["status" => "error", "success" => false, "message" => $msg]);
    exit;
}

$raw_input = file_get_contents("php://input");
$body      = json_decode($raw_input, true);

if (json_last_error() !== JSON_ERROR_NONE || empty($body)) {
    json_error("Invalid JSON body received");
}

if (empty($body["person_image"]))  json_error("person_image is required");
if (empty($body["garment_image"]) && (empty($body["top_image"]) || empty($body["bottom_image"]))) {
    json_error("garment_image is required");
}

$data = null;

// =========================================================================
// 0. MOCK SIMULATION (For UI testing with 2-second realistic delay)
// =========================================================================
if ((defined('MOCK_VTON') && MOCK_VTON) || !empty($body['mock'])) {
    sleep(2); // Simulate 2-second loading delay

    $placeholderPath = dirname(__DIR__) . '/frontend/images/hero_couple.png';
    if (!file_exists($placeholderPath)) {
        $placeholderPath = dirname(__DIR__) . '/frontend/images/cat_wedding_men.png';
    }

    $resultImage = "data:image/png;base64," . base64_encode(file_get_contents($placeholderPath));
    if (!empty($body["garment_image"]) && strpos($body["garment_image"], "data:image") === 0) {
        $resultImage = $body["garment_image"];
    }

    $data = [
        "status"       => "success",
        "success"      => true,
        "image_url"    => $resultImage,
        "result_image" => $resultImage,
        "engine"       => "Fal.ai VTON (Mock Simulation)",
        "mock"         => true,
        "timings"      => ["vton_time" => 2.0]
    ];
}

// =========================================================================
// 1. Fal.ai Virtual Try-On Engine (fal-ai/fashn/tryon/v1.6)
// =========================================================================
if (!$data && FalService::isConfigured() && (!(defined('MOCK_VTON') && MOCK_VTON) || !empty($body['use_fal']))) {
    // Inspect input model image dimensions to detect if full body portrait
    $personImg = $body["person_image"] ?? '';
    $isFullBodyImg = !empty($body["is_full_body"]);
    $aspectRatio = $body["aspect_ratio"] ?? "3:4";
    $targetW = 768;
    $targetH = 1024;

    if (!empty($personImg) && extension_loaded('gd')) {
        $rawP = null;
        if (strpos($personImg, 'data:image') === 0) {
            $pParts = explode(',', $personImg, 2);
            if (count($pParts) === 2) $rawP = base64_decode($pParts[1]);
        } elseif (file_exists($personImg)) {
            $rawP = @file_get_contents($personImg);
        }
        if ($rawP) {
            $info = @getimagesizefromstring($rawP);
            if ($info && $info[0] > 0 && $info[1] > 0) {
                $ratio = $info[0] / $info[1];
                // If aspect ratio is <= 0.68 (e.g. 9:16 or 2:3 full standing person), preserve full body
                if ($ratio <= 0.68) {
                    $isFullBodyImg = true;
                    $aspectRatio = ($ratio <= 0.60) ? "9:16" : "2:3";
                    $targetW = ($aspectRatio === "9:16") ? 576 : 864;
                    $targetH = ($aspectRatio === "9:16") ? 1024 : 1296;
                }
            }
        }
    }

    $reqGender = strtolower(trim($body["gender"] ?? ''));
    $defaultPrompt = ($reqGender === 'female')
        ? "proportional head-to-body ratio, natural head scale, photorealistic female model wearing stylish outfit"
        : (($reqGender === 'male')
            ? "proportional head-to-body ratio, natural head scale, photorealistic male full-body suit model"
            : "proportional head-to-body ratio, natural head scale, photorealistic model");

    $falResult = FalService::tryOn([
        'model_image'   => $body["person_image"],
        'garment_image' => $body["garment_image"] ?? '',
        'top_image'     => $body["top_image"] ?? '',
        'bottom_image'  => $body["bottom_image"] ?? '',
        'category'      => $body["category"] ?? "tops",
        'cover_feet'    => isset($body["cover_feet"]) ? (bool)$body["cover_feet"] : ($isFullBodyImg ? true : null),
        'is_full_body'  => $isFullBodyImg,
        'garment_name'  => $body["garment_desc"] ?? ($body["garment_name"] ?? ''),
        'mode'                    => $body["mode"] ?? "performance",
        'nsfw_filter'             => false,
        'face_restoration_weight' => isset($body["face_restoration_weight"]) ? (float)$body["face_restoration_weight"] : 0.5,
        'prompt'                  => $body["prompt"] ?? $defaultPrompt,
        'aspect_ratio'            => $aspectRatio,
        'target_width'            => $targetW,
        'target_height'           => $targetH
    ]);

    if (!empty($falResult['status']) && $falResult['status'] === 'success') {
        $data = $falResult;
        $data['success'] = true;
        if (empty($data['image_url']) && !empty($data['result_image'])) {
            $data['image_url'] = $data['result_image'];
        }
    } else {
        $errMsg = !empty($falResult['message']) ? $falResult['message'] : 'Fal.ai try-on request failed';
        error_log("[Fal.ai VTON Error] " . $errMsg);
        if (!defined('USE_MODAL') || !USE_MODAL) {
            json_error($errMsg, 502);
        }
    }
}

// =========================================================================
// 2. Modal.com Pipeline (TRELLIS / IDM-VTON)
// =========================================================================
if (!$data && defined('USE_MODAL') && USE_MODAL && !empty(MODAL_PIPELINE_URL)) {
    $payload = json_encode([
        "person_image"  => $body["person_image"],
        "garment_image" => $body["garment_image"],
        "garment_desc"  => $body["garment_desc"] ?? "",
        "steps"         => (int)($body["steps"] ?? 30),
        "seed"          => (int)($body["seed"] ?? 42),
        "skip_3d"       => $body["skip_3d"] ?? "false",
    ]);

    $ch = curl_init(MODAL_PIPELINE_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => [
            "Content-Type: application/json",
            "Content-Length: " . strlen($payload),
            "Expect:",
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 900,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);

    $raw  = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw && !$err) {
        $modalData = json_decode($raw, true);
        if ($modalData) {
            $data = $modalData;
            if (!empty($data["tryon_image"])) {
                $data["result_image"] = "data:image/jpeg;base64," . $data["tryon_image"];
                $data["status"] = "success";
            }
        }
    }
}

// =========================================================================
// 3. Fallback / Response Handling
// =========================================================================
if (!$data) {
    json_error("Try-On generation failed or AI service unreachable.", 502);
}

// ── Save TryOn result to try_on_history table ──
if (!empty($data["result_image"]) || !empty($data["image_url"])) {
    try {
        require_once __DIR__ . "/database.php";

        if (isset($conn) && $conn) {
            $userId    = !empty($body["user_id"]) ? (int)$body["user_id"] : null;
            $garmentId = !empty($body["garment_id"]) ? (int)$body["garment_id"] : null;
            $res2d     = $data["image_url"] ?? ($data["result_image"] ?? '');

            if (!empty($res2d)) {
                $histStmt = $conn->prepare("INSERT INTO try_on_history (user_id, garment_id, result_image_url, result_2d_url, created_at) VALUES (:uid, :gid, :resimg, :res2d, NOW())");
                $histStmt->execute([
                    ':uid'    => $userId,
                    ':gid'    => $garmentId,
                    ':resimg' => $res2d,
                    ':res2d'  => $res2d
                ]);
                $data["history_id"] = (int)$conn->lastInsertId();
            }
        }
    } catch (Exception $e) {
        error_log("[Style360 v2 DB] TryOn record save error: " . $e->getMessage());
    }
}

echo json_encode($data);
?>
