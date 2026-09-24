<?php
/**
 * Style360 Backend
 * Contributor: Member 2 (Core Backend & Database Architect)
 */

// Style360 — Live Database Viewer Page
require_once __DIR__ . '/database.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Style360 — Live Database Inspection</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8f6ff; color: #1e1b4b; padding: 2rem; }
        h1 { color: #7c3aed; margin-bottom: 0.5rem; }
        p.sub { color: #64748b; margin-bottom: 2rem; }
        .table-card { background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(124,58,237,0.06); padding: 1.5rem; margin-bottom: 2rem; }
        .table-card h2 { font-size: 1.2rem; color: #4c1d95; margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
        th { background: #f3e8ff; color: #6b21a8; padding: 10px 14px; font-weight: 700; border-radius: 6px; }
        td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; word-break: break-all; }
        tr:hover td { background: #fdf4ff; }
        .empty-row { color: #94a3b8; font-style: italic; }
    </style>
</head>
<body>

    <h1>📊 Style360 Official Database Inspector</h1>
    <p class="sub">Database: <strong>style360_db</strong> | 4 Core Diagram Tables: <strong>User, Session, Garment, TryOn</strong></p>

    <?php
    if (!$conn) {
        echo '<div class="table-card" style="border-left: 4px solid #ef4444;">';
        echo '<h2 style="color:#ef4444;">⚠️ MySQL Connection Not Ready</h2>';
        echo '<p>Could not connect to MySQL server at <code>localhost</code>. Please ensure XAMPP MySQL service is running.</p>';
        echo '<p><a href="init_db.php" target="_blank" style="display:inline-block; background:#7c3aed; color:#fff; padding:8px 16px; border-radius:8px; text-decoration:none; font-weight:600;">Run Database Setup (init_db.php)</a></p>';
        echo '</div>';
    } else {
        $tables = ['User', 'Session', 'Garment', 'TryOn'];

        foreach ($tables as $tbl) {
            echo '<div class="table-card">';
            echo '<h2>Table: <strong>' . $tbl . '</strong></h2>';
            
            try {
                $stmt = $conn->query("SELECT * FROM `$tbl` ORDER BY Id DESC LIMIT 50");
                $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

                if (empty($rows)) {
                    echo '<p class="empty-row">No records found in table `' . $tbl . '` yet.</p>';
                } else {
                    echo '<table><thead><tr>';
                    $keys = array_keys($rows[0]);
                    foreach ($keys as $k) {
                        echo '<th>' . htmlspecialchars($k) . '</th>';
                    }
                    echo '</tr></thead><tbody>';

                    foreach ($rows as $row) {
                        echo '<tr>';
                        foreach ($row as $val) {
                            echo '<td>' . (is_null($val) ? '<span style="color:#cbd5e1;">NULL</span>' : htmlspecialchars($val)) . '</td>';
                        }
                        echo '</tr>';
                    }
                    echo '</tbody></table>';
                }
            } catch (Exception $e) {
                echo '<p style="color:#ef4444;">Table missing or uninitialized: ' . htmlspecialchars($e->getMessage()) . '</p>';
                echo '<p><a href="init_db.php" target="_blank" style="display:inline-block; background:#7c3aed; color:#fff; padding:6px 12px; border-radius:6px; text-decoration:none; font-size:0.85rem;">Initialize `' . $tbl . '` Table</a></p>';
            }
            echo '</div>';
        }
    }
    ?>

</body>
</html>
