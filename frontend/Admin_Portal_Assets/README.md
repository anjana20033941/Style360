# Style360 — AI-Powered Virtual Try-On Platform

An advanced AI-powered Virtual Try-On web platform built with PHP, JavaScript, and Python. Features realistic 2D garment drape synthesis, interactive 360° 3D neural mesh avatars, automated gender matching guards, and a multimodal Gemini fashion stylist—engineered entirely using zero-cost, open-source tools and high-performance APIs.

---

## ✨ Key Features

- **⚡ 2D Neural Virtual Try-On**: Seamlessly drapes custom tops, bottoms, and full outfits onto user or catalog models with natural proportions, realistic fabric textures, and shadow synthesis.
- **🌐 360° Interactive 3D Avatar Studio**: Reconstructs full 3D GLB avatars from 2D try-on results using Tripo3D V3 and Modal neural pipelines with Three.js orbit controls, auto-bounding box camera zoom, and high-DPI antialiasing.
- **🛡️ Smart Safety & Gender Matching**:
  - Gemini Vision AI auto-classifies model photos and custom garments (detecting tops, bottoms, full sets).
  - Built-in gender mismatch prevention guards against cross-gender try-on conflicts while auto-aligning matching styles.
  - NSFW content filter blocks inappropriate uploads.
- **👗 Dynamic Garment Coverage**: Select between "Top Only", "Bottom Only", or "Full Outfit / Both" with coverage-aware API payload routing.
- **💎 Gemini Multimodal Fashion Stylist**: Real-time interactive AI stylist chatbot providing personalized fashion advice, skin tone matching, and wedding outfit curation.
- **📜 History & Request Tracking**: Real-time generation archive, 3D GLB model gallery, and custom tailoring request workflow tracking.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Modern Vanilla JavaScript (ES6+), CSS3 Variables & Flex/Grid, Three.js (WebGL, OrbitControls, GLTFLoader).
- **Backend**: PHP 8.2+ RESTful API endpoints, cURL async streaming, PDO MySQL.
- **AI & 3D Pipelines**:
  - **Fal.ai VTON** (`fal-ai/fashn/tryon/v1.6`) for high-fidelity fabric drape.
  - **Tripo3D V3** API for fast, high-topology 3D neural mesh generation.
  - **Google Gemini Vision API** for instant safety, category, and gender classification.
  - **Modal.com / TRELLIS** GPU pipelines for fallback 3D reconstruction.
- **Storage & Database**: MySQL (`style360_v2`) + Cloudflare R2 Object Storage for GLB and high-resolution assets.

---

## 📁 Project Architecture

```
myStyle360Project/
├── backend/                  # PHP API endpoints & AI services
│   ├── FalService.php        # Fal.ai VTON engine & composite garment merger
│   ├── generate_3d.php       # Tripo3D V3 model generation & local caching
│   ├── proxy_glb.php         # CORS-safe GLB binary stream proxy
│   ├── tryon.php             # Unified virtual try-on API router
│   ├── validate_gender.php   # Vision AI model photo validation guard
│   ├── verify_garment.php    # Vision AI garment safety & category verification
│   ├── config.php            # Environment loader & API credentials
│   └── database.php          # PDO MySQL database connection
├── frontend/                 # Client-side web application
│   ├── index.html            # Main landing & Virtual Try-On Studio
│   ├── history.html          # Try-on history archive & lightbox
│   ├── my-3d-models.html     # Dedicated 3D model gallery & orbit viewer
│   ├── js/
│   │   ├── home.js           # Try-on studio controller & validation logic
│   │   ├── studio.js         # Gatekeeper, custom upload & photo verification
│   │   ├── viewer3d.js       # Three.js 3D viewport & camera controls
│   │   ├── chatbot.js        # Gemini AI stylist widget controller
│   │   └── auth.js           # User session & profile management
│   ├── css/                  # Styling & responsive design
│   └── images/               # Silhouettes, badges, and catalog assets
├── uploads/                  # Catalog display & fal garment images
├── colab/                    # Google Colab GPU scripts & server wrappers
├── router.php                # Local development server routing
├── .env.example              # Environment variables template
└── README.md                 # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **PHP 8.1+** with `pdo_mysql`, `curl`, `gd`, `openssl`, and `fileinfo` extensions enabled.
- **MySQL 8.0+** or MariaDB (via XAMPP, WampServer, or native).
- Web browser with WebGL support (Chrome, Edge, Firefox, Safari).

### 2. Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/anjana20033941/Style360.git
   cd Style360
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in your API credentials:
   ```bash
   cp .env.example .env
   ```
   Configure the following keys in `.env`:
   - `DATABASE_URL` (e.g. `mysql://root:@localhost:3306/style360_v2`)
   - `GEMINI_API_KEY` (from Google AI Studio)
   - `FAL_KEY` (from Fal.ai)
   - `TRIPO3D_API_KEY` (from Tripo3D Platform)

3. **Database Initialization:**
   Import `backend/schema.sql` into your MySQL database (`style360_v2`).

4. **Start Development Server:**
   ```bash
   php -S localhost:8000 router.php
   ```
   Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

---

## 📄 License & Academic Attribution
Developed as part of the Style360 Project (Group 8). See included project proposal documents for academic background and system specifications.
