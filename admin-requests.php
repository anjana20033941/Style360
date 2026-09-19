<?php
/**
 * Style360 - Admin Panel: Custom Outfit Requests & Analytics (admin-requests.php)
 * Restricts access to role === 'admin'.
 * Displays User Custom Requests data table (Pending/Completed) and User Analytics.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/backend/database.php';

// Server-side Admin Auth Verification
$sessionUser = $_SESSION['user'] ?? null;
$isAdmin = ($sessionUser && ($sessionUser['role'] === 'admin' || !empty($sessionUser['is_admin'])));

// ── Analytics Queries (PDO) ──
$totalRequests = 0;
$pendingReviewCount = 0;
$inDesignCount = 0;
$readyDownloadCount = 0;
$totalTryons = 0;
$popularGarments = [];
$categoryDistribution = [];

if ($conn) {
    try {
        // Request counts across 3 lifecycle stages
        $reqCountStmt = $conn->query("SELECT status, COUNT(*) as cnt FROM custom_requests GROUP BY status");
        while ($r = $reqCountStmt->fetch(PDO::FETCH_ASSOC)) {
            $cnt = (int)$r['cnt'];
            $st = strtolower(trim($r['status']));
            if ($st === 'pending review' || $st === 'pending') $pendingReviewCount += $cnt;
            elseif ($st === 'in design') $inDesignCount += $cnt;
            elseif ($st === 'ready for download' || $st === 'completed') $readyDownloadCount += $cnt;
            $totalRequests += $cnt;
        }

        // Try-on count
        $tryCountStmt = $conn->query("SELECT COUNT(*) as cnt FROM try_on_history");
        $tryRow = $tryCountStmt->fetch(PDO::FETCH_ASSOC);
        $totalTryons = $tryRow ? (int)$tryRow['cnt'] : 0;

        // Most Popular Outfits (Most tried-on garments)
        $popStmt = $conn->query("
            SELECT g.id, g.title, g.category, g.gender, g.display_image_url, 
                   COUNT(t.id) as tryon_count,
                   (SELECT COUNT(*) FROM custom_requests cr WHERE cr.outfit_id = g.id) as custom_req_count
            FROM garment g
            LEFT JOIN try_on_history t ON g.id = t.garment_id
            GROUP BY g.id
            ORDER BY tryon_count DESC, custom_req_count DESC, g.id DESC
            LIMIT 6
        ");
        $popularGarments = $popStmt->fetchAll(PDO::FETCH_ASSOC);

        // Category distribution
        $catStmt = $conn->query("
            SELECT category, COUNT(*) as garment_count 
            FROM garment 
            GROUP BY category
            ORDER BY garment_count DESC
        ");
        $categoryDistribution = $catStmt->fetchAll(PDO::FETCH_ASSOC);

    } catch (Exception $e) {
        // Fallback gracefully if database has empty tables
    }
}

// Compute total garments for percentage bars
$totalGarmentCount = array_sum(array_column($categoryDistribution, 'garment_count')) ?: 1;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Style360 Admin — Custom Requests & Analytics</title>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    
    <link rel="stylesheet" href="frontend/css/style.css?v=6" />
    <link rel="stylesheet" href="frontend/css/admin.css?v=2" />

    <style>
        .admin-nav-tabs {
            display: flex;
            gap: 8px;
            margin-top: 14px;
        }
        .admin-nav-tab {
            padding: 8px 16px;
            font-size: 0.85rem;
            font-weight: 600;
            color: #64748B;
            background: #F1F5F9;
            border-radius: 8px;
            text-decoration: none;
            transition: all 0.2s ease;
        }
        .admin-nav-tab:hover {
            color: #7C3AED;
            background: #EDE9FE;
        }
        .admin-nav-tab.active {
            color: #FFFFFF;
            background: #7C3AED;
            box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25);
        }

        /* Analytics Section Layout */
        .analytics-grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 24px;
            margin-bottom: 28px;
        }
        @media (max-width: 1024px) {
            .analytics-grid {
                grid-template-columns: 1fr;
            }
        }

        /* Popular Outfits List */
        .popular-outfits-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .popular-outfit-item {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 10px 14px;
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .popular-outfit-item:hover {
            border-color: #C4B5FD;
            transform: translateX(3px);
            background: #FFFFFF;
        }
        .popular-rank-badge {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 700;
            background: #EDE9FE;
            color: #6D28D9;
            flex-shrink: 0;
        }
        .popular-thumb {
            width: 46px;
            height: 46px;
            border-radius: 8px;
            object-fit: cover;
            border: 1px solid #E2E8F0;
            background: #EDE9FE;
        }
        .popular-meta {
            flex: 1;
            min-width: 0;
        }
        .popular-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: #1E293B;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .popular-sub {
            font-size: 0.74rem;
            color: #64748B;
            display: flex;
            gap: 8px;
            margin-top: 2px;
        }
        .popular-metrics {
            text-align: right;
            flex-shrink: 0;
        }
        .popular-tryon-count {
            font-size: 0.95rem;
            font-weight: 800;
            color: #7C3AED;
        }
        .popular-tryon-label {
            font-size: 0.7rem;
            color: #94A3B8;
            text-transform: uppercase;
            font-weight: 600;
        }

        /* Category Distribution Bars */
        .category-dist-list {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .dist-item-head {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            font-weight: 600;
            color: #334155;
            margin-bottom: 6px;
        }
        .dist-bar-track {
            width: 100%;
            height: 10px;
            background: #E2E8F0;
            border-radius: 999px;
            overflow: hidden;
        }
        .dist-bar-fill {
            height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, #7C3AED, #A855F7);
            transition: width 0.6s ease;
        }

        /* Requests Table Styling */
        .requests-table-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
            margin-bottom: 40px;
        }
        .requests-filter-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 14px;
            margin-bottom: 20px;
        }
        .filter-buttons-group {
            display: flex;
            gap: 6px;
            background: #F1F5F9;
            padding: 4px;
            border-radius: 10px;
        }
        .btn-filter-req {
            padding: 6px 14px;
            font-size: 0.8rem;
            font-weight: 600;
            border-radius: 8px;
            border: none;
            background: transparent;
            color: #64748B;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .btn-filter-req.active {
            background: #FFFFFF;
            color: #1E293B;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .req-table-wrap {
            overflow-x: auto;
            border-radius: 10px;
            border: 1px solid #E2E8F0;
        }
        .requests-data-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 0.86rem;
        }
        .requests-data-table th {
            background: #F8FAFC;
            color: #475569;
            font-weight: 700;
            padding: 12px 14px;
            border-bottom: 1.5px solid #E2E8F0;
            white-space: nowrap;
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }
        .requests-data-table td {
            padding: 14px;
            border-bottom: 1px solid #F1F5F9;
            vertical-align: middle;
            color: #1E293B;
        }
        .requests-data-table tr:hover td {
            background: #FAF8FF;
        }
        .outfit-cell {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .outfit-cell-thumb {
            width: 42px;
            height: 42px;
            border-radius: 6px;
            object-fit: cover;
            border: 1px solid #E2E8F0;
        }
        .color-chips-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .color-chip-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.75rem;
            background: #F8FAFC;
            padding: 3px 8px;
            border-radius: 6px;
            border: 1px solid #E2E8F0;
            width: fit-content;
        }
        .color-dot-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 1px solid rgba(0,0,0,0.15);
            flex-shrink: 0;
        }
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.74rem;
            font-weight: 700;
            letter-spacing: 0.02em;
        }
        .status-badge.pending_review {
            background: #FEF3C7;
            color: #92400E;
            border: 1px solid #FDE68A;
        }
        .status-badge.in_design {
            background: #DBEAFE;
            color: #1E40AF;
            border: 1px solid #BFDBFE;
        }
        .status-badge.ready_for_download {
            background: #DCFCE7;
            color: #166534;
            border: 1px solid #BBF7D0;
        }

        /* 3-Stage Lifecycle Dropdown */
        .admin-status-select {
            padding: 7px 10px;
            font-size: 0.8rem;
            font-weight: 700;
            border-radius: 8px;
            border: 1.5px solid #CBD5E1;
            background: #FFFFFF;
            color: #1E293B;
            cursor: pointer;
            outline: none;
            transition: all 0.2s ease;
        }
        .admin-status-select:hover {
            border-color: #7C3AED;
        }
        .admin-status-select.st-pending-review {
            border-color: #F59E0B;
            background: #FFFBEB;
            color: #92400E;
        }
        .admin-status-select.st-in-design {
            border-color: #3B82F6;
            background: #EFF6FF;
            color: #1E40AF;
        }
        .admin-status-select.st-ready-download {
            border-color: #10B981;
            background: #ECFDF5;
            color: #047857;
        }

        /* Completed Dress Upload & Thumbnail Styles */
        .dress-upload-cell {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .dress-thumb-preview {
            width: 44px;
            height: 44px;
            border-radius: 8px;
            object-fit: cover;
            border: 2px solid #10B981;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
            transition: transform 0.2s ease;
        }
        .dress-thumb-preview:hover {
            transform: scale(1.1);
        }
        .btn-upload-dress-trigger {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 6px 10px;
            font-size: 0.74rem;
            font-weight: 700;
            border-radius: 6px;
            border: 1px solid #CBD5E1;
            background: #FFFFFF;
            color: #475569;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .btn-upload-dress-trigger:hover {
            border-color: #7C3AED;
            color: #7C3AED;
            background: #F5F3FF;
        }
        .btn-upload-dress-trigger.uploaded {
            border-color: #10B981;
            color: #059669;
            background: #F0FDF4;
        }

        /* Dress Upload Modal */
        .dress-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(6px);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .dress-modal-dialog {
            background: #FFFFFF;
            border-radius: 16px;
            max-width: 480px;
            width: 100%;
            padding: 24px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            border: 1px solid #E2E8F0;
        }
        .dress-dropzone {
            border: 2px dashed #CBD5E1;
            border-radius: 12px;
            padding: 24px 16px;
            text-align: center;
            background: #F8FAFC;
            cursor: pointer;
            transition: all 0.2s ease;
            margin: 16px 0;
        }
        .dress-dropzone:hover {
            border-color: #7C3AED;
            background: #FAF8FF;
        }
        .dress-preview-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .dress-preview-img {
            max-height: 180px;
            border-radius: 8px;
            object-fit: contain;
            border: 1px solid #E2E8F0;
        }
        .empty-requests-state {
            text-align: center;
            padding: 48px 16px;
            color: #64748B;
        }
        .empty-icon {
            font-size: 2.2rem;
            margin-bottom: 8px;
        }

        /* Access Denied Card */
        .access-denied-wrap {
            max-width: 520px;
            margin: 80px auto;
            background: #FFFFFF;
            border-radius: 16px;
            padding: 40px 32px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            border: 1px solid #E2E8F0;
        }
        .access-denied-icon {
            font-size: 3rem;
            margin-bottom: 16px;
        }
    </style>

    <script>
        // Client-side Role Check
        (function () {
            try {
                var raw = localStorage.getItem('style360_user');
                var u = raw ? JSON.parse(raw) : null;
                var isAdmin = !!(u && (u.role === 'admin' || u.is_admin === true || u.is_admin === 1 || u.is_admin === '1'));
                if (!isAdmin) {
                    window.__STYLE360_IS_ADMIN = false;
                } else {
                    window.__STYLE360_IS_ADMIN = true;
                }
            } catch (e) {
                window.__STYLE360_IS_ADMIN = false;
            }
        })();
    </script>
</head>
<body class="admin-body">

    <!-- Client-side Guard Warning (if not admin) -->
    <div id="admin-access-guard" style="display:none;">
        <div class="access-denied-wrap">
            <div class="access-denied-icon">🔒</div>
            <h2 style="font-size: 1.4rem; font-weight: 800; color: #1E293B; margin-bottom: 8px;">Administrator Access Required</h2>
            <p style="font-size: 0.9rem; color: #64748B; margin-bottom: 24px; line-height: 1.5;">
                This section is restricted to Style360 administrators. Please sign in with an administrator account to view custom outfit requests and analytics.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <a href="frontend/login.html" class="btn-admin-primary" style="text-decoration:none;">Sign In as Admin</a>
                <a href="frontend/index.html" class="btn-admin-secondary" style="text-decoration:none;">Go to Storefront</a>
            </div>
        </div>
    </div>

    <div id="admin-content-wrap">
        <!-- Admin Header -->
        <header class="admin-header">
            <div class="admin-header-inner">
                <div class="admin-brand">
                    <a href="frontend/index.html" class="admin-logo-link">
                        <img src="frontend/images/user_logo.jpeg" alt="Style360 Logo" class="admin-logo-img" />
                    </a>
                    <div class="admin-badge-wrap">
                        <span class="admin-pill-badge">ADMIN CONSOLE</span>
                        <h1 class="admin-header-title">Custom Requests &amp; Analytics</h1>
                        <!-- Navigation Tabs between Admin views -->
                        <div class="admin-nav-tabs">
                            <a href="frontend/admin.html" class="admin-nav-tab">👗 Garment Catalog</a>
                            <a href="admin-requests.php" class="admin-nav-tab active">📋 Custom Requests &amp; Analytics</a>
                        </div>
                    </div>
                </div>
                <div class="admin-header-actions">
                    <a href="frontend/index.html" class="btn-admin-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="m12 5-7 7 7 7"/></svg>
                        View Storefront
                    </a>
                    <a href="frontend/index.html#tryon" class="btn-admin-primary">
                        ⚡ Open Studio
                    </a>
                </div>
            </div>
        </header>

        <!-- Main Admin Container -->
        <main class="admin-main">

            <!-- Stat Overview Cards -->
            <section class="admin-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon-wrap violet">📋</div>
                    <div class="stat-content">
                        <span class="stat-label">Total Custom Requests</span>
                        <h3 class="stat-value" id="kpi-total-requests"><?= $totalRequests ?></h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon-wrap amber">⏳</div>
                    <div class="stat-content">
                        <span class="stat-label">Pending Review</span>
                        <h3 class="stat-value" id="kpi-pending-requests"><?= $pendingReviewCount ?></h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon-wrap pink">🎨</div>
                    <div class="stat-content">
                        <span class="stat-label">In Design</span>
                        <h3 class="stat-value" id="kpi-in-design-requests"><?= $inDesignCount ?></h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon-wrap emerald">✅</div>
                    <div class="stat-content">
                        <span class="stat-label">Ready for Download</span>
                        <h3 class="stat-value" id="kpi-ready-requests"><?= $readyDownloadCount ?></h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon-wrap indigo">✨</div>
                    <div class="stat-content">
                        <span class="stat-label">Virtual Try-Ons</span>
                        <h3 class="stat-value"><?= $totalTryons ?></h3>
                    </div>
                </div>
            </section>

            <!-- User Analytics Grid: Popular Outfits & Category Distribution -->
            <section class="analytics-grid">

                <!-- Left: Most Popular Outfits (Most Tried-On) -->
                <div class="admin-card">
                    <div class="admin-card-head between">
                        <div>
                            <h2 class="admin-card-title">🔥 Most Popular Outfits</h2>
                            <p class="admin-card-sub">Top try-on demand &amp; customer customization interest</p>
                        </div>
                        <span style="font-size:0.75rem; font-weight:700; color:#7C3AED; background:#EDE9FE; padding:4px 10px; border-radius:12px;">Live Ranked</span>
                    </div>

                    <div class="popular-outfits-list" id="popular-outfits-list">
                        <?php if (empty($popularGarments)): ?>
                            <div style="text-align:center; padding:2rem; color:#94A3B8;">No try-on history recorded yet.</div>
                        <?php else: ?>
                            <?php foreach ($popularGarments as $idx => $g): 
                                $displayImg = htmlspecialchars($g['display_image_url'] ?? 'frontend/images/hero_couple.png');
                                if (strpos($displayImg, 'http') !== 0 && strpos($displayImg, '/') !== 0 && strpos($displayImg, 'frontend') !== 0) {
                                    $displayImg = '/' . $displayImg;
                                }
                            ?>
                                <div class="popular-outfit-item">
                                    <span class="popular-rank-badge"><?= $idx + 1 ?></span>
                                    <img src="<?= $displayImg ?>" alt="<?= htmlspecialchars($g['title']) ?>" class="popular-thumb" onerror="this.src='frontend/images/hero_couple.png'" />
                                    <div class="popular-meta">
                                        <div class="popular-title"><?= htmlspecialchars($g['title']) ?></div>
                                        <div class="popular-sub">
                                            <span><?= ucfirst($g['gender'] ?? 'Unisex') ?></span>
                                            <span>&bull;</span>
                                            <span style="text-transform:capitalize;"><?= htmlspecialchars($g['category'] ?? 'General') ?></span>
                                        </div>
                                    </div>
                                    <div class="popular-metrics">
                                        <div class="popular-tryon-count"><?= (int)$g['tryon_count'] ?></div>
                                        <div class="popular-tryon-label">Try-Ons</div>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Right: Category Distribution Breakdown -->
                <div class="admin-card">
                    <div class="admin-card-head">
                        <div class="card-head-icon">📊</div>
                        <div>
                            <h2 class="admin-card-title">Category Distribution</h2>
                            <p class="admin-card-sub">Catalog breakdown across fashion collections</p>
                        </div>
                    </div>

                    <div class="category-dist-list" style="margin-top: 10px;">
                        <?php 
                        $colors = [
                            'western'     => '#3B82F6',
                            'bridal'      => '#EC4899',
                            'casual'      => '#10B981',
                            'suits'       => '#7C3AED',
                            'indian'      => '#F59E0B',
                            'traditional' => '#6366F1'
                        ];
                        foreach ($categoryDistribution as $catRow): 
                            $catName = strtolower($catRow['category']);
                            $catLabel = ucfirst($catName);
                            if ($catName === 'bridal') $catLabel = 'Bridal & Formal';
                            if ($catName === 'suits')  $catLabel = 'Suits & Blazers';
                            $count = (int)$catRow['garment_count'];
                            $pct = round(($count / $totalGarmentCount) * 100, 1);
                            $fillColor = $colors[$catName] ?? '#7C3AED';
                        ?>
                            <div class="dist-item">
                                <div class="dist-item-head">
                                    <span><?= htmlspecialchars($catLabel) ?></span>
                                    <span><strong><?= $count ?></strong> outfits (<?= $pct ?>%)</span>
                                </div>
                                <div class="dist-bar-track">
                                    <div class="dist-bar-fill" style="width: <?= $pct ?>%; background: <?= $fillColor ?>;"></div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>

            </section>

            <!-- User Custom Outfit Requests Data Table -->
            <section class="requests-table-card">
                <div class="requests-filter-bar">
                    <div>
                        <h2 class="admin-card-title" style="margin-bottom:2px;">User Custom Outfit Requests</h2>
                        <p class="admin-card-sub">Customer color selections and bespoke tailoring notes</p>
                    </div>
                    
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                        <!-- Filter Tabs -->
                        <div class="filter-buttons-group">
                            <button type="button" class="btn-filter-req active" data-status="all" id="filter-all">
                                All (<span id="count-pill-all"><?= $totalRequests ?></span>)
                            </button>
                            <button type="button" class="btn-filter-req" data-status="pending review" id="filter-pending-review">
                                ⏳ Pending Review (<span id="count-pill-pending-review"><?= $pendingReviewCount ?></span>)
                            </button>
                            <button type="button" class="btn-filter-req" data-status="in design" id="filter-in-design">
                                🎨 In Design (<span id="count-pill-in-design"><?= $inDesignCount ?></span>)
                            </button>
                            <button type="button" class="btn-filter-req" data-status="ready for download" id="filter-ready-download">
                                ✅ Ready for Download (<span id="count-pill-ready-download"><?= $readyDownloadCount ?></span>)
                            </button>
                        </div>

                        <!-- Search Input -->
                        <div class="search-input-wrap" style="max-width:240px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            <input type="text" id="requests-search-input" placeholder="Search requests..." class="admin-search-field" style="font-size:0.82rem; padding:8px 12px 8px 34px;" />
                        </div>

                        <button type="button" class="btn-refresh-inventory" id="btn-refresh-requests" title="Reload requests table">
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                <!-- Table Container -->
                <div class="req-table-wrap">
                    <table class="requests-data-table">
                        <thead>
                            <tr>
                                <th>#ID</th>
                                <th>Date &amp; Time</th>
                                <th>Customer</th>
                                <th>Target Outfit</th>
                                <th>Selected Colors</th>
                                <th>Tailoring Notes</th>
                                <th>Status Lifecycle</th>
                                <th>Completed Dress</th>
                                <th style="text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="requests-table-body">
                            <tr>
                                <td colspan="9" style="text-align:center; padding:32px;">Loading custom requests...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

        </main>
    </div>

    <!-- Modal: Upload Completed Dress & Update Status -->
    <div id="modal-upload-dress" class="dress-modal-backdrop" style="display:none;">
        <div class="dress-modal-dialog">
            <div class="dress-modal-head">
                <h3 style="margin:0; font-size:1.1rem; font-weight:700; color:#1E293B;">Upload Completed Dress</h3>
                <button type="button" id="btn-close-upload-modal" style="background:none; border:none; font-size:1.3rem; cursor:pointer; color:#64748B;">&times;</button>
            </div>
            <form id="form-upload-dress" enctype="multipart/form-data">
                <input type="hidden" id="upload-request-id" name="id" value="" />
                <input type="hidden" name="action" value="update_status" />
                <div style="margin-bottom:1rem;">
                    <p style="font-size:0.85rem; color:#64748B; margin:0 0 0.6rem 0;" id="upload-request-summary">Attaching tailored outfit for Request #</p>
                    <label style="display:block; font-size:0.85rem; font-weight:600; color:#334155; margin-bottom:6px;">Status</label>
                    <select id="upload-status-select" name="status" class="admin-status-select" style="width:100%; padding:8px 12px; border:1.5px solid #CBD5E1; border-radius:8px;">
                        <option value="Ready for Download" selected>✅ Ready for Download (Notify User)</option>
                        <option value="In Design">🎨 In Design</option>
                        <option value="Pending Review">⏳ Pending Review</option>
                    </select>
                </div>
                <div style="margin-bottom:1.25rem;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; color:#334155; margin-bottom:6px;">Completed Dress Image <span style="color:#DC2626;">*</span></label>
                    <input type="file" id="upload-result-file" name="result_image" accept="image/*" required style="width:100%; font-size:0.85rem; padding:8px; border:1.5px dashed #CBD5E1; border-radius:8px; background:#F8FAFC;" />
                    <div id="upload-file-preview-wrap" style="display:none; margin-top:10px; text-align:center;">
                        <img id="upload-file-preview" src="" style="max-height:160px; border-radius:8px; border:1px solid #E2E8F0; object-fit:contain;" />
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" id="btn-cancel-upload-modal" class="btn-admin-secondary" style="padding:8px 16px;">Cancel</button>
                    <button type="submit" id="btn-submit-upload" class="btn-admin-primary" style="padding:8px 18px;">Upload &amp; Notify User</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Admin Toast -->
    <div id="admin-toast" class="admin-toast"></div>

    <script>
        (function () {
            'use strict';

            // Guard check
            var isUserAdmin = window.__STYLE360_IS_ADMIN;
            var guardWrap = document.getElementById('admin-access-guard');
            var contentWrap = document.getElementById('admin-content-wrap');

            if (!isUserAdmin && !<?= $isAdmin ? 'true' : 'false' ?>) {
                if (guardWrap) guardWrap.style.display = 'block';
                if (contentWrap) contentWrap.style.display = 'none';
                return;
            }

            var allRequests = [];
            var currentFilter = 'all';

            var tableBody    = document.getElementById('requests-table-body');
            var searchInput  = document.getElementById('requests-search-input');
            var btnRefresh   = document.getElementById('btn-refresh-requests');
            var filterBtns   = document.querySelectorAll('.btn-filter-req');
            var toast        = document.getElementById('admin-toast');

            var pillAll            = document.getElementById('count-pill-all');
            var pillPendingReview  = document.getElementById('count-pill-pending-review');
            var pillInDesign       = document.getElementById('count-pill-in-design');
            var pillReadyDownload  = document.getElementById('count-pill-ready-download');

            var kpiTotal    = document.getElementById('kpi-total-requests');
            var kpiPending  = document.getElementById('kpi-pending-requests');
            var kpiInDesign = document.getElementById('kpi-in-design-requests');
            var kpiReady    = document.getElementById('kpi-ready-requests');

            // Modal elements
            var uploadModal          = document.getElementById('modal-upload-dress');
            var uploadForm           = document.getElementById('form-upload-dress');
            var uploadReqId          = document.getElementById('upload-request-id');
            var uploadReqSummary     = document.getElementById('upload-request-summary');
            var uploadStatusSelect   = document.getElementById('upload-status-select');
            var uploadFileInput      = document.getElementById('upload-result-file');
            var uploadFilePreview    = document.getElementById('upload-file-preview');
            var uploadFilePreviewWrap= document.getElementById('upload-file-preview-wrap');
            var btnCloseUpload       = document.getElementById('btn-close-upload-modal');
            var btnCancelUpload      = document.getElementById('btn-cancel-upload-modal');

            function showToast(msg) {
                if (!toast) return;
                toast.textContent = msg;
                toast.classList.add('show');
                setTimeout(function () { toast.classList.remove('show'); }, 3000);
            }

            function openUploadModal(reqId, outfitTitle, defaultStatus) {
                if (!uploadModal) return;
                if (uploadReqId) uploadReqId.value = reqId;
                if (uploadReqSummary) {
                    uploadReqSummary.textContent = 'Upload completed dress for Request #' + reqId + (outfitTitle ? (' (' + outfitTitle + ')') : '');
                }
                if (uploadStatusSelect) {
                    uploadStatusSelect.value = defaultStatus || 'Ready for Download';
                }
                if (uploadFileInput) uploadFileInput.value = '';
                if (uploadFilePreviewWrap) uploadFilePreviewWrap.style.display = 'none';
                if (uploadFilePreview) uploadFilePreview.src = '';
                uploadModal.style.display = 'flex';
            }

            function closeUploadModal() {
                if (uploadModal) uploadModal.style.display = 'none';
                if (uploadForm) uploadForm.reset();
                if (uploadFilePreviewWrap) uploadFilePreviewWrap.style.display = 'none';
            }

            if (btnCloseUpload) btnCloseUpload.onclick = closeUploadModal;
            if (btnCancelUpload) btnCancelUpload.onclick = closeUploadModal;
            if (uploadModal) {
                uploadModal.onclick = function (e) {
                    if (e.target === uploadModal) closeUploadModal();
                };
            }

            // Preview selected image file
            if (uploadFileInput) {
                uploadFileInput.onchange = function () {
                    var file = uploadFileInput.files && uploadFileInput.files[0];
                    if (file) {
                        var reader = new FileReader();
                        reader.onload = function (e) {
                            if (uploadFilePreview) uploadFilePreview.src = e.target.result;
                            if (uploadFilePreviewWrap) uploadFilePreviewWrap.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    } else {
                        if (uploadFilePreviewWrap) uploadFilePreviewWrap.style.display = 'none';
                    }
                };
            }

            // Handle upload form submission
            if (uploadForm) {
                uploadForm.onsubmit = function (e) {
                    e.preventDefault();
                    var apiUrl = (window.location.pathname.indexOf('/style360') === 0) 
                        ? '/style360/api/custom-request' 
                        : '/api/custom-request';

                    var submitBtn = document.getElementById('btn-submit-upload');
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Uploading...';
                    }

                    var formData = new FormData(uploadForm);

                    fetch(apiUrl, {
                        method: 'POST',
                        body: formData
                    })
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Upload & Notify User';
                        }
                        if (data && data.status === 'success') {
                            closeUploadModal();
                            showToast('✓ Completed dress uploaded! User notified.');
                            fetchRequests();
                        } else {
                            showToast('⚠️ ' + (data.message || 'Upload failed'));
                        }
                    })
                    .catch(function (err) {
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Upload & Notify User';
                        }
                        console.error(err);
                        showToast('⚠️ Network error during upload.');
                    });
                };
            }

            // Fetch custom requests from backend API
            function fetchRequests() {
                var apiUrl = (window.location.pathname.indexOf('/style360') === 0) 
                    ? '/style360/api/custom-request' 
                    : '/api/custom-request';

                fetch(apiUrl)
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (data && data.status === 'success' && Array.isArray(data.requests)) {
                            allRequests = data.requests;

                            // Update count pills
                            if (data.counts) {
                                if (pillAll) pillAll.textContent = data.counts.all || 0;
                                if (pillPendingReview) pillPendingReview.textContent = data.counts.pending_review || data.counts.pending || 0;
                                if (pillInDesign) pillInDesign.textContent = data.counts.in_design || 0;
                                if (pillReadyDownload) pillReadyDownload.textContent = data.counts.ready_for_download || data.counts.completed || 0;

                                if (kpiTotal) kpiTotal.textContent = data.counts.all || 0;
                                if (kpiPending) kpiPending.textContent = data.counts.pending_review || data.counts.pending || 0;
                                if (kpiInDesign) kpiInDesign.textContent = data.counts.in_design || 0;
                                if (kpiReady) kpiReady.textContent = data.counts.ready_for_download || data.counts.completed || 0;
                            }

                            renderRequestsTable();
                        } else {
                            renderEmptyTable('No custom requests found.');
                        }
                    })
                    .catch(function (err) {
                        console.error('Failed to load requests:', err);
                        renderEmptyTable('Error connecting to database.');
                    });
            }

            function renderEmptyTable(msg) {
                if (!tableBody) return;
                tableBody.innerHTML = '<tr><td colspan="9" class="empty-requests-state">' +
                    '<div class="empty-icon">📭</div>' +
                    '<p style="font-size:0.95rem; font-weight:600; color:#475569;">' + msg + '</p>' +
                    '<p style="font-size:0.8rem; color:#94A3B8;">Customer tailoring and recolor requests will appear here.</p>' +
                '</td></tr>';
            }

            function renderRequestsTable() {
                if (!tableBody) return;
                var term = (searchInput ? searchInput.value : '').toLowerCase().trim();

                var filtered = allRequests.filter(function (r) {
                    var rStatus = (r.status || 'Pending Review').toLowerCase().trim();
                    if (rStatus === 'pending') rStatus = 'pending review';
                    if (rStatus === 'completed') rStatus = 'ready for download';

                    var filterStatus = currentFilter.toLowerCase().trim();
                    var statusMatch = (filterStatus === 'all') || (rStatus === filterStatus);
                    if (!statusMatch) return false;

                    if (!term) return true;

                    var outfitTitle = (r.outfit_title || '').toLowerCase();
                    var customerEmail = (r.email || '').toLowerCase();
                    var customerName = (r.first_name + ' ' + (r.last_name || '')).toLowerCase();
                    var notes = (r.notes || '').toLowerCase();

                    return (outfitTitle.indexOf(term) !== -1 || customerEmail.indexOf(term) !== -1 || customerName.indexOf(term) !== -1 || notes.indexOf(term) !== -1 || String(r.id).indexOf(term) !== -1);
                });

                if (filtered.length === 0) {
                    renderEmptyTable('No matching requests found.');
                    return;
                }

                tableBody.innerHTML = '';

                filtered.forEach(function (r) {
                    var tr = document.createElement('tr');

                    var normStatus = (r.status || 'Pending Review').trim();
                    if (normStatus.toLowerCase() === 'pending') normStatus = 'Pending Review';
                    if (normStatus.toLowerCase() === 'completed') normStatus = 'Ready for Download';

                    var customerName = (r.first_name ? (r.first_name + ' ' + (r.last_name || '')) : 'Guest User');
                    var customerEmail = r.email ? '<span style="font-size:0.75rem; color:#64748B;">' + r.email + '</span>' : '<span style="font-size:0.75rem; color:#94A3B8;">Unregistered</span>';

                    var outfitImg = r.outfit_image || 'frontend/images/hero_couple.png';
                    if (outfitImg.indexOf('http') !== 0 && outfitImg.indexOf('/') !== 0 && outfitImg.indexOf('frontend') !== 0) {
                        outfitImg = '/' + outfitImg;
                    }

                    var outfitTitle = r.outfit_title || ('Outfit #' + (r.outfit_id || 'N/A'));
                    var outfitCat = r.outfit_category ? ('<span style="font-size:0.72rem; color:#7C3AED; font-weight:600;">' + ucfirst(r.outfit_category) + '</span>') : '';

                    var topColor = r.top_color || '#D4AF37';
                    var bottomColor = r.bottom_color || '#1B2A4A';

                    var dateStr = r.created_at ? new Date(r.created_at).toLocaleString() : 'Just now';

                    // Status Dropdown
                    var statusSelectHtml = 
                        '<select class="admin-status-select" data-id="' + r.id + '">' +
                            '<option value="Pending Review"' + (normStatus === 'Pending Review' ? ' selected' : '') + '>⏳ Pending Review</option>' +
                            '<option value="In Design"' + (normStatus === 'In Design' ? ' selected' : '') + '>🎨 In Design</option>' +
                            '<option value="Ready for Download"' + (normStatus === 'Ready for Download' ? ' selected' : '') + '>✅ Ready for Download</option>' +
                        '</select>';

                    // Completed dress preview / upload button
                    var dressHtml = '';
                    if (r.result_image_url) {
                        var dressUrl = r.result_image_url;
                        if (dressUrl.indexOf('http') !== 0 && dressUrl.indexOf('/') !== 0 && dressUrl.indexOf('uploads') === 0) {
                            dressUrl = '/' + dressUrl;
                        }
                        dressHtml = 
                            '<div class="dress-upload-cell">' +
                                '<a href="' + dressUrl + '" target="_blank" title="View full dress">' +
                                    '<img src="' + dressUrl + '" class="dress-thumb-preview" alt="Tailored Dress" />' +
                                '</a>' +
                                '<button type="button" class="btn-upload-dress-trigger" data-id="' + r.id + '" data-title="' + escapeHtml(outfitTitle) + '" title="Replace image">Replace</button>' +
                            '</div>';
                    } else {
                        dressHtml = 
                            '<button type="button" class="btn-upload-dress-trigger" data-id="' + r.id + '" data-title="' + escapeHtml(outfitTitle) + '">' +
                                '📤 Upload Result' +
                            '</button>';
                    }

                    tr.innerHTML = 
                        '<td><strong style="color:#7C3AED;">#' + r.id + '</strong></td>' +
                        '<td style="white-space:nowrap; font-size:0.8rem; color:#64748B;">' + dateStr + '</td>' +
                        '<td>' +
                            '<div style="font-weight:700; color:#1E293B;">' + customerName + '</div>' +
                            customerEmail +
                        '</td>' +
                        '<td>' +
                            '<div class="outfit-cell">' +
                                '<img src="' + outfitImg + '" class="outfit-cell-thumb" alt="' + outfitTitle + '" onerror="this.src=\'frontend/images/hero_couple.png\'" />' +
                                '<div>' +
                                    '<div style="font-weight:600; color:#1E293B; font-size:0.84rem;">' + outfitTitle + '</div>' +
                                    outfitCat +
                                '</div>' +
                            '</div>' +
                        '</td>' +
                        '<td>' +
                            '<div class="color-chips-row">' +
                                '<span class="color-chip-pill" title="Top Garment Color">' +
                                    '<span class="color-dot-indicator" style="background-color:' + topColor + ';"></span>' +
                                    '<span>Top: <code>' + topColor + '</code></span>' +
                                '</span>' +
                                '<span class="color-chip-pill" title="Bottom Garment Color">' +
                                    '<span class="color-dot-indicator" style="background-color:' + bottomColor + ';"></span>' +
                                    '<span>Bottom: <code>' + bottomColor + '</code></span>' +
                                '</span>' +
                            '</div>' +
                        '</td>' +
                        '<td style="max-width:220px;">' +
                            (r.notes ? '<div style="font-size:0.82rem; color:#334155; line-height:1.4;">' + escapeHtml(r.notes) + '</div>' : '<span style="color:#94A3B8; font-style:italic; font-size:0.8rem;">No notes specified</span>') +
                        '</td>' +
                        '<td>' + statusSelectHtml + '</td>' +
                        '<td>' + dressHtml + '</td>' +
                        '<td style="text-align:right; white-space:nowrap;">' +
                            '<button type="button" class="btn-status-toggle" data-id="' + r.id + '" data-title="' + escapeHtml(outfitTitle) + '" data-status="' + normStatus + '" title="Upload completed dress & notify">' +
                                'Upload &amp; Notify' +
                            '</button>' +
                        '</td>';

                    tableBody.appendChild(tr);
                });

                // Attach dropdown change events
                tableBody.querySelectorAll('.admin-status-select').forEach(function (sel) {
                    sel.onchange = function () {
                        var id = this.getAttribute('data-id');
                        var newStatus = this.value;
                        var req = allRequests.find(function (item) { return String(item.id) === String(id); });

                        if (newStatus === 'Ready for Download' && (!req || !req.result_image_url)) {
                            // Suggest upload
                            openUploadModal(id, req ? req.outfit_title : '', 'Ready for Download');
                        } else {
                            updateRequestStatus(id, newStatus);
                        }
                    };
                });

                // Attach upload triggers
                tableBody.querySelectorAll('.btn-upload-dress-trigger').forEach(function (btn) {
                    btn.onclick = function () {
                        var id = this.getAttribute('data-id');
                        var title = this.getAttribute('data-title');
                        openUploadModal(id, title, 'Ready for Download');
                    };
                });

                tableBody.querySelectorAll('.btn-status-toggle').forEach(function (btn) {
                    btn.onclick = function () {
                        var id = this.getAttribute('data-id');
                        var title = this.getAttribute('data-title');
                        var st = this.getAttribute('data-status');
                        openUploadModal(id, title, (st === 'Ready for Download' ? 'Ready for Download' : 'Ready for Download'));
                    };
                });
            }

            function updateRequestStatus(id, status) {
                var apiUrl = (window.location.pathname.indexOf('/style360') === 0) 
                    ? '/style360/api/custom-request' 
                    : '/api/custom-request';

                fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update_status', id: id, status: status })
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data && data.status === 'success') {
                        showToast('✓ Request #' + id + ' updated to ' + status);
                        fetchRequests();
                    } else {
                        showToast('⚠️ ' + (data.message || 'Failed to update status'));
                    }
                })
                .catch(function (err) {
                    console.error(err);
                    showToast('⚠️ Network error updating status.');
                });
            }

            function escapeHtml(str) {
                if (!str) return '';
                return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

            function ucfirst(str) {
                if (!str) return '';
                return str.charAt(0).toUpperCase() + str.slice(1);
            }

            // Filter button events
            filterBtns.forEach(function (btn) {
                btn.onclick = function () {
                    filterBtns.forEach(function (b) { b.classList.remove('active'); });
                    this.classList.add('active');
                    currentFilter = this.getAttribute('data-status');
                    renderRequestsTable();
                };
            });

            // Live search
            if (searchInput) {
                searchInput.oninput = function () {
                    renderRequestsTable();
                };
            }

            // Refresh button
            if (btnRefresh) {
                btnRefresh.onclick = function () {
                    fetchRequests();
                    showToast('↻ Requests reloaded');
                };
            }

            // Initial load
            fetchRequests();

        })();
    </script>
</body>
</html>
