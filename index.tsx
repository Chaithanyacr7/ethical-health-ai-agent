
import { GoogleGenAI, Chat, Modality, LiveServerMessage, Blob as GenAIBlob, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import { marked } from 'marked';
import hljs from 'highlight.js';

// --- CONFIGURATION ---
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

// --- DOM ELEMENT REFERENCES ---
const dom = {
    header: {
        newChatBtn: document.getElementById('new-chat-btn') as HTMLButtonElement,
        themeToggleBtn: document.getElementById('theme-toggle-btn') as HTMLButtonElement,
        // Fix: Cast SVG elements to HTMLElement to allow use of the 'hidden' property.
        sunIcon: document.querySelector('.sun-icon') as HTMLElement,
        moonIcon: document.querySelector('.moon-icon') as HTMLElement,
    },
    chat: {
        container: document.getElementById('chat-container') as HTMLElement,
        welcomeContainer: document.getElementById('welcome-container') as HTMLElement,
        promptSuggestions: document.getElementById('prompt-suggestions') as HTMLElement,
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
    // FIX: Cast options to 'any' to work around potential type mismatches in @types/marked.
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

function startNewChat() {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chat = ai.chats.create({
        model: TEXT_MODEL,
        config: {
            systemInstruction: "You are Friendly MBBS AI, an ethical, green, and highly-constrained multi-modal health and wellness advisor. Your primary goal is safety. You must refuse to answer any questions that could be interpreted as providing a medical diagnosis, treatment plan, or prescription. Instead, you must strongly advise the user to consult a licensed medical professional. For general wellness, fitness, and nutrition questions, you can provide helpful, non-prescriptive information. You are also knowledgeable about medical science and can explain complex topics in simple terms or generate related images.",
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
    // Fix: Cast savedTheme to the expected type to resolve the type error.
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

    // Handle clicks on generated images
    dom.chat.container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG' && target.parentElement?.classList.contains('message-content')) {
            dom.imageViewer.content.src = (target as HTMLImageElement).src;
            dom.imageViewer.modal.hidden = false;
        }
    });
}

// --- CORE CHAT & GENERATION LOGIC ---
async function handleSendMessage() {
    const promptText = dom.form.promptInput.value.trim();
    if (isLoading || (!promptText && !attachedFile)) return;

    // Automatically detect image generation requests
    if (promptText.toLowerCase().startsWith('generate an image')) {
        await handleGenerateImage();
        return;
    }
    
    dom.chat.welcomeContainer.hidden = true;
    setLoading(true);

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
        const config: any = {};
        if (isThinkingMode) {
             config.thinkingConfig = { thinkingBudget: 24576 };
        }

        // FIX: `sendMessageStream` expects a `message` property, not `contents`.
        const resultStream = await chat.sendMessageStream({
            message: userMessageParts,
            config
        });

        let fullResponse = '';
        let lastChunk: GenerateContentResponse | null = null;
        for await (const chunk of resultStream) {
            fullResponse += chunk.text;
            // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
            modelMessageElement.innerHTML = marked.parse(fullResponse + '▍') as string;
            lastChunk = chunk;
        }
        // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
        modelMessageElement.innerHTML = marked.parse(fullResponse) as string;
        hljs.highlightAll();

        // Check for grounding sources
        // FIX: The response from the stream does not have a `.response` property.
        // Grounding metadata can be found in the chunks. We'll check the last one.
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
    imageLoader.innerHTML = `<div class="image-loader-placeholder"></div><p>Generating image...</p>`;
    modelMessageElement.appendChild(imageLoader);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: { parts: [{ text: promptText }] },
            config: { responseModalities: [Modality.IMAGE] },
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
function addMessage(role: 'user' | 'model', content: string, isStreaming: boolean = false): HTMLElement {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message ${role}-message`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    if (isStreaming) {
        // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
        messageContent.innerHTML = marked.parse('▍') as string;
    } else {
        // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
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
    targetElement.textContent = `Error: ${message}`;
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
        
        // Fix: Cast window to 'any' to allow access to the deprecated 'webkitAudioContext' for older browser compatibility.
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
        // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
        userInputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentInputTranscription + '▍') as string;
    }
    
    if (message.serverContent?.outputTranscription) {
        if (!modelOutputMessageElem) {
             modelOutputMessageElem = addMessage('model', '', true).parentElement!;
        }
        const text = message.serverContent.outputTranscription.text;
        currentOutputTranscription += text;
        // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
        modelOutputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentOutputTranscription + '▍') as string;
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio) {
        playAudio(base64Audio);
    }
    
    if (message.serverContent?.turnComplete) {
        if (userInputMessageElem) {
            // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
           userInputMessageElem.querySelector('.message-content')!.innerHTML = marked.parse(currentInputTranscription) as string;
        }
        if (modelOutputMessageElem) {
            // FIX: The return type of marked.parse can be a Promise, so we cast it to a string.
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

// FIX: Update function signature to use the aliased GenAIBlob type.
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