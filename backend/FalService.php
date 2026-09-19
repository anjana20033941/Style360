<?php
/**
 * Style360 - FalService.php
 * Centralized Service Controller for Fal.ai API integrations:
 * 1. Virtual Try-On: fal-ai/fashn/tryon/v1.6
 * 2. Outfit Recolor (Inpainting): fal-ai/flux-general/inpainting
 */

if (!class_exists('FalService')) {
class FalService {

    public const MOCK_MODE = false;

    const TRYON_ENDPOINT = "https://fal.run/fal-ai/fashn/tryon/v1.6";
    const INPAINTING_ENDPOINT = "https://fal.run/fal-ai/flux-general/inpainting";
    const FACE_RESTORATION_ENDPOINT = "https://fal.run/fal-ai/codeformer";

    // Optimized alignment, proportional scaling, and face restoration constraints
    const DEFAULT_PROMPT_CONSTRAINT = "proportional head-to-body ratio, natural head scale, photorealistic male full-body suit model";
    const DEFAULT_FACE_RESTORATION_WEIGHT = 0.5; // Adjusted down from 1.0 to 0.4 - 0.6 to prevent oversized head scaling
    const DEFAULT_TARGET_WIDTH = 768;
    const DEFAULT_TARGET_HEIGHT = 1024;

    /**
     * Get configured FAL_KEY directly from constants, environment, or root .env file
     */
    public static function getApiKey(): string {
        if (defined('FAL_KEY') && !empty(FAL_KEY)) {
            return FAL_KEY;
        }
        $key = getenv('FAL_KEY');
        if (!empty($key)) {
            return $key;
        }
        if (!empty($_ENV['FAL_KEY'])) {
            return $_ENV['FAL_KEY'];
        }
        if (!empty($_SERVER['FAL_KEY'])) {
            return $_SERVER['FAL_KEY'];
        }

        // Direct parse from root .env file
        $envPaths = [
            dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env',
            __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . '.env',
            dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env',
        ];

        foreach ($envPaths as $envFile) {
            if (file_exists($envFile) && is_readable($envFile)) {
                $lines = @file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines) {
                    foreach ($lines as $line) {
                        $trimmed = trim($line);
                        if ($trimmed === '' || $trimmed[0] === '#') continue;
                        if (strpos($trimmed, 'FAL_KEY=') === 0) {
                            $parts = explode('=', $trimmed, 2);
                            $val = trim($parts[1] ?? '', " \t\n\r\0\x0B\"'");
                            if (!empty($val)) {
                                return $val;
                            }
                        }
                    }
                }
            }
        }

        return '';
    }

    /**
     * Check if Fal.ai is configured with a valid key
     */
    public static function isConfigured(): bool {
        if (self::MOCK_MODE) {
            return true;
        }
        $key = self::getApiKey();
        return !empty($key);
    }

    /**
     * Normalize image into URL or base64 data URI
     */
    public static function normalizeImage(string $image): string {
        $image = trim($image);
        if (empty($image)) {
            return '';
        }

        // Already a remote URL or data URI
        if (strpos($image, 'http://') === 0 || strpos($image, 'https://') === 0 || strpos($image, 'data:image') === 0) {
            return $image;
        }

        // If it's a local file path or relative URL, resolve to file on disk
        $clean = ltrim($image, '/\\');
        $candidates = [
            dirname(__DIR__) . DIRECTORY_SEPARATOR . $clean,
            dirname(__DIR__) . DIRECTORY_SEPARATOR . 'frontend' . DIRECTORY_SEPARATOR . $clean,
            dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . $clean,
            $image
        ];

        foreach ($candidates as $cand) {
            if (file_exists($cand) && is_file($cand)) {
                $mime = @mime_content_type($cand) ?: 'image/jpeg';
                $content = @file_get_contents($cand);
                if ($content !== false) {
                    return 'data:' . $mime . ';base64,' . base64_encode($content);
                }
            }
        }

        return $image;
    }

    /**
     * Standardize and auto-crop input user face/model images to a 3:4 or 9:16 portrait aspect ratio
     * with fixed target dimensions (e.g., width: 768, height: 1024) to maintain realistic body-to-head proportions.
     */
    public static function standardizeModelImage(
        string $image,
        int $targetW = self::DEFAULT_TARGET_WIDTH,
        int $targetH = self::DEFAULT_TARGET_HEIGHT,
        string $aspectRatio = '3:4'
    ): string {
        $image = trim($image);
        if (empty($image)) {
            return '';
        }

        // Adjust dimensions if 9:16 ratio is explicitly specified
        if ($aspectRatio === '9:16' || $aspectRatio === '9/16') {
            if ($targetW === 768 && $targetH === 1024) {
                $targetW = 576; // 576x1024 is exact 9:16 portrait
                $targetH = 1024;
            }
        }

        // Extract binary image content
        $binary = null;
        if (strpos($image, 'data:image') === 0) {
            $parts = explode(',', $image, 2);
            if (isset($parts[1])) {
                $binary = base64_decode($parts[1]);
            }
        } elseif (strpos($image, 'http://') === 0 || strpos($image, 'https://') === 0) {
            $binary = @file_get_contents($image);
            if (!$binary && function_exists('curl_init')) {
                $ch = curl_init($image);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT        => 15,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => false
                ]);
                $binary = curl_exec($ch);
                curl_close($ch);
            }
        } else {
            $clean = ltrim($image, '/\\');
            $candidates = [
                $image,
                dirname(__DIR__) . DIRECTORY_SEPARATOR . $clean,
                dirname(__DIR__) . DIRECTORY_SEPARATOR . 'frontend' . DIRECTORY_SEPARATOR . $clean,
                dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . $clean
            ];
            foreach ($candidates as $cand) {
                if (file_exists($cand) && is_file($cand)) {
                    $binary = @file_get_contents($cand);
                    if ($binary) break;
                }
            }
        }

        if (!$binary || !extension_loaded('gd')) {
            return $image;
        }

        $srcImg = @imagecreatefromstring($binary);
        if (!$srcImg) {
            return $image;
        }

        $origW = imagesx($srcImg);
        $origH = imagesy($srcImg);

        if ($origW <= 0 || $origH <= 0) {
            imagedestroy($srcImg);
            return $image;
        }

        // Compute aspect ratios
        $targetRatio = $targetW / $targetH;
        $srcRatio    = $origW / $origH;

        $cropX = 0;
        $cropY = 0;
        // Auto-Fit & Proportional Scaling without losing any body parts:
        // NEVER crop out the feet/legs of a full-body or tall portrait!
        $dstX = 0;
        $dstY = 0;
        $dstW = $targetW;
        $dstH = $targetH;

        if ($srcRatio < $targetRatio) {
            // Source is taller than target (e.g. 9:16 portrait of a full standing person):
            // Scale by height to fill $targetH, center horizontally.
            // 100% of the vertical height (head to toes) is completely preserved!
            $dstH = $targetH;
            $dstW = (int)round($origW * ($targetH / $origH));
            $dstX = (int)max(0, round(($targetW - $dstW) / 2));
            $dstY = 0;
            $cropX = 0;
            $cropY = 0;
            $cropW = $origW;
            $cropH = $origH;
        } elseif ($srcRatio > $targetRatio) {
            // Source is wider (e.g. landscape or square) -> center horizontally
            $cropW = (int)round($origH * $targetRatio);
            $cropH = $origH;
            $cropX = (int)max(0, round(($origW - $cropW) / 2));
            $cropY = 0;
        } else {
            $cropX = 0;
            $cropY = 0;
            $cropW = $origW;
            $cropH = $origH;
        }

        // Create target canvas with exact fixed dimensions
        $canvas = imagecreatetruecolor($targetW, $targetH);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);

        // Sample background color from source image corner for seamless borders
        $r = 255; $g = 255; $b = 255;
        $rgb = @imagecolorat($srcImg, min(4, $origW - 1), min(4, $origH - 1));
        if ($rgb !== false) {
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
        }
        $bg = imagecolorallocate($canvas, $r, $g, $b);
        imagefilledrectangle($canvas, 0, 0, $targetW, $targetH, $bg);
        imagealphablending($canvas, true);

        // Resample cropped region to target dimensions without vertical cropping
        imagecopyresampled(
            $canvas,
            $srcImg,
            $dstX, $dstY,
            $cropX, $cropY,
            $dstW, $dstH,
            $cropW, $cropH
        );

        ob_start();
        imagejpeg($canvas, null, 95);
        $standardizedJpeg = ob_get_clean();

        imagedestroy($srcImg);
        imagedestroy($canvas);

        if ($standardizedJpeg) {
            return 'data:image/jpeg;base64,' . base64_encode($standardizedJpeg);
        }

        return $image;
    }

    /**
     * Detect if an outfit represents a complete outfit, full suit, or two-piece set (Shirt + Trouser)
     */
    public static function isFullOutfit(string $category, string $garmentName = ''): bool {
        $cat = strtolower(trim($category));
        $name = strtolower(trim($garmentName));
        $combined = $cat . ' ' . $name;

        if (
            $cat === 'one-pieces' ||
            $cat === 'onepiece' ||
            $cat === 'suits' ||
            $cat === 'suit' ||
            $cat === 'bridal' ||
            $cat === 'two-piece' ||
            $cat === 'set' ||
            $cat === 'full-outfit'
        ) {
            return true;
        }

        // Check if item contains top + bottom (or top + shoes or bottom + shoes)
        $hasTop = (bool)preg_match('/\b(shirt|tee|t-shirt|top|blouse|blazer|jacket|polo|hoodie|kurti|kurta|sweater|coat|linen)\b/i', $combined);
        $hasBottom = (bool)preg_match('/\b(chino|chinos|trouser|trousers|pant|pants|jean|jeans|short|shorts|skirt|slacks|joggers)\b/i', $combined);
        $hasShoes = (bool)preg_match('/\b(espadrille|espadrilles|shoe|shoes|sneaker|sneakers|loafer|loafers|boot|boots|heel|heels|sandals)\b/i', $combined);

        if (($hasTop && $hasBottom) || ($hasTop && $hasShoes) || ($hasBottom && $hasShoes)) {
            return true;
        }

        // Match full suits, two-piece sets, complete outfits, dresses, gowns, sherwanis, anarkalis
        if (preg_match('/\b(suit|suits|tuxedo|tux|sherwani|anarkali|two-piece|2-piece|two\s*piece|2\s*piece|full\s*set|full\s*outfit|complete\s*outfit|complete|set|dress|gown|robe|jumpsuit|romper|overall|co-ord|coord)\b/i', $combined)) {
            return true;
        }

        return false;
    }

    /**
     * Combine separate top and bottom garment images into a single full-outfit image
     */
    public static function combineGarmentImages(string $topImage, string $bottomImage): string {
        $topNorm = self::normalizeImage($topImage);
        $botNorm = self::normalizeImage($bottomImage);

        // Decode top image
        $topData = (strpos($topNorm, 'data:image') === 0) 
            ? base64_decode(explode(',', $topNorm)[1] ?? '') 
            : @file_get_contents($topNorm);

        // Decode bottom image
        $botData = (strpos($botNorm, 'data:image') === 0) 
            ? base64_decode(explode(',', $botNorm)[1] ?? '') 
            : @file_get_contents($botNorm);

        if (!$topData || !$botData) {
            return $topNorm ?: $botNorm;
        }

        $topImg = @imagecreatefromstring($topData);
        $botImg = @imagecreatefromstring($botData);

        if (!$topImg || !$botImg) {
            if ($topImg) imagedestroy($topImg);
            if ($botImg) imagedestroy($botImg);
            return $topNorm ?: $botNorm;
        }

        $targetW = 1024;
        $targetH = 1536; // 2:3 aspect ratio suited for full body outfit

        $canvas = imagecreatetruecolor($targetW, $targetH);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $bg = imagecolorallocatealpha($canvas, 255, 255, 255, 0); // Transparent canvas
        imagefilledrectangle($canvas, 0, 0, $targetW, $targetH, $bg);
        imagealphablending($canvas, true);

        // Place top garment in upper half (0% to 50%)
        $topOrigW = imagesx($topImg);
        $topOrigH = imagesy($topImg);
        $topDestH = (int)($targetH * 0.50);
        $topScale = min($targetW / $topOrigW, $topDestH / $topOrigH);
        $topW = (int)($topOrigW * $topScale);
        $topH = (int)($topOrigH * $topScale);
        $topX = (int)(($targetW - $topW) / 2);
        $topY = (int)(($topDestH - $topH) / 2);
        imagecopyresampled($canvas, $topImg, $topX, $topY, 0, 0, $topW, $topH, $topOrigW, $topOrigH);

        // Place bottom garment in lower half (50% to 100%)
        $botOrigW = imagesx($botImg);
        $botOrigH = imagesy($botImg);
        $botDestH = (int)($targetH * 0.50);
        $botScale = min($targetW / $botOrigW, $botDestH / $botOrigH);
        $botW = (int)($botOrigW * $botScale);
        $botH = (int)($botOrigH * $botScale);
        $botX = (int)(($targetW - $botW) / 2);
        $botY = (int)($topDestH + ($botDestH - $botH) / 2);
        imagecopyresampled($canvas, $botImg, $botX, $botY, 0, 0, $botW, $botH, $botOrigW, $botOrigH);

        ob_start();
        imagepng($canvas);
        $combinedPng = ob_get_clean();

        imagedestroy($topImg);
        imagedestroy($botImg);
        imagedestroy($canvas);

        return 'data:image/png;base64,' . base64_encode($combinedPng);
    }

    /**
     * Normalize category into one of: "tops" | "bottoms" | "one-pieces"
     * Explicitly routes complete outfits, full suits, or two-piece sets (Shirt + Trouser) to "one-pieces".
     */
    public static function normalizeCategory(string $category, string $garmentName = ''): string {
        $cat = strtolower(trim($category));
        $name = strtolower(trim($garmentName));

        // 1. Explicit match if already normalized by caller (e.g. from user coverage selector)
        if (in_array($cat, ['tops', 'bottoms', 'one-pieces'], true)) {
            return $cat;
        }

        // 2. Check for complete outfits, full suits, or two-piece sets (Shirt + Trouser)
        if (self::isFullOutfit($cat, $name)) {
            return 'one-pieces';
        }

        // 3. Standalone Bottoms (pants, trousers, skirts, shorts, jeans without matching top)
        if (
            strpos($cat, 'bottom') !== false ||
            strpos($cat, 'pant') !== false ||
            strpos($cat, 'trouser') !== false ||
            strpos($cat, 'skirt') !== false ||
            strpos($cat, 'jean') !== false ||
            strpos($cat, 'short') !== false ||
            strpos($name, 'pant') !== false ||
            strpos($name, 'trouser') !== false ||
            strpos($name, 'skirt') !== false ||
            strpos($name, 'jean') !== false ||
            strpos($name, 'short') !== false
        ) {
            return 'bottoms';
        }

        // 4. Default: Tops
        return 'tops';
    }

    /**
     * Execute Fal.ai Virtual Try-On (fal-ai/fashn/tryon/v1.6)
     *
     * @param array $params [
     *     'model_image'   => string (required),
     *     'garment_image' => string (required, or provide top_image + bottom_image),
     *     'category'      => string ("tops" | "bottoms" | "one-pieces"),
     *     'cover_feet'    => bool (optional, auto-set true for full outfits / one-pieces),
     *     'mode'          => string ("performance" | "balanced" | "quality"),
     *     'nsfw_filter'   => bool
     * ]
     * @return array Standardized result with status, result_image, engine, etc.
     */
    public static function tryOn(array $params): array {
        $apiKey = self::getApiKey();
        if (empty($apiKey)) {
            return [
                'status'  => 'error',
                'message' => 'FAL_KEY is not configured in backend environment.'
            ];
        }

        $rawModel = $params['model_image'] ?? ($params['person_image'] ?? '');
        $targetW = isset($params['target_width']) ? (int)$params['target_width'] : (isset($params['width']) ? (int)$params['width'] : self::DEFAULT_TARGET_WIDTH);
        $targetH = isset($params['target_height']) ? (int)$params['target_height'] : (isset($params['height']) ? (int)$params['height'] : self::DEFAULT_TARGET_HEIGHT);
        $aspectRatio = $params['aspect_ratio'] ?? '3:4';

        // 1. Auto-Crop & Proportional Scaling: Standardize input face/model image to 3:4 portrait (768x1024)
        $normalizedRawModel = self::normalizeImage($rawModel);
        $modelImage = self::standardizeModelImage($normalizedRawModel, $targetW, $targetH, $aspectRatio);

        // Handle separate top and bottom garments if provided together
        if (!empty($params['top_image']) && !empty($params['bottom_image'])) {
            $rawGarment = self::combineGarmentImages($params['top_image'], $params['bottom_image']);
        } else {
            $rawGarment = $params['garment_image'] ?? ($params['garment_url'] ?? ($params['full_outfit_image'] ?? ''));
        }
        $garmentImage = self::normalizeImage($rawGarment);

        if (empty($modelImage)) {
            return ['status' => 'error', 'message' => 'model_image is required for Virtual Try-On.'];
        }
        if (empty($garmentImage)) {
            return ['status' => 'error', 'message' => 'garment_image is required for Virtual Try-On.'];
        }

        $rawCat = $params['category'] ?? 'tops';
        $garmentName = $params['garment_name'] ?? ($params['name'] ?? ($params['garment_desc'] ?? ''));
        $category = self::normalizeCategory($rawCat, $garmentName);

        // Determine cover_feet & full body: true if full-length rendering is required or category is one-pieces / full outfit or full body model
        $isFullBody = !empty($params['is_full_body']) || (isset($params['aspect_ratio']) && ($params['aspect_ratio'] === '9:16' || $params['aspect_ratio'] === '2:3'));
        $isFull = self::isFullOutfit($rawCat, $garmentName) || ($category === 'one-pieces') || $isFullBody;
        if ($isFull && $category === 'tops' && self::isFullOutfit($rawCat, $garmentName)) {
            $category = 'one-pieces';
        }
        $coverFeet = isset($params['cover_feet']) ? (bool)$params['cover_feet'] : $isFull;

        // 2. Refine Alignment & Face Blending Parameters:
        // Adjust face_restoration_weight to 0.4 - 0.6 (default 0.5) down from 1.0 to prevent oversized head scaling
        $faceRestorationWeight = isset($params['face_restoration_weight'])
            ? (float)$params['face_restoration_weight']
            : self::DEFAULT_FACE_RESTORATION_WEIGHT;
        if ($faceRestorationWeight > 0.6 || $faceRestorationWeight < 0.4) {
            $faceRestorationWeight = self::DEFAULT_FACE_RESTORATION_WEIGHT;
        }

        // Add prompt parameter constraint for natural head-to-body proportion
        $promptConstraint = self::DEFAULT_PROMPT_CONSTRAINT;
        $userPrompt = trim($params['prompt'] ?? '');
        if (!empty($userPrompt)) {
            $prompt = (strpos($userPrompt, $promptConstraint) === false)
                ? ($userPrompt . ", " . $promptConstraint)
                : $userPrompt;
        } else {
            $prompt = $promptConstraint;
        }

        // ── Mock Mode (Zero external HTTP requests) ──
        if (self::MOCK_MODE) {
            $mockImg = !empty($garmentImage) ? $garmentImage : $modelImage;
            return [
                'status'                  => 'success',
                'result_image'            => $mockImg,
                'image_url'               => $mockImg,
                'engine'                  => 'Fal.ai FASHN Try-On v1.6 (Mock Mode)',
                'category'                => $category,
                'face_restoration_weight' => $faceRestorationWeight,
                'prompt'                  => $prompt,
                'target_dimensions'       => ['width' => $targetW, 'height' => $targetH],
                'aspect_ratio'            => $aspectRatio,
                'mock'                    => true,
                'timings'                 => ['inference' => 0.4]
            ];
        }

        $payload = [
            'model_image'             => $modelImage,
            'garment_image'           => $garmentImage,
            'category'                => $category,
            'cover_feet'              => $coverFeet,
            'mode'                    => $params['mode'] ?? 'performance',
            'nsfw_filter'             => isset($params['nsfw_filter']) ? (bool)$params['nsfw_filter'] : false,
            'face_restoration'        => true,
            'face_restoration_weight' => $faceRestorationWeight,
            'prompt'                  => $prompt,
            'negative_prompt'         => "oversized head, disproportionate head, giant head, bobblehead, distorted head scale, blurry face, low quality",
            'aspect_ratio'            => $aspectRatio,
            'target_dimensions'       => ['width' => $targetW, 'height' => $targetH]
        ];

        $response = self::sendRequest(self::TRYON_ENDPOINT, $payload, $apiKey, 300);

        if ($response['http_code'] === 200 && !empty($response['data'])) {
            $data = $response['data'];
            $imgUrl = $data['images'][0]['url'] ?? '';

            if (!empty($imgUrl)) {
                $imgBytes = @file_get_contents($imgUrl);
                $finalImage = $imgBytes ? ('data:image/png;base64,' . base64_encode($imgBytes)) : $imgUrl;

                return [
                    'status'       => 'success',
                    'result_image' => $finalImage,
                    'image_url'    => $imgUrl,
                    'engine'       => 'Fal.ai FASHN Try-On v1.6',
                    'category'     => $category,
                    'timings'      => $data['timings'] ?? null
                ];
            }
        }

        $errMsg = 'Fal.ai Try-On error (HTTP ' . $response['http_code'] . ')';
        if (!empty($response['data']['detail'])) {
            $errMsg .= ': ' . (is_string($response['data']['detail']) ? $response['data']['detail'] : json_encode($response['data']['detail']));
        }

        return [
            'status'    => 'error',
            'message'   => $errMsg,
            'http_code' => $response['http_code'],
            'raw'       => $response['data'] ?? null
        ];
    }

    /**
     * Execute Fal.ai Face Restoration / Inpainting (fal-ai/codeformer)
     * Adjusts face_restoration_weight to 0.4 - 0.6 (down from 1.0) to prevent oversized head scaling over body frame.
     * Enforces proportional head-to-body ratio constraints.
     */
    public static function restoreFace(array $params): array {
        $apiKey = self::getApiKey();
        if (empty($apiKey)) {
            return [
                'status'  => 'error',
                'message' => 'FAL_KEY is not configured in backend environment.'
            ];
        }

        $image = self::normalizeImage($params['image_url'] ?? ($params['image'] ?? ''));
        if (empty($image)) {
            return ['status' => 'error', 'message' => 'Source image is required for Face Restoration.'];
        }

        $targetW = isset($params['target_width']) ? (int)$params['target_width'] : self::DEFAULT_TARGET_WIDTH;
        $targetH = isset($params['target_height']) ? (int)$params['target_height'] : self::DEFAULT_TARGET_HEIGHT;
        $aspectRatio = $params['aspect_ratio'] ?? '3:4';

        // Auto-crop & proportional scaling to fixed portrait dimensions (768x1024)
        $standardizedImage = self::standardizeModelImage($image, $targetW, $targetH, $aspectRatio);

        // Adjust face_restoration_weight to 0.4 - 0.6 (default 0.5) down from 1.0
        $weight = isset($params['face_restoration_weight'])
            ? (float)$params['face_restoration_weight']
            : self::DEFAULT_FACE_RESTORATION_WEIGHT;
        if ($weight > 0.6 || $weight < 0.4) {
            $weight = self::DEFAULT_FACE_RESTORATION_WEIGHT;
        }

        $promptConstraint = self::DEFAULT_PROMPT_CONSTRAINT;
        $userPrompt = trim($params['prompt'] ?? '');
        $prompt = !empty($userPrompt)
            ? ((strpos($userPrompt, $promptConstraint) === false) ? ($userPrompt . ", " . $promptConstraint) : $userPrompt)
            : $promptConstraint;

        $payload = [
            'image_url'               => $standardizedImage,
            'face_restoration_weight' => $weight,
            'fidelity'                => $weight,
            'prompt'                  => $prompt,
            'negative_prompt'         => "oversized head, distorted head scale, giant head, bobblehead, disproportionate body",
            'upscale'                 => 1
        ];

        return self::sendRequest(self::FACE_RESTORATION_ENDPOINT, $payload, $apiKey, 180);
    }

    /**
     * Map any Hex color code or generic hue name to vivid, descriptive English color names
     */
    public static function getColorNameFromHex(string $hex): string {
        $clean = ltrim(trim($hex), '#');
        if (strlen($clean) === 3) {
            $clean = $clean[0] . $clean[0] . $clean[1] . $clean[1] . $clean[2] . $clean[2];
        }
        if (strlen($clean) !== 6 || !ctype_xdigit($clean)) {
            return 'vibrant';
        }

        $r = hexdec(substr($clean, 0, 2));
        $g = hexdec(substr($clean, 2, 2));
        $b = hexdec(substr($clean, 4, 2));

        $rNorm = $r / 255; $gNorm = $g / 255; $bNorm = $b / 255;
        $max = max($rNorm, $gNorm, $bNorm);
        $min = min($rNorm, $gNorm, $bNorm);
        $d = $max - $min;
        $l = ($max + $min) / 2;

        if ($d == 0) {
            $h = 0;
            $s = 0;
        } else {
            $s = $l > 0.5 ? $d / (2 - $max - $min) : $d / ($max + $min);
            if ($max == $rNorm) {
                $h = ($gNorm - $bNorm) / $d + ($gNorm < $bNorm ? 6 : 0);
            } elseif ($max == $gNorm) {
                $h = ($bNorm - $rNorm) / $d + 2;
            } else {
                $h = ($rNorm - $gNorm) / $d + 4;
            }
            $h = round($h * 60);
        }
        $s = round($s * 100);
        $l = round($l * 100);

        if ($s < 12) {
            if ($l < 18) return 'obsidian black';
            if ($l < 45) return 'charcoal grey';
            if ($l < 75) return 'silver grey';
            return 'pure white';
        }

        if ($h >= 15 && $h <= 45 && $s < 60 && $l < 45) {
            return ($l < 25) ? 'dark chocolate brown' : 'warm espresso brown';
        }
        if ($h >= 35 && $h <= 55 && $s < 50 && $l > 70) {
            return 'champagne cream';
        }

        $prefix = '';
        if ($l < 25) $prefix = 'deep ';
        elseif ($l < 35) $prefix = 'dark ';
        elseif ($l > 75) $prefix = 'pastel ';
        elseif ($s > 75) $prefix = 'vibrant ';

        if ($h < 12 || $h >= 350) {
            $base = ($l < 35) ? 'ruby crimson' : (($l > 65) ? 'coral pink' : 'ruby red');
        } elseif ($h < 28) {
            $base = 'scarlet red';
        } elseif ($h < 45) {
            $base = ($s > 70 && $l > 45) ? 'tangerine orange' : 'warm amber gold';
        } elseif ($h < 65) {
            $base = ($l > 70) ? 'canary yellow' : 'royal gold';
        } elseif ($h < 85) {
            $base = 'lime green';
        } elseif ($h < 150) {
            $base = ($l < 30) ? 'deep forest green' : 'emerald green';
        } elseif ($h < 180) {
            $base = ($l < 35) ? 'teal' : 'jade green';
        } elseif ($h < 205) {
            $base = 'turquoise cyan';
        } elseif ($h < 235) {
            $base = ($l < 30) ? 'midnight navy blue' : (($l > 65) ? 'sky blue' : 'royal sapphire blue');
        } elseif ($h < 265) {
            $base = ($l < 30) ? 'midnight indigo' : 'deep indigo';
        } elseif ($h < 290) {
            $base = ($l < 35) ? 'deep plum purple' : 'royal purple';
        } elseif ($h < 320) {
            $base = 'orchid violet';
        } elseif ($h < 340) {
            $base = ($l < 45) ? 'fuchsia magenta' : 'magenta pink';
        } else {
            $base = 'rose pink';
        }

        if ($prefix && strpos($base, trim($prefix)) === false) {
            return $prefix . $base;
        }
        return $base;
    }

    /**
     * Execute Fal.ai Outfit Recolor (Inpainting) (fal-ai/flux-general/inpainting)
     *
     * @param array $params [
     *     'image_url'  => string (required),
     *     'color'      => string (hex or color name),
     *     'color_name' => string,
     *     'prompt'     => string (optional, auto-generated if missing),
     *     'mask_url'   => string (optional, auto-generated if missing)
     * ]
     * @return array Standardized result with status, result_image, engine, etc.
     */
    public static function recolor(array $params): array {
        $apiKey = self::getApiKey();
        if (empty($apiKey)) {
            return [
                'status'  => 'error',
                'message' => 'FAL_KEY is not configured in backend environment.'
            ];
        }

        $image = self::normalizeImage($params['image_url'] ?? ($params['image'] ?? ''));
        if (empty($image)) {
            return ['status' => 'error', 'message' => 'Source image is required for Outfit Recolor.'];
        }

        $colorName = trim($params['color_name'] ?? '');
        $colorHex  = trim($params['color'] ?? ($params['color_hex'] ?? '#7C3AED'));
        if ($colorHex !== '' && $colorHex[0] !== '#') {
            $colorHex = '#' . $colorHex;
        }

        if (empty($colorName) || preg_match('/^(hue\s*\d+|custom\s*color|selected\s*color)/i', $colorName)) {
            $colorLabel = self::getColorNameFromHex($colorHex);
        } else {
            $colorLabel = $colorName;
        }

        $targetSection = strtolower(trim($params['target_section'] ?? ($params['target'] ?? 'full')));

        // Format top and bottom colors
        $topColorName = trim($params['top_color_name'] ?? '');
        $topColorHex  = trim($params['top_color'] ?? ($params['top_color_hex'] ?? $colorHex));
        if (empty($topColorName) || preg_match('/^(hue\s*\d+|custom\s*color|selected\s*color)/i', $topColorName)) {
            $topColor = self::getColorNameFromHex($topColorHex);
        } else {
            $topColor = $topColorName;
        }

        $bottomColorName = trim($params['bottom_color_name'] ?? '');
        $bottomColorHex  = trim($params['bottom_color'] ?? ($params['bottom_color_hex'] ?? $colorHex));
        if (empty($bottomColorName) || preg_match('/^(hue\s*\d+|custom\s*color|selected\s*color)/i', $bottomColorName)) {
            $bottomColor = self::getColorNameFromHex($bottomColorHex);
        } else {
            $bottomColor = $bottomColorName;
        }

        // Dynamic prompt as specified in requirements
        if (!empty($params['prompt']) && !preg_match('/hue\s*\d+|custom\s*color/i', $params['prompt'])) {
            $prompt = $params['prompt'];
        } else {
            if ($targetSection === 'top') {
                $prompt = "Change only the top shirt/blouse color to {$colorLabel} while leaving pants, background, and skin unchanged.";
            } elseif ($targetSection === 'bottom') {
                $prompt = "Change only the trousers/skirt/pants color to {$colorLabel} while leaving top garment unchanged.";
            } elseif ($targetSection === 'dual') {
                $prompt = "Change top garment color to {$topColor} and bottom garment color to {$bottomColor}.";
            } else {
                $prompt = "Change the entire outfit color to {$colorLabel}.";
            }
        }

        // Inpainting requires mask_url. If not passed, generate section-specific garment mask
        $mask = !empty($params['mask_url']) ? self::normalizeImage($params['mask_url']) : self::generateGarmentMask($image, $targetSection);

        // ── Custom Outfit Workflow Active: External Inpainting API call removed ──
        $resultImage = self::generateMockRecolorImage($image, $targetSection, $colorHex, $topColorHex, $bottomColorHex);
        return [
            'status'         => 'success',
            'result_image'   => $resultImage,
            'image_url'      => $resultImage,
            'engine'         => 'Style360 Color Preview (Custom Request Mode)',
            'target_section' => $targetSection,
            'prompt'         => $prompt,
            'note'           => 'Live inpainting replaced with Custom Outfit Request workflow',
            'timings'        => ['inference' => 0.1]
        ];
    }

    /**
     * Generate an intelligent mock recolor image using local GD without external API calls
     */
    public static function generateMockRecolorImage(string $image, string $targetSection, string $colorHex, string $topHex, string $bottomHex): string {
        $raw = null;
        if (strpos($image, 'data:') === 0) {
            $parts = explode(',', $image, 2);
            if (count($parts) === 2) {
                $raw = base64_decode($parts[1]);
            }
        } elseif (strpos($image, 'http') === 0) {
            $raw = @file_get_contents($image);
        } else {
            $clean = ltrim($image, '/\\');
            $candidates = [
                dirname(__DIR__) . DIRECTORY_SEPARATOR . $clean,
                dirname(__DIR__) . DIRECTORY_SEPARATOR . 'frontend' . DIRECTORY_SEPARATOR . $clean,
                dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . $clean,
            ];
            foreach ($candidates as $c) {
                if (file_exists($c)) { $raw = @file_get_contents($c); break; }
            }
        }

        if (!$raw) {
            $def = dirname(__DIR__) . '/frontend/images/cat_women_evening.jpg';
            if (file_exists($def)) $raw = @file_get_contents($def);
        }

        if ($raw && extension_loaded('gd')) {
            $im = @imagecreatefromstring($raw);
            if ($im) {
                $w = imagesx($im);
                $h = imagesy($im);
                $out = imagecreatetruecolor($w, $h);
                imagealphablending($out, true);
                imagesavealpha($out, true);
                imagecopy($out, $im, 0, 0, 0, 0, $w, $h);

                $hexToRgb = function($hStr) {
                    $cl = ltrim(trim($hStr), '#');
                    if (strlen($cl) === 3) $cl = $cl[0].$cl[0].$cl[1].$cl[1].$cl[2].$cl[2];
                    if (strlen($cl) !== 6) return [212, 175, 55];
                    return [hexdec(substr($cl, 0, 2)), hexdec(substr($cl, 2, 2)), hexdec(substr($cl, 4, 2))];
                };

                $rgb = $hexToRgb($colorHex);
                $topRgb = $hexToRgb($topHex);
                $botRgb = $hexToRgb($bottomHex);

                if ($targetSection === 'top') {
                    $y1 = (int)($h * 0.24); $y2 = (int)($h * 0.54);
                    $tint = imagecreatetruecolor($w, $y2 - $y1);
                    $c = imagecolorallocatealpha($tint, $rgb[0], $rgb[1], $rgb[2], 65);
                    imagefilledrectangle($tint, 0, 0, $w, $y2 - $y1, $c);
                    imagecopymerge($out, $tint, 0, $y1, 0, 0, $w, $y2 - $y1, 50);
                    imagedestroy($tint);
                } elseif ($targetSection === 'bottom') {
                    $y1 = (int)($h * 0.50); $y2 = (int)($h * 0.95);
                    $tint = imagecreatetruecolor($w, $y2 - $y1);
                    $c = imagecolorallocatealpha($tint, $rgb[0], $rgb[1], $rgb[2], 65);
                    imagefilledrectangle($tint, 0, 0, $w, $y2 - $y1, $c);
                    imagecopymerge($out, $tint, 0, $y1, 0, 0, $w, $y2 - $y1, 50);
                    imagedestroy($tint);
                } elseif ($targetSection === 'dual') {
                    // Top
                    $y1 = (int)($h * 0.24); $y2 = (int)($h * 0.50);
                    $tTint = imagecreatetruecolor($w, $y2 - $y1);
                    $tc = imagecolorallocatealpha($tTint, $topRgb[0], $topRgb[1], $topRgb[2], 65);
                    imagefilledrectangle($tTint, 0, 0, $w, $y2 - $y1, $tc);
                    imagecopymerge($out, $tTint, 0, $y1, 0, 0, $w, $y2 - $y1, 50);
                    imagedestroy($tTint);
                    // Bottom
                    $by1 = (int)($h * 0.50); $by2 = (int)($h * 0.95);
                    $bTint = imagecreatetruecolor($w, $by2 - $by1);
                    $bc = imagecolorallocatealpha($bTint, $botRgb[0], $botRgb[1], $botRgb[2], 65);
                    imagefilledrectangle($bTint, 0, 0, $w, $by2 - $by1, $bc);
                    imagecopymerge($out, $bTint, 0, $by1, 0, 0, $w, $by2 - $by1, 50);
                    imagedestroy($bTint);
                } else {
                    $y1 = (int)($h * 0.24); $y2 = (int)($h * 0.95);
                    $tint = imagecreatetruecolor($w, $y2 - $y1);
                    $c = imagecolorallocatealpha($tint, $rgb[0], $rgb[1], $rgb[2], 65);
                    imagefilledrectangle($tint, 0, 0, $w, $y2 - $y1, $c);
                    imagecopymerge($out, $tint, 0, $y1, 0, 0, $w, $y2 - $y1, 50);
                    imagedestroy($tint);
                }

                ob_start();
                imagejpeg($out, null, 92);
                $resData = ob_get_clean();
                imagedestroy($im);
                imagedestroy($out);

                if ($resData) {
                    return 'data:image/jpeg;base64,' . base64_encode($resData);
                }
            }
        }

        return $image;
    }

    /**
     * Generate an intelligent inpainting mask (focusing on torso, legs, or whole garment area)
     */
    public static function generateGarmentMask(string $sourceImage, string $targetSection = 'full'): string {
        $w = 512;
        $h = 768;

        if (strpos($sourceImage, 'data:image') === 0) {
            $parts = explode(',', $sourceImage, 2);
            if (count($parts) === 2) {
                $bin = base64_decode($parts[1]);
                $size = @getimagesizefromstring($bin);
                if ($size && !empty($size[0]) && !empty($size[1])) {
                    $w = $size[0];
                    $h = $size[1];
                }
            }
        }

        $im = imagecreatetruecolor($w, $h);
        $black = imagecolorallocate($im, 0, 0, 0);
        $white = imagecolorallocate($im, 255, 255, 255);
        imagefill($im, 0, 0, $black);

        $x1 = (int)($w * 0.18);
        $x2 = (int)($w * 0.82);

        if ($targetSection === 'top') {
            $y1 = (int)($h * 0.24);
            $y2 = (int)($h * 0.54);
        } elseif ($targetSection === 'bottom') {
            $y1 = (int)($h * 0.50);
            $y2 = (int)($h * 0.95);
        } else {
            // full or dual
            $y1 = (int)($h * 0.24);
            $y2 = (int)($h * 0.95);
        }

        imagefilledrectangle($im, $x1, $y1, $x2, $y2, $white);

        ob_start();
        imagepng($im);
        $maskData = ob_get_clean();
        imagedestroy($im);

        return 'data:image/png;base64,' . base64_encode($maskData);
    }

    /**
     * Automated Subject Segmentation & Background Removal (Fal.ai BiRefNet / RMBG)
     * Isolates person and outfit, removing complex studio/background elements.
     * Returns array with status, base64 transparent PNG, and image_url.
     */
    public static function removeBackground(string $image): array {
        $apiKey = self::getApiKey();
        if (empty($apiKey)) {
            return ['status' => 'error', 'message' => 'FAL_KEY is not configured in backend environment.'];
        }

        $normalized = self::normalizeImage($image);
        if (empty($normalized)) {
            return ['status' => 'error', 'message' => 'Invalid or empty image for background removal.'];
        }

        $endpoints = [
            'https://fal.run/fal-ai/birefnet',
            'https://fal.run/fal-ai/imageutils/rembg'
        ];

        foreach ($endpoints as $ep) {
            $payload = ['image_url' => $normalized];
            $res = self::sendRequest($ep, $payload, $apiKey, 60);

            if ($res['http_code'] === 200 && !empty($res['data'])) {
                $data = $res['data'];
                $url = $data['image']['url'] ?? ($data['images'][0]['url'] ?? null);
                if (!empty($url)) {
                    $ch = curl_init($url);
                    curl_setopt_array($ch, [
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT        => 30,
                        CURLOPT_SSL_VERIFYPEER => false,
                        CURLOPT_SSL_VERIFYHOST => false
                    ]);
                    $bytes = curl_exec($ch);
                    curl_close($ch);

                    if ($bytes && strlen($bytes) > 100) {
                        return [
                            'status'    => 'success',
                            'image_url' => $url,
                            'base64'    => base64_encode($bytes),
                            'data_uri'  => 'data:image/png;base64,' . base64_encode($bytes)
                        ];
                    }
                }
            }
        }

        return ['status' => 'error', 'message' => 'Fal.ai background removal returned no valid image.'];
    }

    /**
     * Shared cURL Request Handler
     */
    private static function sendRequest(string $url, array $payload, string $apiKey, int $timeout = 180): array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Key ' . $apiKey
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false
        ]);

        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return [
                'http_code' => 0,
                'data'      => ['detail' => 'cURL connection error: ' . $err]
            ];
        }

        $decoded = json_decode($body, true);
        return [
            'http_code' => $code,
            'data'      => $decoded ?: ['detail' => $body]
        ];
    }
}
}