<?php
/**
 * Style360 – Cloth Simulation Proxy
 * Calls the Modal.com cloth-sim endpoint to drape a garment GLB over an avatar GLB.
 *
 * POST body (JSON):
 *   { "avatar_url": "...", "shirt_url": "...", "cloth_frames": 30 }
 *
 * Returns (JSON):
 *   { "status": "success", "r2_url": "...", "size_kb": ... }
 *   { "status": "error",   "message": "..." }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); echo json_encode(['status'=>'error','message'=>'POST required']); exit; }

/* ── Parse input ─────────────────────────────────────────────────────────── */
$body = json_decode(file_get_contents('php://input'), true);
$avatar_url   = trim($body['avatar_url']   ?? '');
$shirt_url    = trim($body['shirt_url']    ?? '');
$cloth_frames = intval($body['cloth_frames'] ?? 30);

if (!$avatar_url || !$shirt_url) {
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>'avatar_url and shirt_url are required']);
    exit;
}

/* ── Modal cloth sim endpoint ─────────────────────────────────────────────── */
$MODAL_CLOTH_SIM_URL = 'https://anjana20033941--style360-cloth-sim.modal.run';

/* ── Call Modal with a long timeout (simulation takes 60-120 s) ──────────── */
$payload = json_encode([
    'avatar_url'   => $avatar_url,
    'shirt_url'    => $shirt_url,
    'cloth_frames' => max(10, min(60, $cloth_frames))
]);

$ch = curl_init($MODAL_CLOTH_SIM_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Content-Length: ' . strlen($payload)],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 300,      // 5 min timeout – cloth sim may take 2-3 min cold-start
    CURLOPT_CONNECTTIMEOUT => 30,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    error_log('[Style360 ClothSim] cURL error: ' . $curlErr);
    echo json_encode(['status'=>'error','message'=>'Cloth simulation request failed: ' . $curlErr]);
    exit;
}

$result = json_decode($response, true);

if ($httpCode !== 200 || !$result) {
    error_log('[Style360 ClothSim] Modal error (' . $httpCode . '): ' . $response);
    echo json_encode(['status'=>'error','message'=>'Modal cloth sim returned HTTP ' . $httpCode, 'raw'=>substr($response,0,300)]);
    exit;
}

// Pass through Modal response to frontend
echo json_encode($result);
