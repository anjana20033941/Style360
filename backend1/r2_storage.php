<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

/**
 * Style360 — Cloudflare R2 S3-Compatible Object Storage Handler
 * Uses AWS Signature Version 4 to upload and manage 3D GLB assets on Cloudflare R2.
 */

require_once __DIR__ . '/config.php';

function uploadToCloudflareR2($localFilePath, $r2ObjectKey, $contentType = 'model/gltf-binary') {
    if (!defined('CLOUDFLARE_R2_ENABLED') || !CLOUDFLARE_R2_ENABLED) {
        error_log("[Style360 R2] Cloudflare R2 storage is disabled in config.php");
        return null;
    }

    $accountId = defined('CLOUDFLARE_R2_ACCOUNT_ID') ? CLOUDFLARE_R2_ACCOUNT_ID : '';
    $accessKey = defined('CLOUDFLARE_R2_ACCESS_KEY_ID') ? CLOUDFLARE_R2_ACCESS_KEY_ID : '';
    $secretKey = defined('CLOUDFLARE_R2_SECRET_ACCESS_KEY') ? CLOUDFLARE_R2_SECRET_ACCESS_KEY : '';
    $bucket    = defined('CLOUDFLARE_R2_BUCKET_NAME') ? CLOUDFLARE_R2_BUCKET_NAME : 'style360-assets';
    $publicUrl = defined('CLOUDFLARE_R2_PUBLIC_URL') ? rtrim(CLOUDFLARE_R2_PUBLIC_URL, '/') : '';

    if (!file_exists($localFilePath) || filesize($localFilePath) === 0) {
        error_log("[Style360 R2] Local file missing or empty: $localFilePath");
        return null;
    }

    $r2ObjectKey = ltrim($r2ObjectKey, '/');
    $fileData    = file_get_contents($localFilePath);
    $payloadHash = hash('sha256', $fileData);

    $region    = 'auto';
    $service   = 's3';
    $host      = "{$accountId}.r2.cloudflarestorage.com";
    $uriPath   = "/" . $bucket . "/" . $r2ObjectKey;
    $endpoint  = "https://{$host}{$uriPath}";

    $time      = time();
    $amzDate   = gmdate('Ymd\THis\Z', $time);
    $dateStamp = gmdate('Ymd', $time);

    // AWS Signature V4 Canonical Request
    $canonicalHeaders = "content-type:{$contentType}\n" .
                        "host:{$host}\n" .
                        "x-amz-content-sha256:{$payloadHash}\n" .
                        "x-amz-date:{$amzDate}\n";
    $signedHeaders   = "content-type;host;x-amz-content-sha256;x-amz-date";

    $canonicalRequest = "PUT\n" .
                        $uriPath . "\n" .
                        "\n" .
                        $canonicalHeaders . "\n" .
                        $signedHeaders . "\n" .
                        $payloadHash;

    $algorithm      = "AWS4-HMAC-SHA256";
    $credentialScope= "{$dateStamp}/{$region}/{$service}/aws4_request";
    $stringToSign   = "{$algorithm}\n{$amzDate}\n{$credentialScope}\n" . hash('sha256', $canonicalRequest);

    // Signing Key calculation
    $kSecret  = "AWS4" . $secretKey;
    $kDate    = hash_hmac('sha256', $dateStamp, $kSecret, true);
    $kRegion  = hash_hmac('sha256', $region, $kDate, true);
    $kService = hash_hmac('sha256', $service, $kRegion, true);
    $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
    $signature= hash_hmac('sha256', $stringToSign, $kSigning);

    $authorizationHeader = "{$algorithm} Credential={$accessKey}/{$credentialScope}, SignedHeaders={$signedHeaders}, Signature={$signature}";

    // Execute HTTP PUT upload via cURL
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => $fileData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER     => [
            "Content-Type: {$contentType}",
            "Host: {$host}",
            "x-amz-date: {$amzDate}",
            "x-amz-content-sha256: {$payloadHash}",
            "Authorization: {$authorizationHeader}"
        ],
        CURLOPT_TIMEOUT => 300
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $finalPublicUrl = "{$publicUrl}/{$r2ObjectKey}";
        error_log("[Style360 R2 Upload Success] HTTP {$httpCode} | R2 Key: {$r2ObjectKey} → Public URL: {$finalPublicUrl}");
        return $finalPublicUrl;
    } else {
        error_log("[Style360 R2 Upload Error] HTTP {$httpCode}, Response: {$response}, cURL Error: {$curlErr}");
        return "{$publicUrl}/{$r2ObjectKey}";
    }
}
?>
