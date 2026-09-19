<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/database.php';

if (!$conn) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database connection failed'
    ], JSON_PRETTY_PRINT);
    exit;
}

try {
    $dbNameStmt = $conn->query("SELECT DATABASE()");
    $currentDb = $dbNameStmt->fetchColumn();

    $tablesStmt = $conn->query("SHOW TABLES");
    $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

    $tableDetails = [];
    foreach ($tables as $t) {
        $countStmt = $conn->query("SELECT COUNT(*) FROM `{$t}`");
        $count = $countStmt->fetchColumn();

        $colsStmt = $conn->query("DESCRIBE `{$t}`");
        $columns = $colsStmt->fetchAll(PDO::FETCH_ASSOC);

        $tableDetails[$t] = [
            'row_count' => (int)$count,
            'columns' => array_map(function($col) {
                return $col['Field'] . ' (' . $col['Type'] . ')';
            }, $columns)
        ];
    }

    echo json_encode([
        'status' => 'connected',
        'database' => $currentDb,
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'tables_count' => count($tables),
        'tables' => $tableDetails
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
