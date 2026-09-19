const { GoogleGenAI } = require(require('path').join(__dirname, '..', 'node_modules', '@google/genai'));
const path = require('path');
const fs = require('fs');

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

function cleanJsonText(raw) {
    if (!raw) return '{}';
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return text;
}

async function detectGender(reqFilePath) {
    if (!apiKey) {
        return { status: 'error', message: 'Missing GEMINI_API_KEY', detected_gender: 'unknown', confidence: 0 };
    }

    const reqData = JSON.parse(fs.readFileSync(reqFilePath, 'utf8'));
    const { imagePath, imageBase64 } = reqData;

    let imagePart;
    if (imageBase64 && imageBase64.startsWith('data:image')) {
        const matches = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
        if (matches) {
            imagePart = { inlineData: { mimeType: matches[1], data: matches[2] } };
        } else {
            return { status: 'error', message: 'Invalid base64 format', detected_gender: 'unknown', confidence: 0 };
        }
    } else if (imagePath && fs.existsSync(imagePath)) {
        const buffer = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
        imagePart = { inlineData: { mimeType: mime, data: buffer.toString('base64') } };
    } else {
        return { status: 'error', message: 'No image found', detected_gender: 'unknown', confidence: 0 };
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = 'Analyze this image carefully. It may depict either a human person or an apparel/clothing/fashion item. Determine: 1. Target gender: Is this subject or outfit intended for a "male" (man/boy/men\'s fashion) or "female" (woman/girl/women\'s fashion)? 2. What is the subject: "person" or "clothing"? Return ONLY a valid JSON object without markdown fences: {"detected_gender": "male"|"female"|"unknown", "item_type": "person"|"clothing"|"other", "confidence": 0.95, "is_person": true, "summary": "brief description"}';

    let lastError = '';
    const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-flash-lite-latest'];
    for (const m of models) {
        try {
            const res = await ai.models.generateContent({
                model: m,
                contents: [imagePart, prompt],
                config: { temperature: 0.1, maxOutputTokens: 250 }
            });
            if (res && res.text) {
                const cleaned = cleanJsonText(res.text);
                let parsed = null;
                try {
                    parsed = JSON.parse(cleaned);
                } catch (pe) {
                    const match = res.text.match(/\{[\s\S]*\}/);
                    if (match) {
                        try { parsed = JSON.parse(match[0]); } catch(e2) {}
                    }
                }

                if (parsed && (parsed.detected_gender || parsed.gender)) {
                    const g = (parsed.detected_gender || parsed.gender).toLowerCase();
                    const normGender = (g === 'man' || g === 'men') ? 'male' : ((g === 'woman' || g === 'women') ? 'female' : g);
                    const itemType = parsed.item_type || (parsed.is_person === false ? 'clothing' : 'person');
                    return {
                        status: 'success',
                        detected_gender: normGender,
                        item_type: itemType,
                        confidence: parsed.confidence || 0.95,
                        is_person: itemType === 'person' || parsed.is_person === true,
                        summary: parsed.summary || '',
                        model: m
                    };
                }

                // Keyword heuristic fallback if JSON parsing failed
                const lower = res.text.toLowerCase();
                const isMale = /\bmale\b|\bman\b|\bboy\b|\bgentleman\b|\bmen's\b/.test(lower);
                const isFemale = /\bfemale\b|\bwoman\b|\bgirl\b|\blady\b|\bwomen's\b/.test(lower);
                if (isMale && !isFemale) {
                    return { status: 'success', detected_gender: 'male', confidence: 0.90, is_person: true, summary: 'Male subject/outfit detected', model: m };
                } else if (isFemale && !isMale) {
                    return { status: 'success', detected_gender: 'female', confidence: 0.90, is_person: true, summary: 'Female subject/outfit detected', model: m };
                }
            }
        } catch (e) {
            lastError = m + ': ' + e.message;
        }
    }

    return { status: 'error', message: lastError || 'All models failed', detected_gender: 'unknown', confidence: 0 };
}

const reqFile = process.argv[2];
if (!reqFile || !fs.existsSync(reqFile)) {
    console.log(JSON.stringify({ status: 'error', message: 'No input file', detected_gender: 'unknown' }));
    process.exit(1);
}

detectGender(reqFile)
    .then(result => {
        console.log(JSON.stringify(result));
        process.exitCode = 0;
    })
    .catch(err => {
        console.log(JSON.stringify({ status: 'error', message: err.message, detected_gender: 'unknown' }));
        process.exitCode = 0;
    });