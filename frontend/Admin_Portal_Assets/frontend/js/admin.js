/* =====================================================
   Style360 — Admin Panel Controller (admin.js)
   ===================================================== */

(function () {
    'use strict';

    // Admin Auth & RBAC Check
    try {
        var rawUser = localStorage.getItem('style360_user');
        var user = rawUser ? JSON.parse(rawUser) : null;
        var isAdmin = !!(user && (user.role === 'admin' || user.is_admin === true || user.is_admin === 1 || user.is_admin === '1'));
        if (!isAdmin) {
            window.location.replace('index.html');
            return;
        }
    } catch(e) {
        window.location.replace('index.html');
        return;
    }

    var allGarments = [];

    // DOM Elements
    var formUpload        = document.getElementById('form-upload-garment');
    var inputDisplay      = document.getElementById('input-display-image');
    var dropzoneDisplay   = document.getElementById('dropzone-display');
    var displayEmptyView  = document.getElementById('display-empty-view');
    var displayPrevView   = document.getElementById('display-preview-view');
    var displayPrevImg    = document.getElementById('display-preview-img');
    var btnClearDisplay   = document.getElementById('btn-clear-display');

    var inputFal          = document.getElementById('input-fal-image');
    var dropzoneFal       = document.getElementById('dropzone-fal');
    var falEmptyView      = document.getElementById('fal-empty-view');
    var falPrevView       = document.getElementById('fal-preview-view');
    var falPrevImg        = document.getElementById('fal-preview-img');
    var btnClearFal       = document.getElementById('btn-clear-fal');
    var chkSameImage      = document.getElementById('chk-same-image');

    var btnSubmit         = document.getElementById('btn-submit-garment');
    var uploadAlert       = document.getElementById('upload-alert');
    var toast             = document.getElementById('admin-toast');

    var statTotal         = document.getElementById('stat-total-count');
    var statWomen         = document.getElementById('stat-women-count');
    var statMen           = document.getElementById('stat-men-count');
    var statActive        = document.getElementById('stat-active-count');

    var searchInput       = document.getElementById('admin-search-input');
    var filterGender      = document.getElementById('filter-gender-select');
    var filterCategory    = document.getElementById('filter-category-select');
    var garmentsGrid      = document.getElementById('admin-garments-grid');
    var btnRefresh        = document.getElementById('btn-refresh-list');

    // Helper: Show Toast
    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function () {
            toast.classList.remove('show');
        }, 3500);
    }

    // Helper: Show Alert
    function showAlert(msg, isSuccess) {
        if (!uploadAlert) return;
        uploadAlert.textContent = msg;
        uploadAlert.className = 'admin-alert ' + (isSuccess ? 'success' : 'error');
        uploadAlert.style.display = 'block';
    }

    function hideAlert() {
        if (uploadAlert) uploadAlert.style.display = 'none';
    }

    // ── 1. Fetch Garments from Database ──
    function fetchGarments() {
        var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/backend/garments.php' : '/backend/garments.php';

        fetch(apiUrl + '?gender=all&category=all&status=all')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.status === 'success' && Array.isArray(data.garments)) {
                    allGarments = data.garments;
                    updateStats();
                    renderInventoryGrid();
                }
            })
            .catch(function (err) {
                console.error('[Admin] Error fetching garments:', err);
                showToast('⚠️ Could not connect to database.');
            });
    }

    // ── 2. Update Stats Counter ──
    function updateStats() {
        var total = allGarments.length;
        var women = allGarments.filter(function (g) { return g.gender === 'female'; }).length;
        var men = allGarments.filter(function (g) { return g.gender === 'male'; }).length;
        var active = allGarments.filter(function (g) { return g.status === 'active'; }).length;

        if (statTotal) statTotal.textContent = total;
        if (statWomen) statWomen.textContent = women;
        if (statMen) statMen.textContent = men;
        if (statActive) statActive.textContent = active;
    }

    // ── 3. Render Inventory Grid ──
    function renderInventoryGrid() {
        if (!garmentsGrid) return;

        var searchVal = (searchInput ? searchInput.value.toLowerCase().trim() : '');
        var genderVal = (filterGender ? filterGender.value : 'all');
        var catVal    = (filterCategory ? filterCategory.value : 'all');

        var filtered = allGarments.filter(function (g) {
            if (genderVal !== 'all' && g.gender !== genderVal) return false;
            if (catVal !== 'all' && g.category !== catVal) return false;
            if (searchVal && g.title.toLowerCase().indexOf(searchVal) === -1) return false;
            return true;
        });

        if (filtered.length === 0) {
            garmentsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: #64748B;">' +
                '<p style="font-weight: 600; margin-bottom: 4px;">No garments matched the criteria.</p>' +
                '<p style="font-size: 0.8rem;">Try clearing search or filter selections.</p>' +
            '</div>';
            return;
        }

        garmentsGrid.innerHTML = '';

        filtered.forEach(function (g) {
            var card = document.createElement('div');
            card.className = 'admin-garment-item-card';

            var genderEmoji = g.gender === 'female' ? '👩 Female' : (g.gender === 'male' ? '👨 Male' : '⚧ Unisex');
            var statusClass = g.status === 'active' ? 'active' : 'inactive';
            var statusLabel = g.status === 'active' ? '🟢 Active' : '⚪ Inactive';

            // Resolve Image URL
            var imgSrc = g.display_image_url;
            if (imgSrc.indexOf('http') !== 0 && imgSrc.indexOf('/') !== 0) {
                imgSrc = '/' + imgSrc;
            }

            card.innerHTML =
                '<div class="admin-garment-thumb-wrap">' +
                    '<img src="' + imgSrc + '" alt="' + g.title + '" />' +
                    '<span class="item-badge-id">#' + g.id + '</span>' +
                    '<span class="item-badge-status ' + statusClass + '">' + statusLabel + '</span>' +
                '</div>' +
                '<div class="admin-item-info">' +
                    '<span class="item-category-tag">' + (g.category_label || g.category) + '</span>' +
                    '<h4 class="item-title" title="' + g.title + '">' + g.title + '</h4>' +
                    '<p class="item-gender-text">' + genderEmoji + '</p>' +
                '</div>' +
                '<div class="admin-item-actions">' +
                    '<button type="button" class="btn-toggle-status" data-id="' + g.id + '" data-status="' + (g.status === 'active' ? 'inactive' : 'active') + '">' +
                        (g.status === 'active' ? 'Set Inactive' : 'Set Active') +
                    '</button>' +
                    '<button type="button" class="btn-delete-garment" data-id="' + g.id + '" title="Delete Garment">🗑️ Delete</button>' +
                '</div>';

            // Toggle Status Action
            var btnToggle = card.querySelector('.btn-toggle-status');
            btnToggle.addEventListener('click', function () {
                var nextStatus = btnToggle.getAttribute('data-status');
                toggleGarmentStatus(g.id, nextStatus);
            });

            // Delete Action
            var btnDelete = card.querySelector('.btn-delete-garment');
            btnDelete.addEventListener('click', function () {
                if (confirm('Are you sure you want to delete "' + g.title + '" (# ' + g.id + ')?')) {
                    deleteGarment(g.id);
                }
            });

            garmentsGrid.appendChild(card);
        });
    }

    // ── 4. Toggle Status API ──
    function toggleGarmentStatus(id, newStatus) {
        var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/backend/garments.php' : '/backend/garments.php';

        fetch(apiUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, status: newStatus })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data && data.status === 'success') {
                showToast('✓ Garment #' + id + ' status set to ' + newStatus);
                fetchGarments();
            } else {
                showToast('⚠️ Failed to update status.');
            }
        })
        .catch(function () {
            showToast('⚠️ Error updating garment.');
        });
    }

    // ── 5. Delete Garment API ──
    function deleteGarment(id) {
        var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/backend/garments.php' : '/backend/garments.php';

        fetch(apiUrl + '?id=' + id, {
            method: 'DELETE'
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data && data.status === 'success') {
                showToast('✓ Garment #' + id + ' removed from database.');
                fetchGarments();
            } else {
                showToast('⚠️ ' + (data.message || 'Delete failed.'));
            }
        })
        .catch(function () {
            showToast('⚠️ Error deleting garment.');
        });
    }

    // ── 6. Dropzone & File Preview Handling ──
    function setupDropzone(dropzoneEl, inputEl, emptyEl, prevEl, prevImgEl, clearBtn) {
        if (!dropzoneEl || !inputEl) return;

        dropzoneEl.addEventListener('click', function (e) {
            if (e.target !== clearBtn) {
                inputEl.click();
            }
        });

        dropzoneEl.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropzoneEl.style.borderColor = '#7C3AED';
            dropzoneEl.style.background = '#F3E8FF';
        });

        dropzoneEl.addEventListener('dragleave', function () {
            dropzoneEl.style.borderColor = '';
            dropzoneEl.style.background = '';
        });

        dropzoneEl.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzoneEl.style.borderColor = '';
            dropzoneEl.style.background = '';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                inputEl.files = e.dataTransfer.files;
                handlePreview(e.dataTransfer.files[0]);
            }
        });

        inputEl.addEventListener('change', function () {
            if (inputEl.files && inputEl.files[0]) {
                handlePreview(inputEl.files[0]);
            }
        });

        function handlePreview(file) {
            var reader = new FileReader();
            reader.onload = function (evt) {
                prevImgEl.src = evt.target.result;
                emptyEl.style.display = 'none';
                prevEl.style.display = 'inline-block';
            };
            reader.readAsDataURL(file);
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                inputEl.value = '';
                prevEl.style.display = 'none';
                emptyEl.style.display = 'block';
            });
        }
    }

    setupDropzone(dropzoneDisplay, inputDisplay, displayEmptyView, displayPrevView, displayPrevImg, btnClearDisplay);
    setupDropzone(dropzoneFal, inputFal, falEmptyView, falPrevView, falPrevImg, btnClearFal);

    // Checkbox toggle for Fal Image
    if (chkSameImage && dropzoneFal) {
        chkSameImage.addEventListener('change', function () {
            if (chkSameImage.checked) {
                dropzoneFal.style.display = 'none';
                inputFal.removeAttribute('required');
            } else {
                dropzoneFal.style.display = 'block';
            }
        });
    }

    // ── 7. Handle Form Submit (Upload Garment) ──
    if (formUpload) {
        formUpload.addEventListener('submit', function (e) {
            e.preventDefault();
            hideAlert();

            if (!inputDisplay.files || !inputDisplay.files[0]) {
                showAlert('Please choose a display image file.', false);
                return;
            }

            var formData = new FormData(formUpload);

            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<span class="btn-spinner"></span> Saving Garment...';

            var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/backend/garments.php' : '/backend/garments.php';

            fetch(apiUrl, {
                method: 'POST',
                body: formData
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<span class="btn-icon-plus">＋</span><span class="btn-label-text">Save Garment to Database</span>';

                if (data && data.status === 'success') {
                    showAlert('✓ ' + data.message, true);
                    showToast('🎉 New outfit added to style360_v2 database!');
                    formUpload.reset();

                    // Reset previews
                    displayPrevView.style.display = 'none';
                    displayEmptyView.style.display = 'block';
                    falPrevView.style.display = 'none';
                    falEmptyView.style.display = 'block';
                    dropzoneFal.style.display = 'none';
                    chkSameImage.checked = true;

                    fetchGarments();
                } else {
                    showAlert('⚠️ ' + (data.message || 'Failed to upload garment.'), false);
                }
            })
            .catch(function (err) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<span class="btn-icon-plus">＋</span><span class="btn-label-text">Save Garment to Database</span>';
                console.error('[Admin] Submit error:', err);
                showAlert('⚠️ An unexpected network error occurred.', false);
            });
        });
    }

    // Live search & filters
    searchInput && searchInput.addEventListener('input', renderInventoryGrid);
    filterGender && filterGender.addEventListener('change', renderInventoryGrid);
    filterCategory && filterCategory.addEventListener('change', renderInventoryGrid);
    btnRefresh && btnRefresh.addEventListener('click', fetchGarments);

    // Initial Load
    document.addEventListener('DOMContentLoaded', fetchGarments);

})();
