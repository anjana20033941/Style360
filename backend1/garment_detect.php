<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

require_once 'config.php';

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Only POST method is allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || (empty($input['image_base64']) && empty($input['image_url']))) {
    echo json_encode(['status' => 'error', 'message' => 'Missing image_base64 or image_url']);
    exit;
}

// ── Build the image part for Gemini ──────────────────────────────────────────
$imagePart = null;

if (!empty($input['image_base64'])) {
    // Inline base64 image
    $dataUrl = $input['image_base64'];
    $mimeType = 'image/jpeg';
    $base64Data = $dataUrl;
    if (preg_match('/^data:(image\/[a-zA-Z+]+);base64,/', $dataUrl, $m)) {
        $mimeType  = $m[1];
        $base64Data = preg_replace('/^data:image\/[a-zA-Z+]+;base64,/', '', $dataUrl);
    }
    $imagePart = ['inlineData' => ['mimeType' => $mimeType, 'data' => $base64Data]];

} elseif (!empty($input['image_url'])) {
    // Fetch image from URL and convert to base64
    $ch = curl_init($input['image_url']);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_USERAGENT      => 'Style360-GarmentDetect/1.0'
    ]);
    $imgBytes = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    if (!$imgBytes || $httpCode !== 200) {
        echo json_encode(['status' => 'error', 'message' => 'Failed to fetch image from URL (HTTP ' . $httpCode . ')']);
        exit;
    }

    $mimeType = strtok($contentType, ';') ?: 'image/jpeg';
    $imagePart = ['inlineData' => ['mimeType' => $mimeType, 'data' => base64_encode($imgBytes)]];
}

// ── Strict Gemini Vision Prompt ───────────────────────────────────────────────
$prompt = 'Analyze this clothing item image. Return ONLY a valid JSON object with NO markdown, NO code fences, and NO extra text whatsoever. The JSON must have exactly this structure:
{"type": "shirt", "confidence": 0.95}
Where "type" is one of: "shirt", "pant", "dress", "jacket".
Rules:
- "shirt" = shirts, tops, blouses, T-shirts, kurtis, sherwanis (upper body only)
- "jacket" = blazers, coats, hoodies, wedding jackets (upper body with structure)
- "pant" = trousers, pants, skirts, shorts (lower body)
- "dress" = full-body outfits, gowns, bridal gowns, jumpsuits, saris (covers torso + legs)
"confidence" is a float between 0.0 and 1.0 indicating your certainty.
Return ONLY the raw JSON object.';

// ── Gemini API Request ────────────────────────────────────────────────────────
$apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' . GEMINI_MODEL . ':generateContent?key=' . GEMINI_API_KEY;

$payload = [
    'contents' => [[
        'parts' => [
            ['text' => $prompt],
            $imagePart
        ]
    ]],
    'generationConfig' => [
        'temperature'     => 0.1,
        'maxOutputTokens' => 80
    ]
];

$ch = curl_init($apiUrl);
curl_setopt_array($ch, [
    CURLOPT_POST          => true,
    CURLOPT_POSTFIELDS    => json_encode($payload),
    CURLOPT_HTTPHEADER    => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_TIMEOUT        => 30
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    echo json_encode(['status' => 'error', 'message' => 'Curl error: ' . $curlError]);
    exit;
}

if ($httpCode !== 200) {
    echo json_encode(['status' => 'error', 'message' => 'Gemini API HTTP ' . $httpCode, 'raw' => $response]);
    exit;
}

$responseData = json_decode($response, true);
$textContent  = '';
if (isset($responseData['candidates'][0]['content']['parts'])) {
    foreach ($responseData['candidates'][0]['content']['parts'] as $part) {
        if (isset($part['text'])) $textContent .= $part['text'];
    }
}

if (empty($textContent)) {
    echo json_encode(['status' => 'error', 'message' => 'Gemini returned empty response']);
    exit;
}

// Clean markdown fences if Gemini adds them despite instructions
$cleaned = trim($textContent);
$cleaned = preg_replace('/^```(?:json)?\s*/i', '', $cleaned);
$cleaned = preg_replace('/\s*```$/', '', $cleaned);
$cleaned = trim($cleaned);

$parsed = json_decode($cleaned, true);

if (!$parsed || !isset($parsed['type'])) {
    // Fallback: try to keyword-match raw text
    $lower = strtolower($textContent);
    if (str_contains($lower, 'pant') || str_contains($lower, 'trouser') || str_contains($lower, 'skirt')) {
        $type = 'pant';
    } elseif (str_contains($lower, 'jacket') || str_contains($lower, 'blazer') || str_contains($lower, 'coat')) {
        $type = 'jacket';
    } elseif (str_contains($lower, 'dress') || str_contains($lower, 'gown') || str_contains($lower, 'sari')) {
        $type = 'dress';
    } else {
        $type = 'shirt'; // default upper body
    }
    echo json_encode([
        'status'     => 'success',
        'type'       => $type,
        'confidence' => 0.6,
        'fallback'   => true
    ]);
    exit;
}

// Normalize type
$allowedTypes = ['shirt', 'pant', 'dress', 'jacket'];
$detectedType = strtolower(trim($parsed['type']));
if (!in_array($detectedType, $allowedTypes)) {
    $detectedType = 'shirt';
}

echo json_encode([
    'status'     => 'success',
    'type'       => $detectedType,
    'confidence' => isset($parsed['confidence']) ? (float)$parsed['confidence'] : 0.9
]);
