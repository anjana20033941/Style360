<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

ini_set("display_errors", "0");
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);

// Load .env if present
$envPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $val) = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val, " \t\n\r\0\x0B\"'");
            if (!isset($_ENV[$key])) {
                $_ENV[$key] = $val;
                putenv("$key=$val");
            }
        }
    }
}

// Helpers
function get_cfg($key, $default) {
    $val = getenv($key);
    return ($val !== false && $val !== '') ? $val : $default;
}

// =============================================
// Style360 - API Configuration
// =============================================

define("GEMINI_API_KEY", get_cfg("GEMINI_API_KEY", ""));
define("HF_API_TOKEN",   get_cfg("HF_API_TOKEN", ""));
define("GEMINI_MODEL",   get_cfg("GEMINI_MODEL", "gemini-2.0-flash"));
define("REPLICATE_API_TOKEN", get_cfg("REPLICATE_API_TOKEN", ""));
define("REPLICATE_MODEL_RODIN", get_cfg("REPLICATE_MODEL_RODIN", "deemos/rodin"));

// Mock Simulation Mode
define("MOCK_VTON", get_cfg("MOCK_VTON", "false") === "true");

// Fal.ai & Tripo3D
define("FAL_KEY", get_cfg("FAL_KEY", ""));
define("TRIPO3D_API_KEY", get_cfg("TRIPO3D_API_KEY", get_cfg("TRIPO_API_KEY", "")));
define("TRIPO_API_KEY", defined("TRIPO3D_API_KEY") ? TRIPO3D_API_KEY : get_cfg("TRIPO_API_KEY", ""));

// =============================================
// Modal.com Unified AI Pipeline
// =============================================
define("USE_MODAL", get_cfg("USE_MODAL", "true") === "true");
define("MODAL_PIPELINE_URL", get_cfg("MODAL_PIPELINE_URL", "https://anjana20033941--style360-pipeline.modal.run"));
define("MODAL_SF3D_URL", get_cfg("MODAL_SF3D_URL", "https://anjana20033941--style360-reconstruct3d.modal.run"));
define("MODAL_HEALTH_URL", get_cfg("MODAL_HEALTH_URL", "https://anjana20033941--style360-health.modal.run"));
define("MODAL_MULTIVIEW_URL", get_cfg("MODAL_MULTIVIEW_URL", "https://anjana20033941--style360-reconstruct3d-multiview.modal.run"));
define("MODAL_DEBUG_PREVIEW_URL", get_cfg("MODAL_DEBUG_PREVIEW_URL", "https://anjana20033941--style360-debug-preview.modal.run"));
define("MODAL_TRELLIS_URL", get_cfg("MODAL_TRELLIS_URL", "https://anjana20033941--style360-trellis-pipeline-trellismodel-r-0d7544.modal.run"));
define("MODAL_HUNYUAN3D_URL", get_cfg("MODAL_HUNYUAN3D_URL", "https://anjana20033941--style360-hunyuan3d-pipeline-hunyuan3dmod-f69dcc.modal.run"));

// Legacy / fallback
define("USE_COLAB", get_cfg("USE_COLAB", "false") === "true");
define("COLAB_GPU_URL", get_cfg("COLAB_GPU_URL", ""));
define("COLAB_VTON_URL", get_cfg("COLAB_VTON_URL", ""));

// =============================================
// Cloudflare R2 Object Storage Configuration
// =============================================
define("CLOUDFLARE_R2_ENABLED", get_cfg("CLOUDFLARE_R2_ENABLED", "true") === "true");
define("CLOUDFLARE_R2_ACCOUNT_ID", get_cfg("CLOUDFLARE_R2_ACCOUNT_ID", ""));
define("CLOUDFLARE_R2_ACCESS_KEY_ID", get_cfg("CLOUDFLARE_R2_ACCESS_KEY_ID", ""));
define("CLOUDFLARE_R2_SECRET_ACCESS_KEY", get_cfg("CLOUDFLARE_R2_SECRET_ACCESS_KEY", ""));
define("CLOUDFLARE_R2_BUCKET_NAME", get_cfg("CLOUDFLARE_R2_BUCKET_NAME", "style360-assets"));
define("CLOUDFLARE_R2_PUBLIC_URL", get_cfg("CLOUDFLARE_R2_PUBLIC_URL", ""));
?>
