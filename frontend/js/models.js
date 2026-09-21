/**
 * Style360 — 3D Models Gallery Controller (models3d.js)
 * Manages fetching, strict validation, and interactive rendering of user-generated 3D meshes:
 * 1. Strictly checks that glb_url / model_file is valid and functional before rendering.
 * 2. Purges and rejects any hardcoded dummy placeholder cards ('Vintage Lace Blouse', 'Blue Groom Suit').
 * 3. Enforces user session scoping via backend/get_3d_models.php.
 * 4. Displays clear empty state panel: "No 3D Models Generated Yet. Try generating one in the Virtual Studio!"
 */

(function () {
    'use strict';

    var modelsGrid    = document.getElementById('models-grid');
    var filterBar     = document.getElementById('models-filter-bar');
    var currentFilter = 'all';
    var modelsList    = [];

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

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Strict Guard: Filter out dummy placeholder cards and non-functional URLs
     */
    function isDummyOrInvalidModel(m) {
        if (!m) return true;
        var title = (m.title || '').toLowerCase();
        var glb = (m.glb_url || m.model_file || m.raw_model_url || '').toLowerCase().trim();

        // 1. Remove mock/dummy placeholder cards
        if (title.indexOf('sampleman') !== -1 ||
            title.indexOf('dummy') !== -1 ||
            title.indexOf('mock model') !== -1 ||
            title.indexOf('mock avatar') !== -1) {
            return true;
        }

        // 2. Reject mock/dummy URLs
        if (glb.indexOf('lace_gown') !== -1 ||
            glb.indexOf('charcoal_suit') !== -1 ||
            glb.indexOf('sampleman_avatar') !== -1) {
            return true;
        }

        // 3. Must be functional .glb or .gltf or proxy_glb
        if (!glb || glb === 'null' || glb === 'undefined' || glb.length < 5) {
            return true;
        }
        if (glb.indexOf('.glb') === -1 && glb.indexOf('.gltf') === -1 && glb.indexOf('proxy_glb') === -1) {
            return true;
        }

        return false;
    }

    // ─── 1. Load Real 3D Models with Strict User Scoping ───
    function loadModels() {
        var userId = getCurrentUserId();
        var primaryUrl = getApiUrl('/backend/get_3d_models.php') + '?user_id=' + encodeURIComponent(userId);

        fetch(primaryUrl)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                handleModelsResponse(data);
            })
            .catch(function (err) {
                console.error('[Style360 3D] Error fetching 3D models:', err);
                modelsList = [];
                renderModelsGrid();
            });
    }

    function handleModelsResponse(data) {
        if (data && Array.isArray(data.models_3d)) {
            // Strictly retain only real, successfully generated 3D items
            modelsList = data.models_3d.filter(function (m) {
                return !isDummyOrInvalidModel(m);
            });
        } else {
            modelsList = [];
        }
        renderModelsGrid();
    }

    // ─── 2. Render 3D Models Grid ───
    function renderModelsGrid() {
        if (!modelsGrid) return;
        modelsGrid.innerHTML = '';

        // Category filtering
        var filtered = modelsList.filter(function (m) {
            if (currentFilter === 'all') return true;
            var cat = (m.category || '').toLowerCase();
            return cat === currentFilter.toLowerCase();
        });

        // Double-check: ensure NO card is rendered if dummy or non-functional
        var validModels = filtered.filter(function (m) {
            return !isDummyOrInvalidModel(m);
        });

        // ── Empty State Handling ──
        if (modelsList.length === 0) {
            // User has 0 successfully generated 3D models
            modelsGrid.innerHTML =
                '<div class="models-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4.5rem 1.5rem; background: #FFFFFF; border-radius: 24px; border: 1.5px dashed #CBD5E1; margin: 1rem 0; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.03);">' +
                    '<div style="font-size: 3.5rem; margin-bottom: 16px;">🪐</div>' +
                    '<h3 style="font-size: 1.4rem; font-weight: 800; color: #1E1B4B; margin: 0 0 10px 0;">No 3D Models Generated Yet</h3>' +
                    '<p style="max-width: 480px; margin: 0 auto 2rem auto; font-size: 1rem; line-height: 1.6; color: #64748B;">' +
                        'Try generating one in the Virtual Studio!' +
                    '</p>' +
                    '<div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">' +
                        '<a href="index.html#tryon" class="btn-card-studio" style="width:auto; padding:12px 28px; font-weight:700; font-size:0.95rem;">' +
                            '✨ Open Virtual Studio' +
                        '</a>' +
                        '<a href="index.html" class="btn-card-download" style="width:auto; padding:12px 24px; font-weight:700;">' +
                            '🏠 Explore Catalog' +
                        '</a>' +
                    '</div>' +
                '</div>';
            return;
        }

        if (validModels.length === 0) {
            // Models exist, but none in this specific category filter
            modelsGrid.innerHTML =
                '<div class="models-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem; background: #FFFFFF; border-radius: 24px; border: 1.5px dashed #CBD5E1; margin: 1rem 0;">' +
                    '<div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>' +
                    '<h3 style="font-size: 1.25rem; font-weight: 800; color: #1E1B4B; margin: 0 0 8px 0;">No 3D Models in this Category</h3>' +
                    '<p style="max-width: 440px; margin: 0 auto 1.6rem auto; font-size: 0.95rem; line-height: 1.6; color: #64748B;">' +
                        'No 3D models found matching this category filter.' +
                    '</p>' +
                    '<button type="button" class="btn-card-download" id="btn-reset-filter" style="width:auto; padding:10px 22px; font-weight:700; cursor:pointer;">' +
                        'Show All Models' +
                    '</button>' +
                '</div>';

            var btnReset = document.getElementById('btn-reset-filter');
            if (btnReset) {
                btnReset.addEventListener('click', function () {
                    if (filterBar) {
                        var allTab = filterBar.querySelector('[data-filter="all"]');
                        if (allTab) allTab.click();
                    }
                });
            }
            return;
        }

        validModels.forEach(function (m, idx) {
            var rawGlb = (m.glb_url || m.model_file || '').trim();
            var glbPath = (rawGlb.indexOf('http') === 0) ? rawGlb : getApiUrl(rawGlb.indexOf('/') === 0 ? rawGlb : ('/' + rawGlb));
            var modelTargetId = m.id || ('tryon_' + idx);
            var viewerId = 'viewer-model-' + modelTargetId;
            var studioRedirectUrl = getApiUrl('/frontend/index.html') + '?load_3d=' + encodeURIComponent(modelTargetId);

            var card = document.createElement('div');
            card.className = 'model-3d-card';
            card.setAttribute('data-model-id', modelTargetId);

            var categoryLabel = m.category_label || (m.category ? (m.category.charAt(0).toUpperCase() + m.category.slice(1)) : 'Collection Outfit');
            var specsText = m.specs || 'Tripo AI Neural Mesh • 360° Orbit • GLTF 2.0';

            card.innerHTML =
                '<div class="model-viewer-stage">' +
                    '<div class="model-card-top-badges">' +
                        '<span class="badge-cat-model">' + escapeHtml(categoryLabel) + '</span>' +
                        '<span class="badge-interactive-hint">✨ 360° Drag</span>' +
                    '</div>' +
                    '<model-viewer id="' + viewerId + '" ' +
                        'src="' + escapeHtml(glbPath) + '" ' +
                        'alt="' + escapeHtml(m.title || '3D Garment Model') + '" ' +
                        'crossorigin="anonymous" ' +
                        'camera-target="0m 1m 0m" ' +
                        'camera-orbit="0deg 75deg 2.7m" ' +
                        'field-of-view="35deg" ' +
                        'auto-rotate ' +
                        'camera-controls ' +
                        'touch-action="pan-y" ' +
                        'shadow-intensity="1" ' +
                        'exposure="1" ' +
                        'rotation-per-second="30deg" ' +
                        'interaction-prompt="auto">' +
                    '</model-viewer>' +
                    '<div class="viewer-controls-overlay">' +
                        '<button type="button" class="btn-viewer-ctrl btn-toggle-spin" data-viewer="' + viewerId + '">⏸ Pause</button>' +
                        '<button type="button" class="btn-viewer-ctrl btn-reset-cam" data-viewer="' + viewerId + '">🔄 Reset</button>' +
                    '</div>' +
                '</div>' +
                '<div class="model-card-body">' +
                    '<div class="model-title-wrap">' +
                        '<h3 class="model-card-name">' + escapeHtml(m.title || 'Interactive 3D Look') + '</h3>' +
                    '</div>' +
                    '<p class="model-specs-text">' + escapeHtml(specsText) + '</p>' +
                    '<div class="model-card-actions">' +
                        '<a href="' + escapeHtml(studioRedirectUrl) + '" class="btn-card-studio" data-model-id="' + escapeHtml(modelTargetId) + '">⚡ Try On in Studio</a>' +
                        '<a href="' + escapeHtml(glbPath) + '" download="style360_model_' + (m.id || idx) + '.glb" class="btn-card-download" title="Download .glb 3D mesh">📥 .GLB</a>' +
                    '</div>' +
                '</div>';

            // Attach model-viewer load error guard: remove broken card completely if loading fails
            var mv = card.querySelector('model-viewer');
            if (mv) {
                mv.addEventListener('error', function () {
                    console.warn('[Style360 3D] Failed to load 3D mesh for card:', glbPath);
                    // Remove card completely to avoid rendering broken half-cards
                    card.remove();
                    if (modelsGrid.children.length === 0) {
                        renderModelsGrid();
                    }
                });
            }

            // Controls
            var btnSpin = card.querySelector('.btn-toggle-spin');
            if (btnSpin) {
                btnSpin.addEventListener('click', function () {
                    var v = document.getElementById(viewerId);
                    if (v) {
                        v.autoRotate = !v.autoRotate;
                        btnSpin.textContent = v.autoRotate ? '⏸ Pause' : '▶ Spin';
                    }
                });
            }

            var btnReset = card.querySelector('.btn-reset-cam');
            if (btnReset) {
                btnReset.addEventListener('click', function () {
                    var v = document.getElementById(viewerId);
                    if (v && v.resetTurntableRotation) {
                        v.resetTurntableRotation();
                    }
                });
            }

            // "Try On in Studio" Navigation: Store 3D model in storage and redirect to index.html?load_3d=...
            var btnStudio = card.querySelector('.btn-card-studio');
            if (btnStudio) {
                btnStudio.addEventListener('click', function (e) {
                    e.preventDefault();
                    var payload = {
                        model_id: modelTargetId,
                        glb_url: glbPath,
                        model_file: glbPath,
                        title: m.title || '3D Garment Model',
                        category: m.category || 'western',
                        gender: m.gender || 'Male',
                        specs: specsText
                    };
                    try {
                        localStorage.setItem('style360_active_3d_model', JSON.stringify(payload));
                        sessionStorage.setItem('style360_active_3d_model', JSON.stringify(payload));
                    } catch (err) {
                        console.error('[Style360 3D] Failed to store 3D model:', err);
                    }

                    window.location.href = studioRedirectUrl;
                });
            }

            modelsGrid.appendChild(card);
        });

        // Check if URL has ?model_id=X to focus targeted 3D model
        var urlParams = new URLSearchParams(window.location.search);
        var targetModelId = urlParams.get('model_id');
        if (targetModelId) {
            var targetCard = document.querySelector('[data-model-id="' + targetModelId + '"]') ||
                             document.querySelector('[data-model-id="tryon_' + targetModelId + '"]');
            if (targetCard) {
                setTimeout(function () {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetCard.style.outline = '3px solid #7C3AED';
                    targetCard.style.boxShadow = '0 0 35px rgba(124, 58, 237, 0.45)';
                    targetCard.style.transition = 'all 0.4s ease';
                }, 350);
            }
        }
    }

    // ─── 3. Filter Tabs Binding ───
    if (filterBar) {
        var tabs = filterBar.querySelectorAll('.model-tab-btn');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                currentFilter = tab.getAttribute('data-filter') || 'all';
                renderModelsGrid();
            });
        });
    }

    document.addEventListener('DOMContentLoaded', loadModels);

    window.Style360Models = {
        loadModels: loadModels,
        renderModelsGrid: renderModelsGrid
    };

})();
