# Style360 - Core AI & 3D WebGL Engine Module
**Developer:** Member 1 (Project Lead & Core AI/3D Architect)  
**Workload Allocation:** ~35% (Core Platform AI & WebGL Engine)  
**Branch:** `feature/core-ai-3d-engine`  

---

## 📌 Module Architecture & Core Responsibilities

This module constitutes the primary algorithmic core and 3D visualization pipeline of the Style360 platform:

### 1. Cloud AI Virtual Try-On Orchestrator (`backend/FalService.php`)
- **Fashn v1.6 VTON Pipeline:** Direct communication with Fal.ai Fashn Try-On v1.6.
- **Smart Aspect-Ratio Standardizer (Pillarboxing):** Preserves 100% vertical height of tall 9:16 portraits, preventing head/toe truncation.
- **Seamless Corner-Color Sampling:** Dynamically samples input image corner pixels to fill canvas padding without artificial black bars.
- **Face Restoration Weight Tuning:** Restricts CodeFormer face restoration weight to `0.5` to prevent disproportionate cartoonish head enlargement.
- **`isFullOutfit()` Detection:** Auto-detects suits, bridal gowns, and two-piece outfits to pass correct one-piece classification to the AI engine.

### 2. Tripo3D V3 Image-to-3D Reconstruction Pipeline (`backend/generate_3d.php`)
- **MD5 Content Hashing Cache:** Hashes incoming Base64 images to achieve `<30ms` instant cache retrieval, eliminating redundant API credit usage.
- **Automated Background Stripping:** Invokes background removal prior to 3D submission, preventing studio walls and floors from turning into blocky 3D mesh artifacts.
- **Asynchronous Polling Loop:** Periodically checks Tripo3D task state up to 90 seconds and persists model metadata in `user_3d_models`.

### 3. High-Performance CORS & Disk Cache Proxy (`backend/proxy_glb.php`)
- **CORS Bypass:** Injects `Access-Control-Allow-Origin: *` headers for remote CloudFront GLB assets, solving Three.js WebGL security restrictions.
- **Disk Caching:** Persists binary GLB files to `temp/glb_cache/model_[md5].glb`, solving CloudFront signed URL 24-hour expiration.
- **Non-buffered Streaming:** Streams binary chunks directly to the client without loading 15MB files into PHP memory.

### 4. Dual-Tier AI Gender Guard (`backend/validate_gender.php`)
- **Tier 1 (<1ms):** Sub-millisecond regex filename heuristic checks.
- **Tier 2 (~1.2s):** In-memory GD library downsampling (resizing 4K/1080p images to 320px ~12KB) sent to Google Gemini Flash Vision API, dropping round-trip network latency from 6s to 1.2s and preventing expensive GPU try-on mismatches.

### 5. Content Safety & Classification (`backend/verify_garment.php`)
- Verifies uploaded garments for appropriate categories and apparel safety via Gemini Vision before catalog entry.

### 6. Multimodal Conversational AI Stylist (`backend/chat_multimodal.php` & `backend/chat.php`)
- **Contextual Inventory Injection:** Queries active MySQL stock and injects only gender-matched garments into the Gemini Vision prompt, preventing hallucinations.

### 7. Three.js WebGL 3D Engine (`frontend/js/three_viewer.js` & `frontend/js/viewer3d.js`)
- **Hardware Acceleration:** High-performance WebGL context with ACES Filmic Tone Mapping (exposure 0.88) and PCF Soft Shadows.
- **Bounding Box Normalization:** `THREE.Box3` calculations scaling arbitrary AI meshes to a standard 1.75m human height and aligning feet to ground (Y = 0).
- **Balanced 3-Point Studio Rig:** Hemisphere ambient light (0.42) + Directional key light (0.82) with 2048x2048 shadow maps.
- **Horizon Orbit Locking:** `minPolarAngle` and `maxPolarAngle` locked at `Math.PI / 2` (90°) to prevent disorienting camera flips.

### 8. Virtual Fitting Studio Controller (`frontend/js/studio.js`)
- Drives the 4-step wizard: photo upload, live webcam streaming, garment alignment, 2D result inspection, and 3D dispatch.
