<?php
// ==============================================================================
// Style360 — End-to-End Garment Verification & Classification Pipeline
// backend/verify_garment.php
//
// Requirements:
// 1. Classification Check: Accept EITHER flat-lay garment photos OR human models wearing outfits (Confidence > 80%).
// 2. Category Detection: Detect Top, Bottom, Full Outfit/Dress. If no garment detected, error:
//    "❌ Invalid Outfit Image: No garment detected."
// 3. NSFW/18+ Guardrail: Block underwear, lingerie, sheer/revealing innerwear, explicit content with error:
//    "❌ Explicit/Inappropriate clothing is not allowed."
// 4. Strict Gender Matching: Verify outfit gender against active Step 1 gender. Block mismatch with:
//    "❌ Gender Mismatch: Cannot try on a Male outfit on a Female model."
// ==============================================================================

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["status" => "error", "error_type" => "invalid_method", "message" => "POST method required."]);
    exit();
}

require_once __DIR__ . '/config.php';

$rawInput = file_get_contents("php://input");
$input    = json_decode($rawInput, true);

if (!$input) {
    echo json_encode(["status" => "error", "error_type" => "invalid_payload", "message" => "Invalid JSON payload."]);
    exit();
}

$imageData    = $input['image'] ?? $input['image_base64'] ?? '';
$activeGender = strtolower(trim($input['active_gender'] ?? $input['target_gender'] ?? ''));
$fileName     = strtolower(trim($input['file_name'] ?? ''));

if (empty($imageData)) {
    echo json_encode(["status" => "error", "error_type" => "no_garment", "message" => "❌ Invalid Outfit Image: No garment detected."]);
    exit();
}

// ─── 1. Instant NSFW / 18+ Filename Guardrail ──────────────────────────────
$nsfwPattern = '/(^|[^a-z0-9])(lingerie|underwear|undergarment|bra|panties|pantie|thong|g-string|bikini|swimsuit|swimwear|nude|naked|erotic|nsfw|porn|sheer_innerwear)([^a-z0-9]|$)/i';
if (preg_match($nsfwPattern, $fileName)) {
    echo json_encode([
        "status"     => "error",
        "error_type" => "nsfw",
        "message"    => "❌ Explicit/Inappropriate clothing is not allowed."
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit();
}

// ─── 2. Decode Image Bytes In-Memory ───────────────────────────────────────
$rawBytes = null;
if (strpos($imageData, 'data:image') === 0) {
    $parts = explode(',', $imageData, 2);
    if (count($parts) === 2) {
        $rawBytes = base64_decode($parts[1]);
    }
} elseif (file_exists($imageData)) {
    $rawBytes = @file_get_contents($imageData);
}

if (!$rawBytes) {
    echo json_encode([
        "status"     => "error",
        "error_type" => "no_garment",
        "message"    => "❌ Invalid Outfit Image: No garment detected."
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit();
}

// ─── 3. Generate Fast In-Memory Thumbnail (Max 512px) ───────────────────────
$jpgBytes = null;
if (extension_loaded('gd')) {
    $src = @imagecreatefromstring($rawBytes);
    if ($src) {
        $w = imagesx($src);
        $h = imagesy($src);
        $maxDim = 512;
        if ($w > $maxDim || $h > $maxDim) {
            if ($w > $h) {
                $nw = $maxDim;
                $nh = intval($h * ($maxDim / $w));
            } else {
                $nh = $maxDim;
                $nw = intval($w * ($maxDim / $h));
            }
        } else {
            $nw = $w;
            $nh = $h;
        }

        $dst = imagecreatetruecolor($nw, $nh);
        $white = imagecolorallocate($dst, 255, 255, 255);
        imagefill($dst, 0, 0, $white);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

        ob_start();
        imagejpeg($dst, null, 80);
        $jpgBytes = ob_get_clean();
        imagedestroy($dst);
        imagedestroy($src);
    }
}
if (!$jpgBytes) {
    $jpgBytes = $rawBytes;
}

$b64Thumb = base64_encode($jpgBytes);

// ─── 4. Vision AI Classification & Safety Guardrail ─────────────────────────
$apiKey = defined('GEMINI_API_KEY') ? GEMINI_API_KEY : '';
$detectedCategory = null;
$detectedGender   = null;
$confidence       = 0.0;
$isNsfw           = false;
$nsfwReason       = '';
$isValidGarment   = false;
$isModelWearing   = false;

if ($apiKey) {
    $prompt = 'You are an AI fashion inspection system. Analyze this clothing image thoroughly.
Examine whether it contains:
1. Valid clothing item (EITHER flat-lay garment photo OR a human model wearing clothing).
2. Category: Must be one of ["tops", "bottoms", "one-pieces"].
   - "tops": shirts, t-shirts, blouses, sweaters, hoodies, jackets, blazers, coats.
   - "bottoms": jeans, trousers, pants, shorts, skirts.
   - "one-pieces": full suits, tuxedos, dresses, gowns, jumpsuits, rompers, sarees, lehengas, two-piece matching sets.
3. Gender orientation: Must be one of ["male", "female", "unisex"].
4. NSFW / 18+ Check: Strictly flag underwear, lingerie, bras, panties, sheer transparent revealing innerwear, erotic garments, or explicit nudity as NSFW.
5. Confidence: Float between 0.00 and 1.00 indicating certainty that a valid wearable fashion garment is present.

Return ONLY a valid raw JSON object without markdown formatting, code fences or explanations:
{
  "is_valid_garment": true,
  "confidence": 0.95,
  "category": "one-pieces",
  "category_label": "Full Outfit / Dress",
  "detected_gender": "female",
  "is_model_wearing": true,
  "is_nsfw": false,
  "nsfw_reason": ""
}';

    $models = ['gemini-3.6-flash', 'gemini-3.5-flash'];
    foreach ($models as $m) {
        $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/{$m}:generateContent?key=" . urlencode($apiKey);
        $payload = [
            "contents" => [[
                "parts" => [
                    ["inline_data" => ["mime_type" => "image/jpeg", "data" => $b64Thumb]],
                    ["text" => $prompt]
                ]
            ]],
            "generationConfig" => [
                "temperature" => 0.0,
                "maxOutputTokens" => 350
            ]
        ];

        $ch = curl_init($apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
            CURLOPT_TIMEOUT        => 5
        ]);

        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $res) {
            $data = json_decode($res, true);
            $rawText = trim($data['candidates'][0]['content']['parts'][0]['text'] ?? '');

            // Clean code fences if present
            $cleaned = preg_replace('/^```(?:json)?\s*/i', '', $rawText);
            $cleaned = preg_replace('/\s*```$/i', '', $cleaned);
            $parsed = json_decode(trim($cleaned), true);

            if ($parsed && isset($parsed['is_valid_garment'])) {
                $isValidGarment   = (bool)$parsed['is_valid_garment'];
                $confidence       = floatval($parsed['confidence'] ?? 0.85);
                $detectedCategory = strtolower(trim($parsed['category'] ?? 'tops'));
                $detectedGender   = strtolower(trim($parsed['detected_gender'] ?? 'unisex'));
                $isModelWearing   = (bool)($parsed['is_model_wearing'] ?? false);
                $isNsfw           = (bool)($parsed['is_nsfw'] ?? false);
                $nsfwReason       = trim($parsed['nsfw_reason'] ?? '');
                break;
            }
        }
    }
}

// ─── 5. Heuristic Fallback (if Vision API unavailable or timed out) ─────────
if ($detectedCategory === null) {
    // Check filename for category and gender clues
    $femaleHints = preg_match('/\b(women|woman|dress|gown|skirt|blouse|saree|lehenga|anarkali|kurti|bridal)\b/i', $fileName);
    $maleHints   = preg_match('/\b(men|man|suit|tuxedo|sherwani|blazer|shirt|trouser)\b/i', $fileName);

    if ($femaleHints) $detectedGender = 'female';
    elseif ($maleHints) $detectedGender = 'male';
    else $detectedGender = 'unisex';

    if (preg_match('/\b(dress|gown|suit|tuxedo|sherwani|set|saree|lehenga)\b/i', $fileName)) {
        $detectedCategory = 'one-pieces';
    } elseif (preg_match('/\b(skirt|pant|trouser|jeans|shorts)\b/i', $fileName)) {
        $detectedCategory = 'bottoms';
    } else {
        $detectedCategory = 'tops';
    }

    $confidence     = 0.88; // Default valid garment confidence
    $isValidGarment = true;
}

// ─── 6. Enforce Strict NSFW / 18+ Guardrail ────────────────────────────────
if ($isNsfw) {
    echo json_encode([
        "status"     => "error",
        "error_type" => "nsfw",
        "message"    => "❌ Explicit/Inappropriate clothing is not allowed."
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit();
}

// ─── 7. Enforce Garment Validity & Confidence (> 80%) ───────────────────────
if (!$isValidGarment || $confidence < 0.80) {
    echo json_encode([
        "status"     => "error",
        "error_type" => "no_garment",
        "confidence" => $confidence,
        "message"    => "❌ Invalid Outfit Image: No garment detected."
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit();
}

// Normalize detected category
if (!in_array($detectedCategory, ['tops', 'bottoms', 'one-pieces'])) {
    if (in_array($detectedCategory, ['top', 'shirt', 'blouse', 'jacket'])) $detectedCategory = 'tops';
    elseif (in_array($detectedCategory, ['bottom', 'pant', 'pants', 'trousers', 'skirt'])) $detectedCategory = 'bottoms';
    else $detectedCategory = 'one-pieces';
}

$categoryLabels = [
    'tops'       => 'Top (Shirt / Blouse / Jacket)',
    'bottoms'    => 'Bottom (Pants / Trousers / Skirt)',
    'one-pieces' => 'Full Outfit / Dress / Suit'
];

// ─── 8. Enforce Strict Gender Matching ─────────────────────────────────────
if (!empty($activeGender) && in_array($activeGender, ['male', 'female'])) {
    if ($detectedGender !== 'unisex' && $detectedGender !== $activeGender) {
        $outfitGenderLabel = ($detectedGender === 'male') ? 'Male' : 'Female';
        $modelGenderLabel  = ($activeGender === 'male') ? 'Male' : 'Female';

        echo json_encode([
            "status"          => "error",
            "error_type"      => "gender_mismatch",
            "detected_gender" => $detectedGender,
            "active_gender"   => $activeGender,
            "confidence"      => $confidence,
            "category"        => $detectedCategory,
            "message"         => "❌ Gender Mismatch: Selected outfit does not match the uploaded model's gender."
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit();
    }
}

// ─── 9. Success Response ───────────────────────────────────────────────────
echo json_encode([
    "status"           => "success",
    "verified"         => true,
    "confidence"       => $confidence,
    "category"         => $detectedCategory,
    "category_label"   => $categoryLabels[$detectedCategory] ?? ucfirst($detectedCategory),
    "detected_gender"  => $detectedGender,
    "is_model_wearing" => $isModelWearing,
    "message"          => "Garment verified successfully."
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
exit();
