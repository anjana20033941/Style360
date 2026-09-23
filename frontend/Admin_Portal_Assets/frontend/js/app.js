/**
 * Style360 — Main Application Logic
 * IIFE pattern, no ES modules. Uses fetch() and standard DOM APIs.
 */
(function () {
    "use strict";

    var API_BASE = "/style360/backend";

    /* ================================================================== */
    /*  State                                                              */
    /* ================================================================== */
    var personImageDataURL = null;
    var garmentImageDataURL = null;
    var tryonResultDataURL = null;
    var cameraStream = null;

    var mvViews = {
        front: null,
        right: null,
        back: null,
        left: null
    };

    /* ================================================================== */
    /*  DOM Ready                                                          */
    /* ================================================================== */
    document.addEventListener("DOMContentLoaded", function () {
        /* Init 3D viewer */
        if (window.Style360Viewer) {
            window.Style360Viewer.init();
        }

        bindNavigation();
        bindPersonUpload();
        bindMultiviewUpload();
        bindGenerate3DMultiview();
        bindPreviewBG();
        bindCameraCapture();
        bindGarmentUpload();
        bindGenerate3DAvatar();
        bindGenerate();
        bindResetView();
        bindGeminiChat();
    });

    /* ================================================================== */
    /*  Navigation                                                         */
    /* ================================================================== */
    function bindNavigation() {
        // Navigation between home page and studio is handled by home.js.
        // This function is kept as a no-op to avoid errors on older entry points.
    }

    /* ================================================================== */
    /*  Person Upload                                                      */
    /* ================================================================== */
    function bindPersonUpload() {
        var input = document.getElementById("person-upload");
        var preview = document.getElementById("person-preview");

        if (!input) return;

        input.addEventListener("change", function () {
            var file = input.files[0];
            if (!file) return;
            readFileAsDataURL(file, function (dataURL) {
                personImageDataURL = dataURL;
                if (preview) {
                    preview.src = dataURL;
                    preview.style.display = "block";
                }
                var btn3d = document.getElementById("btn-generate-3d");
                if (btn3d) {
                    btn3d.style.display = "block";
                    btn3d.disabled = false;
                }
            });
        });
    }

    /* ================================================================== */
    /*  Camera Capture                                                     */
    /* ================================================================== */
    function bindCameraCapture() {
        var btnCamera = document.getElementById("btn-camera");
        var btnCapture = document.getElementById("btn-capture");
        var btnCancelCam = document.getElementById("btn-cancel-camera");
        var cameraModal = document.getElementById("camera-modal");
        var video = document.getElementById("camera-video");
        var captureCanvas = document.getElementById("camera-canvas");
        var preview = document.getElementById("person-preview");

        if (!btnCamera) return;

        btnCamera.addEventListener("click", function () {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Camera not supported in this browser.");
                return;
            }
            navigator.mediaDevices
                .getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })
                .then(function (stream) {
                    cameraStream = stream;
                    video.srcObject = stream;
                    video.play();
                    if (cameraModal) cameraModal.style.display = "flex";
                })
                .catch(function (err) {
                    console.error("[Style360] Camera error:", err);
                    alert("Could not access camera: " + err.message);
                });
        });

        if (btnCapture) {
            btnCapture.addEventListener("click", function () {
                if (!video || !captureCanvas) return;
                captureCanvas.width = video.videoWidth || 640;
                captureCanvas.height = video.videoHeight || 480;
                var ctx = captureCanvas.getContext("2d");
                ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
                personImageDataURL = captureCanvas.toDataURL("image/jpeg", 0.9);
                if (preview) {
                    preview.src = personImageDataURL;
                    preview.style.display = "block";
                }
                var btn3d = document.getElementById("btn-generate-3d");
                if (btn3d) {
                    btn3d.style.display = "block";
                    btn3d.disabled = false;
                }
                stopCamera();
            });
        }

        if (btnCancelCam) {
            btnCancelCam.addEventListener("click", function () {
                stopCamera();
            });
        }

        function stopCamera() {
            if (cameraStream) {
                cameraStream.getTracks().forEach(function (t) { t.stop(); });
                cameraStream = null;
            }
            if (video) video.srcObject = null;
            if (cameraModal) cameraModal.style.display = "none";
        }
    }

    /* ================================================================== */
    /*  4-View Photo Upload & Direct 3D Reconstruction                     */
    /* ================================================================== */
    function bindMultiviewUpload() {
        var views = ["front", "right", "back", "left"];
        views.forEach(function (v) {
            var input = document.getElementById("mv-upload-" + v);
            var preview = document.getElementById("mv-preview-" + v);
            var badge = document.getElementById("mv-badge-" + v);
            var ph = document.getElementById("mv-ph-" + v);

            if (!input) return;

            input.addEventListener("change", function () {
                var file = input.files[0];
                if (!file) return;
                readFileAsDataURL(file, function (dataURL) {
                    mvViews[v] = dataURL;
                    if (v === "front") personImageDataURL = dataURL;
                    if (preview) {
                        preview.src = dataURL;
                        preview.style.display = "block";
                    }
                    if (ph) ph.style.display = "none";
                    if (badge) badge.style.display = "flex";
                    updateMultiviewStatus();
                });
            });
        });
    }

    function updateMultiviewStatus() {
        var views = ["front", "right", "back", "left"];
        var count = 0;
        views.forEach(function (v) {
            if (mvViews[v]) count++;
        });

        var statusBar  = document.getElementById("mv-status-bar");
        var btnMv      = document.getElementById("btn-generate-3d-mv");
        var btnPreview = document.getElementById("btn-preview-bg");

        if (statusBar) {
            statusBar.textContent = count + " / 4 views uploaded";
            if (count === 4) statusBar.style.color = "var(--accent-green)";
            else statusBar.style.color = "var(--text-secondary)";
        }

        if (btnMv)      btnMv.disabled      = (count < 4);
        if (btnPreview) btnPreview.disabled = (count < 4);
    }

    function bindGenerate3DMultiview() {
        var btn = document.getElementById("btn-generate-3d-mv");
        if (!btn) return;

        btn.addEventListener("click", function () {
            if (!mvViews.front || !mvViews.right || !mvViews.back || !mvViews.left) {
                showStatus("Please upload all 4 view photos (Front, Right, Back, Left).", "error");
                return;
            }

            btn.disabled = true;
            showLoading(true);
            showProgress(true);
            updateStep(1, "active");
            updateLoadingText("Building 3D avatar from 4 real views...");

            var savedUser = null;
            try { savedUser = JSON.parse(localStorage.getItem('style360_user')); } catch(e) {}
            var userId = (savedUser && savedUser.id) ? savedUser.id : 1;

            var inputGender = document.getElementById("selected-avatar-gender");
            var selectedGender = (inputGender && inputGender.value) ? inputGender.value : ((savedUser && savedUser.gender) ? savedUser.gender : 'Male');

            fetchJSON(API_BASE + "/reconstruct3d_multiview.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    front: mvViews.front,
                    right: mvViews.right,
                    back:  mvViews.back,
                    left:  mvViews.left,
                    user_id: userId,
                    gender: selectedGender
                })
            }).then(function (recon3dData) {
                if (recon3dData.status === 'success' && recon3dData.model_url) {
                    if (window.Style360Viewer) {
                        window.Style360Viewer.loadGLBModel(recon3dData.model_url);
                    }
                    updateStep(1, "done");
                    showStatus("3D avatar generated from 4 views successfully!", "success");

                    // Reveal Step 2 Container
                    var step2 = document.getElementById("step-2-container");
                    if (step2) step2.style.display = "block";
                } else {
                    updateStep(1, "error");
                    var errMsg = recon3dData.message ? recon3dData.message : "4-view 3D generation failed.";
                    showStatus(errMsg, "error");
                }
            }).catch(function (err) {
                updateStep(1, "error");
                console.error(err);
                showStatus("4-view 3D generation failed: " + err.message, "error");
            }).finally(function () {
                showLoading(false);
                btn.disabled = false;
            });
        });
    }

    /* ================================================================== */
    /*  Preview BG Removal (debug endpoint)                               */
    /* ================================================================== */
    function bindPreviewBG() {
        var btn   = document.getElementById("btn-preview-bg");
        var strip = document.getElementById("bg-preview-strip");
        var logs  = document.getElementById("bg-preview-logs");
        if (!btn) return;

        btn.addEventListener("click", function () {
            if (!mvViews.front || !mvViews.right || !mvViews.back || !mvViews.left) {
                showStatus("Upload all 4 views first.", "error");
                return;
            }

            btn.disabled    = true;
            btn.textContent = "\u23f3 Running BG removal...";
            if (strip) strip.style.display = "none";

            fetchJSON(API_BASE + "/debug_preview.php", {
                method : "POST",
                headers: { "Content-Type": "application/json" },
                body   : JSON.stringify({
                    front: mvViews.front,
                    right: mvViews.right,
                    back : mvViews.back,
                    left : mvViews.left
                })
            }).then(function (data) {
                if (data.status === "success" && data.previews) {
                    ["front","right","back","left"].forEach(function (v) {
                        var el = document.getElementById("prev-" + v);
                        if (el && data.previews[v]) {
                            el.src = data.previews[v];
                            el.style.display = "block";
                        }
                    });
                    if (strip) strip.style.display = "block";
                    if (logs && data.logs) {
                        logs.innerHTML = data.logs.map(function(l) {
                            var ok   = l.indexOf("SUCCESS") !== -1;
                            var warn = l.indexOf("WARNING") !== -1 || l.indexOf("FAILED") !== -1;
                            var col  = ok ? "#4ade80" : warn ? "#f59e0b" : "#7a82a8";
                            return '<span style="color:' + col + '">' + l + '</span>';
                        }).join("<br>");
                    }
                    showStatus("BG removal preview ready \u2014 verify images look clean, then Generate.", "success");
                } else {
                    showStatus("Preview failed: " + (data.message || "unknown error"), "error");
                }
            }).catch(function (err) {
                showStatus("Preview request failed: " + err.message, "error");
            }).finally(function () {
                btn.disabled    = false;
                btn.textContent = "\uD83D\uDD0D Preview BG Removal";
            });
        });
    }

    /* ================================================================== */
    /*  Garment Upload                                                     */
    /* ================================================================== */
    function bindGarmentUpload() {
        var input = document.getElementById("garment-upload");
        var preview = document.getElementById("garment-preview");

        if (!input) return;

        input.addEventListener("change", function () {
            var file = input.files[0];
            if (!file) return;
            readFileAsDataURL(file, function (dataURL) {
                garmentImageDataURL = dataURL;
                if (preview) {
                    preview.src = dataURL;
                    preview.style.display = "block";
                }
            });
        });
    }

    /* ================================================================== */
    /*  Generate Try-On (Step-by-Step Pipeline)                             */
    /* ================================================================== */
    function bindGenerate() {
        var btn = document.getElementById("btn-generate");
        if (!btn) return;

        btn.addEventListener("click", function () {
            runPipeline();
        });
    }

    function bindGenerate3DAvatar() {
        var btn = document.getElementById("btn-generate-3d");
        if (!btn) return;

        btn.addEventListener("click", function () {
            if (!personImageDataURL) {
                showStatus("Please upload or capture your photo first.", "error");
                return;
            }

            btn.disabled = true;
            showLoading(true);
            showProgress(true);
            updateStep(1, "active");
            updateLoadingText("Step 1/1: Building 3D avatar...");

            var savedUser = null;
            try { savedUser = JSON.parse(localStorage.getItem('style360_user')); } catch(e) {}
            var userId = (savedUser && savedUser.id) ? savedUser.id : 1;

            var inputGender = document.getElementById("selected-avatar-gender");
            var selectedGender = (inputGender && inputGender.value) ? inputGender.value : ((savedUser && savedUser.gender) ? savedUser.gender : 'Male');

            fetchJSON(API_BASE + "/reconstruct3d.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: personImageDataURL,
                    user_id: userId,
                    gender: selectedGender
                })
            }).then(function (recon3dData) {
                console.log("%c[Style360 App] reconstruct3d.php raw response:", "color: #ff9900; font-weight: bold;", recon3dData);
                console.log("[Style360 App] status:", recon3dData.status, "| model_url:", recon3dData.model_url, "| source:", recon3dData.source);

                if (recon3dData.status === 'success' && recon3dData.model_url) {
                    console.log("%c[Style360 App] ✅ Calling loadAvatarModel with URL: " + recon3dData.model_url, "color: #00ff88; font-weight: bold;");
                    if (window.Style360Viewer) {
                        if (window.Style360Viewer.loadAvatarModel) {
                            window.Style360Viewer.loadAvatarModel(recon3dData.model_url);
                        } else {
                            window.Style360Viewer.loadGLBModel(recon3dData.model_url);
                        }
                    }
                    if (window.Style360Firebase) {
                        window.Style360Firebase.saveAvatarToFirestore("default", recon3dData.model_url);
                    }
                    updateStep(1, "done");
                    showStatus("✨ 3D avatar generated successfully! Loading model into 3D viewport...", "success");

                    // Reveal Step 2 Container (Garment Selection & Try-On options)
                    var step2Container = document.getElementById("step-2-container");
                    if (step2Container) step2Container.style.display = "block";
                } else {
                    updateStep(1, "error");
                    var errMsg = recon3dData.message ? recon3dData.message : "3D avatar generation failed.";
                    console.error("[Style360 App] ❌ Backend error:", errMsg);
                    showStatus(errMsg, "error");
                }
            }).catch(function (err) {
                updateStep(1, "error");
                console.error("[Style360 App] ❌ Fetch error:", err);
                showStatus("3D avatar generation failed.", "error");
            }).finally(function () {
                showLoading(false);
                btn.disabled = false;
            });

        });
    }

    function runPipeline() {
        var garmentURL = (document.getElementById("garment-url") || {}).value || "";
        garmentURL = garmentURL.trim();

        /* Validate inputs */
        if (!personImageDataURL) {
            showStatus("Please upload or capture your photo first.", "error");
            return;
        }
        if (!garmentImageDataURL && !garmentURL) {
            showStatus("Please upload a garment image or paste a product URL.", "error");
            return;
        }

        var btn = document.getElementById("btn-generate");
        if (btn) btn.disabled = true;
        showLoading(true);
        tryonResultDataURL = null;

        var step1Promise = Promise.resolve();

        step1Promise
            .then(function () {
                /* ---- Step 2: URL Scraping (conditional) ---- */
                if (garmentURL && !garmentImageDataURL) {
                    updateStep(2, "active");
                    updateLoadingText("Step 2/4: Fetching product image from URL...");
                    return fetchJSON(API_BASE + "/scrape.php", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: garmentURL })
                    }).then(function (data) {
                        if (data.success && data.image) {
                            garmentImageDataURL = data.image;
                            var preview = document.getElementById("garment-preview");
                            if (preview) {
                                preview.src = garmentImageDataURL;
                                preview.style.display = "block";
                            }
                            updateStep(2, "done");
                        } else {
                            updateStep(2, "error");
                            throw new Error(data.error || "Could not scrape product image from URL.");
                        }
                    });
                } else {
                    updateStep(2, "done");
                    return Promise.resolve();
                }
            })
            .then(function () {
                /* ---- Step 3: Gemini Vision Analysis ---- */
                updateStep(3, "active");
                updateLoadingText("Step 3/4: Analyzing images with Gemini AI...");

                return fetchJSON(API_BASE + "/gemini_vision.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        person_image: personImageDataURL,
                        garment_image: garmentImageDataURL
                    })
                });
            })
            .then(function (analysisData) {
                /* Show analysis */
                showAnalysis(analysisData);

                if (analysisData.quality_ok === false) {
                    updateStep(3, "error");
                    showStatus("Image quality issue: " + (analysisData.warning || "Please use clearer images."), "warning");
                    throw new Error("__QUALITY_STOP__");
                }
                updateStep(3, "done");

                /* ---- Step 4: Virtual Try-On ---- */
                updateStep(4, "active");
                updateLoadingText("Step 4/4: Generating virtual try-on with AI...");

                return fetchJSON(API_BASE + "/tryon.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        person_image: personImageDataURL,
                        garment_image: garmentImageDataURL
                    })
                });
            })
            .then(function (tryonData) {
                if (tryonData.status === 'success' && tryonData.result_image) {
                    tryonResultDataURL = tryonData.result_image;
                    if (window.Style360Viewer) {
                        window.Style360Viewer.showResultImage(tryonResultDataURL);
                    }
                    updateStep(4, "done");
                    showStatus("Virtual try-on completed successfully!", "success");
                    updateTopStepper(3);
                    updatePodStatus("Almost Done", 3);
                } else {
                    updateStep(4, "error");
                    showStatus("Try-on generation had issues.", "warning");
                    throw new Error("__TRYON_FAIL__");
                }
            })
            .catch(function (err) {
                if (err.message === "__QUALITY_STOP__") {
                    /* Already handled */
                } else if (err.message === "__TRYON_FAIL__") {
                    showStatus("Try-on generation failed. Please try different images.", "error");
                } else {
                    console.error("[Style360] Pipeline error:", err);
                    showStatus(err.message, "error");
                }
            })
            .finally(function () {
                showLoading(false);
                var btn = document.getElementById("btn-generate");
                if (btn) btn.disabled = false;
            });
    }

    /* ================================================================== */
    /*  Reset View                                                         */
    /* ================================================================== */
    function bindResetView() {
        var btnReset = document.getElementById("btn-reset-view");
        if (btnReset) {
            btnReset.addEventListener("click", function () {
                if (window.Style360Viewer && window.Style360Viewer.resetView) {
                    window.Style360Viewer.resetView();
                }
            });
        }

        var btnUpright = document.getElementById("btn-rotate-upright");
        if (btnUpright) {
            btnUpright.addEventListener("click", function () {
                if (window.Style360Viewer && window.Style360Viewer.rotateUpright) {
                    window.Style360Viewer.rotateUpright();
                }
            });
        }

        var btnFace = document.getElementById("btn-rotate-face");
        if (btnFace) {
            btnFace.addEventListener("click", function () {
                if (window.Style360Viewer && window.Style360Viewer.rotateYaw) {
                    window.Style360Viewer.rotateYaw();
                }
            });
        }
    }

    /* ================================================================== */
    /*  Gemini Chat                                                        */
    /* ================================================================== */
    function bindGeminiChat() {
        var input = document.getElementById("gemini-input");
        var btn = document.getElementById("btn-gemini-send");
        var chatBox = document.getElementById("gemini-chat-box");

        if (!btn || !input || !chatBox) return;

        function sendMessage() {
            var msg = input.value.trim();
            if (!msg) return;

            appendChatMessage("You", msg, "user");
            input.value = "";

            var payload = { message: msg };
            /* Attach context if available */
            if (personImageDataURL) {
                payload.person_image = personImageDataURL;
            }
            if (garmentImageDataURL) {
                payload.garment_image = garmentImageDataURL;
            }

            fetch(API_BASE + "/gemini.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    var reply = data.reply || data.response || data.error || "No response.";
                    appendChatMessage("Style360 AI", reply, "ai");
                })
                .catch(function (err) {
                    appendChatMessage("Style360 AI", "Error: " + err.message, "ai error");
                });
        }

        btn.addEventListener("click", sendMessage);
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    function appendChatMessage(sender, text, cssClass) {
        var chatBox = document.getElementById("gemini-chat-box");
        if (!chatBox) return;
        var div = document.createElement("div");
        div.className = "chat-msg " + (cssClass || "");
        div.innerHTML = "<strong>" + escapeHTML(sender) + ":</strong> " + escapeHTML(text);
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    /* ================================================================== */
    /*  UI Helpers                                                         */
    /* ================================================================== */
    function showLoading(visible) {
        var overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.style.display = visible ? "flex" : "none";
    }

    function updateLoadingText(text) {
        var el = document.getElementById("loading-text");
        if (el) el.textContent = text;
    }

    function showStatus(msg, type) {
        var el = document.getElementById("status-message");
        if (!el) return;
        el.textContent = msg;
        el.className = "status-message " + (type || "");
        el.style.display = "block";
        if (type === "success" || type === "warning") {
            setTimeout(function () { el.style.display = "none"; }, 8000);
        }
    }

    function showProgress(visible) {
        var el = document.getElementById("pipeline-progress");
        if (el) el.style.display = visible ? "block" : "none";
        if (visible) {
            /* Reset all steps */
            for (var i = 1; i <= 4; i++) {
                updateStep(i, "pending");
            }
        }
    }

    function updateStep(stepNum, state) {
        var el = document.getElementById("step-" + stepNum);
        if (!el) return;
        el.className = "pipeline-step " + state;
        var icon = el.querySelector(".step-icon");
        if (icon) {
            if (state === "active") icon.textContent = "⏳";
            else if (state === "done") icon.textContent = "✅";
            else if (state === "error") icon.textContent = "❌";
            else icon.textContent = "⬜";
        }
    }

    function showAnalysis(data) {
        var el = document.getElementById("analysis-results");
        if (!el) return;
        var html = "";
        if (data.skin_tone) html += "<div><strong>Skin Tone:</strong> " + escapeHTML(data.skin_tone) + "</div>";
        if (data.body_shape) html += "<div><strong>Body Shape:</strong> " + escapeHTML(data.body_shape) + "</div>";
        if (data.garment_type) html += "<div><strong>Garment Type:</strong> " + escapeHTML(data.garment_type) + "</div>";
        if (data.recommendation) html += "<div class='ai-tip'><strong>AI Tip:</strong> " + escapeHTML(data.recommendation) + "</div>";
        el.innerHTML = html;
        el.style.display = html ? "block" : "none";
    }

    /* ================================================================== */
    /*  Utility Functions                                                   */
    /* ================================================================== */
    function readFileAsDataURL(file, callback) {
        var reader = new FileReader();
        reader.onload = function (e) {
            callback(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    function dataURLtoBlob(dataURL) {
        var parts = dataURL.split(",");
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var n = bstr.length;
        var u8 = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
            u8[i] = bstr.charCodeAt(i);
        }
        return new Blob([u8], { type: mime });
    }

    function fetchJSON(url, options) {
        return fetch(url, options).then(function (res) {
            if (!res.ok) {
                throw new Error("HTTP " + res.status + ": " + res.statusText);
            }
            return res.json();
        });
    }

    function bindGarmentCatalog() {
        var catCards = document.querySelectorAll(".cat-card, .product-card");
        catCards.forEach(function(card) {
            card.addEventListener("click", function(e) {
                var glbUrl = card.getAttribute("data-glb-url");
                if (glbUrl && window.Style360Viewer && window.Style360Viewer.tryOnGarment) {
                    window.Style360Viewer.tryOnGarment(glbUrl);
                    showStatus("Overlaying selected garment on 3D avatar...", "info");
                }
            });
        });
    }

    function escapeHTML(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function updateTopStepper(currentStep) {
        var s1 = document.getElementById("stepper-step-1");
        var s2 = document.getElementById("stepper-step-2");
        var s3 = document.getElementById("stepper-step-3");
        var l1 = document.getElementById("stepper-line-1");
        var l2 = document.getElementById("stepper-line-2");

        if (s1) s1.className = "step-item" + (currentStep >= 1 ? " active" : "");
        if (s2) s2.className = "step-item" + (currentStep >= 2 ? " active" : "");
        if (s3) s3.className = "step-item" + (currentStep >= 3 ? " active" : "");
        if (l1) l1.className = "step-line" + (currentStep >= 2 ? " active" : "");
        if (l2) l2.className = "step-line" + (currentStep >= 3 ? " active" : "");
    }

    function updatePodStatus(statusText, step) {
        var title = document.getElementById("pod-status-title");
        if (title) title.textContent = statusText;

        var c1 = document.getElementById("chk-scanning");
        var c2 = document.getElementById("chk-processing");
        var c3 = document.getElementById("chk-done");

        if (c1) c1.className = "check-item" + (step >= 1 ? " active" : "");
        if (c2) c2.className = "check-item" + (step >= 2 ? " active" : "");
        if (c3) c3.className = "check-item" + (step >= 3 ? " active" : "");
    }

    function bindGenderSelection() {
        var btnMale = document.getElementById("btn-gender-male");
        var btnFemale = document.getElementById("btn-gender-female");
        var inputGender = document.getElementById("selected-avatar-gender");

        function selectGender(g) {
            if (inputGender) inputGender.value = g;

            if (g === "Male") {
                if (btnMale) {
                    btnMale.classList.add("active");
                    btnMale.style.border = "1.5px solid #7c3aed";
                    btnMale.style.background = "#f3e8ff";
                    btnMale.style.color = "#6b21a8";
                    btnMale.style.fontWeight = "600";
                }
                if (btnFemale) {
                    btnFemale.classList.remove("active");
                    btnFemale.style.border = "1.5px solid #e2e8f0";
                    btnFemale.style.background = "#ffffff";
                    btnFemale.style.color = "#475569";
                    btnFemale.style.fontWeight = "500";
                }
            } else {
                if (btnFemale) {
                    btnFemale.classList.add("active");
                    btnFemale.style.border = "1.5px solid #ec4899";
                    btnFemale.style.background = "#fce7f3";
                    btnFemale.style.color = "#be185d";
                    btnFemale.style.fontWeight = "600";
                }
                if (btnMale) {
                    btnMale.classList.remove("active");
                    btnMale.style.border = "1.5px solid #e2e8f0";
                    btnMale.style.background = "#ffffff";
                    btnMale.style.color = "#475569";
                    btnMale.style.fontWeight = "500";
                }
            }
        }

        if (btnMale) btnMale.addEventListener("click", function () { selectGender("Male"); });
        if (btnFemale) btnFemale.addEventListener("click", function () { selectGender("Female"); });
    }

    // Auto-bind catalog items & gender selection on DOM load
    document.addEventListener("DOMContentLoaded", function() {
        bindGarmentCatalog();
        bindGenderSelection();
    });
})();
