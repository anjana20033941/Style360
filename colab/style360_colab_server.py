# ============================================================
# Style360 — Google Colab GPU Server
# ============================================================
# This script runs on Google Colab with a FREE T4 GPU.
# It provides a Flask API for 3D reconstruction (TripoSR)
# and Virtual Try-On (IDM-VTON) — no Hugging Face queue issues!
#
# HOW TO USE:
# 1. Open Google Colab: https://colab.research.google.com
# 2. Create a new notebook
# 3. Set runtime to GPU: Runtime > Change runtime type > T4 GPU
# 4. Copy each cell below into a separate Colab cell
# 5. Run all cells
# 6. Copy the ngrok URL into your config.php
# ============================================================

# ==========================
# CELL 1: Install Everything
# ==========================
# Copy this into the FIRST cell in Colab and run it.
# This will take 2-3 minutes.

"""
!pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
!pip install -q flask pyngrok pillow rembg[gpu] trimesh einops omegaconf transformers huggingface_hub tqdm
!git clone https://github.com/VAST-AI-Research/TripoSR.git /content/TripoSR
!cd /content/TripoSR && pip install -q -r requirements.txt
!pip install -q pyopengl==3.1.7
print("✅ All dependencies installed!")
"""

# ==========================
# CELL 2: Set Your ngrok Token
# ==========================
# Get your FREE token from: https://dashboard.ngrok.com/get-started/your-authtoken
# Paste it below between the quotes.

"""
NGROK_TOKEN = ""  # @param {type:"string"}

# Save it for Cell 3
import os
os.environ['NGROK_TOKEN'] = NGROK_TOKEN
print(f"✅ ngrok token set!")
"""

# ==========================
# CELL 3: Start GPU Server
# ==========================
# This loads the AI model and starts the server.
# After running, you'll see the public URL to copy into config.php.

"""
import sys
sys.path.insert(0, '/content/TripoSR')

import torch
import numpy as np
import base64
import io
import os
import tempfile
import time
from PIL import Image
from flask import Flask, request, jsonify
from pyngrok import ngrok

# ---------- Load TripoSR Model ----------
print("🔄 Loading TripoSR AI model (this takes ~30 seconds)...")
from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground
import rembg

model = TSR.from_pretrained(
    "stabilityai/TripoSR",
    config_name="config.yaml",
    weight_name="model.ckpt",
)
model.renderer.set_chunk_size(8192)
model.to("cuda:0")

rembg_session = rembg.new_session()
print("✅ TripoSR model loaded on GPU!")
print(f"   GPU: {torch.cuda.get_device_name(0)}")
print(f"   VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")

# ---------- Flask API Server ----------
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model": "TripoSR",
        "gpu": torch.cuda.get_device_name(0),
        "vram_gb": round(torch.cuda.get_device_properties(0).total_mem / 1e9, 1)
    })

@app.route('/reconstruct3d', methods=['POST'])
def reconstruct3d():
    start = time.time()
    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({"status": "error", "message": "Missing 'image' field"})

        img_b64 = data['image']

        # Remove data URL prefix if present (e.g., "data:image/png;base64,...")
        if ',' in img_b64:
            img_b64 = img_b64.split(',', 1)[1]

        # Decode base64 to PIL Image
        img_data = base64.b64decode(img_b64)
        image = Image.open(io.BytesIO(img_data)).convert("RGBA")
        print(f"  📸 Image received: {image.size}")

        # Step 1: Remove background
        image = remove_background(image, rembg_session)
        image = resize_foreground(image, 0.85)

        # Convert RGBA to RGB with white background
        img_array = np.array(image).astype(np.float32) / 255.0
        img_array = img_array[:, :, :3] * img_array[:, :, 3:4] + (1 - img_array[:, :, 3:4]) * 0.5
        image = Image.fromarray((img_array * 255.0).astype(np.uint8))
        print("  ✂️ Background removed")

        # Step 2: Generate 3D mesh
        with torch.no_grad():
            scene_codes = model([image], device="cuda:0")

        meshes = model.extract_mesh(scene_codes, resolution=256)
        mesh = meshes[0]
        print("  🧊 3D mesh generated")

        # Step 3: Export to GLB
        tmp_path = tempfile.mktemp(suffix='.glb')
        mesh.export(tmp_path)

        with open(tmp_path, 'rb') as f:
            glb_data = f.read()
        os.unlink(tmp_path)

        glb_b64 = base64.b64encode(glb_data).decode('utf-8')
        elapsed = time.time() - start
        print(f"  ✅ Done in {elapsed:.1f}s | GLB size: {len(glb_data)/1024:.0f} KB")

        return jsonify({
            "status": "success",
            "model_glb": glb_b64,
            "time_seconds": round(elapsed, 1)
        })

    except Exception as e:
        print(f"  ❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)})

# ---------- Start ngrok + Flask ----------
ngrok_token = os.environ.get('NGROK_TOKEN', '')
if not ngrok_token:
    print("❌ ERROR: No ngrok token set! Run Cell 2 first.")
else:
    ngrok.set_auth_token(ngrok_token)
    public_url = ngrok.connect(5000).public_url

    print()
    print("=" * 60)
    print("🚀 Style360 GPU Server is LIVE!")
    print("=" * 60)
    print()
    print(f"📡 Your Server URL: {public_url}")
    print()
    print("📋 Copy this line into your config.php:")
    print(f"   define('COLAB_GPU_URL', '{public_url}');")
    print()
    print("=" * 60)
    print("⚡ Keep this Colab tab open while using Style360!")
    print("=" * 60)

    app.run(port=5000)
"""
