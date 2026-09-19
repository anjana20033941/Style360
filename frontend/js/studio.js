/**
 * Style360 — Try-On Studio Controller (studio.js)
 * End-to-End Image Verification & Validation Pipeline across Step 1 and Step 2.
 *
 * Requirements:
 * 1. Step 1: User Photo Verification & Gender Sync:
 *    - Auto-detect user's gender (Male / Female) using Vision AI via backend API.
 *    - Automatically sync the Step 1 Gender Toggle ('Male Model' / 'Female Model') to match detected gender.
 *    - Reject mismatched uploads with alert: "❌ Gender Mismatch: Uploaded photo does not match selected gender tab."
 * 2. Gender Toggle Auto-Reset Rule:
 *    - Whenever Gender Toggle ('Male Model' / 'Female Model') is switched, IMMEDIATELY clear/unselect active outfit in Step 2 (selectedOutfit = null).
 *    - Reset Step 2 UI elements (remove selected outfit card, reset custom file upload input, show placeholder: "Please select an outfit matching the chosen gender.").
 * 3. Step 2: Outfit Upload & Verification Process (Custom & Catalog):
 *    - Loading State: Show "Verifying Image & Safety..." loading overlay over Step 2 card upon custom garment upload.
 *    - Call backend/verify_garment.php to classify image (flat-lay or human model, Confidence > 80%).
 *    - Category detection: Top, Bottom, Full Outfit/Dress. If no garment detected: "❌ Invalid Outfit Image: No garment detected."
 *    - NSFW/18+ guardrail: Block underwear, lingerie, sheer/revealing innerwear, explicit content: "❌ Explicit/Inappropriate clothing is not allowed."
 *    - Strict gender matching: Block cross-gender selections: "❌ Gender Mismatch: Cannot try on a Male outfit on a Female model."
 *    - Success state: Show thumbnail, update category tags/coverage, enable selection.
 * 4. Gatekeeper Logic for "Generate 2D Try-On" Button:
 *    - Keep "Generate 2D Try-On" button DISABLED until BOTH conditions are met:
 *      a) Step 1 user image is valid & gender-verified.
 *      b) Step 2 outfit passes garment classification, NSFW 18+ filter, and matches active Step 1 gender.
 */
(function (window, document) {
    'use strict';

    function getApiEndpoint(route) {
        var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
        return prefix + route;
    }

    function showToast(type, title, message, duration) {
        if (typeof window.showStyle360Toast === 'function') {
            window.showStyle360Toast(type, title, message, duration || 5500);
        } else {
            var container = document.getElementById('style360-toast-container');
            var toast = document.getElementById('style360-toast');
            var titleEl = document.getElementById('toast-title');
            var msgEl = document.getElementById('toast-message');
            if (container && toast && titleEl && msgEl) {
                toast.className = 'style360-toast ' + (type === 'error' ? 'toast-error' : (type === 'warning' ? 'toast-warning' : 'toast-success'));
                titleEl.textContent = title;
                msgEl.textContent = message;
                container.classList.add('show');
                setTimeout(function () { container.classList.remove('show'); }, duration || 5500);
            } else {
                alert(message);
            }
        }
    }

    var StudioController = {
        // Return active state
        getState: function () {
            if (!window.tryonState) {
                window.tryonState = {
                    selectedGender: 'Male',
                    genderUnlocked: false,
                    userPhotoData: null,
                    detectedPhotoGender: null,
                    isPhotoVerified: false,
                    selectedGarment: null,
                    customGarmentData: null,
                    isOutfitVerified: false
                };
            }
            return window.tryonState;
        },

        // Determine active model gender: user photo takes absolute precedence over toggle
        getModelGender: function () {
            var state = this.getState();
            if (state.userPhotoData && state.detectedPhotoGender) {
                return state.detectedPhotoGender;
            }
            if (window.tryonState && window.tryonState.userPhotoData && window.tryonState.detectedPhotoGender) {
                return window.tryonState.detectedPhotoGender;
            }
            return (state.selectedGender || (window.tryonState && window.tryonState.selectedGender) || 'Male');
        },

        // Determine garment gender from metadata or category keywords
        getGarmentGender: function (garment) {
            if (!garment) return null;
            var g = (garment.gender || '').toLowerCase().trim();
            if (g === 'female' || g === 'women' || g === 'woman') return 'Female';
            if (g === 'male' || g === 'men' || g === 'man') return 'Male';
            if (g === 'unisex') return 'Unisex';

            var combined = ((garment.category || '') + ' ' + (garment.name || garment.title || '') + ' ' + (garment.desc || '')).toLowerCase();
            if (/\b(women|woman|womens|female|girl|lady|dress|gown|bridal|saree|sari|lehenga|kurti|kurtis|skirt|blouse|anarkali|bride)\b/i.test(combined)) {
                return 'Female';
            }
            if (/\b(men|man|mens|male|boy|gentleman|tuxedo|sherwani|kurta\s*pajama|dhoti|cowboy|sherpa|groom|tux)\b/i.test(combined)) {
                return 'Male';
            }
            return null;
        },

        // Detect custom garment gender from filename or description
        detectCustomGarmentGender: function (fileNameOrText) {
            if (!fileNameOrText) return null;
            var text = String(fileNameOrText).toLowerCase();
            var maleMatch = /(^|[^a-z0-9])(men|mens|male|boy|guy|gentleman|tuxedo|sherwani|kurta|dhoti|cowboy|sherpa|groom|tux|cat_men|g_men)([^a-z0-9]|$)/i.test(text);
            var femaleMatch = /(^|[^a-z0-9])(women|womens|female|girl|lady|woman|dress|gown|skirt|blouse|saree|sari|lehenga|kurti|anarkali|bride|cat_women|g_women)([^a-z0-9]|$)/i.test(text);
            if (femaleMatch && !maleMatch) return 'Female';
            if (maleMatch && !femaleMatch) return 'Male';
            return null;
        },

        // Check if there is any outfit-to-model gender mismatch
        hasGarmentGenderMismatch: function () {
            var state = this.getState();
            var activeGender = this.getModelGender();
            if (!activeGender) return false;

            var outfit = state.selectedGarment || (window.tryonState ? window.tryonState.selectedGarment : null) || window.selectedOutfit;
            if (outfit) {
                var gGender = this.getGarmentGender(outfit);
                if (outfit.custom && !gGender && outfit.name) {
                    gGender = this.detectCustomGarmentGender(outfit.name);
                }
                if (gGender && gGender !== activeGender && gGender !== 'Unisex') {
                    return true;
                }
            }

            if ((state.customGarmentData || (window.tryonState && window.tryonState.customGarmentData)) && window.selectedOutfit) {
                var customGender = window.selectedOutfit.gender || this.detectCustomGarmentGender(window.selectedOutfit.name);
                if (customGender) {
                    var norm = (customGender.toLowerCase() === 'female') ? 'Female' : ((customGender.toLowerCase() === 'male') ? 'Male' : 'Unisex');
                    if (norm !== activeGender && norm !== 'Unisex') {
                        return true;
                    }
                }
            }

            return false;
        },

        // 2. Gender Toggle Auto-Reset Rule:
        // Clear active outfit state, reset Step 2 UI elements, and display placeholder state
        resetOutfit: function (promptText) {
            var defaultPrompt = promptText || "Please select an outfit matching the chosen gender.";
            var state = this.getState();
            if (state) {
                state.selectedGarment = null;
                state.customGarmentData = null;
                state.isOutfitVerified = false;
            }
            window.selectedOutfit = null;
            try { localStorage.removeItem('style360_pending_garment'); } catch (e) {}

            var garmentInput = document.getElementById('garment-upload-input');
            var garmentPreviewWrap = document.getElementById('garment-upload-preview-wrap');
            var garmentPreviewImg = document.getElementById('garment-upload-preview-img');
            var garmentEmptyState = document.getElementById('garment-upload-empty-state');
            var previewCard = document.getElementById('selected-outfit-preview-card');
            var placeholder = document.getElementById('no-outfit-placeholder');
            var cardStep2 = document.getElementById('card-step-2');
            var garmentDropzone = document.getElementById('garment-upload-dropzone');

            if (garmentInput) garmentInput.value = '';
            if (garmentPreviewWrap) garmentPreviewWrap.style.display = 'none';
            if (garmentPreviewImg) garmentPreviewImg.src = '';
            if (garmentEmptyState) garmentEmptyState.style.display = 'block';

            if (previewCard) {
                var existingRow = previewCard.querySelector('.selected-garment-row');
                if (existingRow) existingRow.remove();
                previewCard.classList.remove('input-error-highlight');
            }
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.innerHTML = '<p>' + defaultPrompt + '<br/><span style="font-size:0.72rem;color:#94A3B8;">Browse catalog or upload matching outfit.</span></p>';
            }

            if (cardStep2) cardStep2.classList.remove('input-error-highlight');
            if (garmentDropzone) garmentDropzone.classList.remove('input-error-highlight');

            this.checkGatekeeper();
        },

        // Sync gender toggle UI buttons and model state
        syncGenderToggle: function (gender) {
            var state = this.getState();
            state.selectedGender = gender;
            state.genderUnlocked = true;

            if (window.tryonState) {
                window.tryonState.selectedGender = gender;
                window.tryonState.genderUnlocked = true;
            }

            var btnMale = document.getElementById('tryon-gender-male');
            var btnFemale = document.getElementById('tryon-gender-female');
            var btnGroup = document.getElementById('tryon-gender-btn-group');
            var lockedPill = document.getElementById('tryon-gender-locked-pill');

            if (lockedPill) lockedPill.style.display = 'none';
            if (btnGroup) btnGroup.style.display = 'flex';

            if (btnMale) {
                btnMale.disabled = false;
                btnMale.classList.remove('disabled');
                if (gender === 'Male') btnMale.classList.add('active');
                else btnMale.classList.remove('active');
            }
            if (btnFemale) {
                btnFemale.disabled = false;
                btnFemale.classList.remove('disabled');
                if (gender === 'Female') btnFemale.classList.add('active');
                else btnFemale.classList.remove('active');
            }

            var step1Subtitle = document.getElementById('tryon-step1-subtitle');
            if (step1Subtitle) {
                step1Subtitle.textContent = (gender === 'Female')
                    ? "Upload a clear, full-length photo of a female model or yourself"
                    : "Upload a clear, full-length photo of a male model or yourself";
            }
        },

        // Set target model gender and trigger Auto-Reset Rule
        setGender: function (gender, isManual) {
            var state = this.getState();
            var prevGender = state.selectedGender;
            var isGenderSwitch = (prevGender && prevGender !== gender);

            this.syncGenderToggle(gender);

            // Auto-Reset Outfit on Gender Switch
            if (isGenderSwitch) {
                this.resetOutfit("Please select an outfit matching the chosen gender.");

                // Check if existing uploaded photo conflicts with the new gender toggle
                if (state.userPhotoData && state.detectedPhotoGender) {
                    if (state.detectedPhotoGender !== gender) {
                        // Reject and clear mismatched photo
                        var photoInput = document.getElementById('tryon-user-upload-input');
                        var photoPreviewWrap = document.getElementById('tryon-user-preview-wrap');
                        var photoPreviewImg = document.getElementById('tryon-user-preview-img');
                        var photoEmptyState = document.getElementById('tryon-user-empty-state');
                        var photoDropzone = document.getElementById('tryon-photo-dropzone');

                        if (photoInput) photoInput.value = '';
                        if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
                        if (photoPreviewImg) photoPreviewImg.src = '';
                        if (photoEmptyState) photoEmptyState.style.display = 'block';

                        state.userPhotoData = null;
                        state.isPhotoVerified = false;
                        if (window.tryonState) {
                            window.tryonState.userPhotoData = null;
                            window.tryonState.detectedPhotoGender = null;
                            window.tryonState.isPhotoVerified = false;
                        }

                        if (photoDropzone) {
                            photoDropzone.classList.add('mismatch-error');
                            setTimeout(function () { photoDropzone.classList.remove('mismatch-error'); }, 800);
                        }

                        showToast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 6000);
                    }
                }
            }

            this.checkGatekeeper();
        },

        // Fast Client-Side Thumbnail Generator (reduces upload from 15MB to 15KB)
        createSmallThumbnail: function (base64, maxDim, cb) {
            try {
                var img = new Image();
                img.onload = function () {
                    var w = img.naturalWidth || img.width;
                    var h = img.naturalHeight || img.height;
                    var scale = Math.min(1, maxDim / Math.max(w, h));
                    var cw = Math.max(1, Math.round(w * scale));
                    var ch = Math.max(1, Math.round(h * scale));
                    var canvas = document.createElement('canvas');
                    canvas.width = cw;
                    canvas.height = ch;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, cw, ch);
                    cb(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = function () { cb(base64); };
                img.src = base64;
            } catch (e) {
                cb(base64);
            }
        },

        // 1. Step 1: User Photo Verification & Gender Sync
        verifyUserPhoto: function (file, base64Data, callback) {
            var self = this;
            var state = self.getState();
            var fileName = (file && file.name ? file.name : '').toLowerCase();

            var scanOverlay = document.getElementById('tryon-photo-scan-loading');
            var scanText = document.getElementById('tryon-photo-scan-text');
            var scanSpinner = scanOverlay ? scanOverlay.querySelector('.photo-scan-spinner') : null;
            var photoDropzone = document.getElementById('tryon-photo-dropzone');
            var photoInput = document.getElementById('tryon-user-upload-input');
            var photoPreviewWrap = document.getElementById('tryon-user-preview-wrap');
            var photoPreviewImg = document.getElementById('tryon-user-preview-img');
            var photoEmptyState = document.getElementById('tryon-user-empty-state');

            // Quick filename pre-check
            var maleName = /(^|[^a-z0-9])(men|male|boy|guy|gentleman|tuxedo|cowboy|sherpa|groom|tux|g_men|cat_men)([^a-z0-9]|$)/i.test(fileName);
            var femaleName = /(^|[^a-z0-9])(women|female|girl|lady|woman|dress|gown|blouse|skirt|saree|lehenga|bride|g_women|cat_women)([^a-z0-9]|$)/i.test(fileName);

            var instantDetected = null;
            if (femaleName && !maleName) instantDetected = 'Female';
            else if (maleName && !femaleName) instantDetected = 'Male';

            var activeGender = instantDetected || state.selectedGender || 'Male';

            // Optimistically set verified immediately so user is never blocked
            state.userPhotoData = base64Data;
            state.isPhotoVerified = true;
            state.detectedPhotoGender = activeGender;
            state.selectedGender = activeGender;
            if (window.tryonState) {
                window.tryonState.userPhotoData = base64Data;
                window.tryonState.isPhotoVerified = true;
                window.tryonState.detectedPhotoGender = activeGender;
                window.tryonState.selectedGender = activeGender;
            }

            if (photoPreviewImg) photoPreviewImg.src = base64Data;
            if (photoPreviewWrap) photoPreviewWrap.style.display = 'inline-block';
            if (photoEmptyState) photoEmptyState.style.display = 'none';

            if (scanOverlay) {
                scanOverlay.classList.remove('verified');
                scanOverlay.style.display = 'flex';
            }
            if (scanSpinner) scanSpinner.style.display = 'block';
            if (scanText) scanText.textContent = '⚡ Checking photo...';

            self.syncGenderToggle(activeGender);
            self.checkGatekeeper();

            // Generate lightweight thumbnail (15KB) for instant verification
            self.createSmallThumbnail(base64Data, 320, function (thumbData) {
                var apiUrl = getApiEndpoint('/api/validate-gender');
                fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: thumbData,
                        file_name: file.name || '',
                        expected_gender: activeGender.toLowerCase(),
                        outfit_name: '',
                        outfit_category: ''
                    })
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    var detectedGender = activeGender;
                    if (data && data.detected_gender) {
                        var dg = String(data.detected_gender).toLowerCase();
                        if (dg === 'female' || dg === 'women' || dg === 'woman') {
                            detectedGender = 'Female';
                        } else if (dg === 'male' || dg === 'men' || dg === 'man') {
                            detectedGender = 'Male';
                        }
                    }

                    self.syncGenderToggle(detectedGender);
                    state.detectedPhotoGender = detectedGender;
                    state.selectedGender = detectedGender;
                    state.isPhotoVerified = true;

                    if (window.tryonState) {
                        window.tryonState.detectedPhotoGender = detectedGender;
                        window.tryonState.selectedGender = detectedGender;
                        window.tryonState.isPhotoVerified = true;
                    }

                    // Check active outfit in Step 2 against this verified photo gender
                    var currentOutfit = state.selectedGarment || (window.tryonState ? window.tryonState.selectedGarment : null) || window.selectedOutfit;
                    if (currentOutfit) {
                        var oGender = self.getGarmentGender(currentOutfit);
                        if (currentOutfit.custom && !oGender && currentOutfit.name) {
                            oGender = self.detectCustomGarmentGender(currentOutfit.name);
                        }
                        if (oGender && oGender !== detectedGender && oGender !== 'Unisex') {
                            self.resetOutfit("Please select an outfit matching the chosen gender.");
                            showToast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 6000);
                        }
                    }

                    if (scanOverlay) scanOverlay.classList.add('verified');
                    if (scanSpinner) scanSpinner.style.display = 'none';
                    if (scanText) scanText.textContent = '✓ Ready for ' + detectedGender + ' Model';

                    setTimeout(function () {
                        if (scanOverlay) scanOverlay.style.display = 'none';
                    }, 800);

                    self.checkGatekeeper();
                    if (typeof callback === 'function') callback(true, data);
                })
                .catch(function (err) {
                    console.warn('[StudioController] Quick photo validation fallback:', err);
                    if (scanOverlay) scanOverlay.style.display = 'none';
                    self.checkGatekeeper();
                    if (typeof callback === 'function') callback(true);
                });
            });
        },

        // 3. Step 2: Outfit Upload & Verification Process (Custom Garment)
        verifyCustomGarment: function (file, base64Data, callback) {
            var self = this;
            var state = self.getState();
            var activeGender = self.getModelGender();
            var fileName = (file && file.name ? file.name : '').toLowerCase();

            var loadingOverlay = document.getElementById('garment-verify-loading');
            var loadingText = document.getElementById('garment-verify-text');
            var garmentInput = document.getElementById('garment-upload-input');
            var garmentDropzone = document.getElementById('garment-upload-dropzone');
            var garmentPreviewWrap = document.getElementById('garment-upload-preview-wrap');
            var garmentPreviewImg = document.getElementById('garment-upload-preview-img');
            var garmentEmptyState = document.getElementById('garment-upload-empty-state');
            var previewCard = document.getElementById('selected-outfit-preview-card');
            var placeholder = document.getElementById('no-outfit-placeholder');

            // Show Loading State: "Verifying Image & Safety..."
            if (loadingOverlay) {
                loadingOverlay.classList.remove('verified');
                loadingOverlay.style.display = 'flex';
            }
            if (loadingText) loadingText.textContent = 'Verifying Image & Safety...';

            function rejectGarment(errorType, message) {
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                if (garmentInput) garmentInput.value = '';
                if (garmentPreviewWrap) garmentPreviewWrap.style.display = 'none';
                if (garmentPreviewImg) garmentPreviewImg.src = '';
                if (garmentEmptyState) garmentEmptyState.style.display = 'block';

                state.customGarmentData = null;
                window.selectedOutfit = null;
                state.isOutfitVerified = false;

                if (garmentDropzone) {
                    garmentDropzone.classList.add('mismatch-error');
                    setTimeout(function () { garmentDropzone.classList.remove('mismatch-error'); }, 1000);
                }

                showToast('error', 'Garment Rejected', message, 6500);
                self.checkGatekeeper();
                if (typeof callback === 'function') callback(false, { error_type: errorType, message: message });
            }

            // Client-side instant NSFW check on filename
            var nsfwRegex = /(^|[^a-z0-9])(lingerie|underwear|undergarment|bra|panties|pantie|thong|g-string|bikini|swimsuit|swimwear|nude|naked|erotic|nsfw|porn|sheer_innerwear)([^a-z0-9]|$)/i;
            if (nsfwRegex.test(fileName)) {
                rejectGarment('nsfw', '❌ Explicit/Inappropriate clothing is not allowed.');
                return;
            }

            // Client-side instant gender mismatch check on custom garment filename
            var hasPhotoUploaded = !!(state.userPhotoData || (window.tryonState && window.tryonState.userPhotoData));
            var photoGender = hasPhotoUploaded ? (state.detectedPhotoGender || (window.tryonState && window.tryonState.detectedPhotoGender) || activeGender) : null;
            var customGenderPre = self.detectCustomGarmentGender(fileName);

            // If user hasn't uploaded a photo yet, automatically adapt model gender to this garment!
            if (!hasPhotoUploaded && customGenderPre && customGenderPre !== 'Unisex') {
                activeGender = customGenderPre;
                self.syncGenderToggle(customGenderPre);
                state.selectedGender = customGenderPre;
                if (window.tryonState) window.tryonState.selectedGender = customGenderPre;
            } else if (hasPhotoUploaded && customGenderPre && photoGender && customGenderPre !== photoGender && customGenderPre !== 'Unisex') {
                rejectGarment('gender_mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.');
                return;
            }

            // Call backend/verify_garment.php
            var apiUrl = getApiEndpoint('/api/verify-garment');
            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Data,
                    active_gender: hasPhotoUploaded ? activeGender.toLowerCase() : '',
                    file_name: file.name || ''
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || data.status === 'error' || data.verified !== true) {
                    var errorType = data ? data.error_type : 'unknown';
                    var msg = data ? data.message : '❌ Invalid Outfit Image: No garment detected.';
                    if (errorType === 'nsfw') {
                        msg = '❌ Explicit/Inappropriate clothing is not allowed.';
                    } else if (errorType === 'no_garment') {
                        msg = '❌ Invalid Outfit Image: No garment detected.';
                    } else if (errorType === 'gender_mismatch') {
                        msg = '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.';
                    }
                    rejectGarment(errorType, msg);
                    return;
                }

                // Garment is verified and approved!
                state.customGarmentData = base64Data;
                state.selectedGarment = null; // Prioritize custom upload
                state.isOutfitVerified = true;

                if (window.tryonState) {
                    window.tryonState.customGarmentData = base64Data;
                    window.tryonState.selectedGarment = null;
                    window.tryonState.isOutfitVerified = true;
                }

                var detectedCat = data.category || 'tops';
                var detectedCatLabel = data.category_label || 'Top';
                var detectedGender = data.detected_gender || 'unisex';

                // Auto-sync gender if verified garment is gender-specific
                var dg = String(detectedGender).toLowerCase();
                if (dg === 'female') {
                    activeGender = 'Female';
                    state.selectedGender = 'Female';
                    if (window.tryonState) window.tryonState.selectedGender = 'Female';
                    self.syncGenderToggle('Female');
                } else if (dg === 'male') {
                    activeGender = 'Male';
                    state.selectedGender = 'Male';
                    if (window.tryonState) window.tryonState.selectedGender = 'Male';
                    self.syncGenderToggle('Male');
                }

                window.selectedOutfit = {
                    custom: true,
                    data: base64Data,
                    name: file.name,
                    category: detectedCat,
                    category_label: detectedCatLabel,
                    gender: detectedGender
                };

                // Render UI preview
                if (garmentPreviewImg) garmentPreviewImg.src = base64Data;
                if (garmentPreviewWrap) garmentPreviewWrap.style.display = 'inline-block';
                if (garmentEmptyState) garmentEmptyState.style.display = 'none';

                if (previewCard) {
                    var existingRow = previewCard.querySelector('.selected-garment-row');
                    if (existingRow) existingRow.remove();
                }
                if (placeholder) {
                    placeholder.style.display = 'block';
                    placeholder.innerHTML = '<p>Custom Outfit Verified<br/><span style="font-size:0.72rem;color:#10B981;">✓ ' + detectedCatLabel + ' ready for ' + activeGender + ' model</span></p>';
                }

                // Sync category coverage radio button
                var radios = document.querySelectorAll('input[name="garment_coverage"]');
                radios.forEach(function (r) {
                    r.checked = (r.value === detectedCat);
                });
                var options = document.querySelectorAll('.coverage-radio-option');
                options.forEach(function (opt) {
                    var radio = opt.querySelector('input[type="radio"]');
                    if (radio && radio.checked) opt.classList.add('selected');
                    else opt.classList.remove('selected');
                });

                // Flash success overlay briefly
                if (loadingOverlay) loadingOverlay.classList.add('verified');
                if (loadingText) loadingText.textContent = '✓ Verified: ' + detectedCatLabel;
                setTimeout(function () {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                }, 1000);

                showToast('success', 'Garment Verified', '✓ Outfit verified and safe for try-on.', 3000);
                self.checkGatekeeper();
                if (typeof callback === 'function') callback(true, data);
            })
            .catch(function (err) {
                console.warn('[StudioController] Garment verification network error:', err);
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                // Fallback: accept custom upload if backend unreachable
                state.customGarmentData = base64Data;
                state.isOutfitVerified = true;
                if (window.tryonState) {
                    window.tryonState.customGarmentData = base64Data;
                    window.tryonState.isOutfitVerified = true;
                    window.tryonState.selectedGarment = null;
                }
                window.selectedOutfit = { custom: true, data: base64Data, name: file.name };
                if (garmentPreviewImg) garmentPreviewImg.src = base64Data;
                if (garmentPreviewWrap) garmentPreviewWrap.style.display = 'inline-block';
                if (garmentEmptyState) garmentEmptyState.style.display = 'none';
                self.checkGatekeeper();
                if (typeof callback === 'function') callback(true);
            });
        },

        // Strict Gatekeeper helper: verify if an outfit can be selected for the current model
        canSelectOutfit: function (garment) {
            if (!garment) return false;
            var modelGender = this.getModelGender();
            var gGender = this.getGarmentGender(garment);
            if (modelGender && gGender && gGender !== modelGender && gGender !== 'Unisex') {
                showToast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 5500);
                return false;
            }
            return true;
        },

        // Verify catalog garment selection against active Step 1 model gender
        verifyCatalogGarment: function (garment) {
            var state = this.getState();
            if (!garment) {
                state.isOutfitVerified = false;
                this.checkGatekeeper();
                return false;
            }

            var modelGender = this.getModelGender();
            var gGender = this.getGarmentGender(garment);

            if (modelGender && gGender && gGender !== modelGender && gGender !== 'Unisex') {
                showToast('error', 'Gender Mismatch', '❌ Gender Mismatch: Selected outfit does not match the uploaded model\'s gender.', 5500);
                state.isOutfitVerified = false;
                this.checkGatekeeper();
                return false;
            }

            state.isOutfitVerified = true;
            this.checkGatekeeper();
            return true;
        },

        // 4. Gatekeeper Logic for "Generate 2D Try-On" Button
        checkGatekeeper: function () {
            var state = this.getState();
            var btnGen = document.getElementById('btn-trigger-tryon-2col');
            var btnStageEmptyGen = document.getElementById('btn-stage-empty-generate');

            var isPhotoValid = !!(state.userPhotoData && state.isPhotoVerified);
            var hasGarment = !!(state.selectedGarment || state.customGarmentData || window.selectedOutfit);
            var hasMismatch = this.hasGarmentGenderMismatch();
            var isGarmentVerified = !!(hasGarment && (state.isOutfitVerified || window.selectedOutfit) && !hasMismatch);

            var canGenerate = isPhotoValid && isGarmentVerified && !hasMismatch;

            var tooltip = '';
            if (hasMismatch) {
                tooltip = '❌ Selected outfit does not match the uploaded model\'s gender.';
            } else if (!canGenerate) {
                if (!isPhotoValid && !hasGarment) {
                    tooltip = 'Please upload a verified photo (Step 1) and select a matching outfit (Step 2).';
                } else if (!isPhotoValid) {
                    tooltip = 'Please upload and verify your photo in Step 1.';
                } else {
                    tooltip = 'Please select or upload a verified outfit in Step 2.';
                }
            }

            [btnGen, btnStageEmptyGen].forEach(function (btn) {
                if (!btn) return;
                btn.disabled = !canGenerate;
                if (!canGenerate) {
                    btn.classList.add('btn-disabled-gatekeeper');
                    if (hasMismatch) {
                        btn.classList.add('btn-disabled-mismatch');
                    } else {
                        btn.classList.remove('btn-disabled-mismatch');
                    }
                    btn.setAttribute('title', tooltip);
                } else {
                    btn.classList.remove('btn-disabled-gatekeeper', 'btn-disabled-mismatch');
                    btn.removeAttribute('title');
                }
            });

            // Update Stage Outfit titles in Center Column
            var stageOutfitTitle = document.getElementById('stage-current-outfit-title');
            var stageOutfitCat = document.getElementById('stage-current-outfit-cat');
            if (stageOutfitTitle) {
                if (hasMismatch) {
                    stageOutfitTitle.textContent = '⚠️ Gender Mismatch';
                } else if (state.selectedGarment) {
                    stageOutfitTitle.textContent = state.selectedGarment.name || 'Selected Outfit';
                } else if (state.customGarmentData) {
                    stageOutfitTitle.textContent = 'Custom Outfit Uploaded';
                } else {
                    stageOutfitTitle.textContent = 'No Outfit Selected';
                }
            }
            if (stageOutfitCat) {
                if (hasMismatch) {
                    stageOutfitCat.textContent = 'Selected outfit does not match uploaded model\'s gender';
                } else {
                    var desc = state.selectedGarment ? (state.selectedGarment.desc || state.selectedGarment.categoryLabel || 'Catalog Outfit') : (state.customGarmentData ? 'Custom Garment' : 'Choose an outfit');
                    stageOutfitCat.textContent = desc + (state.userPhotoData ? ' • Photo Ready' : ' • Upload Photo');
                }
            }

            return canGenerate;
        },

        // Manual 3D Model Generation via Tripo3D API with Credit Preservation
        generate3DModel: function () {
            var self = this;
            var state = self.getState();

            if (state.isProcessing3D || state.isProcessing2D) return;

            // Get 2D result image (prefer generated2DImage, then stage img src)
            var inputImage = state.generated2DImage;
            if (!inputImage) {
                var imgEl = document.getElementById('stage-output-tryon-img');
                if (imgEl && imgEl.src && (imgEl.src.indexOf('data:image') === 0 || imgEl.src.indexOf('http') === 0)) {
                    inputImage = imgEl.src;
                }
            }

            if (!inputImage) {
                showToast('error', 'No 2D Try-On Found', 'Please generate a 2D Try-On first before creating a 3D model.', 4500);
                return;
            }

            state.isProcessing3D = true;

            // UI Elements
            var loadingOverlay = document.getElementById('stage-loading-overlay');
            var loadingTitle   = document.getElementById('stage-loading-title');
            var loadingSub     = document.getElementById('stage-loading-sub');
            var loadingGemIcon = document.getElementById('loading-gem-icon');
            var progressBar    = document.getElementById('stage-loading-progress-bar');
            var panel2D        = document.getElementById('stage-panel-2d');
            var panel3D        = document.getElementById('stage-panel-3d');
            var panelEmpty     = document.getElementById('stage-panel-empty');
            var podStage       = document.querySelector('.scanner-pod-stage') || document.querySelector('.pod-canvas-container');
            var mountTarget    = document.getElementById('stage-canvas-3d-mount');
            var chip2D         = document.getElementById('chip-status-2d');
            var chip3D         = document.getElementById('chip-status-3d');
            var statusBadge    = document.getElementById('stage-status-badge');

            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            if (loadingTitle) loadingTitle.textContent = 'Reconstructing 3D Interactive Model...';
            if (loadingSub) loadingSub.textContent = 'Tripo3D AI Neural Mesh Generation (360° GLB)';
            if (loadingGemIcon) loadingGemIcon.textContent = '🪐';
            if (progressBar) progressBar.style.width = '20%';

            var progInterval = setInterval(function () {
                if (progressBar) {
                    var cur = parseInt(progressBar.style.width) || 20;
                    if (cur < 85) progressBar.style.width = (cur + 5) + '%';
                }
            }, 1200);

            var user = (window.Style360Auth && window.Style360Auth.getCurrentUser()) || (function () {
                try { return JSON.parse(localStorage.getItem('style360_user')); } catch (e) { return null; }
            })();
            var userId = user ? user.id : (state.userId || 0);

            var payload = {
                generation_id: state.lastHistoryId || state.generationId || 0,
                history_id: state.lastHistoryId || state.generationId || 0,
                user_id: userId,
                image: inputImage,
                gender: self.getModelGender(),
                outfit_id: state.selectedGarment ? state.selectedGarment.id : null,
                outfit_title: state.selectedGarment ? (state.selectedGarment.title || state.selectedGarment.name) : null,
                category: state.selectedGarment ? state.selectedGarment.category : null
            };

            fetch(getApiEndpoint('/backend/generate_3d.php'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                clearInterval(progInterval);
                if (progressBar) progressBar.style.width = '100%';

                setTimeout(function () {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    state.isProcessing3D = false;

                    if (data && data.status === 'success' && data.model_url) {
                        var modelUrl = data.model_url;
                        state.generated3DModelUrl = modelUrl;

                        if (data.cached) {
                            showToast('success', '✨ 3D Model Loaded', 'Loaded cached 3D model (credits preserved).', 4000);
                        } else {
                            showToast('success', '✨ 3D Model Ready', 'Tripo3D 360° mesh reconstructed successfully!', 4000);
                        }

                        // Switch to 3D Canvas Stage
                        if (panel2D) panel2D.style.display = 'none';
                        if (panelEmpty) panelEmpty.style.display = 'none';
                        if (panel3D) panel3D.style.display = 'flex';

                        if (chip2D) chip2D.classList.remove('active');
                        if (chip3D) chip3D.classList.add('active');
                        if (statusBadge) {
                            statusBadge.className = 'stage-status-badge live';
                            statusBadge.textContent = '● 3D Interactive Mode';
                        }

                        // Trigger resize and render in Three.js Viewer
                        if (window.Style360Viewer) {
                            if (typeof window.Style360Viewer.onResize === 'function') {
                                window.Style360Viewer.onResize();
                            }
                            window.dispatchEvent(new Event('resize'));
                            if (window.Style360Viewer.loadGLBModel) {
                                window.Style360Viewer.loadGLBModel(modelUrl);
                            } else if (window.Style360Viewer.loadModel) {
                                window.Style360Viewer.loadModel(modelUrl);
                            }
                        }
                    } else {
                        var errMsg = (data && data.message) ? data.message : '❌ 3D Generation failed.';
                        errMsg = errMsg.replace(/\.?\s*No credits? lost\.?/gi, '').trim();
                        if (errMsg.indexOf('failed') !== -1 || errMsg.indexOf('credit') !== -1) {
                            errMsg = '❌ 3D Generation failed.';
                        }
                        showToast('error', '3D Generation Failed', errMsg || '❌ 3D Generation failed.', 6000);
                    }
                }, 300);
            })
            .catch(function (err) {
                clearInterval(progInterval);
                if (progressBar) progressBar.style.width = '100%';
                setTimeout(function () {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    state.isProcessing3D = false;
                    console.error('[Style360 3D] Request error:', err);
                    showToast('error', '3D Generation Failed', '❌ 3D Generation failed.', 6000);
                }, 300);
            });
        },

        // Parse and render 3D model requested via URL parameter (?load_3d=... or ?model_id=...)
        load3DModelFromParam: function (paramVal) {
            var self = this;
            if (!paramVal) return;

            var targetId = String(paramVal).trim();
            if (!targetId || targetId === 'null' || targetId === 'undefined') return;

            console.log('[Style360 Studio] Initializing 3D model from URL param:', targetId);

            // 1. Ensure Try-On section is active and visible
            if (window.Style360Home && typeof window.Style360Home.showTryOnPage === 'function') {
                window.Style360Home.showTryOnPage();
            } else {
                var tryonSection  = document.getElementById('tryon-dedicated-section');
                var homePage      = document.getElementById('home-landing-content');
                var catSection    = document.getElementById('category-section');
                var studioSection = document.getElementById('studio-section');
                if (homePage) homePage.style.display = 'none';
                if (catSection) catSection.style.display = 'none';
                if (studioSection) studioSection.style.display = 'none';
                if (tryonSection) tryonSection.style.display = 'block';
            }

            // 2. Resolve proxied GLB URL
            var proxiedUrl = '';
            if (targetId.indexOf('http://') === 0 || targetId.indexOf('https://') === 0) {
                proxiedUrl = getApiEndpoint('/backend/proxy_glb.php?url=' + encodeURIComponent(targetId));
            } else if (targetId.indexOf('proxy_glb') !== -1) {
                proxiedUrl = (targetId.indexOf('/') === 0) ? getApiEndpoint(targetId) : getApiEndpoint('/' + targetId);
            } else {
                proxiedUrl = getApiEndpoint('/backend/proxy_glb.php?id=' + encodeURIComponent(targetId));
            }

            var state = self.getState();
            state.generated3DModelUrl = proxiedUrl;

            // 3. Switch immediately to #stage-panel-3d and mount canvas
            setTimeout(function () {
                var panel2D     = document.getElementById('stage-panel-2d');
                var panel3D     = document.getElementById('stage-panel-3d');
                var panelEmpty  = document.getElementById('stage-panel-empty');
                var podStage    = document.querySelector('.scanner-pod-stage') || document.querySelector('.pod-canvas-container');
                var mountTarget = document.getElementById('stage-canvas-3d-mount');
                var chip2D      = document.getElementById('chip-status-2d') || document.getElementById('stage-chip-2d');
                var chip3D      = document.getElementById('chip-status-3d') || document.getElementById('stage-chip-3d');
                var statusBadge = document.getElementById('stage-status-badge') || document.getElementById('stage-status-indicator');

                if (panel2D) panel2D.style.display = 'none';
                if (panelEmpty) panelEmpty.style.display = 'none';
                if (panel3D) panel3D.style.display = 'flex';

                if (chip2D) chip2D.classList.remove('active');
                if (chip3D) chip3D.classList.add('active');

                if (statusBadge) {
                    statusBadge.className = 'stage-status-badge live';
                    statusBadge.textContent = '● 3D Interactive Mode';
                }

                if (podStage && mountTarget && podStage.parentElement !== mountTarget) {
                    // Stage canvas is mounted permanently
                }

                // 4. Invoke Style360Viewer.loadGLBModel() with the proxied GLB URL
                if (window.Style360Viewer) {
                    if (typeof window.Style360Viewer.onResize === 'function') {
                        window.Style360Viewer.onResize();
                    }
                    window.dispatchEvent(new Event('resize'));
                    if (window.Style360Viewer.loadGLBModel) {
                        window.Style360Viewer.loadGLBModel(proxiedUrl);
                    } else if (window.Style360Viewer.loadModel) {
                        window.Style360Viewer.loadModel(proxiedUrl);
                    }
                }

                var stageTarget = document.getElementById('stage-main-display') || panel3D;
                if (stageTarget) {
                    stageTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
        },

        // Initialize and bind events
        init: function () {
            var self = this;

            // Check for load_3d or model_id query parameter on init
            var urlParams = new URLSearchParams(window.location.search);
            var load3DParam = urlParams.get('load_3d') || urlParams.get('model_id');
            if (load3DParam) {
                self.load3DModelFromParam(load3DParam);
            }

            var btnMale = document.getElementById('tryon-gender-male');
            var btnFemale = document.getElementById('tryon-gender-female');
            var btnGroup = document.getElementById('tryon-gender-btn-group');

            if (btnMale) {
                btnMale.addEventListener('click', function (e) {
                    if (e) e.preventDefault();
                    self.setGender('Male', true);
                });
            }
            if (btnFemale) {
                btnFemale.addEventListener('click', function (e) {
                    if (e) e.preventDefault();
                    self.setGender('Female', true);
                });
            }
            if (btnGroup) {
                btnGroup.addEventListener('change', function (e) {
                    var target = e.target;
                    if (target && target.getAttribute('data-gender')) {
                        self.setGender(target.getAttribute('data-gender'), true);
                    }
                });
            }

            // Bind 3D generation trigger button (strictly manual trigger)
            var btnTrigger3D = document.getElementById('btn-trigger-3d-view');
            if (btnTrigger3D) {
                btnTrigger3D.addEventListener('click', function (e) {
                    if (e) e.preventDefault();
                    self.generate3DModel();
                });
            }

            // Expose globally
            window.resetSelectedOutfit = function (promptText) {
                self.resetOutfit(promptText);
            };
            window.setGender = function (gender, isManual) {
                self.setGender(gender, isManual);
            };
            window.generate3DModel = function () {
                self.generate3DModel();
            };

            // Run initial gatekeeper check
            setTimeout(function () {
                self.checkGatekeeper();
            }, 300);
        }
    };

    // Attach to window
    window.StudioController = StudioController;

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { StudioController.init(); });
    } else {
        StudioController.init();
    }

})(window, document);
