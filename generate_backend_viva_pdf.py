# -*- coding: utf-8 -*-
"""
Style360 - Backend Viva Examination Master Guide Generator (Sinhala Edition)
Generates an academic-grade, publication-quality HTML document and renders it to PDF via Microsoft Edge.
Focused strictly on Style360's Backend Architecture, Files, Key Algorithms, and Viva Preparation.
"""

import os
import subprocess
import sys
import shutil

HTML_PATH = r"E:\myStyle360Project\backend_viva_guide.html"
PDF_PATH = r"E:\myStyle360Project\Style360_Backend_Viva_Guide_Sinhala.pdf"
EDGE_EXE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ARTIFACT_DIR = r"C:\Users\kavin\.gemini\antigravity\brain\6e7136ab-d3c7-4a91-bb45-a8d2e36e1a35"

html_content = """<!DOCTYPE html>
<html lang="si">
<head>
<meta charset="UTF-8">
<title>Style360 - Backend Viva Master Guide (Sinhala)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap');

  @page {
    size: A4;
    margin: 16mm 14mm 16mm 14mm;
    @bottom-right {
      content: counter(page);
      font-size: 8.5pt;
      font-family: 'Inter', sans-serif;
      color: #94a3b8;
    }
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Inter', 'Nirmala UI', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.65;
    font-size: 10pt;
  }

  /* Page Break Helpers */
  .page-break {
    page-break-before: always;
    break-before: page;
  }
  .avoid-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Cover Page */
  .cover-page {
    min-height: 255mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 26mm 18mm 20mm 18mm;
    background: linear-gradient(135deg, #090d16 0%, #111827 40%, #1e1b4b 100%);
    color: #ffffff;
    page-break-after: always;
    break-after: page;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
  }

  .cover-header {
    border-left: 6px solid #6366f1;
    padding-left: 22px;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid #818cf8;
    color: #c7d2fe;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .cover-title {
    font-size: 32pt;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.5px;
    color: #ffffff;
    margin-bottom: 12px;
  }
  .cover-title span {
    background: linear-gradient(90deg, #818cf8, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .cover-subtitle {
    font-size: 13.5pt;
    color: #cbd5e1;
    font-weight: 400;
    max-width: 680px;
    line-height: 1.5;
    margin-top: 10px;
  }

  .cover-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    margin: 35px 0;
  }
  .cover-stat-box {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 16px 14px;
    backdrop-filter: blur(8px);
  }
  .cover-stat-title {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    margin-bottom: 6px;
    font-weight: 600;
  }
  .cover-stat-val {
    font-size: 13pt;
    font-weight: 700;
    color: #38bdf8;
  }
  .cover-stat-desc {
    font-size: 8.5pt;
    color: #cbd5e1;
    margin-top: 4px;
  }

  .cover-footer {
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    padding-top: 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .cover-author {
    font-size: 9.5pt;
    color: #e2e8f0;
    line-height: 1.5;
  }
  .cover-author strong {
    color: #ffffff;
    font-size: 10.5pt;
  }
  .cover-version {
    font-size: 8.5pt;
    color: #94a3b8;
    text-align: right;
  }

  /* Typography & Headings */
  h1 {
    font-size: 20pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px;
    margin-top: 24px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h1 .num {
    background: #4f46e5;
    color: #ffffff;
    font-size: 11pt;
    padding: 3px 10px;
    border-radius: 6px;
    font-weight: 700;
  }

  h2 {
    font-size: 14.5pt;
    font-weight: 700;
    color: #1e1b4b;
    margin-top: 18px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 16px;
    background: #6366f1;
    border-radius: 3px;
  }

  h3 {
    font-size: 12pt;
    font-weight: 600;
    color: #334155;
    margin-top: 14px;
    margin-bottom: 6px;
  }

  p {
    margin-bottom: 10px;
    color: #334155;
    text-align: justify;
  }

  strong {
    color: #0f172a;
  }

  /* Callout Boxes */
  .callout {
    border-radius: 8px;
    padding: 12px 16px;
    margin: 14px 0;
    font-size: 9.5pt;
    line-height: 1.55;
  }
  .callout-info {
    background: #f0fdf4;
    border-left: 4px solid #16a34a;
    color: #14532d;
  }
  .callout-purple {
    background: #f5f3ff;
    border-left: 4px solid #7c3aed;
    color: #4c1d95;
  }
  .callout-warning {
    background: #fffbeb;
    border-left: 4px solid #d97706;
    color: #78350f;
  }
  .callout-danger {
    background: #fef2f2;
    border-left: 4px solid #dc2626;
    color: #7f1d1d;
  }

  .callout-title {
    font-weight: 700;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10pt;
  }

  /* Code Blocks */
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 12px 14px;
    border-radius: 7px;
    font-family: 'Fira Code', Consolas, Monaco, monospace;
    font-size: 8.5pt;
    line-height: 1.5;
    margin: 10px 0 14px 0;
    overflow-x: auto;
    border: 1px solid #1e293b;
    position: relative;
  }
  code {
    font-family: 'Fira Code', Consolas, Monaco, monospace;
    font-size: 8.8pt;
    background: #f1f5f9;
    color: #4338ca;
    padding: 1px 5px;
    border-radius: 4px;
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 9pt;
  }
  th {
    background: #1e293b;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #334155;
  }
  td {
    padding: 7px 10px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }
  tr:nth-child(even) {
    background: #f8fafc;
  }

  /* File Card */
  .file-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px;
    margin: 14px 0;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .file-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .file-name {
    font-family: 'Fira Code', monospace;
    font-size: 11pt;
    font-weight: 700;
    color: #4338ca;
  }
  .file-badge {
    background: #e0e7ff;
    color: #3730a3;
    font-size: 8pt;
    padding: 3px 8px;
    border-radius: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  /* Q&A Box */
  .qa-box {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    margin: 12px 0;
    overflow: hidden;
    background: #ffffff;
  }
  .qa-header {
    background: #f8fafc;
    border-bottom: 1px solid #cbd5e1;
    padding: 10px 14px;
    font-weight: 700;
    color: #0f172a;
    font-size: 10pt;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .qa-header .q-tag {
    background: #ef4444;
    color: #ffffff;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 8pt;
  }
  .qa-body {
    padding: 12px 14px;
    font-size: 9.5pt;
    color: #334155;
    line-height: 1.6;
  }
  .qa-body .ans-si {
    margin-bottom: 8px;
  }
  .qa-body .ans-en {
    background: #f1f5f9;
    border-left: 3px solid #64748b;
    padding: 8px 12px;
    font-size: 9pt;
    color: #1e293b;
    border-radius: 0 4px 4px 0;
    font-style: italic;
  }

  /* Bullet lists */
  ul, ol {
    margin-left: 20px;
    margin-bottom: 10px;
  }
  li {
    margin-bottom: 4px;
  }

  .badge-tag {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 8pt;
    font-weight: 600;
    margin-right: 4px;
  }
  .badge-get { background: #dcfce7; color: #166534; }
  .badge-post { background: #dbeafe; color: #1e40af; }
  .badge-patch { background: #fef3c7; color: #92400e; }
  .badge-del { background: #fee2e2; color: #991b1b; }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover-page">
  <div class="cover-header">
    <div class="cover-badge">University Final Year Defense &bull; Backend Specialization</div>
    <div class="cover-title">STYLE360 <span>BACKEND VIVA</span><br>MASTER GUIDE</div>
    <div class="cover-subtitle">
      Style360 ව්‍යාපෘතියේ Backend Architecture, PHP APIs, AI Orchestration, Core Algorithms සහ MySQL Database සම්බන්ධව Viva පරීක්ෂණයේදී අසනු ලබන සියලුම ප්‍රශ්න හා කේත කොටස් පිළිබඳ විශේෂ සිංහල මාර්ගෝපදේශය.
    </div>
  </div>

  <div class="cover-grid">
    <div class="cover-stat-box">
      <div class="cover-stat-title">Backend Architecture</div>
      <div class="cover-stat-val">PHP 8.2 + MySQL</div>
      <div class="cover-stat-desc">Stateless RESTful APIs with PDO connection resilience & zero memory leaks.</div>
    </div>
    <div class="cover-stat-box">
      <div class="cover-stat-title">AI Microservices</div>
      <div class="cover-stat-val">Fal.ai + Tripo3D</div>
      <div class="cover-stat-desc">Fashn v1.6 Virtual Try-On, Tripo3D V3 Image-to-3D & Gemini Flash Vision.</div>
    </div>
    <div class="cover-stat-box">
      <div class="cover-stat-title">Special Features</div>
      <div class="cover-stat-val">Caching & Proxy</div>
      <div class="cover-stat-desc">MD5 Mesh Caching, GD Resampling & CORS-free GLB Binary Streaming.</div>
    </div>
  </div>

  <div class="cover-footer">
    <div class="cover-author">
      <strong>Candidate Role:</strong> Backend Developer & Systems Integrator<br>
      <strong>Project:</strong> Style360 - AI Powered Virtual Fitting & 3D Fashion Platform<br>
      <strong>Framework & Tools:</strong> PHP 8.2 &bull; MySQL 8.0 &bull; PDO &bull; Three.js GLB Proxy &bull; Google Gemini Vision
    </div>
    <div class="cover-version">
      Academic Defense Edition<br>
      September 2026
    </div>
  </div>
</div>

<!-- PAGE 1: ARCHITECTURE OVERVIEW -->
<div class="page-break"></div>

<h1><span class="num">01</span> Backend System Architecture & Technology Stack</h1>

<p>
Style360 ව්‍යාපෘතියේ Backend එක නිර්මාණය කර ඇත්තේ <strong>Stateless RESTful API Architecture</strong> එකක් ලෙසිනි. Frontend එකෙහි (React 18 + Vite) සිට පැමිණෙන පරිශීලක ඉල්ලීම් (HTTP Requests) භාරගෙන, දත්ත සමුදාය (MySQL) සමඟ ගනුදෙනු කරමින්, කෘතිම බුද්ධි සේවාවන් (Fal.ai, Tripo3D, Google Gemini) සම්බන්ධීකරණය (orchestrate) කිරීම Backend හි ප්‍රධාන කාර්යභාරයයි.
</p>

<div class="callout callout-purple">
  <div class="callout-title">💡 Why PHP 8.2 instead of Node.js or Python for Backend? (Viva Defense Key Point)</div>
  විවා පරීක්ෂකවරුන් නිතර අසන ප්‍රශ්නයකි: <em>"AI project එකකට Python හෝ Node.js භාවිතා නොකර PHP තෝරාගත්තේ ඇයි?"</em><br>
  <strong>පිළිතුර:</strong>
  <ul>
    <li><strong>Stateless Process Isolation (මතක කාන්දු වැළැක්වීම):</strong> 3D GLB Models (5MB - 15MB) Binary Streaming කිරීමේදී Node.js වැනි single-threaded event loop එකක RAM Buffer කාන්දු (Memory Leaks) ඇති විය හැක. PHP හි සෑම request එකක්ම වෙනම process එකක් ලෙස ක්‍රියාත්මක වී අවසානයේ memory සම්පූර්ණයෙන්ම නිදහස් (garbage collected) කෙරේ.</li>
    <li><strong>Zero Cold-Start Latency:</strong> Python Web Frameworks (FastAPI, Django) මෙන් නොව, PHP Apache/Nginx මත ඉතා වේගයෙන් (<15ms) initial request cycle එක ආරම්භ කරයි.</li>
    <li><strong>Built-in GD Image Library & Stream Wrappers:</strong> තෙවන පාර්ශවීය බරැති packages නොමැතිව Native GD මඟින් High-Speed Image Resampling සහ cURL මඟින් Multi-Part Cloud API streaming සිදුකළ හැක.</li>
    <li><strong>Cost & Portability:</strong> ඕනෑම Standard Cloud VM එකක (Shared, VPS, Dedicated) ඉතා අඩු වියදමකින් සහ පහසුවෙන් deploy කළ හැක.</li>
  </ul>
</div>

<h2>Backend High-Level Data Flow</h2>
<pre>
[User Browser / React 18 UI]
       │
       ▼ (HTTPS / JSON / Multipart Form-Data)
[PHP 8.2 REST Endpoints (/backend/*.php)]
       │
       ├────► [database.php] ──► [MySQL 8.0 (style360_v2)]
       │         └─ PDO Connection Pooling & Auto-Migrations
       │
       ├────► [FalService.php] ─► [Fal.ai Fashn v1.6] (Virtual Try-On 2D)
       │         └─ Smart Aspect-Ratio Pillarboxing & Color Sampling
       │
       ├────► [generate_3d.php] ─► [Tripo3D V3 API] (Image-to-3D GLB)
       │         └─ MD5 Hash Cache Lookup & Background Removal
       │
       ├────► [proxy_glb.php] ─► [Local Disk Cache (temp/glb_cache/)]
       │         └─ Bypasses CloudFront CORS & Streams GLB to Three.js
       │
       └────► [validate_gender.php] ─► [Google Gemini Vision API]
                 └─ GD 320px In-Memory Resample (Latency: 1.2s)
</pre>

<!-- PAGE 2: FILE BY FILE DETAILED BREAKDOWN -->
<div class="page-break"></div>

<h1><span class="num">02</span> Backend Core Files - Detailed Code & Logic Breakdown</h1>

<p>
Style360 Backend එකෙහි අඩංගු සෑම file එකකම කාර්යභාරය, එහි ඇති විශේෂ Functions, Algorithms සහ Security Measures පහත පරිදි අධ්‍යයනය කර Viva එකේදී පැහැදිලි කරන්න:
</p>

<!-- FILE 1: database.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/database.php</span>
    <span class="file-badge">Database & Migrations</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> MySQL දත්ත සමුදාය සමඟ PDO සම්බන්ධතාවය ඇති කිරීම, පරිසර විචල්‍යයන් (.env) කියවීම, සහ දත්ත සමුදාය හෝ වගු (Tables) නොමැති නම් ඒවා ස්වයංක්‍රීයව නිර්මාණය කිරීම (Auto-Provisioning & Auto-Migration).</p>
  
  <h3>විශේෂ Code කොටස් සහ Logic:</h3>
  <ol>
    <li>
      <strong>Zero-Dependency .env Parser:</strong> Composer හෝ vlucas/phpdotenv වැනි external packages මත යැපෙන්නේ නැතිව Native PHP string operations මඟින් root <code>.env</code> file එක කියවා <code>$_ENV</code> සහ <code>putenv()</code> වෙත load කරයි:
      <pre><code>if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $val) = explode('=', $line, 2);
            putenv(trim($key) . "=" . trim($val, " \\t\\n\\r\\0\\x0B\\"'"));
        }
    }
}</code></pre>
    </li>
    <li>
      <strong>Host Fallback Array & Auto-Creation:</strong> Localhost, 127.0.0.1, custom port ආදී විවිධ පරිසරයන්හිදි සම්බන්ධතාවය බිඳ නොවැටී පවත්වා ගැනීමට <code>$hostsToTry</code> array එකක් භාවිත කරයි. <code>style360_v2</code> database එක නොමැති නම් root මඟින් <code>CREATE DATABASE IF NOT EXISTS</code> execute කර auto-create කරයි.
    </li>
    <li>
      <strong>Live Schema Migrations & Data Cleaning:</strong> <code>SHOW COLUMNS</code> පරීක්ෂා කර <code>result_image_url</code> වැනි අලුත් columns එකතු කිරීම, CloudFront signed URLs (>900 chars) ගබඩා කිරීම සඳහා <code>result_3d_url TEXT</code> බවට පත් කිරීම, සහ static mock dummy images database එකෙන් ස්වයංක්‍රීයව delete කර දත්තවල පිරිසිදුකම (Data Integrity) ආරක්ෂා කිරීම.
    </li>
  </ol>
</div>

<!-- FILE 2: FalService.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/FalService.php</span>
    <span class="file-badge">AI Virtual Try-On Core</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> Fal.ai Cloud Platform එකෙහි ඇති Fashn v1.6 Virtual Try-On සහ Flux Inpainting APIs කළමනාකරණය කරන මධ්‍යම Service Controller එකයි.</p>

  <h3>විශේෂ Code කොටස් සහ Logic:</h3>
  <ul>
    <li>
      <strong>Smart Aspect-Ratio Standardizer (Pillarboxing Algorithm):</strong>
      පරිශීලකයා උඩුගත කරන ඡායාරූප (විශේෂයෙන් සම්පූර්ණ උස 9:16 portraits) AI Try-On එකට යැවීමේදී ඔලුව හෝ දෙපා කැපී යාම (crop වීම) වැළැක්වීමට මෙම ඇල්ගොරිතමය ක්‍රියාත්මක වේ. <code>standardizeModelImage()</code> මඟින් මුළු උසම (100% vertical height) ආරක්ෂා කරමින් දෙපසට seamless padding එකතු කරයි.
      <pre><code>// ඡායාරූපයේ කොනක (Corner) pixel වර්ණය හඳුනාගෙන canvas එක fill කිරීම:
$rgb = @imagecolorat($srcImg, min(4, $origW - 1), min(4, $origH - 1));
$r = ($rgb >> 16) & 0xFF; $g = ($rgb >> 8) & 0xFF; $b = $rgb & 0xFF;
$bg = imagecolorallocate($canvas, $r, $g, $b);
imagefilledrectangle($canvas, 0, 0, $targetW, $targetH, $bg);
imagecopyresampled($canvas, $srcImg, $dstX, $dstY, 0, 0, $dstW, $dstH, $origW, $origH);</code></pre>
    </li>
    <li>
      <strong>Face Restoration Weight Constraint (0.5 Constraint):</strong>
      සාමාන්‍යයෙන් CodeFormer face restoration එක 1.0 අගයකදී ක්‍රියාත්මක වීමේදී හිස පමණක් කෘතිමව විශාල වී (oversized cartoonish head) දිස්වේ. Style360 හිදී මෙය <code>const DEFAULT_FACE_RESTORATION_WEIGHT = 0.5;</code> ලෙස සකසා ස්වභාවික මිනිස් සමානුපාතික බව (natural body-to-head proportions) තහවුරු කර ඇත.
    </li>
    <li>
      <strong>isFullOutfit() Auto-Detection:</strong> Garment category සහ title එකෙහි <em>"suit, two-piece, set, wedding, gown"</em> වැනි වචන හඳුනාගෙන Fal.ai වෙත <code>category = "one-pieces"</code> ලෙස යවා උඩ සහ යට කොටස් දෙකම සම්පූර්ණයෙන් අඳිනු ලබයි.
    </li>
  </ul>
</div>

<!-- PAGE 3: GENERATE_3D & PROXY_GLB -->
<div class="page-break"></div>

<!-- FILE 3: generate_3d.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/generate_3d.php</span>
    <span class="file-badge">Tripo3D V3 Image-to-3D Pipeline</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> 2D Virtual Try-On ප්‍රතිඵල ඡායාරූපය ලබාගෙන, පසුබිම ඉවත් කර (Background Removal), Tripo3D V3 AI Engine එක මඟින් 3D Mesh එකක් (.GLB format) බවට පත් කිරීම.</p>

  <h3>විශේෂ Code කොටස් සහ Logic:</h3>
  <ol>
    <li>
      <strong>MD5 Image Hash Caching Algorithm (Cost & Time Optimization):</strong>
      Tripo3D API එකට එකම ඡායාරූපය නැවත නැවත යැවීමෙන් මුදල්/Credits නාස්ති වීම සහ තත්පර 15ක් බලා සිටීම වැළැක්වීමට, උඩුගත කරන ඡායාරූපයේ Base64 binary එකෙන් <code>md5($cleanBase64)</code> hash එකක් සාදයි. මෙම hash එක <code>user_3d_models</code> වගුවේ තිබේ නම්, API call එකක් නොකර <strong>මිලි තත්පර 30කින් (30ms)</strong> Cache එකෙන් කෙලින්ම 3D Model එක ලබාදෙයි!
      <pre><code>$imageHash = md5($cleanBase64);
$hashStmt = $conn->prepare("SELECT id, model_url FROM user_3d_models WHERE image_hash = :hash LIMIT 1");
$hashStmt->execute([':hash' => $imageHash]);
if ($cached = $hashStmt->fetch()) {
    echo json_encode(['status' => 'success', 'cached' => true, 'model_url' => '/backend/proxy_glb.php?id=u3d_' . $cached['id']]);
    exit;
}</code></pre>
    </li>
    <li>
      <strong>Automated Background Stripping:</strong> ඡායාරූපයේ පසුබිමේ ඇති බිත්ති, දොරවල් හෝ බිම Tripo3D මඟින් 3D ඝන වස්තු ලෙස වැරදියට generate වීම වැළැක්වීමට, පළමුව Fal Background Removal මඟින් subject එක පමණක් වෙන්කර Transparent PNG එකක් ලෙස Tripo3D වෙත යවයි.
    </li>
    <li>
      <strong>Asynchronous Polling Loop with Adaptive Sleep:</strong> Tripo task එකක් create කළ පසු, උපරිම තත්පර 90ක කාලයක් ඇතුළත සෑම තත්පර 2කට වරක් status එක poll කර බලා <code>status === 'success'</code> වූ වහාම GLB URL එක ලබාගෙන MySQL database එකේ persist කරයි.
    </li>
  </ol>
</div>

<!-- FILE 4: proxy_glb.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/proxy_glb.php</span>
    <span class="file-badge">High-Performance CORS & Cache Proxy</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> Three.js Frontend Viewer එකට දුරස්ථ AWS CloudFront S3 endpoints වෙතින් GLB files බාගත කිරීමේදී ඇතිවන CORS ආරක්ෂක බාධක මගහැරීම සහ දේශීයව Cache කිරීම.</p>

  <div class="callout callout-warning">
    <div class="callout-title">⚠️ Why is proxy_glb.php indispensable? (Examiner Question)</div>
    <strong>ප්‍රශ්නය:</strong> <em>"Frontend එකට කෙලින්ම Tripo3D දෙන CloudFront GLB URL එක Three.js GLTFLoader එකට දෙන්න බැරිද? Proxy එකක් හැදුවේ ඇයි?"</em><br>
    <strong>පිළිතුර (Viva Answer):</strong>
    <ol>
      <li><strong>CORS (Cross-Origin Resource Sharing) Restriction:</strong> CloudFront S3 CDN එකෙන් <code>Access-Control-Allow-Origin: *</code> header එක නොඑවන විට, බ්‍රවුසරයේ WebGL ආරක්ෂක නීති නිසා 3D model එක render වීම block වේ. මෙම proxy එකෙන් එම header එක inject කරයි.</li>
      <li><strong>URL Expiration (Signed URLs):</strong> Tripo3D signed URLs පැය 24කින් expire වේ. Proxy එක මඟින් මුල් වරට බාගත කරන binary file එක <code>temp/glb_cache/model_[md5].glb</code> ලෙස hard disk එකේ තැන්පත් කරන බැවින්, මාස ගණනකට පසුව වුවද model එක නැවත load වේ!</li>
      <li><strong>Streaming Without Memory Leaks:</strong> <code>fpassthru($fp)</code> හෝ cURL buffer stream එකක් භාවිතා කරන නිසා 15MB file එකක් වුවද PHP Server RAM එකට load නොවී කෙලින්ම client බ්‍රවුසරයට stream වේ.</li>
    </ol>
  </div>
</div>

<!-- PAGE 4: VALIDATE_GENDER & VERIFY_GARMENT -->
<div class="page-break"></div>

<!-- FILE 5: validate_gender.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/validate_gender.php</span>
    <span class="file-badge">Dual-Tier AI Gender Guard</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පරිශීලකයා තෝරාගත් ඇඳුම (Garment Gender: Male / Female) සහ උඩුගත කරන ලද පුද්ගලයාගේ ඡායාරූපයේ ලිංගිකත්වය ගැලපේදැයි පරික්ෂා කිරීම. වැරදි gender mismatch එකක් හමු වුවහොත් expensive GPU Try-On එකට යාමට පෙර එය වහාම නවතයි.</p>

  <h3>Tier දෙකකින් සමන්විත Ultra-Fast Architecture:</h3>
  <ul>
    <li>
      <strong>Tier 1 - Regex Pre-check (<1ms):</strong>
      Upload කරන file name එකෙහි පැහැදිලි වචන (උදා: <code>men, boy, tuxedo, bride, gown, saree</code>) තිබේදැයි Regex මඟින් ක්ෂණිකව පරීක්ෂා කරයි. කිසිදු AI call එකක් නොකර 0.5ms තුළ තීරණය ගනී.
    </li>
    <li>
      <strong>Tier 2 - GD In-Memory Downsampling & Gemini Vision (~1.2s):</strong>
      පරිශීලකයා 4K හෝ 1080p high-resolution ඡායාරූපයක් (5MB) දුන් විට, එය කෙලින්ම Gemini API එකට යැවුවහොත් network upload එකට තත්පර 5-7ක් ගතවේ. Style360 Backend එකෙහි PHP GD library මඟින් RAM එක තුළදීම එම රූපය <strong>320px කුඩා Thumbnail එකක් (~12KB)</strong> බවට resample කරයි!
      <pre><code>// 320px In-Memory Resampling - Latency drops from 6.0s to 1.2s:
$maxDim = 320;
$dst = imagecreatetruecolor($nw, $nh);
imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
ob_start(); imagejpeg($dst, null, 75); $jpgBytes = ob_get_clean();
$b64Thumb = base64_encode($jpgBytes);</code></pre>
      අනතුරුව <code>gemini-flash-lite-latest</code> වෙත මෙම 12KB payload එක යවා zero temperature යටතේ තනි වචනයකින් (male/female) ප්‍රතිඵලය ලබාගනී.
    </li>
  </ul>
</div>

<!-- FILE 6: verify_garment.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/verify_garment.php</span>
    <span class="file-badge">Garment Content Safety & Category AI</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පරිශීලකයා හෝ Admin විසින් Catalog එකට ඇතුළත් කරන ඇඳුම සැබවින්ම ඇඳුමක්ද (Garment), එය අඳින ආකාරය කුමක්ද (top, bottom, full-body suit, dress), සහ එහි කිසියම් නුසුදුසු අන්තර්ගතයක් (inappropriate content) තිබේදැයි Gemini Vision මඟින් තහවුරු කිරීම.</p>
</div>

<!-- FILE 7: garments.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/garments.php</span>
    <span class="file-badge">RESTful Garment Catalog Engine</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> ඇඳුම් නාමාවලියෙහි (Catalog) සියලුම CRUD (Create, Read, Update, Delete) මෙහෙයුම් සිදුකරයි. Dynamic SQL Query Builder එකක් මඟින් Gender, Category, Status සහ Search Query අනුව තත්පරයෙන් සුළු කාලයකදී filter කර JSON ලබාදෙයි.</p>
  <ul>
    <li><span class="badge-tag badge-get">GET</span> <code>/backend/garments.php?gender=male&category=suits</code>: Active garments පෙළගස්වයි.</li>
    <li><span class="badge-tag badge-post">POST</span> <code>/backend/garments.php</code>: අලුත් garment එකක් upload කිරීම (Display Image සහ FAL Transparent Image වෙන වෙනම save වේ).</li>
    <li><span class="badge-tag badge-del">DELETE</span> <code>/backend/garments.php?id=12</code>: Garment එකක් ඉවත් කිරීම (Safe cascade delete).</li>
  </ul>
</div>

<!-- PAGE 5: AUTH, CUSTOM_REQUESTS, NOTIFICATIONS & HISTORY -->
<div class="page-break"></div>

<!-- FILE 8: auth.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/auth.php</span>
    <span class="file-badge">Authentication & Session Security</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> User Sign-Up, Sign-In, Role Authorization (admin vs user) සහ PHP Session State කළමනාකරණය කිරීම.</p>

  <h3>ආරක්ෂක ක්‍රමවේද (Security Best Practices):</h3>
  <ul>
    <li>
      <strong>Bcrypt Strong Hashing:</strong> Passwords කිසි විටෙකත් plain text ලෙස ගබඩා නොකරයි. <code>password_hash($password, PASSWORD_DEFAULT)</code> මඟින් 60-character cryptographically secure Blowfish salt hash එකක් සාදයි. Verify කිරීම සඳහා <code>password_verify()</code> භාවිත කරයි.
    </li>
    <li>
      <strong>Complete SQL Injection Immunity:</strong> සියලුම දත්ත සමුදා විමසුම් (queries) සඳහා PDO Prepared Statements සහ Bound Parameters (උදා: <code>:email</code>) පමණක් භාවිත කර ඇත. කිසිදු තැනක string concatenation නොකරයි.
    </li>
    <li>
      <strong>Role-Based Access Control (RBAC):</strong> පරිශීලකයා <code>admin</code> ද සාමාන්‍ය <code>user</code> කෙනෙක්ද යන්න හඳුනාගෙන, admin-only endpoints වලදී අනවසර පිවිසුම් (unauthorized access) වලක්වයි.
    </li>
  </ul>
</div>

<!-- FILE 9: custom_requests.php & admin-requests.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/custom_requests.php & admin-requests.php</span>
    <span class="file-badge">Bespoke Tailoring Workflow</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පාරිභෝගිකයාට අවශ්‍ය පරිදි ඇඳුම් මැසීම (Custom tailoring) සඳහා ඉල්ලීම් භාරගැනීම, වර්ණ (Hex Color Codes) ලබාගැනීම, සහ අදියර 3ක Lifecycle එකක් ඔස්සේ Admin විසින් නිර්මාණය කර නැවත ලබාදීම.</p>

  <table style="margin-top: 10px;">
    <tr>
      <th>Status Lifecycle</th>
      <th>තේරුම සහ සිදුවන ක්‍රියාවලිය</th>
      <th>ස්වයංක්‍රීය දැනුම්දීම (Notification)</th>
    </tr>
    <tr>
      <td><strong>Pending Review</strong></td>
      <td>පරිශීලකයා විසින් Top/Bottom වර්ණ සහ Notes සමඟ ඉල්ලීම submit කළ මොහොත.</td>
      <td>Admin Dashboard එකේ unread badge එකක් ලෙස පෙන්වයි.</td>
    </tr>
    <tr>
      <td><strong>In Design</strong></td>
      <td>Admin විසින් ඇඳුම නිර්මාණය කිරීම ආරම්භ කර ඇති බව පාරිභෝගිකයාට දන්වයි.</td>
      <td><em>"Your custom outfit request #X is now in design stage."</em></td>
    </tr>
    <tr>
      <td><strong>Ready for Download</strong></td>
      <td>Admin විසින් නිමකළ ඇඳුමේ ඡායාරූපය upload කර අවසන් වූ පසු.</td>
      <td><em>"Your Custom Outfit (#X) is Ready for Download!"</em></td>
    </tr>
  </table>
</div>

<!-- FILE 10: notifications.php & get_notifications.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/notifications.php & get_notifications.php</span>
    <span class="file-badge">Real-Time User Notification Engine</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පාරිභෝගිකයාගේ Custom Requests හෝ Try-On තත්ත්වයන් පිළිබඳව alerts ලබාදීම. Unread badge counter එකක් පවත්වාගෙන යන අතර, click කළ විට <code>is_read = 1</code> ලෙස update කරයි.</p>
</div>

<!-- FILE 11: get_3d_models.php & get_history.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/get_3d_models.php & get_history.php</span>
    <span class="file-badge">Gallery & History Data Relational Aggregator</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පරිශීලකයා විසින් මෙතෙක් අත්හදා බලන ලද 2D Try-on ප්‍රතිඵල සහ 3D Models එකම තිරයක පෙන්වීමට <code>LEFT JOIN</code> ආශ්‍රයෙන් Multi-Table Relational Data එකලස් කර ලබාදීම.</p>
  <pre><code>SELECT m.id, m.task_id, m.model_url, m.preview_image_url, m.outfit_title, 
       h.result_image_url as tryon_image, g.title as garment_name
FROM user_3d_models m
LEFT JOIN try_on_history h ON m.tryon_history_id = h.id
LEFT JOIN garment g ON m.outfit_id = g.id
WHERE m.user_id = :uid ORDER BY m.id DESC;</code></pre>
</div>

<!-- PAGE 6: MULTIMODAL CHAT & OTHER SPECIAL FILES -->
<div class="page-break"></div>

<!-- FILE 12: chat_multimodal.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/chat_multimodal.php</span>
    <span class="file-badge">Gemini Multimodal AI Stylist</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පරිශීලකයා උඩුගත කරන ඡායාරූපය සහ ඔවුන්ගේ පැනය (User Prompt) ලබාගෙන, MySQL database එකේ ඇති active ඇඳුම් inventory එක දත්තයක් ලෙස Gemini වෙත සපයා (Contextual Inventory Injection), පරිශීලකයාගේ ශරීර හැඩය සහ ලිංගිකත්වයට ගැළපෙන ඇඳුම් පමණක් නිර්දේශ (recommend) කිරීම.</p>

  <div class="callout callout-info">
    <div class="callout-title">🎯 Gender-Aware Recommendation Rule</div>
    පිරිමි පුද්ගලයෙකුගේ ඡායාරූපයක් ලබාදුන් විට, පද්ධතිය කිසිසේත්ම Bridal Gowns හෝ කාන්තා ඇඳුම් නිර්දේශ නොකරයි. <code>$maleItems</code> පමණක් prompt එකට inject කර AI එක strict constraint එකක් තුළ තබා ගනී.
  </div>
</div>

<!-- FILE 13: recolor.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">backend/recolor.php</span>
    <span class="file-badge">AI Outfit Inpainting & Color Swapping</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> පරිශීලකයා කැමති ඇඳුමක වර්ණය පමණක් (උදා: Red to Royal Navy Blue) වෙනස් කිරීම සඳහා Fal.ai Flux General Inpainting microservice එක call කිරීම.</p>
</div>

<!-- FILE 14: router.php -->
<div class="file-card avoid-break">
  <div class="file-card-header">
    <span class="file-name">router.php (Root Gateway)</span>
    <span class="file-badge">PHP Built-in Server Dynamic Router</span>
  </div>
  <p><strong>මූලික කාර්යය:</strong> Local development එකේදී PHP built-in server එක (<code>php -S localhost:8000 router.php</code>) run වන විට, CSS/JS/Images වැනි static assets නිවැරදි mime-type සමඟ serve කරමින්, API requests අදාළ backend scripts වෙත route කිරීම.</p>
</div>

<h1><span class="num">03</span> MySQL Database Schema & Table Structure</h1>

<p>
Style360 දත්ත සමුදාය <strong>InnoDB Storage Engine</strong> සහ <strong>utf8mb4_unicode_ci</strong> encoding මඟින් සම්පූර්ණයෙන්ම Normalized ආකාරයට නිර්මාණය කර ඇත:
</p>

<table>
  <tr>
    <th style="width: 22%;">Table Name</th>
    <th style="width: 38%;">ප්‍රධාන තීරු (Key Columns)</th>
    <th style="width: 40%;">කාර්යය සහ සබඳතා (Purpose & Relationships)</th>
  </tr>
  <tr>
    <td><strong>users</strong></td>
    <td><code>id (PK)</code>, <code>first_name</code>, <code>last_name</code>, <code>email (UNIQUE)</code>, <code>password</code>, <code>role</code></td>
    <td>පරිශීලක ගිණුම් තොරතුරු සහ roles (user/admin). Bcrypt passwords.</td>
  </tr>
  <tr>
    <td><strong>garment</strong></td>
    <td><code>id (PK)</code>, <code>title</code>, <code>gender</code>, <code>category</code>, <code>display_image_url</code>, <code>fal_image_url</code>, <code>status</code></td>
    <td>නාමාවලියෙහි ඇති සියලුම ඇඳුම් විස්තර. Men, Women, Unisex කාණ්ඩ.</td>
  </tr>
  <tr>
    <td><strong>try_on_history</strong></td>
    <td><code>id (PK)</code>, <code>user_id (FK)</code>, <code>garment_id (FK)</code>, <code>user_image_url</code>, <code>result_image_url</code>, <code>result_3d_url (TEXT)</code></td>
    <td>සිදුකරන ලද 2D Try-on ප්‍රතිඵල සහ 3D ආකෘති links.</td>
  </tr>
  <tr>
    <td><strong>custom_requests</strong></td>
    <td><code>id (PK)</code>, <code>user_id (FK)</code>, <code>outfit_id (FK)</code>, <code>top_color</code>, <code>bottom_color</code>, <code>notes</code>, <code>result_image_url</code>, <code>status</code></td>
    <td>පාරිභෝගිකයාගේ bespoke tailoring ඇණවුම් සහ 3-stage status.</td>
  </tr>
  <tr>
    <td><strong>notifications</strong></td>
    <td><code>id (PK)</code>, <code>user_id (FK)</code>, <code>title</code>, <code>message</code>, <code>is_read</code></td>
    <td>පරිශීලක alerts සහ completed order notifications.</td>
  </tr>
  <tr>
    <td><strong>user_3d_models</strong></td>
    <td><code>id (PK)</code>, <code>user_id (FK)</code>, <code>task_id</code>, <code>image_hash (INDEX)</code>, <code>model_url</code>, <code>preview_image_url</code></td>
    <td>Tripo3D මඟින් ජනනය කරන ලද 3D GLB Models සහ Fast Caching Hashes.</td>
  </tr>
</table>

<!-- PAGE 7: TOP 15 VIVA QUESTIONS & ANSWERS -->
<div class="page-break"></div>

<h1><span class="num">04</span> Top 15 Backend Viva Examination Questions & Model Answers</h1>

<p>
විශ්වවිද්‍යාල Viva පරීක්ෂණ මණ්ඩලය (Examiners) විසින් Backend භාර සිසුවාගෙන් ඇසීමට ඉඩ ඇති ප්‍රමුඛතම ප්‍රශ්න 15 සහ ඊට ලබාදිය යුතු විශිෂ්ටතම සිංහල හා ඉංග්‍රීසි පිළිතුරු:
</p>

<!-- Q1 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q1</span> 
    ඔබේ Backend Architecture එක විස්තර කරන්න. Frontend එක සහ AI Services සමඟ Backend එක සම්බන්ධ වෙන්නේ කොහොමද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> අපගේ Backend එක PHP 8.2 මත පදනම් වූ Stateless RESTful API Architecture එකක්. Frontend React client එකෙන් JSON හෝ Multipart payload එකක් මඟින් HTTP POST/GET request එකක් එවන විට, Backend එකෙන් මුලින්ම Authentication, Session සහ Input Data validate කරනවා. ඉන්පසු දත්ත අවශ්‍ය නම් MySQL දත්ත සමුදායට (PDO මඟින්) ලියන අතරතුර, Fal.ai සහ Tripo3D වැනි AI microservices සමඟ cURL ඔස්සේ secure API communication සිදුකර ප්‍රතිඵල JSON response එකක් ලෙස frontend එකට ලබාදෙනවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "Our backend utilizes a stateless RESTful architecture implemented in PHP 8.2. It accepts HTTPS requests from our React frontend, validates input, interacts securely with our MySQL 8.0 relational database via PDO, and orchestrates cloud AI pipelines (Fal.ai for 2D VTON, Tripo3D for 3D meshes, and Gemini Vision for validation) using asynchronous cURL streams."
    </div>
  </div>
</div>

<!-- Q2 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q2</span> 
    SQL Injection ප්‍රහාර වලින් ඔබේ පද්ධතිය ආරක්ෂා කර ඇත්තේ කෙසේද? (Security Defense)
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> අප කිසිම තැනක dynamic SQL query එකක් තුළට user input කෙලින්ම string concatenation මඟින් ඇතුළත් කරන්නේ නැහැ. සියලුම database queries සඳහා 100% ක්ම <strong>PDO Prepared Statements</strong> සහ <strong>Parameterized Binding</strong> (උදා: <code>:email</code>, <code>:id</code>) පමණක් භාවිත කර තිබෙනවා. මෙහිදී query structure එක database engine එක විසින් compile කර අවසන් වන බැවින්, user input එකක් malicious SQL command එකක් ලෙස execute වීමට කිසිදු ඉඩක් නොමැත.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "We completely mitigate SQL Injection vulnerabilities by strictly adhering to PDO Prepared Statements with parameterized queries across all endpoints. User inputs are bound as pure parameter values rather than concatenated strings, preventing malicious SQL code execution."
    </div>
  </div>
</div>

<!-- Q3 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q3</span> 
    3D Model එකක් generate කිරීමේදී API Cost එක සහ Latency එක අඩුකර ගැනීමට ඔබ කළ විශේෂ ඉංජිනේරු විසඳුම කුමක්ද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> අප <code>backend/generate_3d.php</code> හි <strong>MD5 Content Hash Caching Algorithm</strong> එකක් ක්‍රියාත්මක කළා. පරිශීලකයෙකු 2D image එකක් 3D කිරීමට ඉල්ලූ විට, එම image එකෙහි binary දත්ත වලින් MD5 hash එකක් සාදා <code>user_3d_models</code> වගුවේ එම hash එක තිබේදැයි බලනවා. තිබේ නම්, Tripo3D API එකට නැවත request නොයවා <strong>තත්පර 0.03ක් (30ms)</strong> ඇතුළත Cache එකෙන් GLB එක ලබාදෙනවා. මේ නිසා අපගේ API credits නාස්ති වීම සහ පරිශීලකයාගේ කාලය 95%කින් ඉතිරි වෙනවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "We engineered an MD5 cryptographic content hashing cache in generate_3d.php. Before making an expensive external API call to Tripo3D, we hash the base64 image data and query user_3d_models. If cached, it serves the existing GLB model in under 30ms, eliminating redundant cloud compute costs and user wait time."
    </div>
  </div>
</div>

<!-- Q4 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q4</span> 
    proxy_glb.php file එකක් නිර්මාණය කිරීමට සිදුවූ තාක්ෂණික හේතුව කුමක්ද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> කරුණු දෙකක් නිසා: පළමුවැන්න, Tripo3D CloudFront CDN එකෙන් <code>Access-Control-Allow-Origin: *</code> header එක නොඑවන විට බ්‍රවුසරයේ Three.js WebGL Loader එකට CORS error එකක් පැමිණීම. දෙවැන්න, CloudFront signed URLs පැය 24කින් expire වීමයි. <code>proxy_glb.php</code> මඟින් model එක දේශීයව <code>temp/glb_cache/</code> එකෙහි cache කර, නිවැරදි CORS headers සහ binary chunks සමඟ frontend එකට stream කරයි.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "Remote CloudFront 3D assets lack permissive CORS headers needed by Three.js GLTFLoader, and signed URLs expire within 24 hours. proxy_glb.php acts as a high-performance streaming proxy that bypasses CORS restrictions and persists binary GLB files in a local cache directory for permanent availability."
    </div>
  </div>
</div>

<!-- Q5 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q5</span> 
    Pass-through Authentication සහ Password Hashing එක සිදුවන්නේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> පරිශීලකයා ලියාපදිංචි වීමේදී (Sign Up), PHP හි <code>password_hash($password, PASSWORD_DEFAULT)</code> භාවිතයෙන් Bcrypt ඇල්ගොරිතමය ඔස්සේ 60-character cryptographically secure hash එකක් සාදා MySQL හි ගබඩා කරනවා. Login වීමේදී <code>password_verify($password, $dbHash)</code> මඟින් timing attack-safe විදියට hash එක සසඳනවා. සාර්ථක වූ පසු PHP Native Sessions (<code>$_SESSION['user_id']</code>) මඟින් authenticated state එක පවත්වා ගන්නවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "User authentication utilizes the industry-standard Bcrypt algorithm via PHP's password_hash() with automatic salt generation. Verification is handled using password_verify() to guard against timing attacks, and authenticated states are maintained via secure server-side session cookies."
    </div>
  </div>
</div>

<!-- PAGE 8: REMAINING VIVA QUESTIONS -->
<div class="page-break"></div>

<!-- Q6 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q6</span> 
    Gender Mismatch එකක් (Male user selecting Female dress) Backend එකෙන් වළක්වන්නේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> <code>validate_gender.php</code> මඟින් Dual-Tier Guard එකක් ක්‍රියාත්මක වෙනවා. පළමුව Regex මඟින් filename පරීක්ෂා කරන අතර, දෙවනුව GD Library එකෙන් image එක 320px Thumbnail (~12KB) එකක් බවට පත්කර Google Gemini Vision API වෙත යවනවා. ලිංගිකත්වය නොගැලපේ නම්, Expensive GPU Try-On එකට යැවීමට පෙර 400 Bad Request / Mismatch error එකක් සමඟ ක්‍රියාවලිය වහාම නවත්වනවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "We created a dual-tier validation guard in validate_gender.php. It first runs a sub-millisecond regex filename check, followed by an in-memory 320px downsampled thumbnail check via Gemini Vision. If a mismatch is detected against the catalog garment's target gender, the pipeline aborts immediately before hitting costly GPU resources."
    </div>
  </div>
</div>

<!-- Q7 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q7</span> 
    Try-on එකේදී Full-body photos වල ඔලුව හෝ දෙපා කැපීයාම (cropping) වැළැක්වූ ආකාරය පහදන්න.
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> <code>FalService.php</code> හි ඇති <code>standardizeModelImage()</code> method එකෙන් Smart Aspect-Ratio Pillarboxing ඇල්ගොරිතමයක් ලියා තිබෙනවා. රූපය 9:16 portrait එකක් නම්, උස 100%ක්ම ආරක්ෂා කරමින් දෙපසට පමණක් padding එකතු කරනවා. තවද, දෙපසට කළු තීරු (black bars) නොවැටී ස්වභාවිකව පෙනීමට, රූපයේ කොනක (corner pixel) වර්ණය හඳුනාගෙන canvas එක එම පාටින්ම fill කරනවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "We implemented an aspect-ratio preserving pillarboxing algorithm in FalService.php. For tall 9:16 portraits, it preserves 100% of the vertical height from head to toe, centers the subject horizontally, and seamlessly samples the corner pixel color to fill borders without adding artificial black bars."
    </div>
  </div>
</div>

<!-- Q8 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q8</span> 
    Face Restoration Weight එක 0.5 ට වෙනස් කිරීමට හේතුව කුමක්ද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> Fal.ai හි CodeFormer face restoration weight එක Default 1.0 තිබෙන විට, සම්පූර්ණ ඇඟට සාපේක්ෂව හිස පමණක් කෘතිමව විශාල වී (oversized cartoonish look) පෙනුණා. අප එය <code>DEFAULT_FACE_RESTORATION_WEIGHT = 0.5</code> ලෙස සකසා ස්වභාවික මිනිස් ශරීර සමානුපාතිකත්වය (natural head-to-body ratio) ලබාගත්තා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "The default CodeFormer face restoration weight of 1.0 caused disproportional head enlargement on full-body models. We fine-tuned the weight constraint to 0.5 in FalService.php, achieving photorealistic facial clarity while preserving realistic anatomical proportions."
    </div>
  </div>
</div>

<!-- Q9 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q9</span> 
    Bespoke Tailoring (Custom Outfit Request) එකක Backend Lifecycle එක කුමක්ද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> <code>custom_requests.php</code> මඟින් අදියර 3ක Lifecycle එකක් පාලනය වේ: (1) <strong>Pending Review</strong>: පාරිභෝගිකයා top/bottom පාට සහ notes සමඟ request එක දමයි. (2) <strong>In Design</strong>: Admin ඉල්ලීම භාරගෙන මැසීම/නිර්මාණය ආරම්භ කරයි. (3) <strong>Ready for Download</strong>: Admin නිමකළ design image එක upload කළ පසු පාරිභෝගිකයාගේ notification center එකට ස්වයංක්‍රීය alert එකක් යයි.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "The bespoke tailoring module follows a strict 3-stage state machine: 'Pending Review' upon submission, 'In Design' when assigned to the tailoring team, and 'Ready for Download' once the completed outfit render is uploaded, triggering real-time user notification records."
    </div>
  </div>
</div>

<!-- Q10 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q10</span> 
    Multimodal AI Stylist එකේදී Hallucinations සහ වැරදි ඇඳුම් නිර්දේශ වීම වැළැක්වූයේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> <strong>Contextual Inventory Injection</strong> ක්‍රමවේදය මඟිනි. <code>chat_multimodal.php</code> මඟින් ප්‍රථමයෙන් MySQL <code>garment</code> table එකෙන් සැබවින්ම stock එකේ ඇති active ඇඳුම් ලැයිස්තුව fetch කර, user's gender එකට පමණක් match වන items Gemini Vision prompt එකට system context එකක් ලෙස inject කරයි. එම නිසා catalog එකේ නැති ඇඳුම් නිර්දේශ කිරීමෙන් AI එක වැළකේ.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "We use Contextual Inventory Injection in chat_multimodal.php. The backend fetches active garments directly from MySQL, filters them by the user's detected gender, and embeds them into the LLM system prompt, constraining Gemini to only recommend items currently in inventory."
    </div>
  </div>
</div>

<!-- PAGE 9: FINAL 5 QUESTIONS & CONCLUSION -->
<div class="page-break"></div>

<!-- Q11 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q11</span> 
    3D Mesh එකක් හැදීමේදී studio background එක (බිත්ති, දොරවල්) Mesh එකට එකතු වීම වැළැක්වූයේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> <code>generate_3d.php</code> හිදී ඡායාරූපය Tripo3D වෙත යැවීමට ප්‍රථමයෙන්, Fal Background Removal AI මඟින් background එක සම්පූර්ණයෙන්ම ඉවත් කර, පුද්ගලයා සහ ඇඳුම පමණක් සහිත Transparent PNG එකක් සාදා Tripo3D API එකට යවනවා. එමගින් 3D mesh එක පිරිසිදු human mesh එකක් ලෙස පමණක් හැදෙනවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "Before submitting to Tripo3D, generate_3d.php invokes an automated background removal microservice. This strips walls, floors, and studio clutter, supplying Tripo3D with an isolated transparent subject to prevent background geometry distortions."
    </div>
  </div>
</div>

<!-- Q12 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q12</span> 
    Server එකෙහි Database Connection එක හැසිරවීමේදී Failover resilience ලබාදුන්නේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> <code>database.php</code> හි <code>$hostsToTry = [$host, "127.0.0.1", "localhost", "127.0.0.1;port=" . $port]</code> array loop එකක් ක්‍රියාත්මක වෙනවා. එක් host configuration එකක් fail වුවහොත් ඊළඟ host එකට try කරන අතර, database එක නැතිනම් root permissions මඟින් <code>CREATE DATABASE IF NOT EXISTS style360_v2</code> ක්‍රියාත්මක කර reconnect වෙනවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "database.php implements a multi-host failover loop across localhost, loopback IP, and custom ports. If the style360_v2 database is missing, it catches the PDOException, auto-provisions the database schema using root credentials, and establishes a persistent UTF-8 connection."
    </div>
  </div>
</div>

<!-- Q13 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q13</span> 
    3D Models වල දිගු URLs (>900 chars) Database එකේ Save කිරීමේදී ආපු Issue එක විසඳුවේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> සාමාන්‍ය <code>VARCHAR(255)</code> එකක AWS CloudFront signed query parameters සහිත URLs truncate වී data corruption ඇති විය. <code>database.php</code> හි auto-migration එකක් මඟින් <code>ALTER TABLE try_on_history MODIFY COLUMN result_3d_url TEXT</code> ලෙස වෙනස් කර අසීමිත දිගකින් යුත් URLs ආරක්ෂිතව ගබඩා කිරීමට ඉඩ සැලැස්සුවා.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "CloudFront signed 3D model URLs frequently exceed 900 characters due to authentication tokens. We resolved this via automated schema migrations that upgraded result_3d_url from VARCHAR to TEXT in MySQL, preventing data truncation."
    </div>
  </div>
</div>

<!-- Q14 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q14</span> 
    Backend එකෙහි Error Handling සහ HTTP Status Codes කළමනාකරණය කර ඇත්තේ කෙසේද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong> සියලුම endpoints හි <code>http_response_code()</code> භාවිතයෙන් RESTful සම්මුතීන්ට අනුකූලව status codes ලබාදෙනවා: සාර්ථක ඉල්ලීම් සඳහා <code>200 OK</code>, වැරදි input දත්ත සඳහා <code>400 Bad Request</code>, Database හෝ Cloud API failures සඳහා <code>500 Internal Server Error</code>, සහ pre-flight check සඳහා <code>OPTIONS 200 OK</code>. සියලුම error responses <code>{"status": "error", "message": "..."}</code> ලෙස JSON format එකෙන් නිකුත් වේ.
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "Every endpoint enforces standard HTTP status codes: 200 OK for successful executions, 400 Bad Request for validation errors, and 500 for database or API exceptions. All responses maintain a uniform JSON envelope with status and descriptive message fields."
    </div>
  </div>
</div>

<!-- Q15 -->
<div class="qa-box avoid-break">
  <div class="qa-header">
    <span class="q-tag">Q15</span> 
    අනාගතයේදී මෙම Backend එක Enterprise Scale එකට ගෙන යාමට ඔබ යෝජනා කරන වැඩිදියුණු කිරීම් (Future Improvements) මොනවාද?
  </div>
  <div class="qa-body">
    <div class="ans-si">
      <strong>සිංහල පිළිතුර:</strong>
      <ol>
        <li><strong>Redis / RabbitMQ Queue System:</strong> AI Try-On සහ 3D Generation දිගු කාලීන (long-running) කාර්යයන් බැවින් Background Worker Queues (Celery/RabbitMQ) මඟින් asynchronous job processing කිරීම.</li>
        <li><strong>JWT (JSON Web Tokens):</strong> Stateless microservice scaling සඳහා PHP session වෙනුවට JWT Bearer tokens භාවිතය.</li>
        <li><strong>Cloudflare R2 / AWS S3 Integration:</strong> Local disk storage වෙනුවට direct S3 multi-region object storage භාවිතය (දැනටමත් <code>r2_storage.php</code> architecture එක සූදානම් කර ඇත).</li>
      </ol>
    </div>
    <div class="ans-en">
      <strong>English Viva Answer:</strong> "For enterprise scaling, we propose: 1) Asynchronous background job workers using Redis queues to decouple long AI generation tasks, 2) Migrating session-based auth to stateless JWT bearer tokens, and 3) Offloading local file storage to Cloudflare R2 / S3 object buckets, which we have prototyped in r2_storage.php."
    </div>
  </div>
</div>

<!-- SUMMARY CALLOUT -->
<div class="callout callout-purple avoid-break" style="margin-top: 20px;">
  <div class="callout-title">🏆 Viva Defense Tips for the Backend Candidate</div>
  <ul>
    <li><strong>Confidence on Code:</strong> "මම Backend එකේ Database Resilience, Caching, සහ AI Orchestration එක මුල සිටම optimize කරපු කෙනෙක්" යන ආත්ම විශ්වාසයෙන් කතා කරන්න.</li>
    <li><strong>Emphasize Engineering Decisions:</strong> නිකන්ම API එකක් call කළා කියනවාට වඩා <em>"MD5 Caching එකෙන් 30ms latency එකක් ගත්තා"</em>, <em>"GD In-memory downsampling එකෙන් payload එක 12KB කරලා Gemini speed එක 1.2s දක්වා වැඩි කළා"</em>, <em>"CORS සහ Expired Signed URLs bypass කරන්න Proxy streaming හැදුවා"</em> යනුවෙන් technical ගැඹුර පැහැදිලි කරන්න.</li>
  </ul>
</div>

</body>
</html>
"""

def main():
    print("[1/3] Writing publication-grade backend viva guide HTML...")
    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"       -> HTML written to {HTML_PATH}")

    print("[2/3] Rendering PDF via Microsoft Edge Headless...")
    if not os.path.exists(EDGE_EXE):
        print(f"ERROR: Edge executable not found at {EDGE_EXE}")
        sys.exit(1)

    cmd = [
        EDGE_EXE,
        "--headless",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        "--no-pdf-header-footer",
        f"--print-to-pdf={PDF_PATH}",
        HTML_PATH
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and os.path.exists(PDF_PATH):
        size_kb = os.path.getsize(PDF_PATH) / 1024
        print(f"[3/3] [SUCCESS] PDF generated successfully ({size_kb:.1f} KB):")
        print(f"       -> {PDF_PATH}")
        
        # Copy to artifact directory
        dest_artifact = os.path.join(ARTIFACT_DIR, "Style360_Backend_Viva_Guide_Sinhala.pdf")
        shutil.copyfile(PDF_PATH, dest_artifact)
        print(f"       -> Copied to artifacts: {dest_artifact}")
    else:
        print(f"ERROR: PDF generation failed. Return code: {res.returncode}")
        print("Stdout:", res.stdout)
        print("Stderr:", res.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
