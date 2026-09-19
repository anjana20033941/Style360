/**
 * Style360 — Google GenAI SDK Service (@google/genai)
 * Handles queries to Gemini flash models with styling persona
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

async function generateStylistResponse(prompt) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured in .env');
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are Style360 AI Fashion Stylist, an elite virtual luxury fashion and try-on consultant.
Provide direct, stylish, and enthusiastic fashion advice to the user.
Suggest outfit colors, silhouettes, wedding & event styling, and accessory pairings.
Format your answer in clear, beautiful markdown with bullet points and elegant emojis ✨.
Do not output internal thought steps or self-critiques; respond directly to the user.`;

    // Try models in order: gemini-2.5-flash as requested by user, then gemini-3.6-flash / gemini-flash-latest
    const modelsToTry = [
        'gemini-2.5-flash',
        'gemini-3.6-flash',
        'gemini-flash-latest',
        'gemini-2.5-flash-lite'
    ];

    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7,
                    maxOutputTokens: 1200
                }
            });

            if (response && response.text) {
                return {
                    model: modelName,
                    text: response.text.trim()
                };
            }
        } catch (err) {
            lastError = err;
            // Continue to next model if model not found/deprecated
            continue;
        }
    }

    throw lastError || new Error('Failed to generate response from Gemini AI');
}

// Support CLI invocation: node gemini_service.js "prompt"
if (require.main === module) {
    const inputPrompt = process.argv[2] || 'Suggest a formal wedding suit';
    generateStylistResponse(inputPrompt)
        .then(result => {
            console.log(JSON.stringify({ status: 'success', model: result.model, reply: result.text }));
        })
        .catch(err => {
            console.error(JSON.stringify({ status: 'error', message: err.message }));
            process.exit(1);
        });
}

module.exports = { generateStylistResponse };
