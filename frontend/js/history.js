/**
 * Style360
 * Contributor: Member 3 (Frontend 3D Showcase & Gallery Contributor)
 */
/**
 * Style360 — My Fashion Studio Hub (history.js)
 * High-performance controller for Virtual Try-On Gallery & Custom Requests Tracker:
 * 1. Prioritizes generated Fal.ai Try-On results (result_image_url / vton_output_url)
 * 2. High-resolution Lightbox modal preview with full metadata
 * 3. Dynamic 3D Mesh state handling (View 3D Model vs. Generate 3D Mesh via Tripo AI)
 */

(function () {
    'use strict';

    // DOM Elements
    var historyGrid         = document.getElementById('history-grid');
    var customReqsContainer = document.getElementById('custom-reqs-container');
    var tabBtnTryons        = document.getElementById('tab-btn-tryons');
    var tabBtnCustomReqs    = document.getElementById('tab-btn-custom-reqs');
    var tryonCountBadge     = document.getElementById('tryon-count-badge');
    var customReqCountBadge = document.getElementById('custom-req-count-badge');

    // Lightbox DOM Elements
    var lightboxModal       = document.getElementById('history-lightbox-modal');
    var lightboxImg         = document.getElementById('lightbox-img');
    var lightboxTitle       = document.getElementById('lightbox-title');
    var lightboxCategory    = document.getElementById('lightbox-category');
    var lightboxDate        = document.getElementById('lightbox-date');
    var lightboxDlBtn       = document.getElementById('lightbox-dl-btn');
    var lightbox3dSlot      = document.getElementById('lightbox-3d-action-slot');
    var btnLightboxClose    = document.getElementById('btn-lightbox-close');
    var btnLightboxDismiss  = document.getElementById('btn-lightbox-dismiss');
    var lightboxBackdrop    = document.getElementById('lightbox-backdrop');

    // Internal State
    var tryonRecords = [];
    var activeLightboxRecord = null;

    function getApiUrl(endpoint) {
        var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
        return prefix + endpoint;
    }

    function getCurrentUserId() {
        var user = (window.Style360Auth && window.Style360Auth.getCurrentUser()) || (function () {
            try { return JSON.parse(localStorage.getItem('style360_user')); } catch (e) { return null; }
        })();
        return user ? user.id : 0;
    }

    function normalizeImageUrl(url) {
        if (!url || typeof url !== 'string') return '';
        url = url.trim();
        if (!url || url === 'null' || url === 'undefined') return '';
        if (url.indexOf('http') === 0 || url.indexOf('data:') === 0) {
            return url;
        }
        if (url.indexOf('/') !== 0) {
            url = '/' + url;
        }
        var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
        return prefix + url;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── Toast Notifications ───
    function showToast(type, title, message) {
        var existing = document.getElementById('style360-toast-wrap');
        if (!existing) {
            existing = document.createElement('div');
            existing.id = 'style360-toast-wrap';
            existing.style.cssText = 'position:fixed; bottom:28px; right:28px; z-index:100000; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
            document.body.appendChild(existing);
        }

        var toast = document.createElement('div');
        toast.className = 'studio-toast ' + (type || 'info');
        toast.style.cssText = 'pointer-events:auto; display:flex; align-items:flex-start; gap:12px; background:#1E1B4B; color:#FFFFFF; padding:14px 20px; border-radius:16px; box-shadow:0 12px 32px rgba(15,23,42,0.35); border-left:4px solid ' + (type === 'success' ? '#10B981' : '#7C3AED') + '; min-width:280px; max-width:400px; animation:toastIn 0.3s cubic-bezier(0.4,0,0.2,1);';

        var icon = type === 'success' ? '✨' : (type === 'error' ? '⚠️' : 'ℹ️');
        toast.innerHTML =
            '<div style="font-size:1.3rem;">' + icon + '</div>' +
            '<div style="flex:1;">' +
                '<div style="font-weight:800; font-size:0.92rem; margin-bottom:2px;">' + escapeHtml(title) + '</div>' +
                '<div style="font-size:0.8rem; color:#CBD5E1; line-height:1.4;">' + escapeHtml(message) + '</div>' +
            '</div>';

        existing.appendChild(toast);

        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(function () {
                if (toast.parentElement) toast.parentElement.removeChild(toast);
            }, 300);
        }, 4000);
    }

    // ─── Tab Switching ───
    function switchTab(tabName) {
        if (tabName === 'custom-reqs') {
            if (tabBtnTryons) tabBtnTryons.classList.remove('active');
            if (tabBtnCustomReqs) tabBtnCustomReqs.classList.add('active');
            if (historyGrid) historyGrid.style.display = 'none';
            if (customReqsContainer) customReqsContainer.style.display = 'flex';
        } else {
            if (tabBtnCustomReqs) tabBtnCustomReqs.classList.remove('active');
            if (tabBtnTryons) tabBtnTryons.classList.add('active');
            if (customReqsContainer) customReqsContainer.style.display = 'none';
            if (historyGrid) historyGrid.style.display = 'grid';
        }
    }

    if (tabBtnTryons) {
        tabBtnTryons.addEventListener('click', function () { switchTab('tryons'); });
    }
    if (tabBtnCustomReqs) {
        tabBtnCustomReqs.addEventListener('click', function () { switchTab('custom-reqs'); });
    }

    // Check URL parameters for direct tab navigation
    var urlParams = new URLSearchParams(window.location.search);
    var initialTab = urlParams.get('tab');
    if (initialTab === 'custom-requests' || initialTab === 'custom-reqs') {
        switchTab('custom-reqs');
    }

    // ─── 1. Load History Records ───
    function loadHistory() {
        var userId = getCurrentUserId();
        var primaryUrl = getApiUrl('/backend/get_history.php') + '?user_id=' + encodeURIComponent(userId);
        var fallbackUrl = getApiUrl('/backend/history.php') + '?user_id=' + encodeURIComponent(userId);

        // Fetch Virtual Try-On History with strict user-scoping
        fetch(primaryUrl)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                handleHistoryData(data);
            })
            .catch(function (err) {
                console.warn('[Style360] Fallback to history.php endpoint:', err);
                fetch(fallbackUrl)
                    .then(function (res) { return res.json(); })
                    .then(function (data) { handleHistoryData(data); })
                    .catch(function (fbErr) {
                        console.error('[Style360] Error fetching tryon history:', fbErr);
                        if (tryonCountBadge) tryonCountBadge.textContent = 0;
                        renderHistoryGrid([]);
                    });
            });

        // Fetch Custom Outfit Tailoring Requests
        loadCustomRequests(userId);
    }

    function handleHistoryData(data) {
        tryonRecords = (data && Array.isArray(data.history)) ? data.history : [];
        var totalCount = (data && typeof data.total === 'number') ? data.total : tryonRecords.length;
        if (tryonCountBadge) tryonCountBadge.textContent = totalCount;
        renderHistoryGrid(tryonRecords);
    }

    // ─── 2. Render Virtual Try-On Gallery Grid (Real Try-On Results ONLY) ───
    function renderHistoryGrid(records) {
        if (!historyGrid) return;
        historyGrid.innerHTML = '';

        // Strict real-tryon filter: omit empty strings and static catalog mock images (images/%)
        var seenImages = {};
        var uniqueRecords = [];
        (records || []).forEach(function (rec) {
            var raw = (rec.result_image_url || rec.vton_output_url || rec.result_2d_url || '').trim();
            // Discard empty, null, or static catalog images
            if (!raw || raw === 'null' || raw === 'undefined' || raw.indexOf('images/') === 0 || raw.indexOf('/images/') === 0) {
                return;
            }
            if (seenImages[raw]) return;
            seenImages[raw] = true;
            rec.result_image_url = raw;
            uniqueRecords.push(rec);
        });
        records = uniqueRecords;
        if (tryonCountBadge) tryonCountBadge.textContent = records.length;

        if (!records || records.length === 0) {
            historyGrid.innerHTML =
                '<div class="empty-tracker-card" style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem; background: #FFFFFF; border-radius: 24px; border: 1.5px dashed #CBD5E1; margin: 1rem 0;">' +
                    '<div style="font-size:3.2rem; margin-bottom:12px;">👗</div>' +
                    '<h3 style="font-size:1.35rem; font-weight:800; color:#1E1B4B; margin:0 0 8px 0;">No Try-On History Yet</h3>' +
                    '<p style="max-width:480px; margin:0 auto 1.6rem auto; line-height:1.6; color:#64748B;">' +
                        'You haven\'t generated any virtual try-ons yet. Pick your favorite outfit in our Studio and see yourself styled instantly!' +
                    '</p>' +
                    '<a href="index.html#tryon" class="btn-download-dress" style="display:inline-flex; width:auto; background:linear-gradient(135deg, #7C3AED, #6366F1);">' +
                        '✨ Open Studio &amp; Choose Outfit' +
                    '</a>' +
                '</div>';
            return;
        }

        records.forEach(function (rec) {
            // Strictly require genuine AI Try-On result URL — no static mock fallbacks
            var rawImg = rec.result_image_url || rec.vton_output_url || rec.result_2d_url || '';
            var imgUrl = normalizeImageUrl(rawImg);
            if (!imgUrl) return; // Omit card completely if no valid generated image exists

            var card = document.createElement('div');
            card.className = 'history-card';
            card.setAttribute('data-record-id', rec.id);

            var dateStr = rec.created_at ? new Date(rec.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent Look';
            var categoryStr = rec.garment_category ? (rec.garment_category.charAt(0).toUpperCase() + rec.garment_category.slice(1)) : 'Collection Outfit';

            // Check if 3D mesh model exists for this generation
            var has3D = !!(rec.has_3d_mesh || rec.tripo_model_id || rec.result_3d_url);
            var modelId = rec.tripo_model_id || ('tryon_' + rec.id);

            var btn3DHtml = '';
            if (has3D) {
                // If 3D exists: Display [ 🧊 View 3D Model ] linking directly to my-3d-models.html?load_3d=...
                var viewTargetUrl = getApiUrl('/frontend/my-3d-models.html') + '?load_3d=' + encodeURIComponent(modelId) + '&history_id=' + encodeURIComponent(rec.id);
                btn3DHtml = '<a href="' + viewTargetUrl + '" class="btn-history-3d btn-3d-view" title="Explore interactive 3D mesh in My 3D Models">🧊 View 3D Model</a>';
            } else {
                // If 3D does NOT exist: Display [ ⚡ Generate 3D Mesh ] triggering Tripo creation
                btn3DHtml = '<button type="button" class="btn-history-3d btn-3d-generate" data-id="' + rec.id + '" data-gender="' + escapeHtml(rec.garment_gender || '') + '" title="Generate interactive 3D mesh with Tripo AI">⚡ Generate 3D Mesh</button>';
            }

            card.innerHTML =
                '<div class="history-img-wrap" title="Click to view high-resolution preview">' +
                    '<img src="' + imgUrl + '" alt="' + escapeHtml(rec.garment_title || 'Try-On Look') + '" onerror="this.style.opacity=\'0\';" />' +
                    '<span class="history-tag-date">📅 ' + dateStr + '</span>' +
                    '<span class="history-badge-ai">⚡ Fal.ai VTON</span>' +
                    '<div class="img-zoom-hint">' +
                        '<span class="zoom-hint-pill">🔍 High-Res Preview</span>' +
                    '</div>' +
                '</div>' +
                '<div class="history-card-body">' +
                    '<h3 class="history-outfit-name">' + escapeHtml(rec.garment_title || 'Virtual Try-On Outfit') + '</h3>' +
                    '<div class="history-meta-row">' +
                        '<span>' + escapeHtml(categoryStr) + '</span>' +
                        '<span>HD AI Render</span>' +
                    '</div>' +
                    '<div class="history-card-actions">' +
                        '<div class="action-3d-wrapper" style="flex:1; display:flex;">' + btn3DHtml + '</div>' +
                        '<a href="' + imgUrl + '" download="style360_look_' + rec.id + '.png" class="btn-history-dl" title="Save image">📥 Save</a>' +
                    '</div>' +
                '</div>';

            // Lightbox Click on Image
            var imgWrap = card.querySelector('.history-img-wrap');
            if (imgWrap) {
                imgWrap.addEventListener('click', function () {
                    openLightbox(rec, imgUrl);
                });
            }

            // Bind Generate 3D button if not existing
            var btnGen3D = card.querySelector('.btn-3d-generate');
            if (btnGen3D) {
                btnGen3D.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    generate3DMesh(rec, imgUrl, this);
                });
            }

            historyGrid.appendChild(card);
        });
    }

    // ─── 3. Lightbox Modal Preview ───
    function openLightbox(rec, imgUrl) {
        activeLightboxRecord = rec;
        if (!lightboxModal) return;

        if (lightboxImg) {
            lightboxImg.src = imgUrl;
            lightboxImg.style.maxHeight = 'calc(92vh - 210px)';
            lightboxImg.style.maxWidth = '100%';
            lightboxImg.style.width = 'auto';
            lightboxImg.style.height = 'auto';
            lightboxImg.style.objectFit = 'contain';
            lightboxImg.style.objectPosition = 'center center';
            lightboxImg.style.display = 'block';
            lightboxImg.style.margin = '0 auto';
        }
        if (lightboxTitle) lightboxTitle.textContent = rec.garment_title || 'Virtual Try-On Output';
        if (lightboxCategory) lightboxCategory.textContent = rec.garment_category ? (rec.garment_category.charAt(0).toUpperCase() + rec.garment_category.slice(1)) : 'Collection Outfit';
        if (lightboxDate) {
            var dateStr = rec.created_at ? new Date(rec.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent Look';
            lightboxDate.textContent = '📅 ' + dateStr;
        }
        if (lightboxDlBtn) {
            lightboxDlBtn.href = imgUrl;
            lightboxDlBtn.download = 'style360_highres_' + rec.id + '.png';
        }

        // Configure dynamic 3D button in Lightbox
        updateLightbox3DButton(rec, imgUrl);

        lightboxModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function updateLightbox3DButton(rec, imgUrl) {
        if (!lightbox3dSlot) return;
        var has3D = !!(rec.has_3d_mesh || rec.tripo_model_id || rec.result_3d_url);
        var modelId = rec.tripo_model_id || ('tryon_' + rec.id);

        if (has3D) {
            var viewTargetUrl = getApiUrl('/frontend/my-3d-models.html') + '?load_3d=' + encodeURIComponent(modelId) + '&history_id=' + encodeURIComponent(rec.id);
            lightbox3dSlot.innerHTML = '<a href="' + viewTargetUrl + '" class="btn-lightbox-3d-view" title="Explore interactive 3D mesh in My 3D Models">🧊 View 3D Model</a>';
        } else {
            lightbox3dSlot.innerHTML = '<button type="button" class="btn-lightbox-3d-generate" id="btn-lightbox-gen3d">⚡ Generate 3D Mesh</button>';
            var btnModalGen = document.getElementById('btn-lightbox-gen3d');
            if (btnModalGen) {
                btnModalGen.addEventListener('click', function () {
                    generate3DMesh(rec, imgUrl, this);
                });
            }
        }
    }

    function closeLightbox() {
        if (!lightboxModal) return;
        lightboxModal.style.display = 'none';
        document.body.style.overflow = '';
        activeLightboxRecord = null;
    }

    if (btnLightboxClose) btnLightboxClose.addEventListener('click', closeLightbox);
    if (btnLightboxDismiss) btnLightboxDismiss.addEventListener('click', closeLightbox);
    if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && lightboxModal && lightboxModal.style.display === 'flex') {
            closeLightbox();
        }
    });

    // ─── 4. Dynamic Tripo 3D Mesh Generation ───
    function generate3DMesh(rec, imgUrl, triggerBtn) {
        if (!rec) return;

        var originalHtml = triggerBtn ? triggerBtn.innerHTML : '⚡ Generate 3D Mesh';
        
        // Immediately disable all trigger buttons for this generation and display loading state
        document.querySelectorAll('.btn-3d-generate[data-id="' + rec.id + '"], #btn-lightbox-gen3d').forEach(function (btn) {
            btn.disabled = true;
            btn.classList.add('is-loading');
            btn.innerHTML = '<span class="spinner-3d"></span> Reconstructing 3D...';
        });

        var userId = getCurrentUserId();
        var apiUrl3D = getApiUrl('/api/generate-3d');

        fetch(apiUrl3D, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                generation_id: rec.id,
                history_id: rec.id,
                image: imgUrl,
                gender: rec.garment_gender || 'unspecified',
                user_id: userId,
                mock: false
            })
        })
        .then(function (res) {
            return res.text().then(function (rawText) {
                try {
                    return JSON.parse(rawText);
                } catch (e) {
                    throw new Error('❌ 3D Generation failed.');
                }
            });
        })
        .then(function (data) {
            if (data && data.status === 'success' && data.model_url) {
                // Update in-memory record state
                rec.has_3d_mesh = true;
                rec.result_3d_url = data.model_url;
                rec.tripo_model_id = data.tripo_model_id || ('tryon_' + rec.id);

                var modelId = rec.tripo_model_id || ('tryon_' + rec.id);
                var viewUrl = getApiUrl('/frontend/my-3d-models.html') + '?load_3d=' + encodeURIComponent(modelId) + '&history_id=' + encodeURIComponent(rec.id);

                // Update card button in grid
                var card = document.querySelector('[data-record-id="' + rec.id + '"]');
                if (card) {
                    var slot = card.querySelector('.action-3d-wrapper');
                    if (slot) {
                        slot.innerHTML = '<a href="' + viewUrl + '" class="btn-history-3d btn-3d-view" title="Explore interactive 3D mesh in My 3D Models">🧊 View 3D Model</a>';
                    }
                }

                // Update lightbox button if open
                if (activeLightboxRecord && activeLightboxRecord.id === rec.id) {
                    updateLightbox3DButton(rec, imgUrl);
                }

                showToast('success', '3D Mesh Created!', 'Your interactive 3D model is ready. Click "View 3D Model" to explore in My 3D Models.');
            } else {
                throw new Error((data && data.message) ? data.message : '❌ 3D Generation failed.');
            }
        })
        .catch(function (err) {
            console.error('[Style360] 3D mesh generation error:', err);
            document.querySelectorAll('.btn-3d-generate[data-id="' + rec.id + '"], #btn-lightbox-gen3d').forEach(function (btn) {
                btn.disabled = false;
                btn.classList.remove('is-loading');
                btn.innerHTML = originalHtml;
            });
            var msg = err.message || '❌ 3D Generation failed.';
            msg = msg.replace(/\.?\s*No credits? lost\.?/gi, '').trim();
            showToast('error', '3D Generation Failed', msg || '❌ 3D Generation failed.');
        });
    }

    // ─── 5. Custom Requests Loader & Tracker ───
    function loadCustomRequests(userId) {
        var url = getApiUrl('/api/custom-request');
        if (userId) {
            url += '?user_id=' + encodeURIComponent(userId);
        }

        fetch(url)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var requests = (data && data.status === 'success' && Array.isArray(data.requests)) ? data.requests : [];
                if (customReqCountBadge) customReqCountBadge.textContent = requests.length;
                renderCustomRequests(requests);
            })
            .catch(function (err) {
                console.error('[Style360] Error fetching custom requests:', err);
                if (customReqsContainer) {
                    customReqsContainer.innerHTML = '<div class="empty-tracker-card"><p>Failed to connect to requests service.</p></div>';
                }
            });
    }

    function renderCustomRequests(requests) {
        if (!customReqsContainer) return;
        customReqsContainer.innerHTML = '';

        if (requests.length === 0) {
            customReqsContainer.innerHTML = 
                '<div class="empty-tracker-card">' +
                    '<div style="font-size:3rem; margin-bottom:12px;">🧵</div>' +
                    '<h3 style="font-size:1.3rem; font-weight:800; color:#1E1B4B; margin:0 0 8px 0;">No Custom Tailoring Requests Yet</h3>' +
                    '<p style="max-width:480px; margin:0 auto 1.5rem auto; line-height:1.6; color:#64748B;">' +
                        'Select an outfit in our Studio, click "Custom Outfit Request", specify your dream colors and notes, and our designers will create your custom render!' +
                    '</p>' +
                    '<a href="index.html#tryon" class="btn-download-dress" style="display:inline-flex; width:auto; background:linear-gradient(135deg, #7C3AED, #6366F1);">' +
                        '⚡ Open Studio &amp; Choose Outfit' +
                    '</a>' +
                '</div>';
            return;
        }

        requests.forEach(function (r) {
            var card = document.createElement('div');
            card.className = 'custom-req-card';

            // Normalize status
            var rawStatus = (r.status || 'Pending Review').trim();
            var normStatus = 'Pending Review';
            if (rawStatus.toLowerCase() === 'in design') {
                normStatus = 'In Design';
            } else if (rawStatus.toLowerCase() === 'ready for download' || rawStatus.toLowerCase() === 'completed') {
                normStatus = 'Ready for Download';
            }

            var isStep1Done = (normStatus === 'In Design' || normStatus === 'Ready for Download');
            var isStep1Active = (normStatus === 'Pending Review');
            var isStep2Done = (normStatus === 'Ready for Download');
            var isStep2Active = (normStatus === 'In Design');
            var isStep3Done = (normStatus === 'Ready for Download');

            var fillWidth = '0%';
            if (normStatus === 'Pending Review') fillWidth = '15%';
            else if (normStatus === 'In Design') fillWidth = '50%';
            else if (normStatus === 'Ready for Download') fillWidth = '100%';

            var thumbUrl = r.display_image_url ? normalizeImageUrl(r.display_image_url) : '';
            var reqDate = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

            var readyShowcaseHtml = '';
            if (isStep3Done && r.result_image_url) {
                var resImg = normalizeImageUrl(r.result_image_url);

                readyShowcaseHtml = 
                    '<div class="ready-result-box">' +
                        '<div class="ready-result-left">' +
                            '<img src="' + resImg + '" alt="Custom Tailored Dress" class="ready-dress-thumb" />' +
                            '<div>' +
                                '<div style="font-size:0.8rem; font-weight:800; color:#059669; text-transform:uppercase; margin-bottom:2px;">✨ Dress Completed &amp; Ready</div>' +
                                '<div style="font-weight:700; color:#064E3B; font-size:1.05rem;">Your Custom Bespoke Render is Ready!</div>' +
                                '<div style="font-size:0.8rem; color:#047857;">Click the button on the right to download in high definition.</div>' +
                            '</div>' +
                        '</div>' +
                        '<a href="' + resImg + '" download="style360_custom_dress_' + r.id + '.png" class="btn-download-dress">' +
                            '📥 Download Dress' +
                        '</a>' +
                    '</div>';
            }

            card.innerHTML =
                '<div class="req-card-header">' +
                    '<div class="req-garment-info">' +
                        (thumbUrl ? ('<img src="' + thumbUrl + '" alt="Outfit Thumbnail" class="req-garment-thumb" onerror="this.style.display=\'none\';" />') : '') +
                        '<div class="req-title-wrap">' +
                            '<h3>' + escapeHtml(r.garment_title || 'Custom Outfit Design') + '</h3>' +
                            '<div class="req-card-meta">' +
                                '<span class="req-id-badge">REQ #' + r.id + '</span>' +
                                '<span>Requested on ' + reqDate + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="req-status-pill ' + normStatus.toLowerCase().replace(/\s+/g, '-') + '">' +
                        '<span class="pulse-dot"></span>' + normStatus +
                    '</div>' +
                '</div>' +
                '<div class="req-details-grid">' +
                    '<div class="color-swatch-item">' +
                        '<span>Top Color:</span>' +
                        '<span class="color-dot-indicator" style="background-color:' + escapeHtml(r.top_color || '#cccccc') + ';"></span>' +
                        '<strong>' + escapeHtml(r.top_color || 'Standard') + '</strong>' +
                    '</div>' +
                    '<div class="color-swatch-item">' +
                        '<span>Bottom Color:</span>' +
                        '<span class="color-dot-indicator" style="background-color:' + escapeHtml(r.bottom_color || '#cccccc') + ';"></span>' +
                        '<strong>' + escapeHtml(r.bottom_color || 'Standard') + '</strong>' +
                    '</div>' +
                    (r.notes ? ('<div style="font-size:0.85rem; color:#475569; width:100%;"><strong style="color:#1E1B4B;">Notes:</strong> ' + escapeHtml(r.notes) + '</div>') : '') +
                '</div>' +
                '<div class="tracker-container">' +
                    '<div class="tracker-title">Request Progress Tracker</div>' +
                    '<div class="tracker-steps tracker-steps-wrap">' +
                        '<div class="tracker-line-track">' +
                            '<div class="tracker-line-fill" style="width:' + fillWidth + ';"></div>' +
                        '</div>' +
                        '<div class="tracker-step ' + (isStep1Done ? 'completed' : (isStep1Active ? 'active' : '')) + '">' +
                            '<div class="step-circle">' + (isStep1Done ? '✓' : '1') + '</div>' +
                            '<div class="step-label">Pending Review</div>' +
                            '<div class="step-desc">Request Received</div>' +
                        '</div>' +
                        '<div class="tracker-step ' + (isStep2Done ? 'completed' : (isStep2Active ? 'active' : '')) + '">' +
                            '<div class="step-circle">' + (isStep2Done ? '✓' : (isStep2Active ? '🎨' : '2')) + '</div>' +
                            '<div class="step-label">In Design</div>' +
                            '<div class="step-desc">Tailoring &amp; Color Match</div>' +
                        '</div>' +
                        '<div class="tracker-step ' + (isStep3Done ? 'completed' : '') + '">' +
                            '<div class="step-circle">' + (isStep3Done ? '🎉' : '3') + '</div>' +
                            '<div class="step-label">Ready</div>' +
                            '<div class="step-desc">Finished Garment</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                readyShowcaseHtml;

            customReqsContainer.appendChild(card);
        });
    }

    document.addEventListener('DOMContentLoaded', loadHistory);

    window.Style360History = {
        loadHistory: loadHistory,
        renderHistoryGrid: renderHistoryGrid,
        openLightbox: openLightbox,
        closeLightbox: closeLightbox,
        generate3DMesh: generate3DMesh
    };

})();
