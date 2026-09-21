<?php
// ==============================================================================
// Style360 — Gemini AI Fashion Stylist (/api/chat)
// Gender-aware: parses gender from user query → filters inventory accordingly.
// Male users NEVER receive female/bridal recommendations and vice versa.
// ==============================================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["status" => "error", "message" => "POST method required."]);
    exit();
}

$rawInput   = file_get_contents("php://input");
$input      = json_decode($rawInput, true) ?: $_POST;
$userPrompt = trim($input['prompt'] ?? ($input['message'] ?? ''));

if (empty($userPrompt)) {
    echo json_encode(["status" => "error", "message" => "Prompt cannot be empty."]);
    exit();
}

$reply     = "";
$usedModel = "gemini-2.5-flash";

// ── 0. Detect Gender Hint from User Query (text signals) ─────────────────────
// e.g. "I am a male", "for women", "groom", "bride"
$promptLower = strtolower($userPrompt);
$hintMale    = preg_match('/\b(male|man|men|boy|groom|he|his|gentleman|tuxedo|suit|sherwani)\b/', $promptLower);
$hintFemale  = preg_match('/\b(female|woman|women|girl|bride|she|her|lady|ladies|lehenga|gown|saree)\b/', $promptLower);

// Resolved gender: 'male', 'female', or 'any' (no hint → show all)
if ($hintMale && !$hintFemale)       $resolvedGender = 'male';
elseif ($hintFemale && !$hintMale)   $resolvedGender = 'female';
else                                  $resolvedGender = 'any';

// ── 1. Fetch Inventory from DB — Split by Gender ──────────────────────────────
require_once __DIR__ . '/database.php';
$maleLines     = [];
$femaleLines   = [];
$allItems      = [];
$garmentLookup = [];

$catLabels = [
    'western'     => 'Western',
    'bridal'      => 'Bridal & Formal',
    'casual'      => 'Casual',
    'suits'       => 'Suits & Blazers',
    'indian'      => 'Indian / Ethnic',
    'traditional' => 'Traditional / Cultural'
];

if ($conn) {
    try {
        $stmt = $conn->query(
            "SELECT id, title, gender, category, display_image_url, fal_image_url
             FROM garment WHERE status = 'active' ORDER BY id ASC LIMIT 50"
        );
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $g) {
            $gRaw   = strtolower(trim($g['gender'] ?? 'unisex'));
            $cLabel = $catLabels[strtolower($g['category'] ?? '')] ?? ucfirst($g['category'] ?? '');
            $g['category_label'] = $cLabel;
            $line   = "- ID {$g['id']}: {$g['title']} (Category: {$cLabel})";

            $garmentLookup[$g['id']] = $g;
            $allItems[] = $g;

            if ($gRaw === 'male')        $maleLines[]   = $line;
            elseif ($gRaw === 'female')  $femaleLines[] = $line;
            else { $maleLines[] = $line; $femaleLines[] = $line; } // unisex → both
        }
    } catch (Exception $e) {}
}

// Static fallback
if (empty($maleLines) && empty($femaleLines)) {
    $maleLines   = [
        "- ID 1: Royal Ivory Wedding Tuxedo (Category: Bridal & Formal)",
        "- ID 2: Executive Charcoal Italian Wool Suit (Category: Suits & Blazers)",
        "- ID 3: Modern Midnight Navy Tuxedo (Category: Suits & Blazers)",
        "- ID 4: Relaxed Urban Denim Jacket (Category: Casual)",
    ];
    $femaleLines = [
        "- ID 5: Lace Cathedral Bridal Gown (Category: Bridal & Formal)",
        "- ID 6: Floral Silk Evening Slip Dress (Category: Western)",
        "- ID 7: Elegant Emerald Satin Evening Dress (Category: Western)",
        "- ID 8: Tailored Ivory Tuxedo Blazer (Category: Suits & Blazers)",
    ];
}

// Build the inventory section shown to Gemini based on resolved gender
if ($resolvedGender === 'male') {
    $inventorySection =
        "The user has indicated they are MALE. You MUST only recommend from [MALE_INVENTORY].\n" .
        "NEVER recommend bridal gowns, dresses, or any female garment.\n\n" .
        "[MALE_INVENTORY]:\n" . implode("\n", $maleLines);

} elseif ($resolvedGender === 'female') {
    $inventorySection =
        "The user has indicated they are FEMALE. You MUST only recommend from [FEMALE_INVENTORY].\n" .
        "NEVER recommend tuxedos, suits, blazers, or any male garment.\n\n" .
        "[FEMALE_INVENTORY]:\n" . implode("\n", $femaleLines);

} else {
    // Gender ambiguous — show both lists clearly separated with instructions
    $inventorySection =
        "Determine the user's target gender from the context of their query.\n" .
        "Then recommend ONLY from the appropriate gender inventory below.\n" .
        "ABSOLUTE RULE: NEVER recommend female garments (gowns, lehengas, sarees) to a male, " .
        "or male garments (tuxedos, suits, sherwanis) to a female.\n\n" .
        "[MALE_INVENTORY] — recommend ONLY if user is male:\n" . implode("\n", $maleLines) . "\n\n" .
        "[FEMALE_INVENTORY] — recommend ONLY if user is female:\n" . implode("\n", $femaleLines);
}

// ── 2. Build System Prompt ────────────────────────────────────────────────────
$systemPrompt =
    "You are the Style360 AI Fashion Stylist — an elite virtual wardrobe consultant.\n" .
    "Your ONLY job is to recommend outfits STRICTLY from the Style360 Inventory listed below.\n\n" .
    "STRICT RULES:\n" .
    "1. Do NOT suggest any generic clothing brands or items outside this inventory.\n" .
    "2. Recommend 1 to 2 items STRICTLY from the correct gender inventory.\n" .
    "3. Always include the exact Item Name and ID (e.g. 'ID 2: Midnight Blue Velvet Tuxedo').\n" .
    "4. Keep your response friendly, stylish, and concise (3-5 sentences max).\n" .
    "5. Briefly explain WHY each item suits the request (color, occasion, skin tone, style).\n" .
    "6. GENDER IS MANDATORY: Never cross gender inventory boundaries.\n\n" .
    $inventorySection;

// ── 3. Call Node.js gemini_service.js ────────────────────────────────────────
$nodeServicePath = __DIR__ . DIRECTORY_SEPARATOR . 'gemini_service.js';
if (file_exists($nodeServicePath)) {
    $fullPrompt = $systemPrompt . "\n\nUser query: " . $userPrompt;
    $cmd        = "node " . escapeshellarg($nodeServicePath) . " " . escapeshellarg($fullPrompt) . " 2>&1";
    $output     = shell_exec($cmd);
    if ($output) {
        $jsonRes = json_decode(trim($output), true);
        if (!empty($jsonRes['reply'])) {
            $reply     = $jsonRes['reply'];
            $usedModel = $jsonRes['model'] ?? $usedModel;
        }
    }
}

// ── 4. Fallback: Direct Gemini REST API ──────────────────────────────────────
if (empty($reply)) {
    $geminiApiKey = defined('GEMINI_API_KEY') ? GEMINI_API_KEY : getenv('GEMINI_API_KEY');
    $models       = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

    foreach ($models as $mName) {
        if (empty($geminiApiKey)) break;
        $url     = "https://generativelanguage.googleapis.com/v1beta/models/{$mName}:generateContent?key={$geminiApiKey}";
        $payload = [
            "system_instruction" => ["parts" => [["text" => $systemPrompt]]],
            "contents"           => [["role" => "user", "parts" => [["text" => $userPrompt]]]],
            "generationConfig"   => ["temperature" => 0.7, "maxOutputTokens" => 600]
        ];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ["Content-Type: application/json"],
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            $text    = $resData['candidates'][0]['content']['parts'][0]['text'] ?? '';
            if (!empty($text)) { $reply = trim($text); $usedModel = $mName; break; }
        }
    }
}

// Helper to sanitize image URL for client
function sanitizeDisplayUrl($url) {
    if (empty($url)) return 'images/cat_wedding_men.png';
    if (strpos($url, 'http://') === 0 || strpos($url, 'https://') === 0 || strpos($url, 'data:image') === 0) {
        return $url;
    }
    $clean = ltrim($url, '/');
    if (strpos($clean, 'uploads/') === 0) {
        return '/' . $clean;
    }
    return $clean;
}

// ── 5. Extract garment IDs from AI reply → build Try On cards ────────────────
$recommendations = [];
if (!empty($reply) && !empty($garmentLookup)) {
    preg_match_all('/\bID\s*:?\s*(\d+)\b/i', $reply, $matches);
    foreach (array_unique($matches[1] ?? []) as $gid) {
        $gid = (int)$gid;
        if (!isset($garmentLookup[$gid])) continue;
        $g     = $garmentLookup[$gid];
        $gGender = strtolower($g['gender'] ?? 'unisex');

        // Hard enforce gender filter on extracted IDs
        if ($resolvedGender === 'male'   && $gGender === 'female') continue;
        if ($resolvedGender === 'female' && $gGender === 'male')   continue;

        $displayImg = sanitizeDisplayUrl($g['display_image_url']);
        $recommendations[] = [
            "id"                => (int)$g['id'],
            "title"             => $g['title'],
            "name"              => $g['title'],
            "gender"            => ucfirst($g['gender'] ?? 'unisex'),
            "display_image_url" => $displayImg,
            "fal_image_url"     => $g['fal_image_url'] ?: $displayImg,
            "img"               => $displayImg,
            "category"          => $g['category_label'] ?: $g['category'],
            "category_label"    => $g['category_label'] ?: $g['category'],
            "reason"            => "Recommended by Style360 AI Stylist",
        ];
    }
}

// If no IDs were specifically matched in the text, offer curated items from the matching inventory
if (empty($recommendations) && !empty($allItems)) {
    $targetGender = ($resolvedGender === 'female') ? 'female' : (($resolvedGender === 'male') ? 'male' : 'all');
    $pool = array_filter($allItems, function ($g) use ($targetGender) {
        if ($targetGender === 'all') return true;
        $gg = strtolower($g['gender'] ?? 'unisex');
        return ($gg === $targetGender || $gg === 'unisex');
    });
    if (empty($pool)) $pool = $allItems;

    foreach (array_slice(array_values($pool), 0, 3) as $g) {
        $displayImg = sanitizeDisplayUrl($g['display_image_url']);
        $recommendations[] = [
            "id"                => (int)$g['id'],
            "title"             => $g['title'],
            "name"              => $g['title'],
            "gender"            => ucfirst($g['gender'] ?? 'unisex'),
            "display_image_url" => $displayImg,
            "fal_image_url"     => $g['fal_image_url'] ?: $displayImg,
            "img"               => $displayImg,
            "category"          => $g['category_label'] ?: $g['category'],
            "category_label"    => $g['category_label'] ?: $g['category'],
            "reason"            => "Curated Style360 outfit matching your search.",
        ];
    }
}

// ── 6. Final fallback ─────────────────────────────────────────────────────────
if (empty($reply)) {
    $reply = "✨ **Style360 AI Stylist**: For *\"" . htmlspecialchars($userPrompt) . "\"* — explore our curated inventory and click any outfit to try it on in the 3D Studio!";
}

echo json_encode([
    "status"          => "success",
    "model"           => $usedModel,
    "reply"           => $reply,
    "recommendations" => $recommendations,
    "gender_detected" => $resolvedGender,
    "prompt"          => $userPrompt,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);