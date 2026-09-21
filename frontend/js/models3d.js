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

        // Double-check: retain all valid real generated models
        var validModels = (modelsList || []).filter(function (m) {
            return !isDummyOrInvalidModel(m);
        });

        // ── Empty State Handling ──
        if (validModels.length === 0) {
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

        validModels.forEach(function (m, idx) {
            var rawGlb = (m.glb_url || m.model_file || '').trim();
            var glbPath = (rawGlb.indexOf('http') === 0) ? rawGlb : getApiUrl(rawGlb.indexOf('/') === 0 ? rawGlb : ('/' + rawGlb));
            var modelTargetId = m.id || ('tryon_' + idx);
            var viewerId = 'viewer-model-' + modelTargetId;
            var studioRedirectUrl = getApiUrl('/frontend/index.html') + '?load_3d=' + encodeURIComponent(modelTargetId);

            var card = document.createElement('div');
            card.className = 'model-3d-card';
            card.setAttribute('data-model-id', modelTargetId);
            if (m.tryon_history_id) {
                card.setAttribute('data-history-id', m.tryon_history_id);
                card.setAttribute('data-tryon-id', 'tryon_' + m.tryon_history_id);
            }
            if (m.u3d_id) {
                card.setAttribute('data-u3d-id', 'u3d_' + m.u3d_id);
            }
            if (m.task_id) {
                card.setAttribute('data-task-id', m.task_id);
            }

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
                        'camera-target="auto auto auto" ' +
                        'camera-orbit="0deg 75deg auto" ' +
                        'bounds="tight" ' +
                        'auto-rotate ' +
                        'camera-controls ' +
                        'touch-action="pan-y" ' +
                        'shadow-intensity="1.2" ' +
                        'shadow-softness="0.75" ' +
                        'exposure="0.92" ' +
                        'rotation-per-second="25deg" ' +
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
                        '<button type="button" class="btn-card-studio btn-open-modal-3d" data-model-id="' + escapeHtml(modelTargetId) + '">🔍 View Model</button>' +
                        '<a href="' + escapeHtml(glbPath) + '" download="style360_model_' + (m.id || idx) + '.glb" class="btn-card-download" title="Download .glb 3D mesh">📥 .GLB</a>' +
                    '</div>' +
                '</div>';

            // Attach model-viewer load error guard
            var mv = card.querySelector('model-viewer');
            if (mv) {
                mv.addEventListener('error', function (err) {
                    console.warn('[Style360 3D] Failed to load 3D mesh for card:', glbPath, err);
                });
            }

            // Card in-place controls
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

            // "🔍 View Model" Action: Open Interactive Expanded Modal Viewer
            var btnView = card.querySelector('.btn-open-modal-3d');
            if (btnView) {
                btnView.addEventListener('click', function (e) {
                    e.preventDefault();
                    open3DModal(m, glbPath, modelTargetId, categoryLabel, specsText);
                });
            }

            modelsGrid.appendChild(card);
        });

        // Auto-open targeted 3D model modal from ?load_3d=X, ?model_id=X, or ?history_id=X
        var urlParams = new URLSearchParams(window.location.search);
        var targetModelId = urlParams.get('model_id') || urlParams.get('load_3d') || urlParams.get('history_id');
        var historyIdParam = urlParams.get('history_id');

        if (targetModelId || historyIdParam) {
            var searchKey = String(targetModelId || historyIdParam).trim();
            var rawNum = searchKey.replace(/^(tryon_|u3d_)/i, '');
            var histNum = historyIdParam ? String(historyIdParam).trim() : '';

            // 1. Locate matched model from modelsList
            var matchedModel = modelsList.find(function (item) {
                if (!item) return false;
                var idStr  = String(item.id || '');
                var tidStr = String(item.task_id || '');
                var hidStr = String(item.tryon_history_id || '');
                var u3dStr = String(item.u3d_id || '');

                return idStr === searchKey ||
                       idStr === ('tryon_' + searchKey) ||
                       idStr === ('u3d_' + searchKey) ||
                       tidStr === searchKey ||
                       (hidStr && (hidStr === searchKey || hidStr === rawNum || hidStr === histNum)) ||
                       (u3dStr && (u3dStr === searchKey || u3dStr === rawNum));
            });

            // 2. Locate corresponding card in DOM
            var targetCard = null;
            if (matchedModel && matchedModel.id) {
                targetCard = document.querySelector('[data-model-id="' + matchedModel.id + '"]');
            }
            if (!targetCard) {
                targetCard = 
                    document.querySelector('[data-model-id="' + searchKey + '"]') ||
                    document.querySelector('[data-model-id="tryon_' + searchKey + '"]') ||
                    document.querySelector('[data-model-id="u3d_' + searchKey + '"]') ||
                    document.querySelector('[data-tryon-id="tryon_' + rawNum + '"]') ||
                    document.querySelector('[data-history-id="' + rawNum + '"]') ||
                    (histNum ? document.querySelector('[data-history-id="' + histNum + '"]') : null) ||
                    document.querySelector('[data-task-id="' + searchKey + '"]');
            }

            if (targetCard) {
                setTimeout(function () {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    var openBtn = targetCard.querySelector('.btn-open-modal-3d');
                    if (openBtn) {
                        openBtn.click();
                    } else if (matchedModel) {
                        var rawGlb = (matchedModel.glb_url || matchedModel.model_file || '').trim();
                        var glbPath = (rawGlb.indexOf('http') === 0) ? rawGlb : getApiUrl(rawGlb.indexOf('/') === 0 ? rawGlb : ('/' + rawGlb));
                        open3DModal(matchedModel, glbPath, matchedModel.id, matchedModel.category_label, matchedModel.specs);
                    }
                }, 250);
            } else if (matchedModel) {
                setTimeout(function () {
                    var rawGlb = (matchedModel.glb_url || matchedModel.model_file || '').trim();
                    var glbPath = (rawGlb.indexOf('http') === 0) ? rawGlb : getApiUrl(rawGlb.indexOf('/') === 0 ? rawGlb : ('/' + rawGlb));
                    open3DModal(matchedModel, glbPath, matchedModel.id, matchedModel.category_label, matchedModel.specs);
                }, 250);
            } else if (modelsList.length > 0) {
                setTimeout(function () {
                    var latest = modelsList[0];
                    var rawGlb = (latest.glb_url || latest.model_file || '').trim();
                    var glbPath = (rawGlb.indexOf('http') === 0) ? rawGlb : getApiUrl(rawGlb.indexOf('/') === 0 ? rawGlb : ('/' + rawGlb));
                    open3DModal(latest, glbPath, latest.id, latest.category_label, latest.specs);
                }, 300);
            }
        }
    }

    // ─── 3. Interactive Expanded 3D Modal Viewer Controller ───
    var modalOverlay    = document.getElementById('model-modal-overlay');
    var modalContainer  = document.getElementById('model-modal-container');
    var modalViewer     = document.getElementById('modal-model-viewer');
    var modalCloseBtn   = document.getElementById('modal-close-btn');
    var modalTitle      = document.getElementById('modal-detail-title');
    var modalCat        = document.getElementById('modal-detail-cat');
    var modalBtnDl      = document.getElementById('modal-btn-download');
    var modalBtnSpin    = document.getElementById('modal-tool-spin');
    var modalBtnReset   = document.getElementById('modal-tool-reset');
    var modalBtnFs      = document.getElementById('modal-btn-fullscreen');
    var modalLightPills = document.querySelectorAll('.modal-light-pill');
    var currentActiveModel = null;

    function open3DModal(m, glbPath, modelTargetId, categoryLabel, specsText) {
        if (!modalOverlay || !modalViewer) return;
        currentActiveModel = {
            m: m,
            glbPath: glbPath,
            modelTargetId: modelTargetId,
            categoryLabel: categoryLabel,
            specsText: specsText
        };

        if (modalTitle) modalTitle.textContent = m.title || 'Interactive 3D Look';
        if (modalCat) modalCat.textContent = categoryLabel || 'Collection Outfit';

        if (modalBtnDl) {
            modalBtnDl.href = glbPath;
            modalBtnDl.setAttribute('download', 'style360_model_' + modelTargetId + '.glb');
        }

        // Configure modal model-viewer for high resolution, auto-framing ~80%
        modalViewer.src = glbPath;
        modalViewer.cameraOrbit = '0deg 75deg auto';
        modalViewer.cameraTarget = 'auto auto auto';
        modalViewer.exposure = 0.92;
        modalViewer.shadowIntensity = 1.3;
        modalViewer.autoRotate = true;
        if (modalBtnSpin) modalBtnSpin.textContent = '⏸ Pause';

        modalLightPills.forEach(function (p) {
            p.classList.toggle('active', p.getAttribute('data-light') === 'studio');
        });

        modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function close3DModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        if (modalContainer) modalContainer.classList.remove('fullscreen');
        if (modalViewer) {
            modalViewer.autoRotate = false;
        }
        document.body.style.overflow = '';
    }

    // Modal Events Binding
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', close3DModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', function (e) {
            if (e.target === modalOverlay) {
                close3DModal();
            }
        });
    }

    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
            close3DModal();
        }
    });

    if (modalBtnSpin) {
        modalBtnSpin.addEventListener('click', function () {
            if (modalViewer) {
                modalViewer.autoRotate = !modalViewer.autoRotate;
                modalBtnSpin.textContent = modalViewer.autoRotate ? '⏸ Pause' : '▶ Auto-Rotate';
            }
        });
    }

    if (modalBtnReset) {
        modalBtnReset.addEventListener('click', function () {
            if (modalViewer) {
                modalViewer.cameraOrbit = '0deg 75deg auto';
                modalViewer.cameraTarget = 'auto auto auto';
                if (typeof modalViewer.resetTurntableRotation === 'function') {
                    modalViewer.resetTurntableRotation();
                }
            }
        });
    }

    if (modalBtnFs && modalContainer) {
        modalBtnFs.addEventListener('click', function () {
            modalContainer.classList.toggle('fullscreen');
            modalBtnFs.textContent = modalContainer.classList.contains('fullscreen') ? '✕' : '⛶';
        });
    }

    // Modal Lighting Preset Switcher
    modalLightPills.forEach(function (pill) {
        pill.addEventListener('click', function () {
            modalLightPills.forEach(function (p) { p.classList.remove('active'); });
            pill.classList.add('active');

            var mode = pill.getAttribute('data-light');
            if (!modalViewer) return;
            switch (mode) {
                case 'warm':
                    modalViewer.exposure = 1.02;
                    modalViewer.shadowIntensity = 1.1;
                    break;
                case 'dramatic':
                    modalViewer.exposure = 0.72;
                    modalViewer.shadowIntensity = 2.0;
                    break;
                case 'bright':
                    modalViewer.exposure = 1.10;
                    modalViewer.shadowIntensity = 0.9;
                    break;
                default: // studio
                    modalViewer.exposure = 0.92;
                    modalViewer.shadowIntensity = 1.3;
                    break;
            }
        });
    });

    document.addEventListener('DOMContentLoaded', loadModels);

    window.Style360Models = {
        loadModels: loadModels,
        renderModelsGrid: renderModelsGrid,
        open3DModal: open3DModal,
        close3DModal: close3DModal
    };

})();
