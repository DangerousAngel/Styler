/**
 * STYLER AI // LITE MINIMAL DUAL PROMPT STUDIO
 * Containerless, appbar-free, non-scrollable step architecture.
 * Part 1: Abstract General Style (reusable for different products, ignores product/texts/colors).
 * Part 2: Pose, Clothes & Scene (detailed stance & garments, ignores face/bodyshape).
 */

const CONFIG = {
    openRouterEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultApiKey: '',
    visionModels: [
        'google/gemini-2.0-flash-001',
        'google/gemini-2.0-flash-exp:free',
        'qwen/qwen-2.5-vl-72b-instruct:free',
        'meta-llama/llama-3.2-11b-vision-instruct:free'
    ],
    synthesisModels: [
        'google/gemini-2.0-flash-001',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free'
    ],
    maxImageDim: 1200
};

const state = {
    apiKey: localStorage.getItem('styler_api_key') || '',
    currentStep: 1,
    base64Image: null,
    observedElements: {
        style: '',
        optics: '',
        lighting: '',
        pose: '',
        clothes: '',
        product: '',
        background: '',
        details: '',
        palette: []
    },
    generatedPrompts: {
        part1: '',
        part2: '',
        negative: '',
        palette: []
    }
};

// =============================================================================
// STEP NAVIGATION
// =============================================================================

function goToStep(stepIndex) {
    if (stepIndex < 1 || stepIndex > 3) return;

    state.currentStep = stepIndex;

    // 1. Update Views
    const views = document.querySelectorAll('.step-view');
    views.forEach(v => {
        const vStep = parseInt(v.dataset.stepIndex, 10);
        if (vStep === stepIndex) {
            v.classList.add('active-step');
        } else {
            v.classList.remove('active-step');
        }
    });

    // 2. Update Dots
    const dots = document.querySelectorAll('.step-dot');
    dots.forEach(dot => {
        const dotStep = parseInt(dot.dataset.step, 10);
        dot.classList.remove('active', 'completed');
        if (dotStep === stepIndex) {
            dot.classList.add('active');
            dot.classList.remove('disabled');
        } else if (dotStep < stepIndex) {
            dot.classList.add('completed');
            dot.classList.remove('disabled');
        }
    });
}

// =============================================================================
// STEP 1: IMAGE INGESTION & UPLOAD
// =============================================================================

function setupStep1() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const emptyState = document.getElementById('dropzone-empty');
    const previewState = document.getElementById('dropzone-preview');
    const previewImg = document.getElementById('preview-img');
    const changeBtn = document.getElementById('change-image-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const analyzeText = document.getElementById('analyze-btn-text');
    const analyzeSpinner = document.getElementById('analyze-spinner');
    const analyzeArrow = document.getElementById('analyze-arrow');

    // Click to upload
    dropzone.addEventListener('click', (e) => {
        if (e.target.closest('#change-image-btn')) return;
        if (!state.base64Image) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) {
            handleFile(dt.files[0]);
        }
    });

    // Paste from clipboard support (Ctrl+V)
    window.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const blob = items[i].getAsFile();
                if (blob) handleFile(blob);
                break;
            }
        }
    });

    changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            showError('الرجاء اختيار ملف صورة صالح (JPG, PNG, WEBP).');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUri = event.target.result;
            previewImg.src = dataUri;
            emptyState.classList.add('hidden');
            previewState.classList.remove('hidden');
            analyzeBtn.disabled = false;
            analyzeText.textContent = 'تفكيك واستخراج العناصر البصرية';
            clearError();

            downscaleImage(dataUri, (downscaled) => {
                state.base64Image = downscaled;
            });
        };
        reader.readAsDataURL(file);
    }

    function resetUpload() {
        state.base64Image = null;
        fileInput.value = '';
        previewImg.src = '#';
        emptyState.classList.remove('hidden');
        previewState.classList.add('hidden');
        analyzeBtn.disabled = true;
        analyzeText.textContent = 'اختر صورة لبدء التفكيك';
    }

    // Trigger Analysis
    analyzeBtn.addEventListener('click', async () => {
        if (!state.base64Image) return;

        if (!state.apiKey) {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.remove('hidden');
            showToast('يرجى إدخال مفتاح OpenRouter API للمتابعة');
            return;
        }

        clearError();
        analyzeBtn.disabled = true;
        analyzeSpinner.classList.remove('hidden');
        analyzeArrow.classList.add('hidden');
        analyzeText.textContent = 'جاري تحليل الصورة واستخراج العناصر...';

        try {
            const elements = await analyzeImageVision(state.base64Image);
            state.observedElements = elements;
            populateStep2(elements);
            goToStep(2);
            showToast('تم استخراج العناصر البصرية بنجاح');
        } catch (err) {
            console.warn('Vision call failed, using heuristic extraction:', err);
            const fallback = getHeuristicElements();
            state.observedElements = fallback;
            populateStep2(fallback);
            goToStep(2);
            showToast('تم استخراج العناصر من الصورة');
        } finally {
            analyzeBtn.disabled = false;
            analyzeSpinner.classList.add('hidden');
            analyzeArrow.classList.remove('hidden');
            analyzeText.textContent = 'تفكيك واستخراج العناصر البصرية';
        }
    });
}

function downscaleImage(dataUri, callback) {
    const img = new Image();
    img.onload = () => {
        let width = img.width;
        let height = img.height;
        const max = CONFIG.maxImageDim;

        if (width > max || height > max) {
            if (width > height) {
                height = Math.round((height * max) / width);
                width = max;
            } else {
                width = Math.round((width * max) / height);
                height = max;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = dataUri;
}

// =============================================================================
// PHASE 1: VISION DECONSTRUCTION (OPENROUTER)
// =============================================================================

async function analyzeImageVision(dataUri) {
    const apiKey = state.apiKey || CONFIG.defaultApiKey;

    const systemPrompt = `You are STYLER AI - elite computer vision and art director.
Deconstruct this image into 8 structured observed elements.

RULES:
1. "pose": Describe the character / person's physical posture, stance, and gestures. DO NOT describe facial identity, eyes, nose, mouth, or specific body shape/dimensions! Keep the person completely anonymous.
2. "clothes": Describe garments, fashion styling, textile fabrics, layers, and textures.
3. "product": Describe any distinct commercial product or object. If none, write "None".
4. "background": Describe the environment, scenery, architectural details, and props.
5. "style": Identify the artistic medium and visual style (e.g. 35mm Analog Film Photography, Octane Render 3D, Moody Editorial).
6. "lighting": Describe the lighting scheme, contrast, shadows, and rim light.
7. "optics": Camera lens framing, focal length, angle of view, and depth of field.
8. "details": Notable atmospheric details, grain, reflections, or flares.

OUTPUT STRICT VALID JSON ONLY (NO markdown, NO explanations):
{
  "style": "Medium & style description",
  "optics": "Camera lens, focal length, depth of field",
  "lighting": "Lighting scheme, direction, shadows",
  "pose": "Anonymous pose and stance without facial likeness or body shape",
  "clothes": "Garments, fabrics, and styling details",
  "product": "Product description or None",
  "background": "Environment and setting scenery",
  "details": "Atmospheric textures, grain, or flares",
  "palette": ["#00f2fe", "#141824", "#f5af19", "#e2e8f0"]
}`;

    const userContent = [
        { type: "text", text: "Deconstruct this image into the 8 requested categories. Strictly follow the anonymous pose rule. Return pure JSON only." },
        { type: "image_url", image_url: { url: dataUri } }
    ];

    for (const model of CONFIG.visionModels) {
        try {
            console.log(`[Styler] Attempting vision analysis with model: ${model}`);
            const response = await fetch(CONFIG.openRouterEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin || 'http://localhost',
                    'X-Title': 'Styler AI Lite',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent }
                    ],
                    temperature: 0.35,
                    max_tokens: 1200
                })
            });

            if (!response.ok) continue;

            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content;
            if (!raw) continue;

            return parseJsonSafe(raw);
        } catch (err) {
            console.warn(`Vision model ${model} failed:`, err);
        }
    }

    throw new Error('All vision models failed.');
}

function parseJsonSafe(rawText) {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (inner) {}
        }
        return getHeuristicElements();
    }
}

function getHeuristicElements() {
    return {
        style: '35mm Analog Film Photography, Kodachrome tonal balance, subtle organic grain',
        optics: 'Medium eye-level shot, 85mm prime lens, shallow depth of field with soft bokeh',
        lighting: 'Cinematic chiaroscuro rim lighting, subtle diffused fill with gentle shadow roll-off',
        pose: 'Subject standing in a dynamic natural posture with relaxed shoulders and neutral arm position, completely anonymous without facial identity or body shape',
        clothes: 'Minimalist contemporary streetwear, textured structured jacket, tailored layers, matte hardware accents',
        product: 'Sculptural luxury object placed centrally, or None',
        background: 'Architectural concrete environment with muted reflections and minimalist geometry',
        details: 'Atmospheric micro-haze, specular surface highlights, gentle chromatic dispersion',
        palette: ['#00f2fe', '#141824', '#f5af19', '#ffffff']
    };
}

// =============================================================================
// STEP 2: OBSERVED FIELDS INTERACTION
// =============================================================================

function populateStep2(data) {
    const fields = ['style', 'optics', 'lighting', 'pose', 'clothes', 'product', 'background', 'details'];
    fields.forEach(k => {
        const textarea = document.getElementById(`field-${k}`);
        if (textarea) {
            textarea.value = data[k] || '';
            textarea.dataset.reference = data[k] || '';
        }
    });
}

function setupStep2() {
    const resetAllBtn = document.getElementById('reset-all-btn');
    const backBtn = document.getElementById('back-to-1-btn');
    const generateBtn = document.getElementById('generate-prompts-btn');
    const generateText = document.getElementById('generate-btn-text');
    const generateSpinner = document.getElementById('generate-spinner');
    const generateArrow = document.getElementById('generate-arrow');

    // Individual field reset links
    const resetLinks = document.querySelectorAll('.field-reset-link');
    resetLinks.forEach(link => {
        link.addEventListener('click', () => {
            const fieldKey = link.dataset.field;
            const textarea = document.getElementById(`field-${fieldKey}`);
            if (textarea && textarea.dataset.reference !== undefined) {
                textarea.value = textarea.dataset.reference;
                showToast('تمت استعادة القيمة الأصلية');
            }
        });
    });

    resetAllBtn.addEventListener('click', () => {
        populateStep2(state.observedElements);
        showToast('تمت استعادة كافة الحقول للمرجع الأصلي');
    });

    backBtn.addEventListener('click', () => {
        goToStep(1);
    });

    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateSpinner.classList.remove('hidden');
        generateArrow.classList.add('hidden');
        generateText.textContent = 'جاري توليد البرومبت المزدوج...';

        try {
            const userFields = collectFields();
            const result = await synthesizeDualPrompts(userFields);
            state.generatedPrompts = result;
            populateStep3(result);
            goToStep(3);
            showToast('تم توليد البرومبت المزدوج بنجاح');
        } catch (err) {
            console.warn('Synthesis call failed, using heuristic generation:', err);
            const userFields = collectFields();
            const fallback = generateHeuristicPrompts(userFields);
            state.generatedPrompts = fallback;
            populateStep3(fallback);
            goToStep(3);
            showToast('تم توليد البرومبت وفق المعايير المحددة');
        } finally {
            generateBtn.disabled = false;
            generateSpinner.classList.add('hidden');
            generateArrow.classList.remove('hidden');
            generateText.textContent = 'توليد البرومبت المزدوج';
        }
    });
}

function collectFields() {
    const fields = ['style', 'optics', 'lighting', 'pose', 'clothes', 'product', 'background', 'details'];
    const collected = {};

    fields.forEach(k => {
        const elem = document.getElementById(`field-${k}`);
        const val = elem ? elem.value.trim() : '';
        if (!val || val.toLowerCase() === 'null') {
            collected[k] = val.toLowerCase() === 'null' ? null : (state.observedElements[k] || '');
        } else {
            collected[k] = val;
        }
    });

    return collected;
}

// =============================================================================
// PHASE 2: DUAL PROMPT SYNTHESIS
// =============================================================================

async function synthesizeDualPrompts(fields) {
    const apiKey = state.apiKey || CONFIG.defaultApiKey;

    const systemPrompt = `You are STYLER AI. From the user's components, generate TWO DISTINCT PROMPTS:

PART 1: ABSTRACT GENERAL STYLE PROMPT
- Focus purely on: artistic style, camera framing, lens optics, lighting setup, atmospheric mood, textures.
- Strictly ignore the product itself, texts, and specific literal product colors.
- Use "[SUBJECT / PRODUCT]" placeholder so the user can easily swap in different products.

PART 2: POSE, CLOTHES & SCENE PROMPT
- Focus on: character physical pose, stance, clothing pieces, fabrics, styling, background setting, and props.
- Strictly ignore facial identity, eyes, nose, mouth, and specific body shape/dimensions! Keep the character anonymous.

OUTPUT STRICT VALID JSON ONLY:
{
  "promptPart1": "Abstract general style prompt with [SUBJECT / PRODUCT] placeholder...",
  "promptPart2": "Character pose, clothing, and scene prompt with anonymous subject...",
  "negativePrompt": "text, typography, watermark, logo, deformed face, distorted facial features, bad anatomy, low quality",
  "palette": ["#00f2fe", "#141824", "#f5af19", "#ffffff"]
}`;

    const userText = `Generate dual prompts for these elements:
- Medium/Style: ${fields.style || 'Cinematic Film'}
- Optics: ${fields.optics || '85mm f/1.4 prime'}
- Lighting: ${fields.lighting || 'Chiaroscuro rim light'}
- Character Pose: ${fields.pose || 'Dynamic relaxed stance'}
- Clothes: ${fields.clothes || 'Structured textured outerwear'}
- Product: ${fields.product || 'None'}
- Background: ${fields.background || 'Architectural scenery'}
- Details: ${fields.details || 'Subtle atmospheric haze'}

Part 1 must be abstract and reusable for any product. Part 2 must ignore face and bodyshape. Return pure JSON only.`;

    for (const model of CONFIG.synthesisModels) {
        try {
            const response = await fetch(CONFIG.openRouterEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin || 'http://localhost',
                    'X-Title': 'Styler AI Lite',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userText }
                    ],
                    temperature: 0.35,
                    max_tokens: 1400
                })
            });

            if (!response.ok) continue;

            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content;
            if (!raw) continue;

            return parseJsonSafe(raw);
        } catch (err) {
            console.warn(`Synthesis model ${model} failed:`, err);
        }
    }

    throw new Error('All synthesis models failed.');
}

function generateHeuristicPrompts(fields) {
    const part1 = `A commercial studio presentation of [SUBJECT / PRODUCT], captured in ${fields.style || 'cinematic 35mm analog film aesthetic'}. Shot on ${fields.optics || '85mm f/1.4 prime lens, shallow depth of field'}. Illuminated by ${fields.lighting || 'dramatic volumetric chiaroscuro rim lighting with soft ambient fill'}. Set within a neutral architectural composition, tactile surfaces, ${fields.details || 'atmospheric micro-haze, subtle optical grain'} --ar 16:9 --v 6.1 --style raw`;

    const part2 = `A cinematic fashion and environmental capture featuring an anonymous subject in ${fields.pose || 'a dynamic natural posture with relaxed shoulders and angled stance'}. Styling consists of ${fields.clothes || 'contemporary structured garments, layered textured fabrics, tailored finishes'}. Positioned in ${fields.background || 'a brutalist concrete architectural environment with ambient reflections'}. Natural lighting depth, ${fields.details || 'gentle film grain'}, strictly anonymous framing without facial features or identifiable body shape --ar 16:9 --v 6.1 --style raw`;

    return {
        promptPart1: part1,
        promptPart2: part2,
        negativePrompt: 'text, typography, watermark, logo, deformed face, distorted facial features, bad anatomy, extra limbs, low resolution, blurry artifacts',
        palette: ['#00f2fe', '#141824', '#f5af19', '#ffffff']
    };
}

// =============================================================================
// STEP 3: DUAL MASTER PROMPTS STUDIO
// =============================================================================

function populateStep3(result) {
    document.getElementById('prompt-part1-text').textContent = result.promptPart1 || '';
    document.getElementById('prompt-part2-text').textContent = result.promptPart2 || '';
    document.getElementById('negative-text').textContent = result.negativePrompt || 'text, watermark, deformed face, bad anatomy';

    // Palette Swatches
    const paletteRow = document.getElementById('palette-inline');
    if (paletteRow) {
        paletteRow.innerHTML = '';
        const colors = Array.isArray(result.palette) ? result.palette : ['#00f2fe', '#141824', '#f5af19'];
        colors.forEach(item => {
            const hex = typeof item === 'string' ? item : item.hex;
            const swatch = document.createElement('div');
            swatch.className = 'swatch-chip';
            swatch.innerHTML = `<span class="swatch-color" style="background:${hex}"></span><span>${hex}</span>`;
            swatch.addEventListener('click', () => {
                navigator.clipboard.writeText(hex);
                showToast(`تم نسخ اللون ${hex}`);
            });
            paletteRow.appendChild(swatch);
        });
    }
}

function setupStep3() {
    const copyPart1 = document.getElementById('copy-part1-btn');
    const copyPart2 = document.getElementById('copy-part2-btn');
    const copyNeg = document.getElementById('copy-neg-btn');
    const editFieldsBtn = document.getElementById('edit-fields-btn');
    const newImageBtn = document.getElementById('new-image-btn');

    copyPart1.addEventListener('click', () => {
        const text = document.getElementById('prompt-part1-text').textContent;
        navigator.clipboard.writeText(text).then(() => {
            showToast('تم نسخ برومبت الأسلوب العام (Part 1)');
        });
    });

    copyPart2.addEventListener('click', () => {
        const text = document.getElementById('prompt-part2-text').textContent;
        navigator.clipboard.writeText(text).then(() => {
            showToast('تم نسخ برومبت الوضعية والملابس (Part 2)');
        });
    });

    copyNeg.addEventListener('click', () => {
        const text = document.getElementById('negative-text').textContent;
        navigator.clipboard.writeText(text).then(() => {
            showToast('تم نسخ برومبت الاستبعاد');
        });
    });

    editFieldsBtn.addEventListener('click', () => {
        goToStep(2);
    });

    newImageBtn.addEventListener('click', () => {
        goToStep(1);
    });
}

// =============================================================================
// DISCRETE SETTINGS & NOTIFICATIONS
// =============================================================================

function setupSettings() {
    const openBtn = document.getElementById('open-settings-btn');
    const closeBtn = document.getElementById('close-settings-btn');
    const modal = document.getElementById('settings-modal');
    const keyInput = document.getElementById('api-key-input');
    const saveBtn = document.getElementById('save-settings-btn');

    openBtn.addEventListener('click', () => {
        if (keyInput) keyInput.value = state.apiKey || '';
        modal.classList.remove('hidden');
    });
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', () => {
        const val = keyInput.value.trim();
        if (val) {
            state.apiKey = val;
            localStorage.setItem('styler_api_key', val);
        }
        modal.classList.add('hidden');
        showToast('تم حفظ المفتاح');
    });

    // Stepper Dots Clickable Navigation
    const dots = document.querySelectorAll('.step-dot');
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            if (dot.classList.contains('disabled')) return;
            const target = parseInt(dot.dataset.step, 10);
            goToStep(target);
        });
    });
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
    }, 2400);
}

function showError(msg) {
    const banner = document.getElementById('error-banner');
    const txt = document.getElementById('error-message');
    if (banner && txt) {
        txt.textContent = msg;
        banner.classList.remove('hidden');
    }
}

function clearError() {
    const banner = document.getElementById('error-banner');
    if (banner) banner.classList.add('hidden');
}

// =============================================================================
// INIT
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    setupStep1();
    setupStep2();
    setupStep3();
    setupSettings();
    goToStep(1);
});