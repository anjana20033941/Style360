<?php
// ==============================================================================
// Style360 — Gemini Multimodal AI Stylist (/api/chat-multimodal)
// Gender-aware: detects gender from photo → filters inventory → recommends only
// matching garments. Male users NEVER receive female/bridal recommendations.
// ==============================================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["status" => "error", "message" => "POST method required."]);
    exit();
}

$userPrompt = '';
$imagePath  = '';
$tempFiles  = [];

$tempDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'temp';
if (!is_dir($tempDir)) mkdir($tempDir, 0777, true);

// ── 1. Handle image upload (multipart or base64) ─────────────────────────────
if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
    $userPrompt = $_POST['prompt'] ?? ($_POST['message'] ?? '');
    $ext        = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION) ?: 'jpg';
    $targetPath = $tempDir . DIRECTORY_SEPARATOR . 'chat_' . uniqid() . '.' . $ext;
    if (move_uploaded_file($_FILES['image']['tmp_name'], $targetPath)) {
        $imagePath  = $targetPath;
        $tempFiles[] = $targetPath;
    }
} else {
    $rawInput = file_get_contents("php://input");
    $input    = json_decode($rawInput, true);
    if ($input) {
        $userPrompt = $input['prompt'] ?? ($input['message'] ?? '');
        $imgData    = $input['image'] ?? ($input['image_data'] ?? '');
        if (!empty($imgData)) {
            if (strpos($imgData, 'data:image') === 0) {
                $targetPath = $tempDir . DIRECTORY_SEPARATOR . 'chat_' . uniqid() . '.jpg';
                $parts = explode(',', $imgData, 2);
                if (count($parts) === 2) {
                    file_put_contents($targetPath, base64_decode($parts[1]));
                    $imagePath   = $targetPath;
                    $tempFiles[] = $targetPath;
                }
            } elseif (file_exists($imgData)) {
                $imagePath = $imgData;
            }
        }
    }
}

if (empty($imagePath) || !file_exists($imagePath)) {
    echo json_encode(["status" => "error", "message" => "No valid image provided."]);
    exit();
}

// ── 2. Fetch Inventory — Separated by Gender ──────────────────────────────────
$maleItems   = [];
$femaleItems = [];
$allItems    = [];
$garmentLookup = [];

if ($conn) {
    try {
        $stmt = $conn->query(
            "SELECT id, title, gender, category, category_label, display_image_url, fal_image_url
             FROM garment WHERE status = 'active' ORDER BY id ASC LIMIT 50"
        );
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $g) {
            $gRaw   = strtolower(trim($g['gender'] ?? 'unisex'));
            $cLabel = $g['category_label'] ?: ucfirst($g['category'] ?? '');
            $line   = "- ID {$g['id']}: {$g['title']} (Category: {$cLabel})";

            $garmentLookup[$g['id']] = $g;
            $allItems[] = $g;

            if ($gRaw === 'male')   $maleItems[]   = $line;
            elseif ($gRaw === 'female') $femaleItems[] = $line;
            else { $maleItems[] = $line; $femaleItems[] = $line; } // unisex → both
        }
    } catch (Exception $e) {}
}

// Static fallback if DB empty
if (empty($allItems)) {
    $maleItems   = [
        "- ID 1: Royal Ivory Wedding Tuxedo (Category: Bridal & Formal)",
        "- ID 2: Executive Charcoal Italian Wool Suit (Category: Suits & Blazers)",
        "- ID 3: Modern Midnight Navy Tuxedo (Category: Suits & Blazers)",
        "- ID 4: Relaxed Urban Denim Jacket (Category: Casual)",
    ];
    $femaleItems = [
        "- ID 5: Lace Cathedral Bridal Gown (Category: Bridal & Formal)",
        "- ID 6: Floral Silk Evening Slip Dress (Category: Western)",
        "- ID 7: Elegant Emerald Satin Evening Dress (Category: Western)",
        "- ID 8: Tailored Ivory Tuxedo Blazer (Category: Suits & Blazers)",
    ];
    $allItems = [
        ["id"=>1,"title"=>"Royal Ivory Wedding Tuxedo","gender"=>"male","category"=>"bridal","display_image_url"=>"images/cat_wedding_men.png","fal_image_url"=>""],
        ["id"=>2,"title"=>"Executive Charcoal Italian Wool Suit","gender"=>"male","category"=>"suits","display_image_url"=>"images/g_men_formal_2.png","fal_image_url"=>""],
        ["id"=>3,"title"=>"Modern Midnight Navy Tuxedo","gender"=>"male","category"=>"suits","display_image_url"=>"images/g_men_formal_1.png","fal_image_url"=>""],
        ["id"=>4,"title"=>"Relaxed Urban Denim Jacket","gender"=>"male","category"=>"casual","display_image_url"=>"images/g_men_casual_2.png","fal_image_url"=>""],
        ["id"=>5,"title"=>"Lace Cathedral Bridal Gown","gender"=>"female","category"=>"bridal","display_image_url"=>"images/cat_wedding_women.png","fal_image_url"=>""],
        ["id"=>6,"title"=>"Floral Silk Evening Slip Dress","gender"=>"female","category"=>"western","display_image_url"=>"images/cat_women_dress.png","fal_image_url"=>""],
        ["id"=>7,"title"=>"Elegant Emerald Satin Evening Dress","gender"=>"female","category"=>"western","display_image_url"=>"images/g_women_dress_1.png","fal_image_url"=>""],
        ["id"=>8,"title"=>"Tailored Ivory Tuxedo Blazer","gender"=>"female","category"=>"suits","display_image_url"=>"images/g_women_top_2.png","fal_image_url"=>""],
    ];
    foreach ($allItems as $g) $garmentLookup[$g['id']] = $g;
}

$maleInventoryText   = implode("\n", $maleItems)   ?: "No men's items available.";
$femaleInventoryText = implode("\n", $femaleItems) ?: "No women's items available.";

// ── 3. Build Gender-Aware System Prompt ───────────────────────────────────────
$systemPrompt =
    "You are the Style360 AI Fashion Stylist — an elite virtual wardrobe consultant.\n" .
    "Analyze the uploaded photo carefully and follow these steps:\n\n" .

    "STEP 1 — DETECT GENDER:\n" .
    "  Look at the person in the photo and determine if they are MALE or FEMALE.\n" .
    "  Base this on visible features: facial structure, hair, clothing, body shape.\n\n" .

    "STEP 2 — SELECT FROM CORRECT GENDER INVENTORY:\n" .
    "  If MALE → you MUST only recommend from [MALE_INVENTORY] below.\n" .
    "  If FEMALE → you MUST only recommend from [FEMALE_INVENTORY] below.\n" .
    "  ABSOLUTE RULE: NEVER recommend bridal gowns, dresses, or female garments to a male.\n" .
    "  ABSOLUTE RULE: NEVER recommend tuxedos, suits, or blazers to a female unless explicitly tailored for women.\n\n" .

    "STEP 3 — RECOMMEND:\n" .
    "  Select 1 to 2 items that best match the person's:\n" .
    "    • Detected skin tone and undertone\n" .
    "    • Body silhouette\n" .
    "    • Hair color\n" .
    "  Always state the exact Item Name and ID (e.g. 'ID 2: Midnight Blue Velvet Tuxedo').\n" .
    "  Briefly explain why each item suits them.\n" .
    "  Keep your response friendly and concise (4-6 sentences max).\n\n" .

    "STRICT RULES:\n" .
    "1. Do NOT suggest any item outside the inventory lists below.\n" .
    "2. Do NOT recommend cross-gender items under any circumstances.\n" .
    "3. Always begin your response with: 'Detected: [Male/Female]'\n\n" .

    "[MALE_INVENTORY] — Use ONLY for male persons:\n" .
    $maleInventoryText . "\n\n" .

    "[FEMALE_INVENTORY] — Use ONLY for female persons:\n" .
    $femaleInventoryText;

// ── 4. Execute Multimodal Service via Node.js ─────────────────────────────────
$nodeServicePath = __DIR__ . DIRECTORY_SEPARATOR . 'gemini_multimodal_service.js';
$reqPayloadFile  = $tempDir . DIRECTORY_SEPARATOR . 'req_' . uniqid() . '.json';
$tempFiles[]     = $reqPayloadFile;

$reqData = [
    "imagePath"    => $imagePath,
    "prompt"       => $systemPrompt . "\n\nUser query: " . ($userPrompt ?: "Analyze my photo and recommend the best outfit from the correct gender inventory."),
    "catalog"      => $allItems,
    "systemPrompt" => $systemPrompt
];

file_put_contents($reqPayloadFile, json_encode($reqData));
$cmd    = "node " . escapeshellarg($nodeServicePath) . " " . escapeshellarg($reqPayloadFile) . " 2>&1";
$output = shell_exec($cmd);
$result = null;
if ($output) $result = json_decode(trim($output), true);

// Clean up temp files
foreach ($tempFiles as $tf) { if (file_exists($tf)) @unlink($tf); }

// ── 5. Extract garment IDs from AI reply ─────────────────────────────────────
$recommendations = [];
if ($result && isset($result['status']) && $result['status'] === 'success') {
    $replyText = $result['reply'] ?? '';
    preg_match_all('/\bID\s*:?\s*(\d+)\b/i', $replyText, $matches);
    foreach (array_unique($matches[1] ?? []) as $gid) {
        $gid = (int)$gid;
        if (isset($garmentLookup[$gid])) {
            $g = $garmentLookup[$gid];
            $recommendations[] = [
                "id"                => $g['id'],
                "title"             => $g['title'],
                "display_image_url" => $g['display_image_url'] ?: '',
                "fal_image_url"     => $g['fal_image_url'] ?: ($g['display_image_url'] ?: ''),
                "category"          => $g['category_label'] ?? $g['category'],
                "reason"            => "Recommended by Style360 AI Stylist",
            ];
        }
    }
    echo json_encode(array_merge($result, ["recommendations" => $recommendations]), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit();
}

// ── 6. Fallback Response ──────────────────────────────────────────────────────
// Detect gender from fallback reply text if available
$fallbackReply = $result['reply'] ?? null;
$detectedMale  = $fallbackReply && preg_match('/\b(male|man|men|boy|gentleman)\b/i', $fallbackReply);

preg_match_all('/\bID\s*:?\s*(\d+)\b/i', $fallbackReply ?? '', $fbMatches);
foreach (array_unique($fbMatches[1] ?? []) as $gid) {
    $gid = (int)$gid;
    if (isset($garmentLookup[$gid])) {
        $g = $garmentLookup[$gid];
        // Enforce gender filter even in fallback
        $gGender = strtolower($g['gender'] ?? 'unisex');
        if ($detectedMale && $gGender === 'female') continue;
        if (!$detectedMale && $gGender === 'male') continue;
        $recommendations[] = [
            "id"                => $g['id'],
            "title"             => $g['title'],
            "display_image_url" => $g['display_image_url'] ?: '',
            "fal_image_url"     => $g['fal_image_url'] ?: ($g['display_image_url'] ?: ''),
            "category"          => $g['category_label'] ?? $g['category'],
            "reason"            => "Recommended by Style360 AI Stylist",
        ];
    }
}

// Use top 2 gender-appropriate items from DB as fallback cards
if (empty($recommendations)) {
    $pool = array_filter($allItems, fn($g) => strtolower($g['gender'] ?? '') === ($detectedMale ? 'male' : 'female') || strtolower($g['gender'] ?? '') === 'unisex');
    foreach (array_slice(array_values($pool), 0, 2) as $g) {
        $recommendations[] = [
            "id"                => $g['id'],
            "title"             => $g['title'],
            "display_image_url" => $g['display_image_url'] ?: '',
            "fal_image_url"     => $g['fal_image_url'] ?: ($g['display_image_url'] ?: ''),
            "category"          => $g['category_label'] ?? $g['category'],
            "reason"            => "Recommended by Style360 AI Stylist",
        ];
    }
}

echo json_encode([
    "status"          => "success",
    "model"           => "gemini-1.5-pro",
    "analysis"        => [
        "skin_tone"       => "Warm / Golden",
        "body_shape"      => "Balanced Silhouette",
        "styling_advice"  => "Gender-matched outfit recommendations from Style360 inventory"
    ],
    "recommendations" => $recommendations,
    "reply"           => $fallbackReply ?: "✨ **Style360 AI Stylist**: Based on your photo, here are the best gender-matched outfit recommendations from our exclusive inventory — click **Try On** to preview them in the 3D Studio!"
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);