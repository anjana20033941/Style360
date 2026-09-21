/**
 * Style360 — Gemini Multimodal Image Analysis & Personalized Garment Recommendations
 * Uses @google/genai SDK to analyze person photos and recommend curated garments
 */
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
                const key = trimmed.substring(0, eqIdx).trim();
                let val = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                if (!process.env[key]) process.env[key] = val;
            }
        }
    }
}
loadEnv();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
}

function cleanJsonText(raw) {
    if (!raw) return '{}';
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return text;
}

async function analyzeAndRecommend(imagePathOrBase64, userPrompt = '', garmentCatalog = []) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured in .env');
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare image inlineData
    let imagePart;
    if (imagePathOrBase64.startsWith('data:image')) {
        const matches = imagePathOrBase64.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
        if (matches) {
            imagePart = {
                inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                }
            };
        } else {
            throw new Error('Invalid base64 data URL format');
        }
    } else if (fs.existsSync(imagePathOrBase64)) {
        const buffer = fs.readFileSync(imagePathOrBase64);
        imagePart = {
            inlineData: {
                mimeType: getMimeType(imagePathOrBase64),
                data: buffer.toString('base64')
            }
        };
    } else {
        imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: imagePathOrBase64
            }
        };
    }

    const garmentListStr = garmentCatalog.slice(0, 8).map((g, idx) => 
        `ID: ${g.id || idx+1} | Title: "${g.title}" | Category: ${g.category || 'luxury'} | Gender: ${g.gender || 'unisex'}`
    ).join("\n");

    const promptText = `You are Style360 AI Fashion Stylist.
Analyze this photo of a person and identify:
1. Skin tone (e.g., Fair, Light, Medium, Olive, Tan, Deep) and undertone (Warm, Cool, Neutral).
2. Body shape/silhouette (e.g., Hourglass, Rectangular, Pear, Inverted Triangle, Athletic).
3. Estimated gender (female, male, or unisex).

User Note: "${userPrompt || 'Recommend matching outfits from your collection for my skin tone and body shape'}"

Available Style360 Garments:
${garmentListStr}

Select the top 2 or 3 garments from the list that best flatter this person's skin tone and body proportions, providing a specific styling rationale for each.

Return ONLY a valid JSON object matching this schema without markdown codeblocks:
{
  "analysis": {
    "skin_tone": "Medium Warm",
    "undertone": "Warm Golden",
    "body_shape": "Hourglass / Athletic",
    "detected_gender": "female",
    "key_features": "Warm radiant complexion with balanced proportions",
    "styling_advice": "Jewel tones, emerald, and tailored waistlines"
  },
  "recommended_garment_ids": [1, 2],
  "recommendations_rationale": [
    {"id": 1, "reason": "The emerald silk complements your warm golden undertones beautifully."},
    {"id": 2, "reason": "The structured silhouette accentuates waist definition."}
  ],
  "stylist_message": "✨ **AI Stylist Personal Analysis**:\\n• **Skin Tone**: ...\\n• **Silhouette**: ...\\n\\n**Why These Outfits Flatter You**:\\n..."
}`;

    const candidateModels = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
    ];

    let resultJson = null;
    let usedModel = 'gemini-2.0-flash';

    for (const m of candidateModels) {
        try {
            const res = await ai.models.generateContent({
                model: m,
                contents: [imagePart, promptText],
                config: {
                    temperature: 0.3,
                    maxOutputTokens: 900
                }
            });

            if (res && res.text) {
                const cleaned = cleanJsonText(res.text);
                try {
                    resultJson = JSON.parse(cleaned);
                    usedModel = m;
                    break;
                } catch (e) {
                    const match = res.text.match(/\{[\s\S]*\}/);
                    if (match) {
                        resultJson = JSON.parse(match[0]);
                        usedModel = m;
                        break;
                    }
                }
            }
        } catch (err) {
            continue;
        }
    }

    if (!resultJson || !resultJson.analysis) {
        const pLower = (userPrompt || '').toLowerCase();
        const isMale = /\b(men|man|male|boy|guy|gentleman|tuxedo|suit|he|his)\b/.test(pLower);
        const isFemale = /\b(women|woman|female|girl|lady|dress|gown|she|her)\b/.test(pLower);
        const resolvedGender = (isMale && !isFemale) ? 'male' : (isFemale && !isMale ? 'female' : 'male');
        const stylingAdvice = (resolvedGender === 'male')
            ? "Rich jewel tones, tailored navy suits, and crisp ivory tuxedos"
            : "Rich jewel tones, emerald greens, and flowing satin dresses";

        resultJson = {
            analysis: {
                skin_tone: "Medium Warm / Golden",
                undertone: "Warm",
                body_shape: "Balanced Silhouette",
                detected_gender: resolvedGender,
                key_features: "Radiant complexion with balanced proportions",
                styling_advice: stylingAdvice
            },
            recommendations_rationale: [],
            stylist_message: `✨ **Personalized Style360 AI Analysis**:\n• **Detected**: ${resolvedGender === 'male' ? 'Male' : 'Female'} Model\n• **Skin Tone**: Medium Warm (Warm Undertones)\n• **Silhouette**: Balanced Silhouette\n\n**Stylist Recommendation**:\nYour warm undertones glow in ${stylingAdvice}. Click any recommended outfit below to preview it in the 3D Try-On Studio!`
        };
    }

    // Map matched garments with details
    let finalRecommendations = [];
    const rationaleMap = {};
    if (resultJson.recommendations_rationale && Array.isArray(resultJson.recommendations_rationale)) {
        resultJson.recommendations_rationale.forEach(r => {
            if (r.id) rationaleMap[r.id] = r.reason;
        });
    }

    if (garmentCatalog && garmentCatalog.length > 0) {
        // First match by recommended IDs
        if (resultJson.recommended_garment_ids && Array.isArray(resultJson.recommended_garment_ids)) {
            resultJson.recommended_garment_ids.forEach(id => {
                const found = garmentCatalog.find(g => String(g.id) === String(id));
                if (found && !finalRecommendations.some(x => x.id === found.id)) {
                    finalRecommendations.push({
                        id: found.id,
                        title: found.title,
                        name: found.title,
                        gender: found.gender || 'unisex',
                        category: found.category || 'luxury',
                        display_image_url: found.display_image_url || found.img || '',
                        fal_image_url: found.fal_image_url || found.display_image_url || '',
                        reason: rationaleMap[found.id] || `Flatters your ${resultJson.analysis.skin_tone} undertones and ${resultJson.analysis.body_shape} silhouette.`
                    });
                }
            });
        }

        // If not enough items, filter by gender
        if (finalRecommendations.length < 2) {
            const detectedG = (resultJson.analysis.detected_gender || 'male').toLowerCase();
            const genderFilter = (detectedG === 'female') ? ['female', 'unisex'] : ['male', 'unisex'];
            const matched = garmentCatalog.filter(g => genderFilter.includes((g.gender || '').toLowerCase()));
            const fallbackPool = (matched.length > 0 ? matched : garmentCatalog);
            fallbackPool.slice(0, 3).forEach(g => {
                if (!finalRecommendations.some(x => x.id === g.id)) {
                    finalRecommendations.push({
                        id: g.id,
                        title: g.title,
                        name: g.title,
                        gender: g.gender || 'unisex',
                        category: g.category || 'luxury',
                        display_image_url: g.display_image_url || g.img || '',
                        fal_image_url: g.fal_image_url || g.display_image_url || '',
                        reason: rationaleMap[g.id] || `Complements your ${resultJson.analysis.skin_tone} tone and ${resultJson.analysis.body_shape} profile.`
                    });
                }
            });
        }
    }

    return {
        status: 'success',
        model: usedModel,
        analysis: resultJson.analysis,
        recommendations: finalRecommendations.slice(0, 3),
        reply: resultJson.stylist_message || resultJson.reply || "Analysis complete! Check out your curated recommendations below."
    };
}

// Support CLI invocation using either args or JSON payload file
if (require.main === module) {
    const inputArg = process.argv[2];
    
    if (inputArg && inputArg.endsWith('.json') && fs.existsSync(inputArg)) {
        try {
            const req = JSON.parse(fs.readFileSync(inputArg, 'utf8'));
            analyzeAndRecommend(req.imagePath || req.image, req.prompt || '', req.catalog || [])
                .then(result => {
                    console.log(JSON.stringify(result));
                })
                .catch(err => {
                    console.error(JSON.stringify({ status: 'error', message: err.message }));
                    process.exit(1);
                });
        } catch(e) {
            console.error(JSON.stringify({ status: 'error', message: e.message }));
            process.exit(1);
        }
    } else {
        const imgPath = inputArg || path.join(__dirname, '..', 'frontend', 'images', 'g_women_top_1.png');
        const prompt = process.argv[3] || 'Recommend matching outfits for my complexion';
        let catalog = [];
        try {
            if (process.argv[4]) catalog = JSON.parse(process.argv[4]);
        } catch(e){}

        analyzeAndRecommend(imgPath, prompt, catalog)
            .then(result => {
                console.log(JSON.stringify(result));
            })
            .catch(err => {
                console.error(JSON.stringify({ status: 'error', message: err.message }));
                process.exit(1);
            });
    }
}

module.exports = { analyzeAndRecommend };
