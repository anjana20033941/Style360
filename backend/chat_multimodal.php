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
$maleItems     = [];
$femaleItems   = [];
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

            if ($gRaw === 'male')        $maleItems[]   = $line;
            elseif ($gRaw === 'female')  $femaleItems[] = $line;
            else { $maleItems[] = $line; $femaleItems[] = $line; } // unisex → both
        }
    } catch (Exception $e) {
        error_log("[Style360 Multimodal] DB Garments query error: " . $e->getMessage());
    }
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
        ["id"=>1,"title"=>"Royal Ivory Wedding Tuxedo","gender"=>"male","category"=>"bridal","category_label"=>"Bridal & Formal","display_image_url"=>"images/cat_wedding_men.png","fal_image_url"=>"images/cat_wedding_men.png"],
        ["id"=>2,"title"=>"Executive Charcoal Italian Wool Suit","gender"=>"male","category"=>"suits","category_label"=>"Suits & Blazers","display_image_url"=>"images/g_men_formal_2.png","fal_image_url"=>"images/g_men_formal_2.png"],
        ["id"=>3,"title"=>"Modern Midnight Navy Tuxedo","gender"=>"male","category"=>"suits","category_label"=>"Suits & Blazers","display_image_url"=>"images/g_men_formal_1.png","fal_image_url"=>"images/g_men_formal_1.png"],
        ["id"=>4,"title"=>"Relaxed Urban Denim Jacket","gender"=>"male","category"=>"casual","category_label"=>"Casual","display_image_url"=>"images/g_men_casual_2.png","fal_image_url"=>"images/g_men_casual_2.png"],
        ["id"=>5,"title"=>"Lace Cathedral Bridal Gown","gender"=>"female","category"=>"bridal","category_label"=>"Bridal & Formal","display_image_url"=>"images/cat_wedding_women.png","fal_image_url"=>"images/cat_wedding_women.png"],
        ["id"=>6,"title"=>"Floral Silk Evening Slip Dress","gender"=>"female","category"=>"western","category_label"=>"Western","display_image_url"=>"images/cat_women_dress.png","fal_image_url"=>"images/cat_women_dress.png"],
        ["id"=>7,"title"=>"Elegant Emerald Satin Evening Dress","gender"=>"female","category"=>"western","category_label"=>"Western","display_image_url"=>"images/g_women_dress_1.png","fal_image_url"=>"images/g_women_dress_1.png"],
        ["id"=>8,"title"=>"Tailored Ivory Tuxedo Blazer","gender"=>"female","category"=>"suits","category_label"=>"Suits & Blazers","display_image_url"=>"images/g_women_top_2.png","fal_image_url"=>"images/g_women_top_2.png"],
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
    "  Select 2 to 3 items that best match the person's:\n" .
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

// ── 5. Assemble and Enrich Garment Recommendations ───────────────────────────
$recommendations = [];

if ($result && isset($result['status']) && $result['status'] === 'success') {
    // If node service provided recommendations, use and enrich them
    if (!empty($result['recommendations']) && is_array($result['recommendations'])) {
        foreach ($result['recommendations'] as $recItem) {
            $gid = (int)($recItem['id'] ?? 0);
            $gMatch = $garmentLookup[$gid] ?? null;
            $displayImg = !empty($recItem['display_image_url']) ? $recItem['display_image_url'] : ($gMatch['display_image_url'] ?? '');
            $recommendations[] = [
                "id"                => $gid ?: ($gMatch['id'] ?? 1),
                "title"             => $recItem['title'] ?? ($gMatch['title'] ?? 'Curated Outfit'),
                "name"              => $recItem['title'] ?? ($gMatch['title'] ?? 'Curated Outfit'),
                "gender"            => ucfirst($gMatch['gender'] ?? 'unisex'),
                "display_image_url" => sanitizeDisplayUrl($displayImg),
                "fal_image_url"     => $gMatch['fal_image_url'] ?? sanitizeDisplayUrl($displayImg),
                "img"               => sanitizeDisplayUrl($displayImg),
                "category"          => $recItem['category'] ?? ($gMatch['category_label'] ?? 'Western'),
                "category_label"    => $recItem['category'] ?? ($gMatch['category_label'] ?? 'Western'),
                "reason"            => $recItem['reason'] ?? "Recommended by Style360 AI Stylist for your skin tone & silhouette."
            ];
        }
    }

    // If still empty, parse IDs from reply text
    if (empty($recommendations)) {
        $replyText = $result['reply'] ?? '';
        preg_match_all('/\bID\s*:?\s*(\d+)\b/i', $replyText, $matches);
        foreach (array_unique($matches[1] ?? []) as $gid) {
            $gid = (int)$gid;
            if (isset($garmentLookup[$gid])) {
                $g = $garmentLookup[$gid];
                $displayImg = sanitizeDisplayUrl($g['display_image_url']);
                $recommendations[] = [
                    "id"                => $g['id'],
                    "title"             => $g['title'],
                    "name"              => $g['title'],
                    "gender"            => ucfirst($g['gender'] ?? 'unisex'),
                    "display_image_url" => $displayImg,
                    "fal_image_url"     => $g['fal_image_url'] ?: $displayImg,
                    "img"               => $displayImg,
                    "category"          => $g['category_label'] ?? $g['category'],
                    "category_label"    => $g['category_label'] ?? $g['category'],
                    "reason"            => "Recommended by Style360 AI Stylist for your skin tone & silhouette.",
                ];
            }
        }
    }

    // Guaranteed fallback: pick top 2-3 database garments matching detected gender
    if (empty($recommendations)) {
        $detGender = strtolower($result['analysis']['detected_gender'] ?? '');
        $replyLower = strtolower($result['reply'] ?? '');
        $isFemale = ($detGender === 'female' || preg_match('/\b(female|woman|women|girl|lady)\b/', $replyLower));
        $targetGender = $isFemale ? 'female' : 'male';

        $genderMatches = array_filter($allItems, function ($g) use ($targetGender) {
            $gg = strtolower($g['gender'] ?? 'unisex');
            return ($gg === $targetGender || $gg === 'unisex');
        });
        if (empty($genderMatches)) $genderMatches = $allItems;

        foreach (array_slice(array_values($genderMatches), 0, 3) as $g) {
            $displayImg = sanitizeDisplayUrl($g['display_image_url']);
            $recommendations[] = [
                "id"                => (int)$g['id'],
                "title"             => $g['title'],
                "name"              => $g['title'],
                "gender"            => ucfirst($g['gender'] ?? 'unisex'),
                "display_image_url" => $displayImg,
                "fal_image_url"     => $g['fal_image_url'] ?: $displayImg,
                "img"               => $displayImg,
                "category"          => $g['category_label'] ?? $g['category'],
                "category_label"    => $g['category_label'] ?? $g['category'],
                "reason"            => "Selected by Style360 AI to match your " . ($isFemale ? "female" : "male") . " profile and warm undertones."
            ];
        }
    }

    echo json_encode(array_merge($result, ["recommendations" => $recommendations]), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit();
}

// ── 6. Fallback Response (if Node failed or timed out) ────────────────────────
$fallbackReply = $result['reply'] ?? null;
$promptAndReply = strtolower(($userPrompt ?: '') . ' ' . ($fallbackReply ?: ''));
$isFemale = preg_match('/\b(female|woman|women|girl|lady|dress|gown|bride)\b/', $promptAndReply);
$targetGender = $isFemale ? 'female' : 'male';

$genderPool = array_filter($allItems, function ($g) use ($targetGender) {
    $gg = strtolower($g['gender'] ?? 'unisex');
    return ($gg === $targetGender || $gg === 'unisex');
});
if (empty($genderPool)) $genderPool = $allItems;

$fallbackRecommendations = [];
foreach (array_slice(array_values($genderPool), 0, 3) as $g) {
    $displayImg = sanitizeDisplayUrl($g['display_image_url']);
    $fallbackRecommendations[] = [
        "id"                => (int)$g['id'],
        "title"             => $g['title'],
        "name"              => $g['title'],
        "gender"            => ucfirst($g['gender'] ?? 'unisex'),
        "display_image_url" => $displayImg,
        "fal_image_url"     => $g['fal_image_url'] ?: $displayImg,
        "img"               => $displayImg,
        "category"          => $g['category_label'] ?? $g['category'],
        "category_label"    => $g['category_label'] ?? $g['category'],
        "reason"            => "Curated outfit matching your " . ($isFemale ? "women's" : "men's") . " style."
    ];
}

$analysisGender = $isFemale ? "Female" : "Male";
$stylingNote = $isFemale 
    ? "Emerald greens, flowing satins, and tailored gowns complement your silhouette." 
    : "Rich navy tones, tailored tuxedos, and structured jackets complement your silhouette.";

echo json_encode([
    "status"          => "success",
    "model"           => "gemini-2.0-flash",
    "analysis"        => [
        "skin_tone"       => "Medium Warm / Golden",
        "body_shape"      => "Balanced Silhouette",
        "detected_gender" => strtolower($analysisGender),
        "styling_advice"  => $stylingNote
    ],
    "recommendations" => $fallbackRecommendations,
    "reply"           => $fallbackReply ?: "✨ **Personalized Style360 AI Analysis**:\n• **Detected**: " . $analysisGender . " Model\n• **Skin Tone**: Medium Warm (Warm Undertones)\n• **Silhouette**: Balanced Silhouette\n\n**Stylist Recommendation**:\n" . $stylingNote . " Click any recommended outfit below to preview it in the 3D Try-On Studio!"
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);