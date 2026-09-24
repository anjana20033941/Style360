<?php /* Contributor: Member 2 (Core Backend & Database Architect) */ ?>
﻿<?php
/**
 * Style360 — Sign Out & Session Destruction API (backend/logout.php)
 * Completely destroys the active PHP session, invalidates cookies, and clears cache.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 1. Unset all session variables
$_SESSION = [];

// 2. Clear Session Cookie if cookies are enabled
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params["path"] ?: '/',
        $params["domain"] ?: '',
        $params["secure"] ?: false,
        $params["httponly"] ?: true
    );
}

// 3. Completely destroy the PHP session
if (session_status() === PHP_SESSION_ACTIVE) {
    session_destroy();
}

// 4. Return clean unauthenticated response
echo json_encode([
    "status" => "success",
    "authenticated" => false,
    "user" => null,
    "message" => "Session successfully destroyed and logged out."
]);
exit;
