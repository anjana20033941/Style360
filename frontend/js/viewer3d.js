/**
 * Style360 Ã¢â‚¬â€ 3D Viewer (Three.js r128, global namespace)
 * Exposes window.Style360Viewer
 */
(function () {
    "use strict";

    var renderer, scene, camera, controls;
    var mannequinGroup = null;
    var loadedModel = null;
    var resultPlane = null;
    var animationId = null;
    var _lastLoadedUrl = null; // tracks the last URL passed to any GLB loader

    /* ------------------------------------------------------------------ */
    /*  init()                                                             */
    /* ------------------------------------------------------------------ */
    function init() {
        var canvas = document.getElementById("viewer-canvas");
        if (!canvas) {
            console.error("[Style360Viewer] #viewer-canvas not found");
            return;
        }

        var parent = canvas.parentElement;
        var w = parent ? parent.clientWidth : 0;
        var h = parent ? parent.clientHeight : 0;
        if (w <= 10 || h <= 10) {
            var vArea = document.querySelector(".stage-viewport-area") || document.querySelector(".stage-view-card");
            if (vArea && vArea.clientWidth > 10 && vArea.clientHeight > 10) {
                w = vArea.clientWidth;
                h = vArea.clientHeight;
            } else {
                w = 640;
                h = 540;
            }
        }

        /* Renderer with Sharp High-DPI Resolution, High-Performance WebGL & Soft Shadows */
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.88;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        /* Scene: Balanced studio light background & subtle infinite fog effect */
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xe6e8ee);
        scene.fog = new THREE.Fog(0xe6e8ee, 10, 32);

        /* Realistic Ground Plane receiving shadows */
        var groundGeo = new THREE.PlaneGeometry(100, 100);
        var groundMat = new THREE.MeshStandardMaterial({
            color: 0xe6e8ee,
            roughness: 0.95,
            metalness: 0.02
        });
        var groundPlane = new THREE.Mesh(groundGeo, groundMat);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = 0;
        groundPlane.receiveShadow = true;
        scene.add(groundPlane);

        /* Camera */
        var aspect = (w > 0 && h > 0) ? (w / h) : (640 / 540);
        camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        camera.position.set(0, 1.0, 2.7);

        /* Controls: Locked strictly to horizontal rotation around Y-axis */
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.0, 0);
        controls.minDistance = 0.8;
        controls.maxDistance = 6.0;
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.enablePan = false;
        controls.minPolarAngle = Math.PI / 2;
        controls.maxPolarAngle = Math.PI / 2;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.update();

        /* ─── Balanced High-End Studio Lighting Rig ─── */
        // 1. Soft Studio Ambient / Hemisphere Light (prevents blowout, provides soft depth)
        var ambient = new THREE.HemisphereLight(0xffffff, 0x475569, 0.42);
        scene.add(ambient);

        // 2. Primary Directional Key Light with realistic soft shadows
        var keyLight = new THREE.DirectionalLight(0xffffff, 0.82);
        keyLight.position.set(2.0, 4.2, 2.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 15;
        keyLight.shadow.camera.left = -2.5;
        keyLight.shadow.camera.right = 2.5;
        keyLight.shadow.camera.top = 3.5;
        keyLight.shadow.camera.bottom = -1.0;
        keyLight.shadow.bias = -0.0004;
        scene.add(keyLight);

        // 3. Soft Studio Fill Light
        var fillLight = new THREE.DirectionalLight(0xdbeafe, 0.32);
        fillLight.position.set(-2.5, 2.5, 2.0);
        scene.add(fillLight);

        // 4. Subtle Studio Rim / Contour Backlight
        var rimLight = new THREE.DirectionalLight(0xfef3c7, 0.35);
        rimLight.position.set(0, 3.2, -3.0);
        scene.add(rimLight);

        /* ─── PMREM environment map for realistic PBR shading ─── */
        try {
            var pmremGen = new THREE.PMREMGenerator(renderer);
            pmremGen.compileEquirectangularShader();
            var envTexture = pmremGen.fromScene(new THREE.RoomEnvironment()).texture;
            scene.environment = envTexture;
            pmremGen.dispose();
        } catch (e) {
            console.warn("[Style360Viewer] PMREMGenerator env skipped:", e.message);
        }

        /* Subtle Studio Grid Floor */
        var grid = new THREE.GridHelper(12, 24, 0xd4d4d8, 0xe4e4e7);
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        grid.position.y = 0.001;
        scene.add(grid);

        /* Placeholder mannequin */
        buildMannequin();

        /* Clean Studio Loader: No photographic room background */
        initBackgroundDressingRoom();

        /* Handle resize */
        window.addEventListener("resize", onResize);

        /* Render loop */
        animate();
    }

    /* ------------------------------------------------------------------ */
    /*  Clean Studio Loader (No photo background)                         */
    /* ------------------------------------------------------------------ */
    function initBackgroundDressingRoom() {
        // Immediate dismissal of loader: clean studio floor is rendered directly via WebGL & CSS
        hideGlassLoader();
    }

    function hideGlassLoader() {
        var glassLoaders = document.querySelectorAll('.stage-bg-glass-loader, #loading-overlay');
        glassLoaders.forEach(function (el) {
            if (el) {
                el.classList.add('hidden');
                setTimeout(function () {
                    el.style.display = 'none';
                }, 300);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Sleek 3D Humanoid Avatar & 3D Scanner Stage                       */
    /* ------------------------------------------------------------------ */
    var podRingsGroup = null;

    function buildMannequin() {
        if (mannequinGroup) scene.remove(mannequinGroup);
        mannequinGroup = new THREE.Group();
        mannequinGroup.name = "mannequin";
        scene.add(mannequinGroup);

        /* ── Build Clean Stationary Stage Base ── */
        buildPodStageElements();
    }

    function buildPodStageElements() {
        if (podRingsGroup) scene.remove(podRingsGroup);
        podRingsGroup = new THREE.Group();

        // Studio Podium Disc Platform with soft satin finish
        var discGeo = new THREE.CylinderGeometry(1.2, 1.25, 0.035, 64);
        var discMat = new THREE.MeshStandardMaterial({
            color: 0xf1f3f7,
            roughness: 0.65,
            metalness: 0.05
        });
        var disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(0, -0.018, 0);
        disc.receiveShadow = true;
        podRingsGroup.add(disc);

        // Subtle Edge Trim Ring with luxury styling
        var trimGeo = new THREE.TorusGeometry(1.22, 0.008, 16, 64);
        var trimMat = new THREE.MeshStandardMaterial({
            color: 0x7c3aed,
            metalness: 0.45,
            roughness: 0.35
        });
        var trim = new THREE.Mesh(trimGeo, trimMat);
        trim.rotation.x = Math.PI / 2;
        trim.position.set(0, 0.002, 0);
        podRingsGroup.add(trim);

        scene.add(podRingsGroup);
    }

    /* ─── Smooth Shading & Normal Recomputation Helper ─── */
    function applySmoothShadingToModel(sceneGraph) {
        if (!sceneGraph) return;
        sceneGraph.traverse(function (child) {
            if (child.isMesh) {
                // Ensure mesh visibility and realistic shadows
                child.visible = true;
                child.castShadow = true;
                child.receiveShadow = true;

                // 1. Recompute vertex normals for organic smooth surfaces
                if (child.geometry) {
                    child.geometry.computeVertexNormals();
                }

                // 2. Force smooth shading on all material instances
                if (child.material) {
                    var mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(function (mat) {
                        mat.flatShading = false;
                        mat.side = THREE.DoubleSide; // Critical: Render both front & back faces
                        mat.depthTest = true;
                        mat.depthWrite = true;

                        var hasVertexColors = child.geometry && child.geometry.attributes && child.geometry.attributes.color;
                        if (hasVertexColors) {
                            mat.vertexColors = true;
                            mat.color.setRGB(1.0, 1.0, 1.0);
                        }

                        // Texture Sharpness & Maximum Anisotropic Filtering (map, roughnessMap, normalMap, etc.)
                        var maxAnisotropy = (renderer && renderer.capabilities) ? renderer.capabilities.getMaxAnisotropy() : 16;
                        var textureSlots = ['map', 'roughnessMap', 'normalMap', 'metalnessMap', 'bumpMap', 'emissiveMap', 'aoMap'];
                        textureSlots.forEach(function (slot) {
                            var tex = mat[slot];
                            if (tex && (tex.isTexture || tex instanceof THREE.Texture)) {
                                if (slot === 'map' || slot === 'emissiveMap') {
                                    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
                                    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
                                }
                                tex.generateMipmaps = true;
                                tex.minFilter = THREE.LinearMipmapLinearFilter;
                                tex.magFilter = THREE.LinearFilter;
                                tex.anisotropy = maxAnisotropy;
                                tex.needsUpdate = true;
                            }
                        });

                        if (!hasVertexColors && !mat.map) {
                            if (!mat.color || (mat.color.r < 0.05 && mat.color.g < 0.05 && mat.color.b < 0.05)) {
                                mat.color = new THREE.Color(0.9, 0.9, 0.95);
                            }
                        }

                        mat.metalness = Math.min(mat.metalness !== undefined ? mat.metalness : 0.0, 0.12);
                        mat.roughness = Math.max(mat.roughness !== undefined ? mat.roughness : 0.70, 0.60);
                        if (mat.emissive) {
                            mat.emissive.setHex(0x000000);
                        }
                        mat.needsUpdate = true;
                    });
                }
            }
        });
    }

    function isGarmentUrl(url) {
        if (!url) return false;
        var lower = url.toLowerCase();
        return lower.includes('/garments/') || lower.includes('garment') || lower.includes('shirt') || 
               lower.includes('tuxedo') || lower.includes('sherwani') || lower.includes('gown') || 
               lower.includes('suit') || lower.includes('jacket') || lower.includes('dress') || lower.includes('attire');
    }

    function loadGLBModel(url) {
        _lastLoadedUrl = url;
        console.log("%c[Style360Viewer] loadGLBModel → URL: " + url, "color: #00ff88; font-weight: bold;");
        if (!url || url === '' || url === 'null' || url === 'undefined') {
            console.error("[Style360Viewer] loadGLBModel called with EMPTY or NULL url");
            return;
        }

        if (url.toLowerCase().endsWith('.obj')) {
            loadOBJModel(url);
            return;
        }

        // Cross-Origin GLTF Loader
        var loader = new THREE.GLTFLoader();
        if (typeof loader.setCrossOrigin === 'function') {
            loader.setCrossOrigin('anonymous');
        }

        loader.load(
            url,
            function (gltf) {
                /* Remove ghost mannequin/wireframe completely */
                if (mannequinGroup) {
                    mannequinGroup.visible = false;
                    scene.remove(mannequinGroup);
                }
                /* Remove previous model */
                if (loadedModel) {
                    scene.remove(loadedModel);
                    loadedModel = null;
                }
                if (loadedAvatar) {
                    scene.remove(loadedAvatar);
                    loadedAvatar = null;
                }
                if (loadedGarment) {
                    scene.remove(loadedGarment);
                    loadedGarment = null;
                }
                /* Hide result plane if any */
                if (resultPlane) {
                    resultPlane.visible = false;
                }

                var model = gltf.scene;

                /* Apply Smooth Shading & Recompute Vertex Normals */
                applySmoothShadingToModel(model);

                /* Orientation, scale and ground */
                model.rotation.set(0, 0, 0);
                model.position.set(0, 0, 0);
                model.scale.set(1, 1, 1);

                // Step 1: Compute local geometry bounds
                var rawBox = new THREE.Box3();
                model.traverse(function (child) {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeBoundingBox();
                        var geomBox = child.geometry.boundingBox.clone();
                        geomBox.applyMatrix4(child.matrixWorld);
                        rawBox.union(geomBox);
                    }
                });
                var rawSize = new THREE.Vector3();
                rawBox.getSize(rawSize);

                if (rawSize.z > rawSize.y * 1.5) {
                    // Z-up model correction
                    model.rotation.x = -Math.PI / 2;
                }

                // Step 2: Add to scene to compute final matrix
                scene.add(model);
                loadedModel = model;
                loadedAvatar = model;

                // Step 3: Compute final bounding box
                var finalBox = new THREE.Box3().setFromObject(model);
                var finalSize = new THREE.Vector3();
                finalBox.getSize(finalSize);

                // Step 4: Scale to full 1.75m human height
                var targetHeight = 1.75;
                var rawHeight = finalSize.y;
                if (rawHeight > 0.05) {
                    var sf = targetHeight / rawHeight;
                    model.scale.set(sf, sf, sf);
                } else {
                    var tallestDim = Math.max(finalSize.x, finalSize.y, finalSize.z);
                    if (tallestDim > 0) {
                        var sf = targetHeight / tallestDim;
                        model.scale.set(sf, sf, sf);
                    }
                }
                model.updateMatrixWorld(true);

                // Step 5: Exact Bounding Box Centering onto (0, 0, 0)
                var grounded = new THREE.Box3().setFromObject(model);
                var gc = new THREE.Vector3();
                grounded.getCenter(gc);

                // Re-center X and Z exactly at 0, 0 so it sits dead-center on the circular platform
                model.position.x = model.position.x - gc.x;
                model.position.z = model.position.z - gc.z;
                // Place feet (lowest Y point) right on top of the white platform at y=0
                model.position.y = model.position.y - grounded.min.y;
                model.updateMatrixWorld(true);

                /* Step 6: Dynamic Auto-Fit Camera Zoom so Avatar Occupies ~80% of Canvas Height */
                var recomputedBox = new THREE.Box3().setFromObject(model);
                var actualH = recomputedBox.max.y - recomputedBox.min.y;
                var actualW = recomputedBox.max.x - recomputedBox.min.x;
                var centerY = recomputedBox.min.y + (actualH * 0.52);

                var vFov = (camera.fov || 45) * (Math.PI / 180);
                var targetCoverage = 0.80; // Occupies ~80% of canvas height
                var distForHeight = (actualH / (2 * Math.tan(vFov / 2))) / targetCoverage;

                var canvasAspect = (camera.aspect && !isNaN(camera.aspect) && camera.aspect > 0) ? camera.aspect : (640 / 540);
                var distForWidth = (actualW / (2 * Math.tan(vFov / 2) * canvasAspect)) / targetCoverage;

                var optimalDistance = Math.max(distForHeight, distForWidth);
                optimalDistance = Math.max(1.4, Math.min(optimalDistance, 4.2));

                camera.position.set(0, centerY, optimalDistance);
                if (controls) {
                    controls.target.set(0, centerY, 0);
                    controls.minDistance = Math.max(0.6, optimalDistance * 0.4);
                    controls.maxDistance = Math.max(5.0, optimalDistance * 2.5);
                    controls.minPolarAngle = Math.PI / 2;
                    controls.maxPolarAngle = Math.PI / 2;
                    controls.enabled = true;
                    controls.enableRotate = true;
                    controls.enableZoom = true;
                    controls.enablePan = false;
                    controls.update();
                }

                // Step 7: Trigger immediate resize calculation & synchronous render
                onResize();
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }

                // Step 8: Dismiss loading spinners/overlays
                hideGlassLoader();

                console.log("[Style360Viewer] ✅ 3D Model precisely centered at (0,0,0) and camera target set to (0,1,0)!");

            },
            function (xhr) {
                if (xhr.total) {
                    var pct = Math.round((xhr.loaded / xhr.total) * 100);
                    console.log("[Style360Viewer] GLB loading: " + pct + "%");
                }
            },
            function (err) {
                console.error("[Style360Viewer] GLB load error:", err);
            }
        );
    }

    function loadOBJModel(url) {
        if (!THREE.OBJLoader) {
            console.error("[Style360Viewer] OBJLoader not found!");
            return;
        }
        var loader = new THREE.OBJLoader();
        loader.load(
            url,
            function (object) {
                if (mannequinGroup) mannequinGroup.visible = false;
                if (loadedModel) {
                    scene.remove(loadedModel);
                    loadedModel = null;
                }
                if (resultPlane) resultPlane.visible = false;

                /* Ã¢â€â‚¬Ã¢â€â‚¬ OBJ: try loading companion texture PNG Ã¢â€â‚¬Ã¢â€â‚¬ */
                var textureUrl = url.replace(/\.obj$/i, '_texture.png');
                var texLoader = new THREE.TextureLoader();
                var loadedTex = null;
                try {
                    loadedTex = texLoader.load(
                        textureUrl,
                        function(t) { console.log("[Style360Viewer] OBJ texture loaded:", textureUrl); },
                        undefined,
                        function() { console.log("[Style360Viewer] No companion texture PNG found, using vertex colors."); }
                    );
                    if (loadedTex) loadedTex.encoding = THREE.sRGBEncoding;
                } catch(e) { loadedTex = null; }

                object.traverse(function(child) {
                    if (child.isMesh) {
                        /* Prefer loaded texture, fall back to vertex colors */
                        child.material = new THREE.MeshStandardMaterial({
                            map: loadedTex || null,
                            vertexColors: loadedTex ? false : true,
                            metalness: 0.05,
                            roughness: 0.75
                        });
                    }
                });

                var box = new THREE.Box3().setFromObject(object);
                var center = new THREE.Vector3();
                box.getCenter(center);
                var size = new THREE.Vector3();
                box.getSize(size);

                var maxDim = Math.max(size.x, size.y, size.z);
                var targetHeight = 1.8;
                var scaleFactor = targetHeight / maxDim;
                object.scale.multiplyScalar(scaleFactor);

                box.setFromObject(object);
                box.getCenter(center);
                object.position.sub(center);
                object.position.y += (targetHeight / 2);

                controls.target.set(0, targetHeight / 2, 0);
                controls.update();

                loadedModel = object;
                scene.add(loadedModel);
            },
            function (xhr) {
                if (xhr.total) {
                    console.log("[Style360Viewer] OBJ loading: " + Math.round((xhr.loaded / xhr.total) * 100) + "%");
                }
            },
            function (err) {
                console.error("[Style360Viewer] OBJ load error:", err);
            }
        );
    }

    /* ------------------------------------------------------------------ */
    /*  showResultImage(imageDataURL)                                       */
    /* ------------------------------------------------------------------ */
    function showResultImage(imageDataURL) {
        /* Hide mannequin */
        if (mannequinGroup) {
            mannequinGroup.visible = false;
        }
        /* Do NOT remove previous model, keep it visible! */
        if (loadedModel) {
            loadedModel.visible = true;
        }
        /* Remove old result plane */
        if (resultPlane) {
            scene.remove(resultPlane);
            resultPlane = null;
        }

        var loader = new THREE.TextureLoader();
        loader.load(imageDataURL, function (texture) {
            texture.encoding = THREE.sRGBEncoding; // Use correct encoding for r128

            var aspect = texture.image.width / texture.image.height;
            var w = 1.2 * aspect;
            var h = 1.2;

            var geo = new THREE.PlaneGeometry(w, h);
            var mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
            });

            resultPlane = new THREE.Mesh(geo, mat);
            
            // If we have a 3D avatar, show them side-by-side
            if (loadedModel) {
                resultPlane.position.set(0.8, 1.2, 0);
                loadedModel.position.x = -0.8;
                camera.position.set(0, 1.2, 3.5);
            } else {
                resultPlane.position.set(0, 1.2, 0);
                camera.position.set(0, 1.2, 2.5);
            }
            
            scene.add(resultPlane);

            controls.target.set(0, 1.2, 0);
            controls.update();
        }, undefined, function (err) {
            console.error("[Style360Viewer] Failed to load result image texture", err);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  applyTexture(imageDataURL) Ã¢â‚¬â€ fallback for mannequin torso          */
    /* ------------------------------------------------------------------ */
    function applyTexture(imageDataURL) {
        if (!mannequinGroup) return;

        var torso = null;
        mannequinGroup.traverse(function (child) {
            if (child.name === "torso") {
                torso = child;
            }
        });
        if (!torso) return;

        var img = new Image();
        img.onload = function () {
            var texture = new THREE.Texture(img);
            texture.needsUpdate = true;
            torso.material = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.6,
                metalness: 0.05
            });
        };
        img.src = imageDataURL;
    }

    /* ------------------------------------------------------------------ */
    /*  resetView()                                                        */
    /* ------------------------------------------------------------------ */
    function resetView() {
        /* If no model is loaded, show placeholder mannequin */
        if (!loadedModel && !loadedAvatar) {
            if (mannequinGroup) {
                mannequinGroup.visible = true;
            }
        }

        /* Reset camera to auto-fitted center occupying ~80% of canvas height */
        if (camera) {
            var targetY = 0.91;
            var targetZ = 2.64;
            var activeModel = loadedModel || loadedAvatar;
            if (activeModel) {
                var box = new THREE.Box3().setFromObject(activeModel);
                var h = box.max.y - box.min.y;
                var w = box.max.x - box.min.x;
                if (h > 0.05) {
                    targetY = box.min.y + (h * 0.52);
                    var vFov = (camera.fov || 45) * (Math.PI / 180);
                    var aspect = (camera.aspect && !isNaN(camera.aspect) && camera.aspect > 0) ? camera.aspect : (640 / 540);
                    var dH = (h / (2 * Math.tan(vFov / 2))) / 0.80;
                    var dW = (w / (2 * Math.tan(vFov / 2) * aspect)) / 0.80;
                    targetZ = Math.max(1.4, Math.min(Math.max(dH, dW), 4.2));
                }
            }
            camera.position.set(0, targetY, targetZ);
            if (controls) {
                controls.target.set(0, targetY, 0);
                controls.minPolarAngle = Math.PI / 2;
                controls.maxPolarAngle = Math.PI / 2;
                controls.enabled = true;
                controls.enableRotate = true;
                controls.enableZoom = true;
                controls.enablePan = false;
                controls.update();
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Internal helpers                                                    */
    /* ------------------------------------------------------------------ */
    function animate() {
        animationId = requestAnimationFrame(animate);

        // Self-correcting resize watchdog: if container became visible or resized
        if (renderer && renderer.domElement && camera) {
            var cv = renderer.domElement;
            var pr = cv.parentElement;
            if (pr && pr.clientWidth > 10 && pr.clientHeight > 10) {
                var expectedW = pr.clientWidth;
                var expectedH = pr.clientHeight;
                var curW = cv.clientWidth;
                var curH = cv.clientHeight;
                if (Math.abs(curW - expectedW) > 2 || Math.abs(curH - expectedH) > 2 || isNaN(camera.aspect) || camera.aspect <= 0) {
                    onResize();
                }
            }
        }

        if (podRingsGroup) {
            podRingsGroup.children.forEach(function(child) {
                if (child.name && child.name.indexOf("orbitRing_") === 0) {
                    child.rotation.y += 0.003;
                }
            });
        }
        if (controls) controls.update();
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    function onResize() {
        if (!renderer || !renderer.domElement || !camera) return;
        var parent = renderer.domElement.parentElement;
        if (!parent) return;

        var w = parent.clientWidth;
        var h = parent.clientHeight;
        if (w <= 10 || h <= 10) {
            var vArea = document.querySelector(".stage-viewport-area") || document.querySelector(".stage-view-card");
            if (vArea && vArea.clientWidth > 10 && vArea.clientHeight > 10) {
                w = vArea.clientWidth;
                h = vArea.clientHeight;
            }
        }

        if (w > 10 && h > 10) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(w, h, false);
        }
    }

    var loadedAvatar = null;
    var loadedGarment = null;

    /**
     * Load Base Avatar GLB at position (0, 0, 0) and scale (1, 1, 1)
     */
    function loadAvatarModel(url) {
        _lastLoadedUrl = url;
        console.log("%c[Style360Viewer] loadAvatarModel Ã¢â€ â€™ URL: " + url, "color: #00ff88; font-weight: bold;");
        if (!url || url === '' || url === 'null' || url === 'undefined') {
            console.error("[Style360Viewer] loadAvatarModel called with EMPTY or NULL url Ã¢â‚¬â€ this is a mock/fallback!");
            return;
        }
        if (loadedAvatar) {
            scene.remove(loadedAvatar);
            loadedAvatar = null;
        }
        var loader = new THREE.GLTFLoader();
        loader.load(url, function (gltf) {
            if (mannequinGroup) mannequinGroup.visible = false;
            loadedAvatar = gltf.scene;
            loadedAvatar.position.set(0, 0, 0);
            loadedAvatar.scale.set(1, 1, 1);

            /* Ã¢â€â‚¬Ã¢â€â‚¬ Apply Smooth Shading & Recompute Vertex Normals (Removes faceted/blocky triangles) Ã¢â€â‚¬Ã¢â€â‚¬ */
            applySmoothShadingToModel(loadedAvatar);

            scene.add(loadedAvatar);
            loadedModel = loadedAvatar;

            /* Ã¢â€â‚¬Ã¢â€â‚¬ Orientation, scale and ground Ã¢â€â‚¬Ã¢â€â‚¬ */
            // Step 1: Compute local geometry bounds using child matrices
            var rawBox = new THREE.Box3();
            loadedAvatar.traverse(function (child) {
                if (child.isMesh && child.geometry) {
                    child.geometry.computeBoundingBox();
                    var geomBox = child.geometry.boundingBox.clone();
                    geomBox.applyMatrix4(child.matrixWorld);
                    rawBox.union(geomBox);
                }
            });
            var rawSize = new THREE.Vector3();
            rawBox.getSize(rawSize);

            console.log("[Style360Viewer] Avatar raw size X=" + rawSize.x.toFixed(3) + " Y=" + rawSize.y.toFixed(3) + " Z=" + rawSize.z.toFixed(3));

            // Step 2: Apply Z-up correction if needed
            loadedAvatar.rotation.set(0, 0, 0);
            loadedAvatar.position.set(0, 0, 0);
            loadedAvatar.scale.set(1, 1, 1);

            if (rawSize.z > rawSize.y * 1.5) {
                loadedAvatar.rotation.x = -Math.PI / 2;
                console.log("[Style360Viewer] Avatar Z-up detected Ã¢â€ â€™ rotating X = -90Ã‚Â°");
            }

            // Step 3: Compute final world-space bounding box
            var finalBox = new THREE.Box3().setFromObject(loadedAvatar);
            var finalSize = new THREE.Vector3();
            finalBox.getSize(finalSize);

            console.log("[Style360Viewer] Avatar after rotation size X=" + finalSize.x.toFixed(3) + " Y=" + finalSize.y.toFixed(3) + " Z=" + finalSize.z.toFixed(3));

            // Step 4: Scale to 1.8m
            var targetHeight = 1.8;
            var tallestDim = Math.max(finalSize.x, finalSize.y, finalSize.z);
            if (tallestDim > 0) {
                var sf = targetHeight / tallestDim;
                loadedAvatar.scale.set(sf, sf, sf);
            }

            // Step 5: Re-center and ground feet at y=0
            var grounded = new THREE.Box3().setFromObject(loadedAvatar);
            var gc = new THREE.Vector3();
            grounded.getCenter(gc);
            loadedAvatar.position.x -= gc.x;
            loadedAvatar.position.z -= gc.z;
            loadedAvatar.position.y -= grounded.min.y;

            controls.target.set(0, targetHeight / 2, 0);
            controls.minPolarAngle = Math.PI / 2;
            controls.maxPolarAngle = Math.PI / 2;
            controls.enabled = true;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = false;
            controls.update();

            console.log("[Style360Viewer] Ã¢Å“â€¦ Avatar GLB loaded successfully & 360Ã‚Â° controls enabled:", url);
        });
    }

    /**
     * Gemini Vision API Garment Type Detection
     * Sends garment image URL to backend Ã¢â€ â€™ Gemini Vision API.
     * Returns detected type: "shirt" | "pant" | "dress" | "jacket".
     */
    function detectGarmentType(imageUrl, onSuccess, onFallback) {
        if (!imageUrl || imageUrl.startsWith('http') === false) {
            onFallback('shirt');
            return;
        }
        var apiUrl = window.location.origin + '/style360/backend/garment_detect.php';
        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageUrl })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data && data.status === 'success' && data.type) {
                console.log(
                    '%c[Style360Viewer] Gemini Vision detected garment type: ' + data.type +
                    ' (confidence: ' + (data.confidence || '?') + ')',
                    'color: #a855f7; font-weight: bold;'
                );
                onSuccess(data.type, data.confidence || 0.9);
            } else {
                console.warn('[Style360Viewer] Garment detect fallback Ã¢â€ â€™ shirt (API error):', data);
                onFallback('shirt');
            }
        })
        .catch(function (err) {
            console.warn('[Style360Viewer] Garment detect network error Ã¢â€ â€™ defaulting shirt:', err);
            onFallback('shirt');
        });
    }

    /**
     * Automatic 3D Garment Fitting & Alignment Algorithm
     * Dynamically positions garment based on Gemini-detected garment type:
     *   shirt / jacket Ã¢â€ â€™ upper body (70% avatar height)
     *   pant           Ã¢â€ â€™ lower body (40% avatar height)
     *   dress          Ã¢â€ â€™ full body  (60% avatar height)
     */
    function fitClothingToAvatar(avatarMesh, garmentMesh, garmentType) {
        if (!garmentMesh) return null;
        console.log(
            '%c[Style360Viewer] fitClothingToAvatar() CALLED | avatarMesh=' + (avatarMesh ? 'YES' : 'NULL') +
            ' | garmentType=' + (garmentType || 'shirt'),
            'background:#7c3aed;color:white;padding:2px 6px;border-radius:4px;font-weight:bold;'
        );

        // Ã¢â€â‚¬Ã¢â€â‚¬ Persist Avatar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (avatarMesh) {
            avatarMesh.visible = true;
            if (!avatarMesh.parent && scene) scene.add(avatarMesh);
        }
        if (!avatarMesh) { scene.add(garmentMesh); return garmentMesh; }

        // Ã¢â€â‚¬Ã¢â€â‚¬ Smooth Shading Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        applySmoothShadingToModel(garmentMesh);

        // Ã¢â€â‚¬Ã¢â€â‚¬ STEP 1 : Identity reset Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Reset the WHOLE garment group Ã¢â‚¬â€ do NOT call geometry.center() on
        // individual child meshes: that breaks multi-mesh garments (collar, body,
        // buttons) by collapsing each piece to the same local origin.
        garmentMesh.position.set(0, 0, 0);
        garmentMesh.rotation.set(0, 0, 0);
        garmentMesh.scale.set(1, 1, 1);
        garmentMesh.updateMatrixWorld(true);

        // Ã¢â€â‚¬Ã¢â€â‚¬ STEP 2 : Avatar world-space bounding box Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        avatarMesh.updateMatrixWorld(true);
        var avatarBox    = new THREE.Box3().setFromObject(avatarMesh);
        var avatarSize   = new THREE.Vector3();
        var avatarCenter = new THREE.Vector3();
        avatarBox.getSize(avatarSize);
        avatarBox.getCenter(avatarCenter);

        // Ã¢â€â‚¬Ã¢â€â‚¬ STEP 3 : Raw garment bounding box (scale=1, position=0) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        var rawBox    = new THREE.Box3().setFromObject(garmentMesh);
        var rawSize   = new THREE.Vector3();
        var rawCenter = new THREE.Vector3(); // actual visual centre of garment
        rawBox.getSize(rawSize);
        rawBox.getCenter(rawCenter);

        console.log(
            '[Style360Viewer] avatar WxH=' + avatarSize.x.toFixed(3) + 'x' + avatarSize.y.toFixed(3) +
            ' | garment raw WxHxD=' + rawSize.x.toFixed(3) + 'x' + rawSize.y.toFixed(3) + 'x' + rawSize.z.toFixed(3) +
            ' | garment raw center Y=' + rawCenter.y.toFixed(3)
        );

        // ── STEP 4 : Height-Proportional Anatomical Scaling ───────────────
        var gType = (garmentType || 'shirt').toLowerCase();
        var heightRatio, anchorYRatio, isTopAnchored;

        if (gType === 'jacket') {
            heightRatio    = 0.46;   // Waist-to-hip length jacket
            anchorYRatio   = 0.82;   // Collar sits at base of neck
            isTopAnchored  = true;
        } else if (gType === 'pant') {
            heightRatio    = 0.54;   // Waist to ankle
            anchorYRatio   = 0.55;   // Top of pant aligns with waist
            isTopAnchored  = true;
        } else if (gType === 'dress') {
            heightRatio    = 0.76;   // Full-length gown from shoulders to ankles
            anchorYRatio   = 0.82;   // Shoulders / neckline
            isTopAnchored  = true;
        } else {                     // shirt / sherwani (default)
            heightRatio    = 0.48;   // Long sherwani / tunic from neck to mid-thigh
            anchorYRatio   = 0.82;   // Collar sits at base of neck
            isTopAnchored  = true;
        }

        // Scale by garment height to preserve sleeve-to-torso proportions
        var refHeight   = Math.max(rawSize.y, 0.001);
        var targetHeight = avatarSize.y * heightRatio;
        var sf          = targetHeight / refHeight;
        if (!isFinite(sf) || sf <= 0) sf = 1.0;

        garmentMesh.scale.set(sf, sf, sf);

        // ── STEP 5 : Orientation & World-Space Positioning ──────────────────
        // Rotate 180° so the front of the garment faces the front of the avatar
        var rotY = (avatarMesh.rotation.y || 0) + Math.PI;
        garmentMesh.rotation.set(0, rotY, 0);

        // Calculate Y position anchored at neck/shoulder height
        var targetY;
        if (isTopAnchored) {
            var anchorWorldY = avatarBox.min.y + (avatarSize.y * anchorYRatio);
            targetY          = anchorWorldY - (rawBox.max.y * sf);
        } else {
            targetY          = avatarCenter.y - (rawCenter.y * sf);
        }

        // Position in world space:
        // Because rotation.y = PI, local X and Z are inverted relative to world
        garmentMesh.position.set(
            avatarCenter.x + (rawCenter.x * sf),
            targetY,
            avatarCenter.z + (rawCenter.z * sf) + (avatarSize.z * 0.04)
        );

        // ── STEP 6 : PolygonOffset (prevents Z-fighting with avatar skin) ────
        garmentMesh.traverse(function (child) {
            if (child.isMesh && child.material) {
                var mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(function (mat) {
                    mat.polygonOffset       = true;
                    mat.polygonOffsetFactor = -1;
                    mat.polygonOffsetUnits  = -1;
                    mat.needsUpdate         = true;
                });
            }
        });

        // ── STEP 7 : Add to scene root ──────────────────────────────────────
        scene.add(garmentMesh);

        console.log(
            '[Style360Viewer] ✅ Fitted | type=' + gType +
            ' | sf=' + sf.toFixed(5) +
            ' | targetY=' + targetY.toFixed(3) +
            ' | targetWidth=' + targetWidth.toFixed(3)
        );

        return garmentMesh;
    }

    /**
     * Overlay Garment GLB on Avatar.
     * Priority:
     *   1. Instant preview: Three.js bounding-box fit
     *   2. Background upgrade: Modal Cloth Simulation (physics drape) via backend/cloth_sim.php
     *
     * garmentGlbUrl   – R2 URL of the garment GLB
     * garmentImageUrl – thumbnail URL for Gemini garment-type detection
     * avatarGlbUrl    – (optional) R2 URL of avatar GLB for cloth sim
     */
    function tryOnGarment(garmentGlbUrl, garmentImageUrl, avatarGlbUrl) {
        if (!garmentGlbUrl) return;

        // ── Remove previous garment from scene ──────────────────────────────
        if (loadedGarment) {
            if (loadedGarment.parent) loadedGarment.parent.remove(loadedGarment);
            else scene.remove(loadedGarment);
            loadedGarment = null;
        }

        var detectBadge   = document.getElementById('garment-type-badge');
        var simStatusEl   = document.getElementById('cloth-sim-status');

        // Helper to show status text in UI
        function setSimStatus(msg, color) {
            if (simStatusEl) {
                simStatusEl.textContent = msg;
                simStatusEl.style.color  = color || '#7c3aed';
                simStatusEl.style.display = msg ? 'block' : 'none';
            }
            console.log('[Style360Viewer] ' + msg);
        }

        // ── Detect garment type, then show garment instantly + upgrade with cloth sim ──
        function runWithType(detectedType) {
            // Resolve avatar R2 URL from: explicit arg → active card → last loaded URL
            var resolvedAvatarUrl = avatarGlbUrl || null;
            if (!resolvedAvatarUrl) {
                var activeCard = document.querySelector('.model-item.active[data-avatar-url]');
                if (activeCard) resolvedAvatarUrl = activeCard.getAttribute('data-avatar-url');
            }
            if (!resolvedAvatarUrl && _lastLoadedUrl && _lastLoadedUrl.startsWith('http')) {
                resolvedAvatarUrl = _lastLoadedUrl;
            }

            // ── STEP 1: Show garment INSTANTLY via Three.js bbox fit ─────────────
            console.log('%c[Style360Viewer] ⚡ Instant preview: loading garment via bbox fit...', 'color:#22c55e;font-weight:bold;');
            setSimStatus('⚡ Placing garment...', '#6366f1');

            var loader = new THREE.GLTFLoader();
            loader.load(garmentGlbUrl, function (gltf) {
                // Remove previous garment if any
                if (loadedGarment) {
                    if (loadedGarment.parent) loadedGarment.parent.remove(loadedGarment);
                    else scene.remove(loadedGarment);
                }
                loadedGarment = gltf.scene;
                var avatarRef = loadedAvatar || loadedModel;
                fitClothingToAvatar(avatarRef, loadedGarment, detectedType);
                setSimStatus('', '');

                if (detectBadge) {
                    var label = { shirt:'👔 Shirt', jacket:'🧥 Jacket', pant:'👖 Pant', dress:'👗 Dress' };
                    detectBadge.textContent = label[detectedType] || detectedType;
                    detectBadge.style.display = 'inline-block';
                }
                console.log('%c[Style360Viewer] ✅ Instant garment placed (' + detectedType + ')', 'color:#22c55e;font-weight:bold;');

                // ── STEP 2: Upgrade with cloth simulation in background ──────────
                var canRunClothSim = resolvedAvatarUrl && garmentGlbUrl && garmentGlbUrl.startsWith('http');
                if (!canRunClothSim) {
                    console.log('[Style360Viewer] Skipping cloth sim (no avatar URL).');
                    return;
                }

                console.log('[Style360Viewer] 🧵 Starting background cloth sim upgrade...');
                setSimStatus('🧵 Upgrading with cloth physics (~60s)...', '#f59e0b');

                fetch('/style360/backend/cloth_sim.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        avatar_url:   resolvedAvatarUrl,
                        shirt_url:    garmentGlbUrl,
                        cloth_frames: 30
                    })
                })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.status === 'success' && data.r2_url) {
                        console.log('[Style360Viewer] Cloth sim done → swapping to draped GLB: ' + data.r2_url);
                        setSimStatus('🧵 Loading cloth-simulated garment...', '#7c3aed');

                        var loader2 = new THREE.GLTFLoader();
                        loader2.load(data.r2_url, function (gltf2) {
                            if (loadedGarment) {
                                if (loadedGarment.parent) loadedGarment.parent.remove(loadedGarment);
                                else scene.remove(loadedGarment);
                            }
                            loadedGarment = gltf2.scene;
                            applySmoothShadingToModel(loadedGarment);
                            loadedGarment.traverse(function (child) {
                                if (child.isMesh && child.material) {
                                    var mats = Array.isArray(child.material) ? child.material : [child.material];
                                    mats.forEach(function (m) {
                                        m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; m.needsUpdate = true;
                                    });
                                }
                            });
                            scene.add(loadedGarment);
                            setSimStatus('✅ Cloth physics applied!', '#22c55e');
                            if (detectBadge) {
                                var label2 = { shirt:'👔 Shirt', jacket:'🧥 Jacket', pant:'👖 Pant', dress:'👗 Dress' };
                                detectBadge.textContent = '🧵 Physics: ' + (label2[detectedType] || detectedType);
                            }
                            setTimeout(function () { setSimStatus('', ''); }, 3000);
                            console.log('%c[Style360Viewer] ✅ Cloth sim upgrade complete!', 'color:#22c55e;font-weight:bold;');
                        }, undefined, function (e) {
                            console.warn('[Style360Viewer] Failed to load draped GLB:', e);
                            setSimStatus('', '');
                        });
                    } else {
                        console.warn('[Style360Viewer] Cloth sim failed or skipped: ' + (data.message || ''));
                        setSimStatus('', '');
                    }
                })
                .catch(function (err) {
                    console.warn('[Style360Viewer] Cloth sim network error:', err);
                    setSimStatus('', '');
                });

            }, undefined, function (err) {
                console.error('[Style360Viewer] Failed to load garment GLB for instant preview:', err);
                setSimStatus('❌ Failed to load garment', '#ef4444');
            });
        }

        // Detect garment type via Gemini or filename fallback
        var imgUrlForDetect = garmentImageUrl || null;
        if (imgUrlForDetect) {
            console.log('%c[Style360Viewer] Calling Gemini Vision for garment type...', 'color:#f59e0b;font-weight:bold;');
            setSimStatus('🔍 Detecting garment type...', '#6366f1');
            detectGarmentType(
                imgUrlForDetect,
                function (type) { runWithType(type); },
                function (type) { runWithType(type); }
            );
        } else {
            var lowerUrl = garmentGlbUrl.toLowerCase();
            var inferredType = 'shirt';
            if (lowerUrl.includes('pant') || lowerUrl.includes('trouser'))                      inferredType = 'pant';
            else if (lowerUrl.includes('gown') || lowerUrl.includes('dress') || lowerUrl.includes('bridal')) inferredType = 'dress';
            else if (lowerUrl.includes('jacket') || lowerUrl.includes('blazer') || lowerUrl.includes('coat')) inferredType = 'jacket';
            console.log('[Style360Viewer] Inferred type from filename: ' + inferredType);
            runWithType(inferredType);
        }
    }

    /* ─── Fabric Type & Garment Color Customization Engine ─── */
    function applyFabricType(fabricType) {
        var type = (fabricType || 'velvet').toLowerCase();
        var target = loadedModel || loadedAvatar || loadedGarment;
        if (!target) return;

        target.traverse(function (child) {
            if (child.isMesh && child.material) {
                var mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(function (mat) {
                    if (type === 'velvet') {
                        mat.roughness = 0.82;
                        mat.metalness = 0.08;
                        if (mat.sheen !== undefined) mat.sheen = 0.85;
                        if (mat.clearcoat !== undefined) mat.clearcoat = 0.0;
                    } else if (type === 'silk') {
                        mat.roughness = 0.18;
                        mat.metalness = 0.38;
                        if (mat.clearcoat !== undefined) mat.clearcoat = 0.6;
                    } else if (type === 'linen') {
                        mat.roughness = 0.96;
                        mat.metalness = 0.0;
                        if (mat.clearcoat !== undefined) mat.clearcoat = 0.0;
                    }
                    mat.needsUpdate = true;
                });
            }
        });
        console.log("[Style360Viewer] ✅ Applied fabric type:", type);
    }

    function applyGarmentColor(hexColor) {
        var target = loadedModel || loadedAvatar || loadedGarment;
        if (!target) return;

        var colorObj = new THREE.Color(hexColor);
        target.traverse(function (child) {
            if (child.isMesh && child.material) {
                var mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(function (mat) {
                    mat.color = colorObj.clone();
                    mat.needsUpdate = true;
                });
            }
        });
        console.log("[Style360Viewer] ✅ Applied garment color:", hexColor);
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                         */
    /* ------------------------------------------------------------------ */
    window.Style360Viewer = {
        init: init,
        onResize: onResize,
        loadModel: loadGLBModel,
        loadGLBModel: loadGLBModel,
        loadAvatarModel: loadAvatarModel,
        tryOnGarment: tryOnGarment,
        fitClothingToAvatar: fitClothingToAvatar,
        showResultImage: showResultImage,
        applyTexture: applyTexture,
        applyFabricType: applyFabricType,
        applyGarmentColor: applyGarmentColor,
        resetView: resetView,
        getLoadedModelUrl: function () {
            console.log("[Style360Viewer] Last loaded URL:", _lastLoadedUrl);
            return _lastLoadedUrl;
        },
        rotateUpright: function () {
            if (loadedModel) {
                loadedModel.rotation.x += Math.PI / 2;
                loadedModel.updateMatrixWorld(true);
                var box = new THREE.Box3().setFromObject(loadedModel);
                loadedModel.position.y -= box.min.y;
                if (controls) controls.update();
            }
        },
        rotateYaw: function () {
            if (loadedModel) {
                loadedModel.rotation.y += Math.PI / 2;
                if (controls) controls.update();
            }
        }
    };
})();
