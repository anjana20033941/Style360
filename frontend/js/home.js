/* =====================================================
   Style360 — Main Application Controller (home.js v8)
   - Fetches Outfits directly from MySQL style360_v2.garment table
   - Dynamic Category Filter Tabs on Collection Page:
     [All] [Western] [Bridal & Formal] [Casual] [Suits & Blazers]
   - Each Garment Card equipped with data-category & data-gender
   - Clean 4-Step Try-On Studio (No custom file upload):
     1. Step 1: User Photo Upload & Gender Selection
     2. Step 2: Instant Category Shortcuts & Garment Selection
     3. Step 3: 2D Try-On Result & Prominent 'Try 3D View' Action
     4. Step 4: On 'Try 3D View' Click -> Tripo3D API & Three.js 360° Render
   ===================================================== */

(function () {
    'use strict';

    /* ─── Global State & Garment Storage ─── */
    var ALL_GARMENTS = [];

    /* ─── Category / Collection Navigation Shortcuts for Step 2 Studio ─── */
    var CATEGORY_SHORTCUTS = [
        { id: 'all', label: 'All Collections', badge: '', badgeClass: '', gender: null },
        { id: 'western', label: '👗 Western', badge: '', badgeClass: '', gender: null },
        { id: 'bridal', label: "👰 Bridal & Formal", badge: 'EXCLUSIVE', badgeClass: 'exclusive', gender: null },
        { id: 'casual', label: '👕 Casual', badge: '', badgeClass: '', gender: null },
        { id: 'suits', label: "🤵 Suits & Blazers", badge: '', badgeClass: '', gender: null }
    ];

    /* ─── State for Try-On Studio ─── */
    var tryonState = {
        userPhotoData: null,
        detectedPhotoGender: null,
        selectedGender: 'Male',
        activeCategoryShortcut: 'all',
        selectedGarment: null,
        generated2DImage: null,
        generated3DModelUrl: null,
        isProcessing2D: false,
        isProcessing3D: false,
        currentCollectionCat: 'cat-wedding-women',
        currentCollectionFilter: 'all'
    };
    window.tryonState = tryonState;
    window.selectedOutfit = null;

    /* ─── DOM Elements ─── */
    var homePage           = document.getElementById('home-page');
    var categorySection    = document.getElementById('category-section');
    var studioSection      = document.getElementById('studio-section');
    var tryonSection       = document.getElementById('tryon-dedicated-section');
    var header             = document.getElementById('main-header');

    var navHomeLink        = document.getElementById('nav-home-link');
    var navTryOnLink       = document.getElementById('nav-tryon-link');
    var navHomeLogo        = document.getElementById('nav-home-logo');

    var btnGetStarted      = document.getElementById('btn-get-started');
    var btnShopNow         = document.getElementById('btn-shop-now');
    var btnCatBack         = document.getElementById('btn-cat-back');

    var btnSwitchWomen     = document.getElementById('btn-switch-women');
    var btnSwitchMen       = document.getElementById('btn-switch-men');

    var catBrowseTitle     = document.getElementById('cat-browse-title');
    var catBrowseBadge     = document.getElementById('cat-browse-badge');
    var garmentGrid        = document.getElementById('garment-grid');

    var podStage           = document.querySelector('.scanner-pod-stage');
    var studioCenterTarget = document.querySelector('.studio-grid-center');

    /* ─── Helper Functions ─── */
    function show(el) { if (el) el.style.display = 'block'; }
    function hide(el) { if (el) el.style.display = 'none'; }

    function setActiveNav(activeLink) {
        [navHomeLink, navTryOnLink].forEach(function (l) {
            if (l) l.classList.remove('active');
        });
        if (activeLink) activeLink.classList.add('active');
    }

    function restoreHomeStyles() {
        document.body.classList.remove('studio-mode');
        document.body.style.background = '';
        document.body.style.color = '';
        if (header) {
            header.style.background = '';
            header.style.borderBottom = '';
        }
    }

    /* ─── Global Style360 Toast Notification ─── */
    function showStyle360Toast(type, title, message, duration) {
        duration = duration || 4500;
        var container = document.getElementById('style360-toast-container');
        var toast     = document.getElementById('style360-toast');
        var iconWrap  = document.getElementById('toast-icon-wrap');
        var titleEl   = document.getElementById('toast-title');
        var msgEl     = document.getElementById('toast-message');
        var btnClose  = document.getElementById('btn-close-toast');
        if (!container || !toast) return;

        toast.className = 'style360-toast ' + (type === 'error' ? 'toast-error' : (type === 'warning' ? 'toast-warning' : (type === 'success' ? 'toast-success' : 'toast-info')));
        if (iconWrap) {
            iconWrap.textContent = (type === 'error' || type === 'warning') ? '⚠️' : ((type === 'success') ? '✓' : 'ℹ️');
        }
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;

        container.classList.add('show');

        if (window._style360ToastTimer) {
            clearTimeout(window._style360ToastTimer);
        }
        window._style360ToastTimer = setTimeout(function () {
            container.classList.remove('show');
        }, duration);

        if (btnClose) {
            btnClose.onclick = function () {
                container.classList.remove('show');
            };
        }
    }
    window.showStyle360Toast = showStyle360Toast;

    /* ─── Infer Outfit Target Gender ─── */
    function inferOutfitGender(garment) {
        if (!garment) return null;
        var g = (garment.gender || '').toLowerCase().trim();

        // 1. Explicit catalog or database gender ALWAYS takes absolute precedence
        if (g === 'female' || g === 'women' || g === 'woman') {
            return 'female';
        }
        if (g === 'male' || g === 'men' || g === 'man') {
            return 'male';
        }
        if (g === 'unisex') {
            return null; // Unisex allows user to choose freely without locking
        }

        var cat = (garment.category || '').toLowerCase().trim();
        var title = (garment.name || garment.title || '').toLowerCase().trim();
        var desc = (garment.desc || '').toLowerCase().trim();
        var combined = cat + ' ' + title + ' ' + desc;

        // 2. Clear female indicators in title or category (dresses, gowns, sarees, etc.)
        if (/\b(women|woman|womens|female|girl|lady|dress|gown|bridal|saree|sari|lehenga|kurti|kurtis|skirt|blouse|anarkali|bride)\b/i.test(combined)) {
            return 'female';
        }

        // 3. Clear male indicators (Only explicit male keywords like men, man, tuxedo, sherwani, cowboy, sherpa)
        if (/\b(men|man|mens|male|boy|gentleman|tuxedo|sherwani|kurta\s*pajama|dhoti|cowboy|sherpa|groom|tux)\b/i.test(combined)) {
            return 'male';
        }

        return null;
    }

    /* ─── Robust Garment Gender Resolvers & Validation ─── */
    function getGarmentGender(garment) {
        if (!garment) return null;
        var g = (garment.gender || '').toLowerCase().trim();
        if (g === 'female' || g === 'women' || g === 'woman') return 'Female';
        if (g === 'male' || g === 'men' || g === 'man') return 'Male';
        if (g === 'unisex') return 'Unisex';

        var inferred = inferOutfitGender(garment);
        if (inferred === 'female') return 'Female';
        if (inferred === 'male') return 'Male';
        return null;
    }

    function detectCustomGarmentGender(fileNameOrText) {
        if (!fileNameOrText) return null;
        var text = String(fileNameOrText).toLowerCase();
        var maleMatch = /(^|[^a-z0-9])(men|mens|male|boy|guy|gentleman|tuxedo|sherwani|kurta|dhoti|cowboy|sherpa|groom|tux|cat_men|g_men)([^a-z0-9]|$)/i.test(text);
        var femaleMatch = /(^|[^a-z0-9])(women|womens|female|girl|lady|woman|dress|gown|skirt|blouse|saree|sari|lehenga|kurti|anarkali|bride|cat_women|g_women)([^a-z0-9]|$)/i.test(text);
        if (femaleMatch && !maleMatch) return 'Female';
        if (maleMatch && !femaleMatch) return 'Male';
        return null;
    }

    function hasGarmentGenderMismatch() {
        if (window.StudioController && typeof window.StudioController.hasGarmentGenderMismatch === 'function') {
            return window.StudioController.hasGarmentGenderMismatch();
        }

        var activeGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
            ? window.StudioController.getModelGender()
            : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
        if (!activeGender) return false;

        // Check catalog outfit
        if (tryonState.selectedGarment) {
            var gGender = getGarmentGender(tryonState.selectedGarment);
            if (gGender && gGender !== activeGender && gGender !== 'Unisex') {
                return true;
            }
        }

        // Check custom outfit
        if (tryonState.customGarmentData && window.selectedOutfit && window.selectedOutfit.name) {
            var customGender = detectCustomGarmentGender(window.selectedOutfit.name);
            if (customGender && customGender !== activeGender && customGender !== 'Unisex') {
                return true;
            }
        }

        return false;
    }

    /* ─── Detect Complete Outfit, Full Suit, or Two-Piece Set ─── */
    function isFullOutfitGarment(garment) {
        if (!garment) return false;
        var cat = (garment.category || '').toLowerCase();
        var title = (garment.name || garment.title || '').toLowerCase();
        var desc = (garment.desc || '').toLowerCase();
        var combined = cat + ' ' + title + ' ' + desc;

        if (
            cat === 'one-pieces' ||
            cat === 'onepiece' ||
            cat === 'suits' ||
            cat === 'suit' ||
            cat === 'bridal' ||
            cat === 'two-piece' ||
            cat === 'set' ||
            cat === 'full-outfit'
        ) {
            return true;
        }

        // Check if item contains top + bottom (or top + shoes or bottom + shoes)
        var hasTop = /\b(shirt|tee|t-shirt|top|blouse|blazer|jacket|polo|hoodie|kurti|kurta|sweater|coat|linen)\b/i.test(combined);
        var hasBottom = /\b(chino|chinos|trouser|trousers|pant|pants|jean|jeans|short|shorts|skirt|slacks|joggers)\b/i.test(combined);
        var hasShoes = /\b(espadrille|espadrilles|shoe|shoes|sneaker|sneakers|loafer|loafers|boot|boots|heel|heels|sandals)\b/i.test(combined);

        if ((hasTop && hasBottom) || (hasTop && hasShoes) || (hasBottom && hasShoes)) {
            return true;
        }

        return /\b(suit|suits|tuxedo|tux|sherwani|anarkali|two-piece|2-piece|two\s*piece|2\s*piece|full\s*set|full\s*outfit|complete\s*outfit|complete|set|dress|gown|robe|jumpsuit|romper|overall|co-ord|coord)\b/i.test(combined);
    }

    /* ─── Contextual Step 1 UI & Auto-Lock State ─── */
    function updateStep1Context(targetGender) {
        var step1Title    = document.getElementById('tryon-step1-title');
        var step1Subtitle = document.getElementById('tryon-step1-subtitle');
        var promptMain    = document.getElementById('tryon-upload-prompt-main');
        var promptSub     = document.getElementById('tryon-upload-prompt-sub');
        var btnGroup      = document.getElementById('tryon-gender-btn-group');
        var lockedPill    = document.getElementById('tryon-gender-locked-pill');
        var lockedTitle   = document.getElementById('tryon-gender-locked-title');
        var btnMale       = document.getElementById('tryon-gender-male');
        var btnFemale     = document.getElementById('tryon-gender-female');

        if (targetGender === 'male') {
            tryonState.selectedGender = 'Male';
            if (step1Title) step1Title.textContent = 'Step 1: Upload Your Male Photo (Full-Length)';
            if (step1Subtitle) step1Subtitle.textContent = 'Upload a clear, full-length photo of a male model or yourself for this Men\'s outfit';
            if (promptMain) promptMain.innerHTML = '<strong>Click to upload male photo (full-length)</strong>';
            if (promptSub) promptSub.textContent = 'Supports PNG, JPG, WebP • Men\'s Outfit Matching';

            if (tryonState.genderUnlocked) {
                if (btnMale) { btnMale.classList.add('active'); btnMale.classList.remove('disabled'); btnMale.disabled = false; }
                if (btnFemale) { btnFemale.classList.remove('active', 'disabled'); btnFemale.disabled = false; }
                if (btnGroup) btnGroup.style.display = 'flex';
                if (lockedPill) lockedPill.style.display = 'none';
            } else {
                // Auto-lock & disable toggle buttons
                if (btnMale) {
                    btnMale.classList.add('active', 'disabled');
                    btnMale.disabled = true;
                }
                if (btnFemale) {
                    btnFemale.classList.remove('active');
                    btnFemale.classList.add('disabled');
                    btnFemale.disabled = true;
                }
                if (btnGroup) btnGroup.style.display = 'none';
                if (lockedPill) {
                    lockedPill.style.display = 'flex';
                    if (lockedTitle) lockedTitle.textContent = "Auto-locked: Men's Model";
                }
            }
        } else if (targetGender === 'female') {
            tryonState.selectedGender = 'Female';
            if (step1Title) step1Title.textContent = 'Step 1: Upload Your Female Photo (Full-Length)';
            if (step1Subtitle) step1Subtitle.textContent = 'Upload a clear, full-length photo of a female model or yourself for this Women\'s outfit';
            if (promptMain) promptMain.innerHTML = '<strong>Click to upload female photo (full-length)</strong>';
            if (promptSub) promptSub.textContent = 'Supports PNG, JPG, WebP • Women\'s Outfit Matching';

            if (tryonState.genderUnlocked) {
                if (btnFemale) { btnFemale.classList.add('active'); btnFemale.classList.remove('disabled'); btnFemale.disabled = false; }
                if (btnMale) { btnMale.classList.remove('active', 'disabled'); btnMale.disabled = false; }
                if (btnGroup) btnGroup.style.display = 'flex';
                if (lockedPill) lockedPill.style.display = 'none';
            } else {
                // Auto-lock & disable toggle buttons
                if (btnFemale) {
                    btnFemale.classList.add('active', 'disabled');
                    btnFemale.disabled = true;
                }
                if (btnMale) {
                    btnMale.classList.remove('active');
                    btnMale.classList.add('disabled');
                    btnMale.disabled = true;
                }
                if (btnGroup) btnGroup.style.display = 'none';
                if (lockedPill) {
                    lockedPill.style.display = 'flex';
                    if (lockedTitle) lockedTitle.textContent = "Auto-locked: Women's Model";
                }
            }
        } else {
            // No outfit selected or Unisex - Unlock manual buttons
            var isFem = (tryonState.selectedGender === 'Female');
            if (step1Title) step1Title.textContent = 'Step 1: Upload Photo';
            if (step1Subtitle) step1Subtitle.textContent = 'Upload your full-length photo to begin';
            if (promptMain) promptMain.innerHTML = '<strong>Click to upload photo</strong>';
            if (promptSub) promptSub.textContent = 'Supports PNG, JPG, WebP';

            if (btnMale) {
                btnMale.classList.remove('disabled');
                btnMale.disabled = false;
                if (!isFem) btnMale.classList.add('active');
                else btnMale.classList.remove('active');
            }
            if (btnFemale) {
                btnFemale.classList.remove('disabled');
                btnFemale.disabled = false;
                if (isFem) btnFemale.classList.add('active');
                else btnFemale.classList.remove('active');
            }
            if (btnGroup) btnGroup.style.display = 'flex';
            if (lockedPill) lockedPill.style.display = 'none';
        }
    }

    /* ─── 0. Load Garments from Database (Single `garment` Table) ─── */
    function loadGarmentsFromDatabase(callback) {
        var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/backend/garments.php' : '/backend/garments.php';

        fetch(apiUrl + '?gender=all&category=all&status=active')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.status === 'success' && Array.isArray(data.garments)) {
                    ALL_GARMENTS = data.garments.map(function (g) {
                        var normalizedGender = (g.gender === 'female') ? 'Female' : ((g.gender === 'male') ? 'Male' : 'Unisex');
                        var displayImg = g.display_image_url;
                        var falImg = g.fal_image_url || g.display_image_url;

                        if (displayImg.indexOf('http') !== 0 && displayImg.indexOf('/') !== 0) {
                            displayImg = '/' + displayImg;
                        }
                        if (falImg.indexOf('http') !== 0 && falImg.indexOf('/') !== 0) {
                            falImg = '/' + falImg;
                        }

                        var defaultGlb = (normalizedGender === 'Female') 
                            ? 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/garments/lace_gown.glb'
                            : 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/garments/charcoal_suit.glb';

                        var isFullSet = isFullOutfitGarment(g);

                        return {
                            id: g.id,
                            title: g.title,
                            name: g.title,
                            gender: normalizedGender,
                            category: g.category,
                            categoryLabel: g.category_label || ucfirst(g.category),
                            desc: (g.category_label || g.category) + ' Collection Outfit',
                            img: displayImg,
                            display_image_url: displayImg,
                            fal_image_url: falImg,
                            full_outfit_image_url: falImg || displayImg,
                            is_full_outfit: isFullSet,
                            cover_feet: isFullSet,
                            glb: defaultGlb
                        };
                    });

                    // Keep user's chosen gender intact; do not auto-force first garment or override gender
                }
                if (callback) callback();
            })
            .catch(function (err) {
                console.error('[Style360] Error loading garments from DB:', err);
                if (callback) callback();
            });
    }

    function ucfirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /* ─── 1. Home Page Navigation ─── */
    function showHome() {
        hide(categorySection);
        hide(studioSection);
        hide(tryonSection);
        show(homePage);
        restoreHomeStyles();
        setActiveNav(navHomeLink);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ─── 2. Collection Page Navigation & Display with Category Filter Tabs ─── */
    function showCategory(catId, filterKey) {
        var isWomen;
        if (catId === 'cat-wedding-women' || catId === 'women') {
            isWomen = true;
            tryonState.selectedGender = 'Female';
        } else if (catId === 'cat-wedding-men' || catId === 'men') {
            isWomen = false;
            tryonState.selectedGender = 'Male';
        } else {
            // Default to active model gender
            isWomen = (tryonState.selectedGender === 'Female');
            if (!tryonState.selectedGender) {
                tryonState.selectedGender = isWomen ? 'Female' : 'Male';
            }
        }

        tryonState.currentCollectionCat = isWomen ? 'cat-wedding-women' : 'cat-wedding-men';
        if (filterKey) {
            tryonState.currentCollectionFilter = filterKey;
        }

        var titleStr = isWomen ? "WOMEN'S COLLECTION" : "MEN'S SELECTION";
        var badgeStr = isWomen ? "EVENING GOWNS & DRESSES - WOMEN" : "SUITS & BLAZERS - MEN";

        hide(homePage);
        hide(studioSection);
        hide(tryonSection);
        show(categorySection);
        restoreHomeStyles();

        // Sync gender switcher pills
        if (btnSwitchWomen && btnSwitchMen) {
            if (isWomen) {
                btnSwitchWomen.classList.add('active');
                btnSwitchMen.classList.remove('active');
            } else {
                btnSwitchMen.classList.add('active');
                btnSwitchWomen.classList.remove('active');
            }
        }

        if (catBrowseTitle) catBrowseTitle.textContent = titleStr;
        if (catBrowseBadge) catBrowseBadge.textContent = badgeStr;

        // Render dynamic category filter tabs
        renderCollectionFilterTabs(isWomen);

        // Fetch fresh garments and render grid
        loadGarmentsFromDatabase(function () {
            renderCollectionGarmentsGrid(isWomen);
        });

        setActiveNav(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ─── Render Collection Filter Tabs ─── */
    function renderCollectionFilterTabs(isWomen) {
        var tabsContainer = document.getElementById('collection-filter-tabs');
        if (!tabsContainer) return;

        var tabs = tabsContainer.querySelectorAll('.col-filter-tab');
        tabs.forEach(function (tab) {
            var filterVal = tab.getAttribute('data-filter') || 'all';
            if (filterVal === tryonState.currentCollectionFilter) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }

            tab.onclick = function () {
                tabsContainer.querySelectorAll('.col-filter-tab').forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                tryonState.currentCollectionFilter = filterVal;
                renderCollectionGarmentsGrid(isWomen);
            };
        });
    }

    /* ─── Render Collection Garments Grid from Database ─── */
    function renderCollectionGarmentsGrid(isWomen) {
        if (!garmentGrid) return;
        garmentGrid.innerHTML = '';

        // Strict Gender-Based Outfit Filtering: Show ONLY outfits that match the target gender selection (Male / Female)
        var targetGender = isWomen ? 'Female' : 'Male';
        tryonState.selectedGender = targetGender;
        var currentFilter = tryonState.currentCollectionFilter || 'all';

        var filteredItems = ALL_GARMENTS.filter(function (g) {
            var gGender = getGarmentGender(g);
            if (gGender && gGender !== targetGender && gGender !== 'Unisex') return false;
            if (g.gender && g.gender !== targetGender && g.gender !== 'Unisex') return false;
            if (currentFilter === 'all') return true;
            return g.category === currentFilter;
        });

        if (filteredItems.length === 0) {
            garmentGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: #64748B;">' +
                '<p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No outfits found in this category for ' + targetGender + ' model.</p>' +
                '<p style="font-size: 0.9rem;">Try selecting "All" or browse our other collections.</p>' +
            '</div>';
            return;
        }

        filteredItems.forEach(function (g) {
            var card = document.createElement('div');
            card.className = 'garment-card';
            card.setAttribute('data-category', g.category);
            card.setAttribute('data-gender', g.gender);
            card.setAttribute('data-id', g.id);

            card.innerHTML =
                '<div class="garment-img-wrap">' +
                    '<img src="' + g.img + '" alt="' + g.name + '" class="garment-img" />' +
                '</div>' +
                '<div class="garment-card-body">' +
                    '<span class="garment-cat-tag">' + g.categoryLabel + '</span>' +
                    '<div class="garment-card-name">' + g.name + '</div>' +
                    '<div class="garment-card-desc">' + g.desc + '</div>' +
                    '<button class="btn-garment-tryon" type="button">✨ Try On in Studio</button>' +
                '</div>';

            // Collection Page Action: Click card or Try On button -> verifies outfit gender against active model
            card.addEventListener('click', function () {
                var modelGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
                    ? window.StudioController.getModelGender()
                    : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
                var gGender = getGarmentGender(g);

                if (window.StudioController && typeof window.StudioController.canSelectOutfit === 'function') {
                    if (!window.StudioController.canSelectOutfit(g)) {
                        return; // BLOCK SELECTION
                    }
                } else if (modelGender && gGender && gGender !== modelGender && gGender !== 'Unisex') {
                    showStyle360Toast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 5500);
                    return; // BLOCK SELECTION
                }

                tryonState.selectedGarment = g;
                tryonState.isOutfitVerified = true;
                window.selectedOutfit = g;
                tryonState.customGarmentData = null;
                tryonState.activeCategoryShortcut = g.category || 'all';
                // Persist selected garment for Try-On page state sync
                try { localStorage.setItem('style360_pending_garment', JSON.stringify(g)); } catch(e) {}
                showTryOnPage();
                if (window.StudioController && typeof window.StudioController.checkGatekeeper === 'function') {
                    window.StudioController.checkGatekeeper();
                }
            });

            garmentGrid.appendChild(card);
        });
    }

    // Global helper for AI Chatbot to select and preview garments in Studio
    window.selectGarmentById = function (garmentId) {
        var found = ALL_GARMENTS.find(function (g) { return String(g.id) === String(garmentId); });
        if (found) {
            var modelGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
                ? window.StudioController.getModelGender()
                : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
            var gGender = getGarmentGender(found);

            if (window.StudioController && typeof window.StudioController.canSelectOutfit === 'function') {
                if (!window.StudioController.canSelectOutfit(found)) {
                    return false; // BLOCK SELECTION
                }
            } else if (modelGender && gGender && gGender !== modelGender && gGender !== 'Unisex') {
                showStyle360Toast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 5500);
                return false; // BLOCK SELECTION
            }

            tryonState.selectedGarment = found;
            tryonState.isOutfitVerified = true;
            window.selectedOutfit = found;
            tryonState.customGarmentData = null;
            tryonState.activeCategoryShortcut = found.category || 'all';
            try { localStorage.setItem('style360_pending_garment', JSON.stringify(found)); } catch(e) {}
            showTryOnPage();
            if (window.StudioController && typeof window.StudioController.checkGatekeeper === 'function') {
                window.StudioController.checkGatekeeper();
            }
            return true;
        }
        return false;
    };

    /* ─── 3. 3D Model Scanner Studio ─── */

    function showStudio() {
        hide(homePage);
        hide(categorySection);
        hide(tryonSection);

        if (podStage && studioCenterTarget && podStage.parentElement !== studioCenterTarget) {
            studioCenterTarget.appendChild(podStage);
        }

        show(studioSection);

        document.body.classList.add('studio-mode');
        document.body.style.background = '#F8F6FF';
        document.body.style.color = '#1E1B4B';
        if (header) {
            header.style.background = '#FFFFFF';
            header.style.borderBottom = '1px solid #E2E8F0';
        }

        setActiveNav(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        window.dispatchEvent(new Event('resize'));
    }

    /* ─── Auth Guard for Virtual Try-On ─── */
    function isUserAuthenticated() {
        try {
            var raw = localStorage.getItem('style360_user');
            if (!raw) return false;
            var u = JSON.parse(raw);
            return !!(u && (u.id || u.email));
        } catch (e) {
            return false;
        }
    }

    function requireAuthForTryOn() {
        if (!isUserAuthenticated()) {
            window.location.href = 'login.html?redirect=try-on';
            return false;
        }
        return true;
    }

    /* ─── 4. Try-On Studio Page ─── */
    function showTryOnPage() {
        if (!requireAuthForTryOn()) return;

        hide(homePage);
        hide(categorySection);
        hide(studioSection);

        show(tryonSection);

        document.body.classList.add('studio-mode');
        document.body.style.background = '#F8F6FF';
        document.body.style.color = '#1E1B4B';
        if (header) {
            header.style.background = '#FFFFFF';
            header.style.borderBottom = '1px solid #E2E8F0';
        }

        setActiveNav(navTryOnLink);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        window.dispatchEvent(new Event('resize'));

        loadGarmentsFromDatabase(function () {
            // Restore garment selected from Catalog page (localStorage state sync)
            try {
                var pendingRaw = localStorage.getItem('style360_pending_garment');
                if (pendingRaw) {
                    var pendingGarment = JSON.parse(pendingRaw);
                    if (pendingGarment && pendingGarment.id) {
                        var pendingGender = getGarmentGender(pendingGarment);
                        if (pendingGender && pendingGender !== 'Unisex') {
                            tryonState.selectedGender = pendingGender;
                            tryonState.genderUnlocked = true;
                        }
                        tryonState.selectedGarment = pendingGarment;
                        window.selectedOutfit = pendingGarment;
                        tryonState.activeCategoryShortcut = pendingGarment.category || 'all';
                    }
                    localStorage.removeItem('style360_pending_garment');
                }
            } catch(e) {}
            initTryOnStudioUI();
        });
    }

    /* ─── Clean Try-On Studio Controller ─── */
    function initTryOnStudioUI() {
        var photoDropzone      = document.getElementById('tryon-photo-dropzone');
        var photoInput         = document.getElementById('tryon-user-upload-input');
        var photoPreviewWrap   = document.getElementById('tryon-user-preview-wrap');
        var photoPreviewImg    = document.getElementById('tryon-user-preview-img');
        var photoEmptyState    = document.getElementById('tryon-user-empty-state');
        var btnRemovePhoto     = document.getElementById('btn-remove-user-photo');

        var btnMale            = document.getElementById('tryon-gender-male');
        var btnFemale          = document.getElementById('tryon-gender-female');
        var btnGroup           = document.getElementById('tryon-gender-btn-group');
        var lockedPill         = document.getElementById('tryon-gender-locked-pill');
        var lockedTitle        = document.getElementById('tryon-gender-locked-title');
        var btnUnlockGender    = document.getElementById('btn-unlock-gender');

        var categoryTabsNav    = document.getElementById('tryon-category-tabs');
        var garmentsScrollGrid = document.getElementById('tryon-garments-scroll-grid');
        var btnGenerate2D      = document.getElementById('btn-trigger-tryon-2col');
        var btnStageEmptyGenerate = document.getElementById('btn-stage-empty-generate');

        var loadingOverlay     = document.getElementById('stage-loading-overlay');
        var loadingTitle       = document.getElementById('stage-loading-title');
        var loadingSub         = document.getElementById('stage-loading-sub');
        var loadingGemIcon     = document.getElementById('loading-gem-icon');
        var progressBar        = document.getElementById('stage-loading-progress-bar');
        var pill1              = document.getElementById('pill-step-1');
        var pill2              = document.getElementById('pill-step-2');
        var pill3              = document.getElementById('pill-step-3');

        var panelEmpty         = document.getElementById('stage-panel-empty');
        var panel2D            = document.getElementById('stage-panel-2d');
        var panel3D            = document.getElementById('stage-panel-3d');
        var output2DImg        = document.getElementById('stage-output-tryon-img');

        var btnTrigger3D       = document.getElementById('btn-trigger-3d-view');
        var btnBackTo2D        = document.getElementById('btn-back-to-2d');
        var btnReset3D         = document.getElementById('btn-reset-3d-camera');
        var btnResetAll        = document.getElementById('btn-stage-reset-all');
        var btnDownloadImg     = document.getElementById('btn-stage-download-img');

        var chip2D             = document.getElementById('chip-status-2d');
        var chip3D             = document.getElementById('chip-status-3d');
        var statusBadge        = document.getElementById('stage-status-badge');
        var stageOutfitTitle   = document.getElementById('stage-current-outfit-title');
        var stageOutfitCat     = document.getElementById('stage-current-outfit-cat');

        var cardStep1          = document.getElementById('card-step-1');
        var cardStep2          = document.getElementById('card-step-2');
        var garmentDropzone    = document.getElementById('garment-upload-dropzone');
        var garmentInput       = document.getElementById('garment-upload-input');
        var garmentPreviewWrap = document.getElementById('garment-upload-preview-wrap');
        var garmentPreviewImg  = document.getElementById('garment-upload-preview-img');
        var garmentEmptyState  = document.getElementById('garment-upload-empty-state');
        var btnRemoveGarment   = document.getElementById('btn-remove-garment-upload');
        var btnBrowseCatalog   = document.getElementById('btn-browse-collection-catalog');
        var btnChangeOutfit    = document.getElementById('btn-change-outfit-link');

        /* ─── Step 2: Garment Coverage Selector Helper Functions ─── */
        function syncGarmentCoverageFromGarment(garment) {
            if (!garment) return;
            var targetCoverage = 'tops';
            var cat = (garment.category || '').toLowerCase();
            var title = (garment.name || garment.title || '').toLowerCase();
            var isFull = (garment.is_full_outfit || isFullOutfitGarment(garment));

            if (cat === 'bottoms' || cat.indexOf('bottom') !== -1 || cat.indexOf('pant') !== -1 || cat.indexOf('trouser') !== -1 || cat.indexOf('skirt') !== -1 || title.indexOf('pant') !== -1 || title.indexOf('trouser') !== -1 || title.indexOf('skirt') !== -1) {
                targetCoverage = 'bottoms';
            } else if (isFull || cat === 'one-pieces' || cat === 'bridal' || cat === 'suits' || cat === 'suit') {
                targetCoverage = 'one-pieces';
            } else {
                targetCoverage = 'tops';
            }

            setGarmentCoverage(targetCoverage);
        }

        function setGarmentCoverage(val) {
            var radios = document.querySelectorAll('input[name="garment_coverage"]');
            radios.forEach(function (r) {
                r.checked = (r.value === val);
            });
            updateCoverageUI();
        }

        function updateCoverageUI() {
            var options = document.querySelectorAll('.coverage-radio-option');
            options.forEach(function (opt) {
                var radio = opt.querySelector('input[type="radio"]');
                if (radio && radio.checked) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
        }

        // Wire up manual switching of Garment Coverage options
        var coverageOptionEls = document.querySelectorAll('.coverage-radio-option');
        coverageOptionEls.forEach(function (opt) {
            opt.addEventListener('click', function () {
                var radio = opt.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    updateCoverageUI();
                }
            });
        });

        var coverageRadioInputs = document.querySelectorAll('input[name="garment_coverage"]');
        coverageRadioInputs.forEach(function (radio) {
            radio.addEventListener('change', function () {
                updateCoverageUI();
            });
        });

        updateCoverageUI();

        // Custom Garment Upload Handlers
        if (garmentDropzone && garmentInput) {
            garmentDropzone.onclick = function (e) {
                if (e.target !== btnRemoveGarment) {
                    garmentInput.click();
                }
            };

            garmentInput.onchange = function () {
                if (garmentInput.files && garmentInput.files[0]) {
                    var file = garmentInput.files[0];
                    var reader = new FileReader();
                    reader.onload = function (evt) {
                        var base64Data = evt.target.result;
                        tryonState.customGarmentData = base64Data;
                        tryonState.selectedGarment = null;
                        if (window.tryonState) {
                            window.tryonState.customGarmentData = base64Data;
                            window.tryonState.selectedGarment = null;
                        }
                        if (window.StudioController && typeof window.StudioController.verifyCustomGarment === 'function') {
                            window.StudioController.verifyCustomGarment(file, base64Data, function (success, resData) {
                                if (success) {
                                    tryonState.isOutfitVerified = true;
                                    if (window.tryonState) window.tryonState.isOutfitVerified = true;
                                    if (resData && resData.detected_gender) {
                                        var dg = String(resData.detected_gender).toLowerCase();
                                        if (dg === 'female') {
                                            tryonState.selectedGender = 'Female';
                                            if (window.tryonState) window.tryonState.selectedGender = 'Female';
                                            if (window.StudioController && typeof window.StudioController.syncGenderToggle === 'function') {
                                                window.StudioController.syncGenderToggle('Female');
                                            }
                                        } else if (dg === 'male') {
                                            tryonState.selectedGender = 'Male';
                                            if (window.tryonState) window.tryonState.selectedGender = 'Male';
                                            if (window.StudioController && typeof window.StudioController.syncGenderToggle === 'function') {
                                                window.StudioController.syncGenderToggle('Male');
                                            }
                                        }
                                    }
                                }
                                updateStageFooter();
                            });
                        }
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        if (btnRemoveGarment) {
            btnRemoveGarment.onclick = function (e) {
                e.stopPropagation();
                tryonState.customGarmentData = null;
                tryonState.isOutfitVerified = false;
                window.selectedOutfit = tryonState.selectedGarment || null;
                if (garmentInput) garmentInput.value = '';
                if (garmentPreviewWrap) garmentPreviewWrap.style.display = 'none';
                if (garmentEmptyState) garmentEmptyState.style.display = 'block';
                renderSelectedGarmentPreview();
                if (window.StudioController && typeof window.StudioController.checkGatekeeper === 'function') {
                    window.StudioController.checkGatekeeper();
                } else {
                    updateStageFooter();
                }
            };
        }

        [btnBrowseCatalog, btnChangeOutfit].forEach(function (btn) {
            if (btn) {
                btn.onclick = function () {
                    var modelGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
                        ? window.StudioController.getModelGender()
                        : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
                    showCategory(modelGender === 'Female' ? 'cat-wedding-women' : 'cat-wedding-men', 'all');
                };
            }
        });

        /* ─── Auto-Reset Outfit on Gender Switch or Mismatch ─── */
        function resetSelectedOutfit(promptText) {
            window.selectedOutfit = null;
            tryonState.selectedGarment = null;
            tryonState.customGarmentData = null;
            try { localStorage.removeItem('style360_pending_garment'); } catch(e) {}

            // Reset Custom Garment Upload UI
            if (garmentInput) garmentInput.value = '';
            var garmentUploadInput = document.getElementById('garment-upload-input');
            if (garmentUploadInput) garmentUploadInput.value = '';

            if (garmentPreviewWrap) garmentPreviewWrap.style.display = 'none';
            if (garmentPreviewImg) garmentPreviewImg.src = '';
            if (garmentEmptyState) garmentEmptyState.style.display = 'block';

            var gUploadPreviewWrap = document.getElementById('garment-upload-preview-wrap');
            if (gUploadPreviewWrap) gUploadPreviewWrap.style.display = 'none';
            var gUploadEmptyState = document.getElementById('garment-upload-empty-state');
            if (gUploadEmptyState) gUploadEmptyState.style.display = 'flex';

            // Reset Step 2 Selected Outfit Preview Card
            var previewCard = document.getElementById('selected-outfit-preview-card');
            var placeholder = document.getElementById('no-outfit-placeholder');
            if (previewCard) {
                var existingRow = previewCard.querySelector('.selected-garment-row');
                if (existingRow) existingRow.remove();
                previewCard.classList.remove('input-error-highlight');
            }
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.innerHTML = '<p>' + (promptText || 'Please select an outfit matching the chosen gender.') + '<br/><span style="font-size:0.72rem;color:#94A3B8;">Browse catalog to pick one.</span></p>';
            }

            if (cardStep2) cardStep2.classList.remove('input-error-highlight');
            if (garmentDropzone) garmentDropzone.classList.remove('input-error-highlight');

            updateStageFooter();
        }

        // Expose globally for Studio controller and cross-module calls
        window.resetSelectedOutfit = resetSelectedOutfit;

        /* ─── Apply Gender Auto-Lock & Mismatch Guard ─── */
        function applyGenderLock() {
            var g = tryonState.selectedGarment;
            var inferredGender = inferOutfitGender(g);
            if (inferredGender && !tryonState.genderUnlocked) {
                updateStep1Context(inferredGender);

                // Guard against previously uploaded photo mismatch
                if (tryonState.userPhotoData && tryonState.detectedPhotoGender) {
                    var photoG = (tryonState.detectedPhotoGender || '').toLowerCase();
                    if ((inferredGender === 'female' && photoG === 'male') || (inferredGender === 'male' && photoG === 'female')) {
                        var mismatchMsg = "Category Mismatch: Please upload a matching photo for this " + (inferredGender === 'male' ? "Men's" : "Women's") + " outfit.";
                        showStyle360Toast('error', 'Category Mismatch', mismatchMsg, 6500);

                        // Clear mismatched photo
                        tryonState.userPhotoData = null;
                        if (photoInput) photoInput.value = '';
                        if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
                        if (photoEmptyState) photoEmptyState.style.display = 'block';
                        if (photoDropzone) {
                            photoDropzone.classList.add('mismatch-error');
                            setTimeout(function () { photoDropzone.classList.remove('mismatch-error'); }, 800);
                        }
                        updateStageFooter();
                    }
                }
            } else if (!tryonState.selectedGarment && !tryonState.genderUnlocked) {
                updateStep1Context(null);
            }
        }

        /* ─── Step 2: Render Selected Garment Preview Card ─── */
        function renderSelectedGarmentPreview() {
            var previewCard = document.getElementById('selected-outfit-preview-card');
            var placeholder = document.getElementById('no-outfit-placeholder');
            if (!previewCard) return;

            var g = tryonState.selectedGarment;

            // Check if existing outfit matches current active model gender
            if (g) {
                var modelGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
                    ? window.StudioController.getModelGender()
                    : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
                var gGender = getGarmentGender(g);
                if (modelGender && gGender && gGender !== modelGender && gGender !== 'Unisex') {
                    resetSelectedOutfit("Please select an outfit matching the chosen gender.");
                    showStyle360Toast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 5500);
                    return;
                }
            }

            if (!g) {
                if (placeholder) {
                    placeholder.style.display = 'block';
                    placeholder.innerHTML = '<p>Please select an outfit matching the chosen gender.<br/><span style="font-size:0.72rem;color:#94A3B8;">Browse catalog to pick one.</span></p>';
                }
                var existingRow = previewCard.querySelector('.selected-garment-row');
                if (existingRow) existingRow.remove();
                window.selectedOutfit = tryonState.customGarmentData ? { custom: true, data: tryonState.customGarmentData } : null;
                updateStageFooter();
                return;
            }

            window.selectedOutfit = g;
            if (placeholder) placeholder.style.display = 'none';

            // Clear any missing outfit error highlight
            if (cardStep2) cardStep2.classList.remove('input-error-highlight');
            if (previewCard) previewCard.classList.remove('input-error-highlight');
            if (garmentDropzone) garmentDropzone.classList.remove('input-error-highlight');

            // Build the preview row (or replace existing)
            var existingRow = previewCard.querySelector('.selected-garment-row');
            if (existingRow) existingRow.remove();

            var row = document.createElement('div');
            row.className = 'selected-garment-row';
            row.innerHTML =
                '<img class="selected-garment-thumb" src="' + (g.img || g.display_image_url || '') + '" alt="' + (g.name || '') + '" />' +
                '<div class="selected-garment-info">' +
                    '<div class="selected-garment-name">' + (g.name || 'Selected Outfit') + '</div>' +
                    '<span class="selected-garment-cat-tag">' + (g.categoryLabel || g.category || '') + '</span>' +
                '</div>';
            previewCard.appendChild(row);

            // Default this selection based on catalog metadata, but allow user to manually switch options
            syncGarmentCoverageFromGarment(g);

            applyGenderLock();
            updateStageFooter();
        }

        /* ─── Step 1: Gender Toggle ─── */
        function setGender(gender, force) {
            var previousGender = tryonState.selectedGender;
            var isGenderSwitch = (previousGender && previousGender !== gender);

            tryonState.selectedGender = gender;
            tryonState.genderUnlocked = true; // User explicitly chose gender

            // 1. Auto-Reset Outfit on Gender Switch: Clear selected outfit state & reset Step 2 UI
            if (isGenderSwitch) {
                resetSelectedOutfit("Please select an outfit matching the chosen gender.");
            }

            var bg = document.getElementById('tryon-gender-btn-group');
            var lp = document.getElementById('tryon-gender-locked-pill');
            var bm = document.getElementById('tryon-gender-male');
            var bf = document.getElementById('tryon-gender-female');

            if (lp) lp.style.display = 'none';
            if (bg) {
                bg.style.display = 'flex';
                try {
                    bg.dispatchEvent(new CustomEvent('change', { detail: { gender: gender } }));
                } catch(e) {}
            }
            if (bm) {
                bm.disabled = false;
                bm.classList.remove('disabled');
                if (gender === 'Male') bm.classList.add('active');
                else bm.classList.remove('active');
            }
            if (bf) {
                bf.disabled = false;
                bf.classList.remove('disabled');
                if (gender === 'Female') bf.classList.add('active');
                else bf.classList.remove('active');
            }

            updateStep1Context(gender === 'Female' ? 'female' : 'male');
            renderSelectedGarmentPreview();
        }

        // Expose setGender globally for external controls / studio.js
        window.setGender = setGender;

        // Attach click and change event listeners to Gender Toggle buttons
        if (btnMale) {
            btnMale.onclick = function (e) {
                if (e) { e.preventDefault(); e.stopPropagation(); }
                setGender('Male', true);
            };
            btnMale.onchange = function () {
                setGender('Male', true);
            };
            btnMale.addEventListener('change', function () {
                setGender('Male', true);
            });
        }

        if (btnFemale) {
            btnFemale.onclick = function (e) {
                if (e) { e.preventDefault(); e.stopPropagation(); }
                setGender('Female', true);
            };
            btnFemale.onchange = function () {
                setGender('Female', true);
            };
            btnFemale.addEventListener('change', function () {
                setGender('Female', true);
            });
        }

        if (btnGroup) {
            btnGroup.addEventListener('change', function (e) {
                var target = e.target;
                if (target && target.getAttribute('data-gender')) {
                    setGender(target.getAttribute('data-gender'), true);
                }
            });
        }

        function handleGenderUnlockAndToggle(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            tryonState.genderUnlocked = true;

            // Instantly toggle to the opposite gender and show interactive buttons
            var newGender = (tryonState.selectedGender === 'Male') ? 'Female' : 'Male';
            setGender(newGender, true);

            var bg = document.getElementById('tryon-gender-btn-group');
            var lp = document.getElementById('tryon-gender-locked-pill');
            var bm = document.getElementById('tryon-gender-male');
            var bf = document.getElementById('tryon-gender-female');

            if (lp) lp.style.display = 'none';
            if (bg) bg.style.display = 'flex';
            if (bm) { bm.disabled = false; bm.classList.remove('disabled'); }
            if (bf) { bf.disabled = false; bf.classList.remove('disabled'); }
        }

        if (btnUnlockGender) {
            btnUnlockGender.onclick = handleGenderUnlockAndToggle;
        }

        if (lockedPill) {
            lockedPill.onclick = handleGenderUnlockAndToggle;
            lockedPill.style.cursor = 'pointer';
        }

        /* ─── Step 1: User Photo Upload with Gender Validation Guard ─── */
        if (photoDropzone && photoInput) {
            photoDropzone.onclick = function (e) {
                if (e.target !== btnRemovePhoto) {
                    photoInput.click();
                }
            };

            function createFastValidationThumb(base64Data, maxDim, cb) {
                try {
                    var img = new Image();
                    img.onload = function () {
                        var w = img.width, h = img.height;
                        if (w > maxDim || h > maxDim) {
                            if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                            else { w = Math.round(w * (maxDim / h)); h = maxDim; }
                        }
                        var canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        cb(canvas.toDataURL('image/jpeg', 0.75));
                    };
                    img.onerror = function () { cb(base64Data); };
                    img.src = base64Data;
                } catch (e) {
                    cb(base64Data);
                }
            }

            photoInput.onchange = function () {
                if (cardStep1) cardStep1.classList.remove('input-error-highlight');
                if (photoDropzone) photoDropzone.classList.remove('input-error-highlight');

                if (photoInput.files && photoInput.files[0]) {
                    var file = photoInput.files[0];
                    var reader = new FileReader();
                    reader.onload = function (evt) {
                        var rawBase64 = evt.target.result;
                        tryonState.userPhotoData = rawBase64;
                        if (window.tryonState) window.tryonState.userPhotoData = rawBase64;

                        var imgCheck = new Image();
                        imgCheck.onload = function () {
                            var w = imgCheck.naturalWidth || imgCheck.width;
                            var h = imgCheck.naturalHeight || imgCheck.height;
                            if (h / w >= 1.35) {
                                tryonState.isFullBodyPhoto = true;
                                if (window.tryonState) window.tryonState.isFullBodyPhoto = true;
                            } else {
                                tryonState.isFullBodyPhoto = false;
                                if (window.tryonState) window.tryonState.isFullBodyPhoto = false;
                            }
                        };
                        imgCheck.src = rawBase64;
                        if (window.StudioController && typeof window.StudioController.verifyUserPhoto === 'function') {
                            window.StudioController.verifyUserPhoto(file, rawBase64, function (success, data) {
                                if (success && data && data.detected_gender) {
                                    var dg = String(data.detected_gender).toLowerCase();
                                    var resolvedG = (dg === 'female' || dg === 'women') ? 'Female' : 'Male';
                                    tryonState.detectedPhotoGender = resolvedG;
                                    tryonState.selectedGender = resolvedG;
                                    if (window.tryonState) {
                                        window.tryonState.detectedPhotoGender = resolvedG;
                                        window.tryonState.selectedGender = resolvedG;
                                    }
                                }
                                updateStageFooter();
                            });
                        }
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        if (btnRemovePhoto) {
            btnRemovePhoto.onclick = function (e) {
                e.stopPropagation();
                tryonState.userPhotoData = null;
                tryonState.detectedPhotoGender = null;
                tryonState.isPhotoVerified = false;
                if (photoInput) photoInput.value = '';
                if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
                if (photoEmptyState) photoEmptyState.style.display = 'block';
                if (window.StudioController && typeof window.StudioController.checkGatekeeper === 'function') {
                    window.StudioController.checkGatekeeper();
                } else {
                    updateStageFooter();
                }
            };
        }

        function updateStageFooter() {
            if (window.StudioController && typeof window.StudioController.checkGatekeeper === 'function') {
                window.StudioController.checkGatekeeper();
                return;
            }

            var mismatch = hasGarmentGenderMismatch();

            // Enable / disable Generate 2D button based on outfit verification
            var btnGen = document.getElementById('btn-trigger-tryon-2col');
            var btnStageEmptyGen = document.getElementById('btn-stage-empty-generate');

            if (mismatch) {
                if (btnGen) {
                    btnGen.disabled = true;
                    btnGen.classList.add('btn-disabled-mismatch');
                    btnGen.setAttribute('title', '❌ Selected outfit does not match the chosen model gender.');
                }
                if (btnStageEmptyGen) {
                    btnStageEmptyGen.disabled = true;
                    btnStageEmptyGen.classList.add('btn-disabled-mismatch');
                    btnStageEmptyGen.setAttribute('title', '❌ Selected outfit does not match the chosen model gender.');
                }
            } else {
                if (btnGen) {
                    btnGen.disabled = false;
                    btnGen.classList.remove('btn-disabled-mismatch');
                    btnGen.removeAttribute('title');
                }
                if (btnStageEmptyGen) {
                    btnStageEmptyGen.disabled = false;
                    btnStageEmptyGen.classList.remove('btn-disabled-mismatch');
                    btnStageEmptyGen.removeAttribute('title');
                }
            }

            if (stageOutfitTitle) {
                if (mismatch) {
                    stageOutfitTitle.textContent = '⚠️ Gender Mismatch';
                } else if (tryonState.selectedGarment) {
                    stageOutfitTitle.textContent = tryonState.selectedGarment.name;
                } else if (tryonState.customGarmentData) {
                    stageOutfitTitle.textContent = 'Custom Garment Uploaded';
                } else {
                    stageOutfitTitle.textContent = 'No Outfit Selected';
                }
            }
            if (stageOutfitCat) {
                if (mismatch) {
                    stageOutfitCat.textContent = 'Selected outfit does not match active model gender';
                } else {
                    var catText = tryonState.selectedGarment ? tryonState.selectedGarment.desc : (tryonState.customGarmentData ? 'Custom Outfit' : 'Choose an outfit');
                    stageOutfitCat.textContent = catText + (tryonState.userPhotoData ? ' • Photo Ready' : ' • Upload Photo');
                }
            }
        }

        // Expose updateStageFooter globally
        window.updateStageFooter = updateStageFooter;

        /* ─── Step 2: Generate 2D Try-On via Fal.ai VTON ─── */
        function execute2DTryOn() {
            if (tryonState.isProcessing2D || tryonState.isProcessing3D) return;

            // Gatekeeper validation: Enforce both Step 1 & Step 2 verification
            if (window.StudioController && typeof window.StudioController.checkGatekeeper === 'function') {
                if (!window.StudioController.checkGatekeeper()) {
                    if (window.StudioController.hasGarmentGenderMismatch && window.StudioController.hasGarmentGenderMismatch()) {
                        showStyle360Toast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 6000);
                        return;
                    }
                    var isPhotoOk = !!(tryonState.userPhotoData && tryonState.isPhotoVerified);
                    var isOutfitOk = !!((tryonState.selectedGarment || tryonState.customGarmentData) && tryonState.isOutfitVerified);
                    if (!isPhotoOk && !isOutfitOk) {
                        showStyle360Toast('warning', 'Missing Inputs', 'Missing Inputs: Please upload your photo and select an outfit before generating try-on.', 5500);
                    } else if (!isPhotoOk) {
                        showStyle360Toast('warning', 'Photo Required', 'Please upload and verify your photo in Step 1.', 5500);
                    } else if (!isOutfitOk) {
                        showStyle360Toast('warning', 'Outfit Required', 'Please select or upload a verified outfit in Step 2.', 5500);
                    }
                    return;
                }
            }

            // 0. Strict Outfit-to-Model Gender Verification Guard:
            if (hasGarmentGenderMismatch()) {
                showStyle360Toast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 6000);
                return;
            }

            // 1. Strict Pre-Execution Validation Guard:
            // Verify that BOTH a user/model photo (model_image) AND a garment photo (garment_image) are selected/uploaded
            var hasUserPhoto = !!(tryonState.userPhotoData || (window.tryonState && window.tryonState.userPhotoData));
            var g = tryonState.selectedGarment || (window.tryonState ? window.tryonState.selectedGarment : null);
            var hasGarment = !!(tryonState.customGarmentData || (window.tryonState && window.tryonState.customGarmentData) || (window.selectedOutfit && window.selectedOutfit.data) || (g && (g.fal_image_url || g.display_image_url || g.img)));

            if (!hasUserPhoto || !hasGarment) {
                // User Feedback: Warning Toast
                showStyle360Toast('warning', 'Missing Inputs', 'Missing Inputs: Please upload your photo and select an outfit before generating try-on.', 5500);

                // UI Highlighting: Visually highlight the missing field box (Step 1 or Step 2) with temporary red alert border
                var cardStep1 = document.getElementById('card-step-1');
                var dropzoneStep1 = document.getElementById('tryon-photo-dropzone');
                var cardStep2 = document.getElementById('card-step-2');
                var previewCardStep2 = document.getElementById('selected-outfit-preview-card');
                var garmentDropzone = document.getElementById('garment-upload-dropzone');

                if (!hasUserPhoto) {
                    if (dropzoneStep1) dropzoneStep1.classList.add('input-error-highlight');
                    if (cardStep1) cardStep1.classList.add('input-error-highlight');
                }
                if (!hasGarment) {
                    if (previewCardStep2) previewCardStep2.classList.add('input-error-highlight');
                    if (cardStep2) cardStep2.classList.add('input-error-highlight');
                    if (garmentDropzone) garmentDropzone.classList.add('input-error-highlight');
                }

                setTimeout(function () {
                    if (dropzoneStep1) dropzoneStep1.classList.remove('input-error-highlight');
                    if (cardStep1) cardStep1.classList.remove('input-error-highlight');
                    if (previewCardStep2) previewCardStep2.classList.remove('input-error-highlight');
                    if (cardStep2) cardStep2.classList.remove('input-error-highlight');
                    if (garmentDropzone) garmentDropzone.classList.remove('input-error-highlight');
                }, 3500);

                // Immediately cancel API request execution
                return;
            }

            // 2. Strict Gender Validation Guard before initiating try-on:
            // Check true outfit gender against model photo gender (do not falsely block matching female photo + female outfit)
            var photoGender = ((tryonState.detectedPhotoGender || (window.tryonState && window.tryonState.detectedPhotoGender) || tryonState.selectedGender || 'Female')).toLowerCase();

            // Determine actual outfit gender
            var outfitGender = 'unisex';
            if (window.selectedOutfit) {
                if (window.selectedOutfit.gender) {
                    outfitGender = String(window.selectedOutfit.gender).toLowerCase();
                } else if (window.selectedOutfit.custom && window.selectedOutfit.name) {
                    var cg = detectCustomGarmentGender(window.selectedOutfit.name);
                    if (cg) outfitGender = cg.toLowerCase();
                }
            }
            if (outfitGender === 'unisex' && g) {
                var gg = getGarmentGender(g);
                if (gg) outfitGender = gg.toLowerCase();
            }

            // Only block when there is a real contradiction between the model photo and the outfit
            if ((photoGender === 'male' && outfitGender === 'female') || (photoGender === 'female' && outfitGender === 'male')) {
                var mismatchMsg = "Category Mismatch: Please upload a matching photo for this " + (outfitGender === 'male' ? "Men's" : "Women's") + " outfit.";
                showStyle360Toast('error', 'Category Mismatch', mismatchMsg, 6000);
                return;
            }

            // Auto-sync active selectedGender to match the model photo
            var activeResolvedGender = (photoGender === 'female') ? 'Female' : 'Male';
            tryonState.selectedGender = activeResolvedGender;
            if (window.tryonState) {
                window.tryonState.selectedGender = activeResolvedGender;
                window.tryonState.detectedPhotoGender = activeResolvedGender;
            }
            if (window.StudioController && typeof window.StudioController.syncGenderToggle === 'function') {
                window.StudioController.syncGenderToggle(activeResolvedGender);
            }

            var personImg = tryonState.userPhotoData || (window.tryonState ? window.tryonState.userPhotoData : null);
            var isFullSet = (g && g.is_full_outfit) || isFullOutfitGarment(g);

            // Garment Selection Handling:
            var garmentImg = tryonState.customGarmentData 
                || (window.tryonState ? window.tryonState.customGarmentData : null) 
                || (window.selectedOutfit && window.selectedOutfit.data ? window.selectedOutfit.data : null);

            if (!garmentImg && g) {
                if (isFullSet) {
                    garmentImg = g.full_outfit_image_url || g.fal_image_url || g.display_image_url || g.img;
                } else {
                    garmentImg = g.fal_image_url || g.display_image_url || g.img;
                }
            }

            var garmentCategory = 'tops';
            var garmentName = '';
            if (g) {
                garmentCategory = g.category || 'tops';
                garmentName = g.name || g.title || '';
            } else if (window.selectedOutfit) {
                garmentCategory = window.selectedOutfit.category || 'tops';
                garmentName = window.selectedOutfit.name || 'Custom Garment';
            }

            // 3. API Category Payload Mapping:
            // Capture the selected coverage option value from radio group ("tops" | "bottoms" | "one-pieces")
            var coverageInput = document.querySelector('input[name="garment_coverage"]:checked');
            var selectedCoverage = coverageInput ? coverageInput.value : (isFullSet ? 'one-pieces' : (garmentCategory === 'bottoms' ? 'bottoms' : 'tops'));

            // Pass this exact value (`tops`, `bottoms`, or `one-pieces`) as the category field
            var effectiveCategory = selectedCoverage;
            var isFullBody = !!(tryonState.isFullBodyPhoto || (window.tryonState && window.tryonState.isFullBodyPhoto));
            if (isFullSet && effectiveCategory === 'tops') {
                effectiveCategory = 'one-pieces';
            }
            var coverFeet = (effectiveCategory === 'one-pieces' || effectiveCategory === 'bottoms' || isFullSet || isFullBody);

            // Helper to set UI loading states on buttons and overlay
            function setGeneratingState(isGenerating) {
                tryonState.isProcessing2D = isGenerating;

                // 1. Left column Generate button
                if (btnGenerate2D) {
                    btnGenerate2D.disabled = isGenerating;
                    if (isGenerating) {
                        btnGenerate2D.classList.add('loading');
                        btnGenerate2D.innerHTML = '<span class="btn-tryon-spinner"></span><span class="btn-label-text">Generating AI Try-On...</span>';
                    } else {
                        btnGenerate2D.classList.remove('loading');
                        btnGenerate2D.innerHTML = '<span class="btn-icon">⚡</span><span class="btn-label-text">Generate 2D Try-On</span>';
                    }
                }

                // 2. Center stage empty state radiant button
                if (btnStageEmptyGenerate) {
                    btnStageEmptyGenerate.disabled = isGenerating;
                    if (isGenerating) {
                        btnStageEmptyGenerate.classList.add('loading');
                        btnStageEmptyGenerate.innerHTML = '<span class="btn-tryon-spinner dark"></span><span class="btn-radiant-label">Generating AI Try-On...</span>';
                    } else {
                        btnStageEmptyGenerate.classList.remove('loading');
                        btnStageEmptyGenerate.innerHTML = '<span class="btn-radiant-label">⚡ Generate 2D Try-On</span>';
                    }
                }

                // 3. Center viewport loading overlay
                if (loadingOverlay) {
                    loadingOverlay.style.display = isGenerating ? 'flex' : 'none';
                }
            }

            setGeneratingState(true);

            // Show 2D loading animation overlay
            if (loadingTitle) loadingTitle.textContent = 'Generating AI Try-On...';
            if (loadingSub) loadingSub.textContent = 'Synthesizing realistic fabric drape with Fal.ai';
            if (loadingGemIcon) loadingGemIcon.textContent = '⚡';
            if (progressBar) progressBar.style.width = '12%';

            if (pill1) pill1.className = 'step-indicator-pill active';
            if (pill2) pill2.className = 'step-indicator-pill';
            if (pill3) pill3.className = 'step-indicator-pill';

            var step2Timer = setTimeout(function () {
                if (progressBar) progressBar.style.width = '55%';
                if (pill2) pill2.className = 'step-indicator-pill active';
            }, 1000);

            var step3Timer = setTimeout(function () {
                if (progressBar) progressBar.style.width = '85%';
                if (pill3) pill3.className = 'step-indicator-pill active';
            }, 2500);

            var currentUser = (window.Style360Auth && window.Style360Auth.getCurrentUser()) ? window.Style360Auth.getCurrentUser() : null;

            var payload = {
                user_id: currentUser ? currentUser.id : null,
                garment_id: (g && g.id) ? g.id : null,
                person_image: personImg,
                garment_image: garmentImg,
                category: effectiveCategory,
                cover_feet: coverFeet,
                is_full_body: isFullBody,
                garment_desc: garmentName,
                gender: activeResolvedGender || tryonState.selectedGender || 'Female'
            };

            var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/api/try-on' : '/api/try-on';

            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(function (res) {
                return res.text().then(function (text) {
                    var data = null;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        console.error('[Style360 2D] Server response parsing error:', text);
                    }
                    return { ok: res.ok, status: res.status, data: data };
                });
            })
            .then(function (result) {
                clearTimeout(step2Timer);
                clearTimeout(step3Timer);

                var data = result.data;
                var isSuccess = result.ok && data && (data.success === true || data.status === 'success');
                var generatedImageUrl = data ? (data.image_url || data.result_image) : null;

                if (!isSuccess || !generatedImageUrl) {
                    var errMsg = (data && data.message) ? data.message : ('AI Try-On failed (HTTP ' + result.status + '). Please try again.');
                    throw new Error(errMsg);
                }

                if (progressBar) progressBar.style.width = '100%';

                setTimeout(function () {
                    setGeneratingState(false);

                    tryonState.generated2DImage = generatedImageUrl;

                    // 1. Dynamically update the central preview <img> element's src attribute with clean render
                    if (output2DImg) {
                        output2DImg.src = generatedImageUrl;
                        output2DImg.style.opacity = '1';
                        output2DImg.style.filter = 'none';
                        output2DImg.style.mixBlendMode = 'normal';
                    }

                    // Remove any legacy canvas overlay layers if present
                    var legacyOverlays = document.querySelectorAll('.stage-recolor-live-overlay, .stage-recolor-live-overlay-bottom, #stage-recolor-live-overlay, #stage-recolor-live-overlay-bottom, #recolor-overlay, #stage-tint-layer');
                    legacyOverlays.forEach(function (el) { el.remove(); });

                    // 2. Ensure the static/mock couple preview image is removed immediately upon successful generation
                    if (panelEmpty) {
                        panelEmpty.style.display = 'none';
                        panelEmpty.classList.remove('active');
                    }
                    if (panel3D) {
                        panel3D.style.display = 'none';
                        panel3D.classList.remove('active');
                    }
                    if (panel2D) {
                        panel2D.style.display = 'flex';
                        panel2D.classList.add('active');
                    }

                    // 3. Update status indicators
                    if (chip2D) chip2D.className = 'flow-step-chip active';
                    if (chip3D) chip3D.className = 'flow-step-chip';
                    if (statusBadge) {
                        statusBadge.className = 'stage-status-badge live';
                        statusBadge.textContent = '● 2D Try-On Ready';
                    }

                    // 4. Save Try-On look to user history database (fallback only if backend didn't already record it)
                    if (currentUser && currentUser.id && (!data || !data.history_id)) {
                        var histApi = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/backend/history.php' : '/backend/history.php';
                        fetch(histApi, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                user_id: currentUser.id,
                                garment_id: (g && g.id) ? g.id : null,
                                result_2d_url: generatedImageUrl
                            })
                        }).catch(function (e) {
                            console.error('[Style360] History sync error:', e);
                        });
                    }

                    showStyle360Toast('success', 'AI Try-On Ready', 'Your photorealistic try-on look has been generated!', 4000);
                }, 350);
            })
            .catch(function (err) {
                clearTimeout(step2Timer);
                clearTimeout(step3Timer);
                console.error('[Style360 2D] Try-On Error:', err);

                if (progressBar) progressBar.style.width = '100%';

                setTimeout(function () {
                    setGeneratingState(false);

                    // If an API error occurs (e.g. invalid key or request timeout), show an error toast instead of leaving the placeholder image in broken state
                    var errorMsg = err.message || 'AI Virtual Try-On generation failed. Please check network or FAL_KEY.';
                    showStyle360Toast('error', 'Try-On Failed', errorMsg, 6500);
                }, 300);
            });
        }

        if (btnGenerate2D) {
            btnGenerate2D.onclick = execute2DTryOn;
        }

        if (btnStageEmptyGenerate) {
            btnStageEmptyGenerate.onclick = execute2DTryOn;
        }

        var btnAuxRefresh = document.getElementById('btn-aux-refresh');
        if (btnAuxRefresh) {
            btnAuxRefresh.onclick = function () {
                if (panelEmpty) panelEmpty.style.display = 'flex';
                if (panel2D) panel2D.style.display = 'none';
                if (panel3D) panel3D.style.display = 'none';
            };
        }

        var btnAuxDownload = document.getElementById('btn-aux-download');
        if (btnAuxDownload) {
            btnAuxDownload.onclick = function () {
                var a = document.createElement('a');
                a.href = 'images/silhouette_couple.jpg';
                a.download = 'style360_silhouette.jpg';
                a.click();
            };
        }

        /* ─── Step 4: Trigger Tripo3D Generation ONLY on 'Try 3D View' Click (Manual Trigger) ─── */
        if (btnTrigger3D) {
            btnTrigger3D.onclick = function (e) {
                if (e) e.preventDefault();
                if (window.StudioController && typeof window.StudioController.generate3DModel === 'function') {
                    window.StudioController.generate3DModel();
                } else if (typeof window.generate3DModel === 'function') {
                    window.generate3DModel();
                }
            };
        }

        // Tab switching: 2D Try-On vs 3D Mesh
        if (chip2D) {
            chip2D.onclick = function () {
                chip2D.classList.add('active');
                if (chip3D) chip3D.classList.remove('active');
                if (panel3D) panel3D.style.display = 'none';
                if (tryonState.generated2DImage && output2DImg && output2DImg.src) {
                    if (panel2D) panel2D.style.display = 'flex';
                    if (panelEmpty) panelEmpty.style.display = 'none';
                } else {
                    if (panelEmpty) panelEmpty.style.display = 'flex';
                    if (panel2D) panel2D.style.display = 'none';
                }
                if (statusBadge) {
                    statusBadge.className = 'stage-status-badge live';
                    statusBadge.textContent = '● Ready';
                }
            };
        }

        if (chip3D) {
            chip3D.onclick = function () {
                chip3D.classList.add('active');
                if (chip2D) chip2D.classList.remove('active');
                if (panelEmpty) panelEmpty.style.display = 'none';
                if (panel2D) panel2D.style.display = 'none';
                if (panel3D) panel3D.style.display = 'flex';

                if (window.Style360Viewer && typeof window.Style360Viewer.onResize === 'function') {
                    window.Style360Viewer.onResize();
                }
                window.dispatchEvent(new Event('resize'));

                var activeGlb = tryonState.generated3DModelUrl || (tryonState.selectedGarment && tryonState.selectedGarment.glb ? tryonState.selectedGarment.glb : 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/users/avater/sampleman_avatar_1786821873.glb');
                if (window.Style360Viewer && window.Style360Viewer.loadGLBModel) {
                    window.Style360Viewer.loadGLBModel(activeGlb);
                }

                if (statusBadge) {
                    statusBadge.className = 'stage-status-badge live';
                    statusBadge.textContent = '● 3D Interactive Mode';
                }
            };
        }

        // Return to 2D Result view
        if (btnBackTo2D) {
            btnBackTo2D.onclick = function () {
                if (panel3D) panel3D.style.display = 'none';
                if (chip2D) chip2D.classList.add('active');
                if (chip3D) chip3D.classList.remove('active');

                if (tryonState.generated2DImage && output2DImg && output2DImg.src) {
                    if (panel2D) panel2D.style.display = 'flex';
                    if (panelEmpty) panelEmpty.style.display = 'none';
                } else {
                    if (panelEmpty) panelEmpty.style.display = 'flex';
                    if (panel2D) panel2D.style.display = 'none';
                }
            };
        }

        // Reset 3D camera
        if (btnReset3D) {
            btnReset3D.onclick = function () {
                if (window.Style360Viewer && window.Style360Viewer.resetView) {
                    window.Style360Viewer.resetView();
                }
            };
        }

        // Reset All
        if (btnResetAll) {
            btnResetAll.onclick = function () {
                tryonState.userPhotoData = null;
                tryonState.detectedPhotoGender = null;
                tryonState.selectedGarment = null;
                tryonState.generated2DImage = null;
                tryonState.generated3DModelUrl = null;

                if (photoInput) photoInput.value = '';
                if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
                if (photoEmptyState) photoEmptyState.style.display = 'block';

                if (panel2D) panel2D.style.display = 'none';
                if (panel3D) panel3D.style.display = 'none';
                if (panelEmpty) panelEmpty.style.display = 'flex';

                if (chip2D) chip2D.classList.add('active');
                if (chip3D) chip3D.classList.remove('active');
                if (statusBadge) {
                    statusBadge.className = 'stage-status-badge live';
                    statusBadge.textContent = '● Ready';
                }

                tryonState.activeCategoryShortcut = 'all';
                renderSelectedGarmentPreview();
                updateStep1Context(null);
            };
        }

        // Download Image
        if (btnDownloadImg) {
            btnDownloadImg.onclick = function () {
                var src = tryonState.generated2DImage || (tryonState.selectedGarment ? (tryonState.selectedGarment.fal_image_url || tryonState.selectedGarment.display_image_url || tryonState.selectedGarment.img) : 'images/silhouette_couple.jpg');
                var link = document.createElement('a');
                link.download = 'style360_tryon_result.png';
                link.href = src;
                link.click();
            };
        }

        /* ─── Fabric Customization & Color Tone Listeners ─── */
        var fabricSwatches = document.querySelectorAll('.fabric-swatch-item');
        fabricSwatches.forEach(function (btn) {
            btn.onclick = function () {
                fabricSwatches.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                var fabric = btn.getAttribute('data-fabric');
                if (window.Style360Viewer && window.Style360Viewer.applyFabricType) {
                    window.Style360Viewer.applyFabricType(fabric);
                }
            };
        });

        // Helper: HSL to Hex converter for the rainbow color tone slider
        function hslToHex(h, s, l) {
            l /= 100;
            var a = s * Math.min(l, 1 - l) / 100;
            var f = function (n) {
                var k = (n + h / 30) % 12;
                var color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, '0');
            };
            return '#' + f(0) + f(8) + f(4);
        }

        /* ─── Dynamic Outfit Recolor Feature & Drawer Controller ─── */
        function getColorNameFromHex(hex) {
            if (!hex) return 'Royal Gold';
            var clean = hex.replace('#', '').trim();
            if (clean.length === 3) {
                clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
            }
            if (clean.length !== 6) return 'Selected Color';

            var r = parseInt(clean.substring(0, 2), 16);
            var g = parseInt(clean.substring(2, 4), 16);
            var b = parseInt(clean.substring(4, 6), 16);

            var rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
            var max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
            var h, s, l = (max + min) / 2;

            if (max === min) {
                h = s = 0;
            } else {
                var d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
                    case gNorm: h = (bNorm - rNorm) / d + 2; break;
                    case bNorm: h = (rNorm - gNorm) / d + 4; break;
                }
                h = Math.round(h * 60);
            }
            s = Math.round(s * 100);
            l = Math.round(l * 100);

            if (s < 12) {
                if (l < 18) return 'Obsidian Black';
                if (l < 45) return 'Charcoal Grey';
                if (l < 75) return 'Silver Grey';
                return 'Pure White';
            }

            if (h >= 15 && h <= 45 && s < 60 && l < 45) {
                return (l < 25) ? 'Dark Chocolate Brown' : 'Warm Espresso Brown';
            }
            if (h >= 35 && h <= 55 && s < 50 && l > 70) {
                return 'Champagne Cream';
            }

            var prefix = '';
            if (l < 25) prefix = 'Deep ';
            else if (l < 35) prefix = 'Dark ';
            else if (l > 75) prefix = 'Pastel ';
            else if (s > 75) prefix = 'Vibrant ';

            var base = '';
            if (h < 12 || h >= 350) {
                base = (l < 35) ? 'Ruby Crimson' : ((l > 65) ? 'Coral Pink' : 'Ruby Red');
            } else if (h < 28) {
                base = 'Scarlet Red';
            } else if (h < 45) {
                base = (s > 70 && l > 45) ? 'Tangerine Orange' : 'Warm Amber Gold';
            } else if (h < 65) {
                base = (l > 70) ? 'Canary Yellow' : 'Royal Gold';
            } else if (h < 85) {
                base = 'Lime Green';
            } else if (h < 150) {
                base = (l < 30) ? 'Deep Forest Green' : 'Emerald Green';
            } else if (h < 180) {
                base = 'Teal';
            } else if (h < 205) {
                base = 'Turquoise Cyan';
            } else if (h < 235) {
                base = (l < 30) ? 'Midnight Navy Blue' : ((l > 65) ? 'Sky Blue' : 'Royal Sapphire Blue');
            } else if (h < 265) {
                base = (l < 30) ? 'Midnight Indigo' : 'Deep Indigo';
            } else if (h < 290) {
                base = (l < 35) ? 'Deep Plum Purple' : 'Royal Purple';
            } else if (h < 320) {
                base = 'Orchid Violet';
            } else if (h < 340) {
                base = (l < 45) ? 'Fuchsia Magenta' : 'Magenta Pink';
            } else {
                base = 'Rose Pink';
            }

            if (prefix && base.indexOf(prefix.trim()) === -1) {
                return prefix + base;
            }
            return base;
        }

        /* ─── Custom Outfit Request Modal & Bespoke Atelier Controller ─── */
        var customReqModal          = document.getElementById('custom-request-modal');
        var btnOpenCustomReqModal   = document.getElementById('btn-open-custom-request-modal');
        var btnCloseCustomReqModal  = document.getElementById('btn-close-custom-request');
        var btnCancelCustomReqModal = document.getElementById('btn-cancel-custom-request');
        var formCustomRequest       = document.getElementById('form-custom-outfit-request');

        var customReqThumb          = document.getElementById('custom-req-outfit-thumb');
        var customReqCat            = document.getElementById('custom-req-outfit-cat');
        var customReqName           = document.getElementById('custom-req-outfit-name');
        var customReqIdLabel        = document.getElementById('custom-req-outfit-id');
        var customReqIdInput        = document.getElementById('custom-req-outfit-id-input');

        var customTopNativeInput    = document.getElementById('custom-top-color-input');
        var customTopColorDot       = document.getElementById('custom-top-color-dot');
        var customTopHexInput       = document.getElementById('custom-top-color-hex');
        var customTopSwatches       = document.querySelectorAll('#custom-top-quick-swatches .swatch-mini');

        var customBottomNativeInput = document.getElementById('custom-bottom-color-input');
        var customBottomColorDot    = document.getElementById('custom-bottom-color-dot');
        var customBottomHexInput    = document.getElementById('custom-bottom-color-hex');
        var customBottomSwatches    = document.querySelectorAll('#custom-bottom-quick-swatches .swatch-mini');

        var customNotesTextarea     = document.getElementById('custom-request-notes');
        var btnSubmitCustomReq      = document.getElementById('btn-submit-custom-request');
        var customSubmitSpinner     = document.getElementById('custom-submit-spinner');
        var customSubmitIcon        = document.getElementById('custom-submit-icon');
        var customSubmitText        = document.getElementById('custom-submit-text');
        var customAlert             = document.getElementById('custom-request-alert');

        // Ensure any residual overlay elements or blend modes are permanently purged from DOM
        function purgeAllCanvasOverlays() {
            var overlays = document.querySelectorAll('.stage-recolor-live-overlay, .stage-recolor-live-overlay-bottom, #stage-recolor-live-overlay, #stage-recolor-live-overlay-bottom, #recolor-overlay, #stage-tint-layer');
            overlays.forEach(function (el) { el.remove(); });
            if (output2DImg) {
                output2DImg.style.opacity = '1';
                output2DImg.style.filter = 'none';
                output2DImg.style.mixBlendMode = 'normal';
            }
        }
        purgeAllCanvasOverlays();

        function setTopColor(hex) {
            if (!hex) return;
            if (hex.indexOf('#') !== 0) hex = '#' + hex;
            if (customTopNativeInput) customTopNativeInput.value = hex;
            if (customTopColorDot) customTopColorDot.style.backgroundColor = hex;
            if (customTopHexInput) customTopHexInput.value = hex.toUpperCase();

            customTopSwatches.forEach(function (btn) {
                if ((btn.getAttribute('data-color') || '').toLowerCase() === hex.toLowerCase()) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Pure stage render: Do not apply any CSS overlay, color masks, or tint boxes on model
            purgeAllCanvasOverlays();

            if (window.Style360Viewer && window.Style360Viewer.applyGarmentColor) {
                window.Style360Viewer.applyGarmentColor(hex);
            }
        }

        function setBottomColor(hex) {
            if (!hex) return;
            if (hex.indexOf('#') !== 0) hex = '#' + hex;
            if (customBottomNativeInput) customBottomNativeInput.value = hex;
            if (customBottomColorDot) customBottomColorDot.style.backgroundColor = hex;
            if (customBottomHexInput) customBottomHexInput.value = hex.toUpperCase();

            customBottomSwatches.forEach(function (btn) {
                if ((btn.getAttribute('data-color') || '').toLowerCase() === hex.toLowerCase()) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Pure stage render: Do not apply any CSS overlay, color masks, or tint boxes on model
            purgeAllCanvasOverlays();
        }

        // Color input listeners: Top
        if (customTopNativeInput) {
            customTopNativeInput.oninput = function () {
                setTopColor(customTopNativeInput.value);
            };
        }
        if (customTopHexInput) {
            customTopHexInput.oninput = function () {
                var val = customTopHexInput.value.trim();
                if (/^#?[0-9A-Fa-f]{6}$/.test(val)) {
                    setTopColor(val);
                }
            };
        }
        customTopSwatches.forEach(function (btn) {
            btn.onclick = function () {
                var c = btn.getAttribute('data-color');
                if (c) setTopColor(c);
            };
        });

        // Color input listeners: Bottom
        if (customBottomNativeInput) {
            customBottomNativeInput.oninput = function () {
                setBottomColor(customBottomNativeInput.value);
            };
        }
        if (customBottomHexInput) {
            customBottomHexInput.oninput = function () {
                var val = customBottomHexInput.value.trim();
                if (/^#?[0-9A-Fa-f]{6}$/.test(val)) {
                    setBottomColor(val);
                }
            };
        }
        customBottomSwatches.forEach(function (btn) {
            btn.onclick = function () {
                var c = btn.getAttribute('data-color');
                if (c) setBottomColor(c);
            };
        });

        // Modal Open / Close
        function openCustomRequestModal() {
            purgeAllCanvasOverlays();
            var garment = tryonState.selectedGarment;

            // Populate outfit details
            var imgUrl = (garment && (garment.fal_image_url || garment.display_image_url || garment.img)) || 'images/hero_couple.png';
            var title = (garment && garment.title) || 'Selected Garment';
            var cat = (garment && (garment.category || garment.gender)) || 'Luxury Atelier';
            var gId = (garment && garment.id) ? garment.id : '';

            if (customReqThumb) customReqThumb.src = imgUrl;
            if (customReqName) customReqName.textContent = title;
            if (customReqCat) customReqCat.textContent = cat;
            if (customReqIdLabel) customReqIdLabel.textContent = gId ? ('Outfit ID: #' + gId) : 'Custom Selection';
            if (customReqIdInput) customReqIdInput.value = gId;

            if (customAlert) {
                customAlert.style.display = 'none';
                customAlert.className = 'custom-request-alert';
                customAlert.textContent = '';
            }

            if (customReqModal) {
                customReqModal.style.display = 'flex';
                customReqModal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            }
        }

        function closeCustomRequestModal() {
            purgeAllCanvasOverlays();
            if (customReqModal) {
                customReqModal.style.display = 'none';
                customReqModal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
            if (customAlert) {
                customAlert.style.display = 'none';
            }
        }

        if (btnOpenCustomReqModal) {
            btnOpenCustomReqModal.onclick = function (e) {
                e.stopPropagation();
                openCustomRequestModal();
            };
        }

        // Backward compatibility for any remaining triggers
        var legacyRecolorBtn = document.getElementById('btn-open-recolor-drawer');
        if (legacyRecolorBtn) {
            legacyRecolorBtn.onclick = function (e) {
                e.stopPropagation();
                openCustomRequestModal();
            };
        }

        if (btnCloseCustomReqModal) {
            btnCloseCustomReqModal.onclick = function (e) {
                e.stopPropagation();
                closeCustomRequestModal();
            };
        }
        if (btnCancelCustomReqModal) {
            btnCancelCustomReqModal.onclick = function (e) {
                e.stopPropagation();
                closeCustomRequestModal();
            };
        }
        if (customReqModal) {
            customReqModal.onclick = function (e) {
                if (e.target === customReqModal) {
                    closeCustomRequestModal();
                }
            };
        }

        // Form Submission
        if (formCustomRequest) {
            formCustomRequest.onsubmit = function (e) {
                e.preventDefault();

                var outfitId = (customReqIdInput && customReqIdInput.value) ? parseInt(customReqIdInput.value, 10) : (tryonState.selectedGarment ? tryonState.selectedGarment.id : null);
                var topColor = (customTopHexInput && customTopHexInput.value) ? customTopHexInput.value.trim() : '#D4AF37';
                var bottomColor = (customBottomHexInput && customBottomHexInput.value) ? customBottomHexInput.value.trim() : '#1B2A4A';
                var notes = (customNotesTextarea && customNotesTextarea.value) ? customNotesTextarea.value.trim() : '';

                // Read user ID from session/local storage
                var userId = null;
                try {
                    var raw = localStorage.getItem('style360_user');
                    if (raw) {
                        var u = JSON.parse(raw);
                        if (u && u.id) userId = parseInt(u.id, 10);
                    }
                } catch (err) {}

                var payload = {
                    user_id: userId,
                    outfit_id: outfitId,
                    outfit_title: tryonState.selectedGarment ? tryonState.selectedGarment.title : '',
                    top_color: topColor,
                    bottom_color: bottomColor,
                    notes: notes
                };

                // UI loading state
                if (btnSubmitCustomReq) btnSubmitCustomReq.disabled = true;
                if (customSubmitSpinner) customSubmitSpinner.style.display = 'inline-block';
                if (customSubmitIcon) customSubmitIcon.style.display = 'none';
                if (customSubmitText) customSubmitText.textContent = 'Submitting Request...';

                var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/api/custom-request' : '/api/custom-request';

                fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(payload)
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (btnSubmitCustomReq) btnSubmitCustomReq.disabled = false;
                    if (customSubmitSpinner) customSubmitSpinner.style.display = 'none';
                    if (customSubmitIcon) customSubmitIcon.style.display = 'inline';
                    if (customSubmitText) customSubmitText.textContent = 'Submit Custom Request';

                    if (data && data.status === 'success') {
                        if (customAlert) {
                            customAlert.className = 'custom-request-alert success';
                            customAlert.textContent = '✅ ' + (data.message || 'Custom Outfit Request submitted successfully!');
                            customAlert.style.display = 'block';
                        }
                        showStyle360Toast('success', 'Request Received', 'Your bespoke outfit request has been sent to our atelier!', 4500);

                        if (customNotesTextarea) customNotesTextarea.value = '';

                        setTimeout(function () {
                            closeCustomRequestModal();
                        }, 2200);
                    } else {
                        var errMsg = (data && data.message) ? data.message : 'Unable to submit request. Please try again.';
                        if (customAlert) {
                            customAlert.className = 'custom-request-alert error';
                            customAlert.textContent = '⚠️ ' + errMsg;
                            customAlert.style.display = 'block';
                        }
                        showStyle360Toast('error', 'Submission Failed', errMsg, 5000);
                    }
                })
                .catch(function (err) {
                    console.error('[Style360 Custom Request] Error:', err);
                    if (btnSubmitCustomReq) btnSubmitCustomReq.disabled = false;
                    if (customSubmitSpinner) customSubmitSpinner.style.display = 'none';
                    if (customSubmitIcon) customSubmitIcon.style.display = 'inline';
                    if (customSubmitText) customSubmitText.textContent = 'Submit Custom Request';

                    if (customAlert) {
                        customAlert.className = 'custom-request-alert error';
                        customAlert.textContent = '⚠️ Network error submitting custom request. Please try again.';
                        customAlert.style.display = 'block';
                    }
                    showStyle360Toast('error', 'Network Error', 'Could not reach server to submit request.', 5000);
                });
            };
        }

        /* ─── Mode Tabs (3D Studio, 3D Mesh, Texture Map) ─── */
        var modeTabs = document.querySelectorAll('.stage-dark-tab');
        modeTabs.forEach(function (tab) {
            tab.onclick = function () {
                modeTabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                var mode = tab.getAttribute('data-mode');

                if (panel3D) panel3D.style.display = 'flex';
                if (panel2D) panel2D.style.display = 'none';
                if (panelEmpty) panelEmpty.style.display = 'none';

                if (window.Style360Viewer && typeof window.Style360Viewer.onResize === 'function') {
                    window.Style360Viewer.onResize();
                }
                window.dispatchEvent(new Event('resize'));

                if (mode === 'mesh' || mode === 'studio') {
                    var activeGlb = tryonState.generated3DModelUrl || (tryonState.selectedGarment && tryonState.selectedGarment.glb ? tryonState.selectedGarment.glb : 'https://pub-7864144fb92e4384ada811a36b701b69.r2.dev/users/avater/sampleman_avatar_1786821873.glb');
                    if (window.Style360Viewer && window.Style360Viewer.loadGLBModel) {
                        window.Style360Viewer.loadGLBModel(activeGlb);
                    }
                }
            };
        });

        // Initial Stage State: show empty placeholder panel until photo is uploaded or generation is triggered
        if (panelEmpty) panelEmpty.style.display = 'flex';
        if (panel2D) panel2D.style.display = 'none';
        if (panel3D) panel3D.style.display = 'none';
        if (loadingOverlay) loadingOverlay.style.display = 'none';

        if (statusBadge) {
            statusBadge.className = 'stage-status-badge live';
            statusBadge.textContent = '● Ready • Upload Photo';
        }

        // Initialize gender pill state
        if (tryonState.selectedGender === 'Female') {
            if (btnFemale) btnFemale.classList.add('active');
            if (btnMale) btnMale.classList.remove('active');
        } else {
            if (btnMale) btnMale.classList.add('active');
            if (btnFemale) btnFemale.classList.remove('active');
        }

        // Custom garment upload handlers are registered and validated in Step 2 above

        /* ─── Step 2: Browse Collection Catalog Button ─── */
        var btnBrowseCatalog = document.getElementById('btn-browse-collection-catalog');
        if (btnBrowseCatalog) {
            btnBrowseCatalog.onclick = function () {
                var modelGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
                    ? window.StudioController.getModelGender()
                    : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
                showCategory(modelGender === 'Female' ? 'cat-wedding-women' : 'cat-wedding-men', 'all');
            };
        }

        /* ─── Step 2: "Change ›" link on selected outfit row ─── */
        var btnChangeOutfitLink = document.getElementById('btn-change-outfit-link');
        if (btnChangeOutfitLink) {
            btnChangeOutfitLink.onclick = function () {
                var modelGender = (window.StudioController && typeof window.StudioController.getModelGender === 'function')
                    ? window.StudioController.getModelGender()
                    : ((tryonState.userPhotoData && tryonState.detectedPhotoGender) ? tryonState.detectedPhotoGender : (tryonState.selectedGender || 'Male'));
                showCategory(modelGender === 'Female' ? 'cat-wedding-women' : 'cat-wedding-men', 'all');
            };
        }

        // Render the selected outfit preview (pre-populated from localStorage state sync or prior state)
        renderSelectedGarmentPreview();
    }


    /* ─── Global Event Listeners for Navigation & Routing ─── */
    navHomeLink && navHomeLink.addEventListener('click', function (e) { e.preventDefault(); showHome(); });
    navTryOnLink && navTryOnLink.addEventListener('click', function (e) { e.preventDefault(); showTryOnPage(); });
    btnGetStarted && btnGetStarted.addEventListener('click', function (e) { e.preventDefault(); showTryOnPage(); });
    btnShopNow && btnShopNow.addEventListener('click', function (e) { e.preventDefault(); showCategory('cat-wedding-women'); });

    navHomeLogo && navHomeLogo.addEventListener('click', function (e) {
        if (!homePage) return;
        e.preventDefault();
        showHome();
        try {
            if (window.location.hash || window.location.search) {
                window.history.pushState(null, '', 'index.html');
            }
        } catch (err) {}
    });

    btnCatBack && btnCatBack.addEventListener('click', function () { showHome(); });

    // Switcher Pills on Collection Page
    btnSwitchWomen && btnSwitchWomen.addEventListener('click', function () {
        if (tryonState.selectedGender !== 'Female') {
            tryonState.selectedGender = 'Female';
            if (typeof resetSelectedOutfit === 'function') {
                resetSelectedOutfit("Please select an outfit matching the chosen gender.");
            }
        }
        showCategory('cat-wedding-women', 'all');
    });

    btnSwitchMen && btnSwitchMen.addEventListener('click', function () {
        if (tryonState.selectedGender !== 'Male') {
            tryonState.selectedGender = 'Male';
            if (typeof resetSelectedOutfit === 'function') {
                resetSelectedOutfit("Please select an outfit matching the chosen gender.");
            }
        }
        showCategory('cat-wedding-men', 'all');
    });

    // Home Page Category Cards
    var catWomenCard = document.getElementById('cat-wedding-women');
    var catMenCard   = document.getElementById('cat-wedding-men');
    var catBanner    = document.getElementById('cat-wedding-banner');

    catWomenCard && catWomenCard.addEventListener('click', function () { showCategory('cat-wedding-women', 'all'); });
    catMenCard && catMenCard.addEventListener('click', function () { showCategory('cat-wedding-men', 'all'); });
    catBanner && catBanner.addEventListener('click', function () { showCategory('cat-wedding-women', 'bridal'); });

    /* ─── Auto-load 3D Model from Studio Navigation ─── */
    function checkAndLoadStored3DModel() {
        try {
            var urlParams = new URLSearchParams(window.location.search);
            var url3D = urlParams.get('load_3d') || urlParams.get('model_id');
            var raw = localStorage.getItem('style360_active_3d_model') || sessionStorage.getItem('style360_active_3d_model');
            var data = null;
            if (raw) {
                try { data = JSON.parse(raw); } catch (e) {}
            }

            var glbUrl = '';
            var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';

            if (url3D) {
                var target = String(url3D).trim();
                if (target.indexOf('http://') === 0 || target.indexOf('https://') === 0) {
                    glbUrl = prefix + '/backend/proxy_glb.php?url=' + encodeURIComponent(target);
                } else if (target.indexOf('proxy_glb') !== -1) {
                    glbUrl = (target.indexOf('/') === 0) ? (prefix + target) : (prefix + '/' + target);
                } else {
                    glbUrl = prefix + '/backend/proxy_glb.php?id=' + encodeURIComponent(target);
                }
            } else if (data && (data.glb_url || data.model_file || data.url)) {
                glbUrl = (data.glb_url || data.model_file || data.url).trim();
            }

            if (!glbUrl || glbUrl === 'null' || glbUrl.length < 5) return false;

            // Remove item so it doesn't repeatedly auto-load
            localStorage.removeItem('style360_active_3d_model');
            sessionStorage.removeItem('style360_active_3d_model');

            tryonState.generated3DModelUrl = glbUrl;

            // Switch to Try-On page
            showTryOnPage();

            setTimeout(function () {
                var pEmpty   = document.getElementById('stage-panel-empty');
                var p2D      = document.getElementById('stage-panel-2d');
                var p3D      = document.getElementById('stage-panel-3d');
                var c2D      = document.getElementById('stage-chip-2d');
                var c3D      = document.getElementById('stage-chip-3d');
                var sBadge   = document.getElementById('stage-status-indicator');
                var pStage   = document.querySelector('.scanner-pod-stage');
                var mMount   = document.getElementById('stage-canvas-3d-mount');

                if (pEmpty) pEmpty.style.display = 'none';
                if (p2D) p2D.style.display = 'none';
                if (p3D) p3D.style.display = 'flex';
                if (c2D) c2D.classList.remove('active');
                if (c3D) c3D.classList.add('active');

                if (window.Style360Viewer && typeof window.Style360Viewer.onResize === 'function') {
                    window.Style360Viewer.onResize();
                }
                window.dispatchEvent(new Event('resize'));

                if (window.Style360Viewer && window.Style360Viewer.loadGLBModel) {
                    window.Style360Viewer.loadGLBModel(glbUrl);
                }

                if (sBadge) {
                    sBadge.className = 'stage-status-badge live';
                    sBadge.textContent = '● 3D Interactive Mode';
                }

                var stageTarget = document.getElementById('stage-main-display') || p3D;
                if (stageTarget) {
                    stageTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);

            return true;
        } catch (e) {
            console.error('[Style360] Failed to load stored 3D model:', e);
            return false;
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        // Preload garments from DB
        loadGarmentsFromDatabase(function () {
            if (!homePage) return;

            var loaded3D = checkAndLoadStored3DModel();
            if (loaded3D) return;

            var hash = window.location.hash;
            if (hash === '#studio-section' || hash === '#studio') {
                showStudio();
            } else if (hash === '#tryon-dedicated-section' || hash === '#tryon') {
                showTryOnPage();
            } else if (hash === '#category-section' || hash === '#women') {
                showCategory('cat-wedding-women', 'all');
            } else if (hash === '#men') {
                showCategory('cat-wedding-men', 'all');
            } else {
                showHome();
            }
        });
    });

    // Expose Global API
    window.Style360Home = {
        showHome: showHome,
        showStudio: showStudio,
        showCategory: showCategory,
        showTryOnPage: showTryOnPage,
        loadGarmentsFromDatabase: loadGarmentsFromDatabase
    };

})();
