import { 
    GoogleGenAI, 
    Chat, 
    Modality, 
    LiveServerMessage, 
    Blob as GenAIBlob, 
    HarmCategory, 
    HarmBlockThreshold, 
    GenerateContentResponse 
} from "@google/genai";
import { marked } from 'marked';
import hljs from 'highlight.js';

// --- CONFIGURATION ---
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

// --- SAFETY FILTERS ---
// Strict safety filters for a health application
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
];

// --- DATA CHUNKING & EMBEDDINGS (SIMULATED) ---
// In a production app, this would query a Vector DB (e.g., Pinecone, Chroma).
// Here we simulate the "Chunking" and "Retrieval" phase with local validated knowledge chunks.
const KNOWLEDGE_CHUNKS = [
    {
        id: 'safety_protocol',
        text: "SAFETY FIRST: Do not provide diagnosis. If user asks for diagnosis, refer to a doctor immediately. Do not interpret lab results definitively."
    },
    {
        id: 'medication_policy',
        text: "MEDICATION: Do not recommend specific prescription dosages. Explain mechanism of action (how it works) and general side effects only."
    },
    {
        id: 'nutrition_wellness',
        text: "NUTRITION: Focus on whole foods, balanced diet, and hydration. Avoid extreme diet advice. Emphasize that individual needs vary."
    },
    {
        id: 'emergency',
        text: "EMERGENCY: If the user mentions chest pain, severe bleeding, or suicidal thoughts, strictly advise calling emergency services (911/999) immediately."
    }
];

// Simple "Embedding/Retrieval" simulation using keyword overlap
function retrieveRelevantContext(query: string): string {
    const tokens = query.toLowerCase().split(/\s+/);
    let bestChunk = "";
    let maxScore = 0;

    KNOWLEDGE_CHUNKS.forEach(chunk => {
        const chunkTokens = chunk.text.toLowerCase().split(/\s+/);
        const intersection = tokens.filter(t => chunkTokens.includes(t));
        const score = intersection.length; // Simple overlap score
        
        if (score > 0 && score > maxScore) {
            maxScore = score;
            bestChunk = chunk.text;
        }
    });

    // If no specific match, return safety protocol as default context
    return bestChunk || KNOWLEDGE_CHUNKS[0].text;
}

// --- DOM ELEMENT REFERENCES ---
const dom = {
    header: {
        newChatBtn: document.getElementById('new-chat-btn') as HTMLButtonElement,
        themeToggleBtn: document.getElementById('theme-toggle-btn') as HTMLButtonElement,
        sunIcon: document.querySelector('.sun-icon') as HTMLElement,
        moonIcon: document.querySelector('.moon-icon') as HTMLElement,
    },
    chat: {
        container: document.getElementById('chat-container') as HTMLElement,
        welcomeContainer: document.getElementById('welcome-container') as HTMLElement,
        promptSuggestions: document.getElementById('prompt-suggestions') as HTMLElement,
        statusIndicator: document.getElementById('status-indicator') as HTMLDivElement, 
    },
    form: {
        form: document.getElementById('chat-form') as HTMLFormElement,
        inputRow: document.getElementById('input-row') as HTMLDivElement,
        promptInput: document.getElementById('prompt-input') as HTMLTextAreaElement,
        submitBtn: document.getElementById('submit-btn') as HTMLButtonElement,
        sendIcon: document.querySelector('.send-icon') as HTMLElement,
        loader: document.querySelector('.loader') as HTMLDivElement,
        imageGenBtn: document.getElementById('image-gen-btn') as HTMLButtonElement,
        thinkingModeBtn: document.getElementById('thinking-mode-btn') as HTMLButtonElement,
    },
    file: {
        uploadBtn: document.getElementById('upload-btn') as HTMLButtonElement,
        fileUpload: document.getElementById('file-upload') as HTMLInputElement,
        preview: document.getElementById('file-preview') as HTMLDivElement,
    },
    camera: {
        btn: document.getElementById('camera-btn') as HTMLButtonElement,
        modal: document.getElementById('camera-modal') as HTMLDivElement,
        view: document.getElementById('camera-view') as HTMLVideoElement,
        canvas: document.getElementById('camera-canvas') as HTMLCanvasElement,
        captureBtn: document.getElementById('capture-btn') as HTMLButtonElement,
        closeBtn: document.getElementById('close-camera-btn') as HTMLButtonElement,
    },
    voice: {
        btn: document.getElementById('voice-btn') as HTMLButtonElement,
        micIcon: document.querySelector('.mic-icon') as HTMLElement,
        stopIcon: document.querySelector('.stop-icon') as HTMLElement,
        visualizerContainer: document.getElementById('visualizer-container') as HTMLDivElement,
        visualizerCanvas: document.getElementById('voice-visualizer') as HTMLCanvasElement,
        controls: document.getElementById('visualizer-controls') as HTMLDivElement,
        muteBtn: document.getElementById('mute-btn') as HTMLButtonElement,
        unmutedIcon: document.querySelector('.unmuted-icon') as HTMLElement,
        mutedIcon: document.querySelector('.muted-icon') as HTMLElement,
        volumeSlider: document.getElementById('volume-slider') as HTMLInputElement,
    },
    imageViewer: {
        modal: document.getElementById('image-viewer-modal') as HTMLDivElement,
        content: document.getElementById('image-viewer-content') as HTMLImageElement,
        closeBtn: document.querySelector('.close-image-viewer') as HTMLSpanElement,
    },
};

// --- STATE MANAGEMENT ---
let chat: Chat;
let attachedFile: { name: string; data: string; mimeType: string; } | null = null;
let isLoading = false;
let isThinkingMode = false;

// Voice / Live API state
let liveSessionPromise: Promise<any> | null = null;
let isRecording = false;
let localStream: MediaStream | null = null;
let inputAudioContext: AudioContext;
let outputAudioContext: AudioContext;
let inputGainNode: GainNode;
let outputGainNode: GainNode;
let analyserNode: AnalyserNode;
let visualizerFrameId: number;
let nextStartTime = 0;
let playingSources = new Set<AudioBufferSourceNode>();


// --- INITIALIZATION ---
function initializeApp() {
    if (!process.env.API_KEY) {
        handleError("API_KEY environment variable not set. Please set it in the environment.");
        return;
    }
    
    // Configure Markdown renderer
    marked.setOptions({
        highlight: (code, lang) => {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
    } as any);
    
    initializeTheme();
    attachEventListeners();
    startNewChat();
    autoResizeTextarea();
}

// --- STRUCTURED PROMPTING ---
// Using XML tags to clearly define role, constraints, and intent.
const SYSTEM_INSTRUCTION = `
<ROLE>
You are Friendly MBBS AI, an ethical, green, and highly-constrained multi-modal health and wellness advisor.
</ROLE>

<OBJECTIVE>
Provide helpful, scientific information about health, biology, nutrition, and fitness while strictly avoiding the unauthorized practice of medicine.
</OBJECTIVE>

<CONSTRAINTS>
1. DIAGNOSIS: You MUST NOT provide a medical diagnosis for a specific individual.
2. PRESCRIPTION: You MUST NOT recommend specific prescription medications or dosages for treatment.
3. EMERGENCY: If a user describes life-threatening symptoms (chest pain, severe bleeding, difficulty breathing), STOP and tell them to call emergency services.
4. TONE: Be professional, empathetic, and scientifically accurate. Use simple language.
</CONSTRAINTS>

<FORMAT>
- Use Markdown for formatting.
- If providing medical lists, use bullet points.
- If explaining a complex biological concept, use an analogy.
</FORMAT>
`;

function startNewChat() {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chat = ai.chats.create({
        model: TEXT_MODEL,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            safetySettings: SAFETY_SETTINGS, // Apply Safety Filters
        },
    });
    dom.chat.container.innerHTML = '';
    dom.chat.container.appendChild(dom.chat.welcomeContainer);
    dom.chat.welcomeContainer.hidden = false;
    clearAttachedFile();
}

// --- THEME MANAGEMENT ---
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme as 'light' | 'dark');
}

function setTheme(theme: 'light' | 'dark') {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    dom.header.sunIcon.hidden = theme === 'dark';
    dom.header.moonIcon.hidden = theme === 'light';
    const hljsTheme = theme === 'dark' ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css' : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
    (document.getElementById('hljs-theme') as HTMLLinkElement).href = hljsTheme;
}

// --- EVENT LISTENERS ---
function attachEventListeners() {
    dom.header.themeToggleBtn.addEventListener('click', () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
    dom.header.newChatBtn.addEventListener('click', startNewChat);

    dom.form.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSendMessage();
    });

    dom.form.imageGenBtn.addEventListener('click', handleGenerateImage);
    dom.form.thinkingModeBtn.addEventListener('click', toggleThinkingMode);
    
    dom.form.promptInput.addEventListener('input', autoResizeTextarea);
    dom.form.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    dom.file.uploadBtn.addEventListener('click', () => dom.file.fileUpload.click());
    dom.file.fileUpload.addEventListener('change', handleFileChange);
    
    dom.camera.btn.addEventListener('click', openCamera);
    dom.camera.closeBtn.addEventListener('click', closeCamera);
    dom.camera.captureBtn.addEventListener('click', captureImage);
    
    dom.voice.btn.addEventListener('click', toggleVoiceInput);
    dom.voice.muteBtn.addEventListener('click', toggleMute);
    dom.voice.volumeSlider.addEventListener('input', adjustVolume);

    dom.chat.promptSuggestions.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('suggestion-chip')) {
            dom.form.promptInput.value = target.textContent || '';
            autoResizeTextarea();
            handleSendMessage();
        }
    });

    dom.imageViewer.closeBtn.addEventListener('click', () => dom.imageViewer.modal.hidden = true);
    dom.imageViewer.modal.addEventListener('click', (e) => {
        if (e.target === dom.imageViewer.modal) dom.imageViewer.modal.hidden = true;
    });

    dom.chat.container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG' && target.parentElement?.classList.contains('message-content')) {
            dom.imageViewer.content.src = (target as HTMLImageElement).src;
            dom.imageViewer.modal.hidden = false;
        }
    });
}

// --- MEDICAL INTENT VALIDATION ---
async function checkMedicalIntent(query: string): Promise<boolean> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        // Lightweight call to check intent
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: `Analyze the following user query. Is it related to health, medicine, biology, wellness, anatomy, or fitness? Answer only "YES" or "NO". Query: "${query}"`,
        });
        const answer = response.text?.trim().toUpperCase();
        return answer?.includes("YES") ?? false;
    } catch (e) {
        console.warn("Intent validation failed, defaulting to allow.", e);
        return true;
    }
}

// --- CORE CHAT & GENERATION LOGIC ---
async function handleSendMessage() {
    const promptText = dom.form.promptInput.value.trim();
    if (isLoading || (!promptText && !attachedFile)) return;

    if (promptText.toLowerCase().startsWith('generate an image')) {
        await handleGenerateImage();
        return;
    }
    
    dom.chat.welcomeContainer.hidden = true;
    setLoading(true);

    // 1. Validate Intent (Medical-Intent Validation)
    updateStatus("Validating medical intent...");
    const isMedical = await checkMedicalIntent(promptText);
    
    if (!isMedical && !attachedFile) {
        setLoading(false);
        updateStatus("");
        addMessage('user', promptText);
        dom.form.promptInput.value = '';
        autoResizeTextarea();
        const errorMsg = addMessage('model', '', false);
        errorMsg.classList.add('error-message');
        errorMsg.textContent = "I am a constrained Health AI. Please ask questions related to health, medicine, or wellness.";
        return;
    }

    const userMessageParts: any[] = [{ text: promptText }];
    if (attachedFile) {
        userMessageParts.unshift({
            inlineData: { data: attachedFile.data, mimeType: attachedFile.mimeType }
        });
    }
    
    const displayPrompt = promptText || (attachedFile ? `(attached: ${attachedFile.name})` : '');
    addMessage('user', displayPrompt);
    dom.form.promptInput.value = '';
    autoResizeTextarea();
    clearAttachedFile();
    
    const modelMessageElement = addMessage('model', '', true);

    try {
        updateStatus("Retrieving knowledge context...");
        
        // 2. Data Chunking & Retrieval (Simulated Embeddings)
        const relevantContext = retrieveRelevantContext(promptText);
        
        // 3. Inject Context into specific message (Augmented Retrieval)
        const augmentedPrompt = [
            ...userMessageParts,
            { text: `\n\n<RETRIEVED_CONTEXT>\n${relevantContext}\n</RETRIEVED_CONTEXT>\n` }
        ];

        const config: any = {
            safetySettings: SAFETY_SETTINGS // Strict Filters
        };
        if (isThinkingMode) {
             config.thinkingConfig = { thinkingBudget: 24576 };
        }

        updateStatus("Generating response...");
        const resultStream = await chat.sendMessageStream({
            message: augmentedPrompt,
            config
        });

        let fullResponse = '';
        let lastChunk: GenerateContentResponse | null = null;
        for await (const chunk of resultStream) {
            fullResponse += chunk.text;
            modelMessageElement.innerHTML = marked.parse(fullResponse + '▍') as string;
            lastChunk = chunk;
        }
        modelMessageElement.innerHTML = marked.parse(fullResponse) as string;
        hljs.highlightAll();

        if (lastChunk) {
            const groundingMetadata = lastChunk?.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks?.length) {
                renderSources(modelMessageElement, groundingMetadata.groundingChunks);
            }
        }
    } catch (e) {
        console.error(e);
        handleError(e instanceof Error ? e.message : String(e), modelMessageElement);
    } finally {
        setLoading(false);
        updateStatus("");
    }
}

async function handleGenerateImage() {
    const promptText = dom.form.promptInput.value.trim();
    if (isLoading || !promptText) return;
    
    dom.chat.welcomeContainer.hidden = true;
    setLoading(true);
    addMessage('user', promptText);
    dom.form.promptInput.value = '';
    autoResizeTextarea();
    clearAttachedFile();

    const modelMessageElement = addMessage('model', '');
    const imageLoader = document.createElement('div');
    imageLoader.className = 'image-loader-container';
    imageLoader.innerHTML = `<div class="image-loader-placeholder"></div><p>Generating medical illustration...</p>`;
    modelMessageElement.appendChild(imageLoader);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: { parts: [{ text: promptText }] },
            config: { 
                responseModalities: [Modality.IMAGE],
                safetySettings: SAFETY_SETTINGS
            },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData?.data) {
            const base64Image = part.inlineData.data;
            const imageUrl = `data:${part.inlineData.mimeType};base64,${base64Image}`;
            modelMessageElement.innerHTML = `<img src="${imageUrl}" alt="${promptText}" style="max-width: 512px; width: 100%; border-radius: 8px; cursor: pointer;">`;
        } else {
            throw new Error('Image generation failed. No image data received.');
        }
    } catch (e) {
        console.error(e);
        handleError(e instanceof Error ? e.message : String(e), modelMessageElement);
    } finally {
        setLoading(false);
    }
}


// --- UI & DOM MANIPULATION ---
function updateStatus(text: string) {
    // Check if status indicator exists, if not create it inside input container
    let statusEl = document.getElementById('status-indicator');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'status-indicator';
        statusEl.className = 'status-indicator';
        dom.form.inputRow.parentElement?.insertBefore(statusEl, dom.form.inputRow);
    }
    statusEl.textContent = text;
    statusEl.hidden = !text;
}

function addMessage(role: 'user' | 'model', content: string, isStreaming: boolean = false): HTMLElement {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message ${role}-message`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    if (isStreaming) {
        messageContent.innerHTML = marked.parse('▍') as string;
    } else {
        messageContent.innerHTML = content.startsWith('<img') ? content : marked.parse(content) as string;
    }
    
    messageWrapper.appendChild(messageContent);
    dom.chat.container.appendChild(messageWrapper);
    dom.chat.container.scrollTop = dom.chat.container.scrollHeight;
    
    if (!isStreaming) {
       hljs.highlightAll();
    }
    return messageContent;
}

function renderSources(messageElement: HTMLElement, chunks: any[]) {
    const sourcesContainer = document.createElement('div');
    sourcesContainer.className = 'sources-container';
    sourcesContainer.innerHTML = '<h4>Sources:</h4>';
    
    const list = document.createElement('ol');
    const seenUris = new Set();

    chunks.forEach(chunk => {
        const uri = chunk.web?.uri || chunk.maps?.uri;
        const title = chunk.web?.title || chunk.maps?.title || uri;
        if (uri && !seenUris.has(uri)) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = uri;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = title;
            item.appendChild(link);
            list.appendChild(item);
            seenUris.add(uri);
        }
    });

    if (list.children.length > 0) {
        sourcesContainer.appendChild(list);
        messageElement.appendChild(sourcesContainer);
    }
}


function handleError(message: string, element?: HTMLElement) {
    const targetElement = element || addMessage('model', '');
    targetElement.parentElement?.classList.add('error-message');
    targetElement.textContent = `Filtered/Error: ${message}`;
}

function setLoading(loading: boolean) {
    isLoading = loading;
    dom.form.submitBtn.disabled = loading;
    dom.form.imageGenBtn.disabled = loading;
    dom.form.sendIcon.hidden = loading;
    dom.form.loader.hidden = !loading;
}

function autoResizeTextarea() {
    const textarea = dom.form.promptInput;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
}

function toggleThinkingMode() {
    isThinkingMode = !isThinkingMode;
    dom.form.thinkingModeBtn.classList.toggle('active', isThinkingMode);
}

// --- FILE & CAMERA HANDLING ---
async function handleFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const data = await blobToBase64(file);
    attachFile({ name: file.name, data, mimeType: file.type });
}

function attachFile(file: { name: string; data: string; mimeType: string; }) {
    attachedFile = file;
    const isImage = file.mimeType.startsWith('image/');
    dom.file.preview.innerHTML = `
        <div class="file-info-preview">
            ${isImage ? `<img src="data:${file.mimeType};base64,${file.data}" alt="Preview">` : ''}
            <span>${file.name}</span>
        </div>
        <button type="button" class="remove-preview-btn" aria-label="Remove file">&times;</button>
    `;
    dom.file.preview.querySelector('.remove-preview-btn')?.addEventListener('click', clearAttachedFile);
    dom.file.preview.hidden = false;
    dom.form.inputRow.classList.add('input-row--active');
}

function clearAttachedFile() {
    attachedFile = null;
    dom.file.fileUpload.value = '';
    dom.file.preview.hidden = true;
    dom.file.preview.innerHTML = '';
    dom.form.inputRow.classList.remove('input-row--active');
}

async function openCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true });
        dom.camera.view.srcObject = localStream;
        dom.camera.modal.hidden = false;
    } catch (err) {
        console.error("Camera access denied:", err);
        handleError("Camera access was denied. Please enable it in your browser settings.");
    }
}

function closeCamera() {
    localStream?.getTracks().forEach(track => track.stop());
    dom.camera.modal.hidden = true;
}

function captureImage() {
    const context = dom.camera.canvas.getContext('2d');
    if (!context) return;
    
    dom.camera.canvas.width = dom.camera.view.videoWidth;
    dom.camera.canvas.height = dom.camera.view.videoHeight;
    context.drawImage(dom.camera.view, 0, 0, dom.camera.view.videoWidth, dom.camera.view.videoHeight);
    
    dom.camera.canvas.toBlob(blob => {
        if (blob) {
            blobToBase64(blob).then(data => {
                attachFile({ name: 'capture.jpg', data, mimeType: 'image/jpeg' });
            });
        }
    }, 'image/jpeg');
    
    closeCamera();
}


// --- VOICE / LIVE API ---
async function toggleVoiceInput() {
    if (isRecording) {
        stopVoiceInput();
    } else {
        await startVoiceInput();
    }
}

async function startVoiceInput() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecording = true;
        updateVoiceButtonState();
        
        inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
        outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        inputGainNode = inputAudioContext.createGain();
        outputGainNode = outputAudioContext.createGain();
        analyserNode = inputAudioContext.createAnalyser();
        analyserNode.fftSize = 256;
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        liveSessionPromise = ai.live.connect({
            model: LIVE_MODEL,
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                safetySettings: SAFETY_SETTINGS // Safety filters for Voice
            },
            callbacks: {
                onopen: () => {
                    const source = inputAudioContext.createMediaStreamSource(localStream!);
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        liveSessionPromise?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                    };
                    
                    source.connect(inputGainNode);
                    inputGainNode.connect(analyserNode);
                    analyserNode.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                    drawVisualizer();
                },
                onmessage: handleLiveMessage,
                onerror: (e) => {
                    console.error('Live API Error:', e);
                    handleError('An error occurred with the voice session.');
                    stopVoiceInput();
                },
                onclose: () => {
                   stopVoiceInput();
                },
            },
        });
    } catch (err) {
        console.error("Microphone access denied:", err);
        handleError("Microphone access was denied. Please enable it in your browser settings.");
        stopVoiceInput();
    }
}

let currentInputTranscription = '';
let currentOutputTranscription = '';
let userInputMessageElem: HTMLElement | null = null;
let modelOutputMessageElem: HTMLElement | null = null;

async function handleLiveMessage(message: LiveServerMessage) {
    if (message.serverContent?.inputTranscription) {
        if (!userInputMessageElem) {
            dom.chat.welcomeContainer.hidden = true;
            userInputMessageElem = addMessage('user', '', true).parentElement!;
        }
        const text = message.serverContent.inputTranscription.text;
        currentInputTranscription += text;
        userInputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentInputTranscription + '▍') as string;
    }
    
    if (message.serverContent?.outputTranscription) {
        if (!modelOutputMessageElem) {
             modelOutputMessageElem = addMessage('model', '', true).parentElement!;
        }
        const text = message.serverContent.outputTranscription.text;
        currentOutputTranscription += text;
        modelOutputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentOutputTranscription + '▍') as string;
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio) {
        playAudio(base64Audio);
    }
    
    if (message.serverContent?.turnComplete) {
        if (userInputMessageElem) {
           userInputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentInputTranscription) as string;
        }
        if (modelOutputMessageElem) {
           modelOutputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentOutputTranscription) as string;
        }
        currentInputTranscription = '';
        currentOutputTranscription = '';
        userInputMessageElem = null;
        modelOutputMessageElem = null;
    }
    
    if (message.serverContent?.interrupted) {
        for (const source of playingSources) {
            source.stop();
        }
        playingSources.clear();
        nextStartTime = 0;
    }
}

async function playAudio(base64Audio: string) {
    nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
    const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, OUTPUT_SAMPLE_RATE, 1);
    const source = outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputGainNode);
    outputGainNode.connect(outputAudioContext.destination);
    
    source.addEventListener('ended', () => playingSources.delete(source));
    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
    playingSources.add(source);
}

function stopVoiceInput() {
    if (!isRecording) return;
    
    isRecording = false;
    updateVoiceButtonState();
    cancelAnimationFrame(visualizerFrameId);

    localStream?.getTracks().forEach(track => track.stop());
    inputAudioContext?.close();
    outputAudioContext?.close();
    
    liveSessionPromise?.then(session => session.close());
    liveSessionPromise = null;
}

function updateVoiceButtonState() {
    dom.voice.btn.classList.toggle('recording', isRecording);
    dom.voice.micIcon.hidden = isRecording;
    dom.voice.stopIcon.hidden = !isRecording;
    dom.form.promptInput.style.display = isRecording ? 'none' : 'block';
    dom.voice.visualizerContainer.style.display = isRecording ? 'flex' : 'none';
    dom.voice.controls.hidden = !isRecording;
    setTimeout(() => {
        dom.voice.visualizerContainer.style.opacity = isRecording ? '1' : '0';
    }, 10);
}

function drawVisualizer() {
    visualizerFrameId = requestAnimationFrame(drawVisualizer);
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteTimeDomainData(dataArray);

    const canvas = dom.voice.visualizerCanvas;
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--accent-primary').trim();
    ctx.beginPath();

    const sliceWidth = width * 1.0 / analyserNode.frequencyBinCount;
    let x = 0;

    for (let i = 0; i < analyserNode.frequencyBinCount; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * height / 2;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
}

function toggleMute() {
    const isMuted = outputGainNode.gain.value === 0;
    outputGainNode.gain.value = isMuted ? 1 : 0;
    dom.voice.unmutedIcon.hidden = !isMuted;
    dom.voice.mutedIcon.hidden = isMuted;
}

function adjustVolume(event: Event) {
    inputGainNode.gain.value = parseFloat((event.target as HTMLInputElement).value);
}


// --- UTILITY & HELPER FUNCTIONS ---
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function createPcmBlob(data: Float32Array): GenAIBlob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
    };
}

// Audio encoding/decoding helpers from guidelines
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// --- START THE APP ---
document.addEventListener('DOMContentLoaded', initializeApp);
