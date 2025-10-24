import {
  GoogleGenAI,
  Modality
} from "@google/genai";
import {
  marked
} from "marked";
import hljs from "highlight.js";

// --- STATE AND CONFIGURATION ---

const SYSTEM_INSTRUCTION = `System Instructions
You are 'Friendly MBBS AI', an *Ethical, Green, and Highly-Constrained Multi-Modal Health & Wellness Advisor*. You combine the persona of a 'Friendly Mini MBBS Doctor' for general advice with 'Deep Pharmacist Knowledge' for medication facts, acting as a one-step informational solution.

*0. Conversational Greeting Protocol:* If the user provides a simple, non-medical greeting (e.g., 'hello', 'hi', 'how are you?', 'hey'), respond with a friendly, natural greeting and *do not* include the disclaimers. For any other query, including greetings mixed with medical questions, the full disclaimer protocol must be followed.

*1. Core Persona & Safety Hierarchy (The Prime Directive):*
- *Persona:* An empathetic, objective, and responsible health educator and informational pharmacist.
- *Prime Directive:* *Your core purpose is patient education and safety. You MUST NOT diagnose, prescribe, or replace a licensed medical professional.* When in doubt, or if the query involves risk, you must immediately escalate the disclaimer and recommend a doctor.
- *Green AI Principle:* Provide concise, relevant information to minimize computational waste.

*2. Mandatory Disclaimers & Risk Assessment Protocol:*
You will apply one of three escalating disclaimers based on the user's input. Every response MUST start with the Initial Disclaimer and end with the Full Disclaimer corresponding to the Risk Level.

| Risk Level | Query Type (Trigger) | Initial Disclaimer (Start of Response) | Full Disclaimer (End of Response) |
| :--- | :--- | :--- | :--- |
| *LOW* | General wellness, basic nutrition, simple exercises. | "[Wellness Guide]" | *Full Disclaimer A* |
| *MEDIUM* | DIY/Home Remedies, basic OTC medication facts, mild, non-acute symptoms. | "[Advisory Notice] This information is NOT a diagnosis. Seek professional advice for ongoing issues." | *Full Disclaimer B* |
| *HIGH* | Acute symptoms, multi-drug queries, specific dosage/diagnosis requests, illegal queries. | "[🚨 IMMEDIATE DANGER ALERT] STOP. Consult a licensed doctor or pharmacist NOW." | *Full Disclaimer C (Refusal)* |

*3. Response Protocols (The Friendly MBBS & Pharmacist Role):*
- *A. Friendly MBBS Protocol (Symptoms/Issues - MEDIUM RISK):*
    - If the user reports *MILD, NON-ACUTE* symptoms (e.g., common cold, mild headache).
    - Provide *one or two basic, non-invasive DIY Home Remedies* (e.g., 'rest and hydration') *OR* suggest *one or two simple, low-risk exercises* (e.g., 'gentle stretching').
    - Suggest the general class of a common *Basic OTC Medication* (e.g., 'a non-drowsy antihistamine for mild allergy').
    - Conclude by stating: "If symptoms worsen, persist for more than 48 hours, or if you have underlying conditions, you must see a doctor."
- *B. Deep Pharmacist Protocol (Medication Knowledge - MEDIUM RISK):*
    - If the user asks about a legitimate medication, provide the medication's *Active Ingredient(s), its **Drug Class** (e.g., 'NSAID'), and its *General Simple Use*.
    - *Do NOT* confirm a user's dosage, advise on two-drug interactions, or recommend a brand name.
- *C. Mindfulness & Stress Protocol (LOW/MEDIUM RISK):*
    - If the user expresses feeling stressed, anxious, or overwhelmed in a non-acute context.
    - Offer *one or two brief, actionable, low-risk mindfulness or stress-management tips* (e.g., 'Consider a simple 1-minute breathing exercise: inhale for 4 seconds, hold for 4, and exhale for 6.' or 'A short walk can sometimes help clear the mind.').
    - Immediately follow with a transition to the standard disclaimer, e.g., "While this can sometimes help, please remember..." and conclude with the appropriate Full Disclaimer.

*4. Advanced Multi-Modal Input Processing:*
You must use information from multimodal inputs to provide context, but apply strict safety guardrails.

| Input Type | Agent Action | Guardrail |
| :--- | :--- | :--- |
| *Voice Input* | Analyze and transcribe the query. If tone/content suggests *IMMEDIATE ACUTE RISK* (e.g., "severe chest pain," "heavy bleeding"), trigger *HIGH RISK* protocol. |
| *Photo/Camera Input* | Interpret *CLEAR TEXT ONLY (OCR)* from pill labels, medication boxes, or legible health documents. | *CRITICAL:* *DO NOT* attempt to analyze photos of physical symptoms (e.g., a rash, a wound) or unlabeled pills. Trigger *HIGH RISK* protocol for such inputs. |
| *PDF/Docs Input* | Extract and summarize the *INDICATIONS/USES* or *SIMPLE COMPONENT LIST* from a patient leaflet. | *Refuse* to interpret complex medical charts, full medical history, or handwritten doctor notes. |

*5. Image Generation Protocol (LOW RISK):*
- *Trigger:* User explicitly requests an image via the designated UI action.
- *Action:* Generate safe, SFW (Safe for Work), educational, and metaphorical images strictly related to the medical and wellness fields. The style should be illustrative, abstract, or cartoonish to avoid any possibility of misinterpretation as a real medical photo or diagnosis.
- *Examples:* "An artistic illustration of healthy lungs," "a metaphorical image representing the immune system as a shield," "a cartoon for a medical story about the importance of hand-washing," "a diagram of a balanced meal."
- *Guardrail:* *CRITICAL: Absolutely refuse to generate any image that depicts specific medical conditions, symptoms (rashes, wounds, injuries), gore, internal organs in a realistic manner, or anything that could be misinterpreted as a diagnostic tool. Photorealistic images of medical subjects are forbidden. If the request is ambiguous or high-risk, refuse the image and respond with text using the HIGH RISK protocol.*

*6. HARD REFUSAL & ETHICAL/LEGAL GUARDRAILS (HIGH RISK):*
You must follow the *Refusal Protocol C* for all high-risk or illegal queries.
- *Prohibited Topics (Trigger Protocol C):* Any query related to *illegal medical practices, **unauthorized/illicit sale of substances* (e.g., *anesthesia, strong opioids, research chemicals*), self-harm, medical emergencies, or specific drug injection/dosage instructions.

*7. Regional Knowledge - India:* You have specialized knowledge of the Indian pharmaceutical landscape. This includes common local medicines (both OTC and traditional/Ayurvedic where appropriate for general knowledge), major Indian pharma companies (e.g., Sun Pharma, Cipla, Dr. Reddy's), and the ability to recognize and discuss their product packaging from images. When generating images, you can create illustrative representations of Indian medicine packaging or logos if explicitly requested, following all safety protocols.

---
### Full Disclaimer Definitions (To be appended to every response)
*Full Disclaimer A: WELLNESS ADVISORY*
The content provided by *Friendly MBBS AI* is for general knowledge, informational, and educational purposes only. It is not medical advice. *Always seek the guidance of a licensed medical professional for personalized diagnosis and treatment.*

*Full Disclaimer B: CRITICAL HEALTH WARNING*
*Friendly MBBS AI* is an informational tool and is *NOT a doctor or pharmacist. Information on symptoms, remedies, or medications is **educational and general* in nature. *Do NOT use it to self-diagnose or self-treat.* Your own doctor or pharmacist must confirm any medication or treatment plan. *If your symptoms worsen or you are experiencing an emergency, call your local emergency number (e.g., 911, 108) immediately.*

*Full Disclaimer C (Refusal):*
*I am a safety-first, ethical AI. I cannot provide any information regarding illegal, illicit, or unauthorized substances or medical procedures. For your safety, please contact local law enforcement or a licensed medical professional immediately. (Full Disclaimer B is still implicitly active.)*
`;

let ai;
let chatHistory = [];

let isRecording = false;
let recognition;
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Audio visualizer state
let audioContext;
let analyser;
let source;
let dataArray;
let animationFrameId;
let gainNode;
let mediaStream;
let cameraStream;

// --- Audio Playback State ---
let currentAudioSource: AudioBufferSourceNode | null = null;
let currentGainNode: GainNode | null = null;
let currentAudioMessageId: string | null = null;
const audioBuffersCache: { [key: string]: AudioBuffer } = {};
let outputAudioContext: AudioContext | null = null;


// --- DOM ELEMENTS ---
let chatContainer, chatForm, submitBtn, promptInput, sendIcon, loader,
  uploadBtn, fileUpload, filePreview, voiceBtn, micIcon, stopIcon,
  inputRow, voiceVisualizer, visualizerContainer,
  visualizerControls, muteBtn, unmutedIcon, mutedIcon, volumeSlider,
  cameraBtn, cameraModal, cameraView, cameraCanvas, captureBtn, closeCameraBtn,
  imageGenBtn, themeToggleBtn, sunIcon, moonIcon, newChatBtn, welcomeContainer,
  promptSuggestions, imageViewerModal, imageViewerContent, closeImageViewerBtn,
  hljsTheme;


// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  // Select all DOM elements
  chatContainer = document.getElementById("chat-container");
  chatForm = document.getElementById("chat-form");
  submitBtn = document.getElementById("submit-btn");
  promptInput = document.getElementById("prompt-input");
  sendIcon = submitBtn.querySelector(".send-icon");
  loader = submitBtn.querySelector(".loader");
  uploadBtn = document.getElementById("upload-btn");
  fileUpload = document.getElementById("file-upload");
  filePreview = document.getElementById("file-preview");
  voiceBtn = document.getElementById("voice-btn");
  micIcon = voiceBtn.querySelector(".mic-icon");
  stopIcon = voiceBtn.querySelector(".stop-icon");
  inputRow = document.getElementById("input-row");
  voiceVisualizer = document.getElementById("voice-visualizer");
  visualizerContainer = document.getElementById("visualizer-container");
  visualizerControls = document.getElementById("visualizer-controls");
  muteBtn = document.getElementById("mute-btn");
  unmutedIcon = muteBtn.querySelector(".unmuted-icon");
  mutedIcon = muteBtn.querySelector(".muted-icon");
  volumeSlider = document.getElementById("volume-slider");
  cameraBtn = document.getElementById("camera-btn");
  cameraModal = document.getElementById("camera-modal");
  cameraView = document.getElementById("camera-view");
  cameraCanvas = document.getElementById("camera-canvas");
  captureBtn = document.getElementById("capture-btn");
  closeCameraBtn = document.getElementById("close-camera-btn");
  imageGenBtn = document.getElementById("image-gen-btn");
  themeToggleBtn = document.getElementById("theme-toggle-btn");
  sunIcon = themeToggleBtn.querySelector(".sun-icon");
  moonIcon = themeToggleBtn.querySelector(".moon-icon");
  newChatBtn = document.getElementById("new-chat-btn");
  welcomeContainer = document.getElementById("welcome-container");
  promptSuggestions = document.getElementById("prompt-suggestions");
  imageViewerModal = document.getElementById("image-viewer-modal");
  imageViewerContent = document.getElementById("image-viewer-content");
  closeImageViewerBtn = document.querySelector(".close-image-viewer");
  hljsTheme = document.getElementById("hljs-theme");

  // Initialize chat
  initChat().catch(err => {
    addMessage("error", `AI initialization failed:\n${getFriendlyErrorMessage(err)}`);
    console.error("Fatal: AI Initialization Failed", err);
  });

  setupEventListeners();
  applyInitialTheme();
  loadChatHistory();
});

function setupEventListeners() {
  if (!chatForm) return; // Guard against missing elements
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  promptInput.addEventListener("input", () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = (promptInput.scrollHeight) + 'px';
    if (promptInput.value.length > 0) {
      inputRow.classList.add("input-row--active");
    } else {
      inputRow.classList.remove("input-row--active");
    }
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  uploadBtn.addEventListener("click", () => fileUpload.click());
  fileUpload.addEventListener("change", handleFileUpload);
  imageGenBtn.addEventListener("click", () => sendMessage(true));
  
  // Header actions
  themeToggleBtn.addEventListener("click", toggleTheme);
  newChatBtn.addEventListener("click", startNewChat);

  // Prompt suggestions
  promptSuggestions?.addEventListener('click', (e) => {
    const target = e.target as HTMLButtonElement;
    if (target.classList.contains('suggestion-chip')) {
        promptInput.value = target.textContent;
        sendMessage();
    }
  });

  // Camera
  cameraBtn.addEventListener("click", openCamera);
  closeCameraBtn.addEventListener("click", closeCamera);
  captureBtn.addEventListener("click", captureImage);
  
  // Image Viewer
  closeImageViewerBtn.addEventListener("click", closeImageModal);
  imageViewerModal.addEventListener("click", (e) => {
    if (e.target === imageViewerModal) {
      closeImageModal();
    }
  });

  // Voice recognition
  if (SpeechRecognition) {
    voiceBtn.addEventListener("click", toggleVoiceRecognition);
  } else if (voiceBtn) {
    voiceBtn.style.display = 'none';
  }

  // Visualizer controls
  muteBtn?.addEventListener('click', toggleMute);
  volumeSlider?.addEventListener('input', changeVolume);

  // Global keyboard shortcuts
  document.addEventListener('keydown', handleGlobalKeyDown);
}

// --- API AND CHAT LOGIC ---

async function initChat() {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.API_KEY
    });
  } catch (error) {
    console.error("AI client initialization failed:", error);
    // The error will be caught and displayed by the caller in DOMContentLoaded
    throw error;
  }
}

async function sendMessage(generateImage = false) {
  if (!ai) {
    addMessage("error", "The AI is not initialized. Please check your API key and refresh the page.");
    return;
  }

  const prompt = promptInput.value.trim();
  const file = fileUpload.files[0];

  if (!prompt && !file) return;

  if (welcomeContainer) {
    welcomeContainer.style.display = 'none';
  }

  playAudioCue('send');
  if (prompt) {
    addMessage("user", prompt);
  }
  setLoading(true);

  const userParts = [];
  if (file) {
    try {
      const base64Data = await fileToBase64(file);
      userParts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.type
        }
      });
    } catch (error) {
      console.error("File to Base64 conversion failed:", error);
      addMessage("error", "Failed to read the attached file.");
      setLoading(false);
      return;
    }
  }
  if (prompt) {
    userParts.push({
      text: prompt
    });
  }

  try {
    if (generateImage) {
      await generateImageFromPrompt(userParts);
    } else {
      await generateTextFromPrompt(userParts);
    }
  } catch (error) {
    // This is a fallback for unexpected errors within the generation functions
    console.error("An unexpected error occurred in sendMessage:", error);
    addMessage("error", `An unexpected error occurred: ${getFriendlyErrorMessage(error)}`);
    setLoading(false);
  }
}

async function generateTextFromPrompt(userParts) {
  const userContent = {
    role: 'user',
    parts: userParts
  };
  let currentResponse = "";
  let messageElement = addMessage("model", "", true);

  playAudioCue('processing');

  try {
    const resultStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [...chatHistory, userContent],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{
          googleSearch: {}
        }],
      },
    });

    let lastChunk = null;
    let hasReceivedText = false;
    for await (const chunk of resultStream) {
      lastChunk = chunk;
      const chunkText = chunk.text;
      if (chunkText) {
        if (!hasReceivedText) {
          playAudioCue('receive');
          if (messageElement) {
            messageElement.querySelector('.message-content').innerHTML = '';
          }
          hasReceivedText = true;
        }

        currentResponse += chunkText;
        if (messageElement) {
          let sanitizedHtml;
          try {
            sanitizedHtml = marked.parse(currentResponse, {
              gfm: true,
              breaks: true,
              highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, {
                  language,
                  ignoreIllegals: true
                }).value;
              }
            });
          } catch (e) {
            console.warn("Markdown parsing error, displaying raw text:", e);
            sanitizedHtml = currentResponse.replace(/</g, "&lt;").replace(/>/g, "&gt;");
          }
          messageElement.querySelector('.message-content').innerHTML = sanitizedHtml;
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }
    }

    if (!hasReceivedText && messageElement) {
      messageElement.remove();
    }

    if (hasReceivedText && messageElement) {
      const groundingMetadata = lastChunk?.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata && groundingMetadata.groundingChunks?.length > 0) {
        appendSources(messageElement, groundingMetadata.groundingChunks);
      }
    }

    if (isResponseInsufficient(currentResponse)) {
      if (messageElement) messageElement.remove();
      if (hasReceivedText) {
        addMessage(
          "error",
          "I'm sorry, I couldn't generate a helpful response for that request, likely due to my safety guidelines. Could you please try rephrasing your prompt?"
        );
      }
    } else {
      if (hasReceivedText && messageElement) {
        addFeedbackControls(messageElement);
        addAudioControls(messageElement);
        chatHistory.push(userContent);
        chatHistory.push({
          role: 'model',
          parts: [{
            text: currentResponse
          }]
        });
        saveChatHistory();
      }
    }

  } catch (error) {
    if (messageElement) messageElement.remove();
    const friendlyError = getFriendlyErrorMessage(error);
    addMessage("error", `An error occurred: ${friendlyError}`);
    console.error("Error during generateContentStream:", error);
  } finally {
    setLoading(false);
  }
}

async function generateImageFromPrompt(userParts) {
  let messageElement = addMessage("model", "", false, true);
  playAudioCue('imageGenStart');
  const userContent = {
    role: 'user',
    parts: userParts
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [...chatHistory, userContent],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseModalities: [Modality.IMAGE],
      },
    });

    let imageFound = false;
    const modelResponseParts = response.candidates?.[0]?.content?.parts;
    if (modelResponseParts) {
      for (const part of modelResponseParts) {
        if (part.inlineData) {
          playAudioCue('imageGenSuccess');
          const base64ImageBytes = part.inlineData.data;
          const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
          const img = document.createElement('img');
          const textPart = userParts.find(p => 'text' in p);
          img.alt = (textPart as {
            text: string
          })?.text || "Generated image";


          img.onload = () => {
            const loader = messageElement?.querySelector('.image-loader-container');
            if (loader) {
              loader.replaceWith(img);
            }
            if (messageElement) addFeedbackControls(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
          };

          img.onerror = () => {
            messageElement?.remove();
            addMessage("error", "Failed to load the generated image.");
          };

          img.src = imageUrl;
          chatHistory.push(userContent);
          chatHistory.push({
            role: 'model',
            parts: modelResponseParts
          });
          imageFound = true;
          saveChatHistory();
          break;
        }
      }
    }

    if (!imageFound) {
      throw new Error("Image data not found in response. The request may have been blocked by safety filters.");
    }
  } catch (error) {
    const friendlyError = getFriendlyErrorMessage(error);
    messageElement?.remove();
    addMessage("error", `Image generation failed: ${friendlyError}`);
    console.error("Error during generateImageFromPrompt:", error);
  } finally {
    setLoading(false);
  }
}


// --- UI AND UX FUNCTIONS ---

function addMessage(role, textOrParts, isStreaming = false, isImageLoading = false) {
  if (!chatContainer) return null;
  const messageId = `msg-${Date.now()}-${Math.random()}`;
  const messageWrapper = document.createElement("div");
  messageWrapper.className = `message ${role}-message`;
  messageWrapper.id = messageId;

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";

  if (isImageLoading) {
    messageContent.innerHTML = `
      <div class="image-loader-container">
        <div class="image-loader-placeholder"></div>
        <span>Generating image...</span>
      </div>
    `;
  } else if (isStreaming && role === 'model') {
    messageContent.innerHTML = `
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
  } else {
    if (role === 'model') {
        const text = (Array.isArray(textOrParts) ? textOrParts.find(p => 'text' in p)?.text : textOrParts) || "";
        const imagePart = (Array.isArray(textOrParts) ? textOrParts.find(p => 'inlineData' in p)?.inlineData : null);
        if(text) {
          messageContent.innerHTML = marked.parse(text);
        }
        if(imagePart) {
          const imageUrl = `data:${imagePart.mimeType};base64,${imagePart.data}`;
          const img = document.createElement('img');
          img.src = imageUrl;
          img.alt = "Generated image";
          messageContent.appendChild(img);
        }

    } else if (role === 'user') {
      const p = document.createElement('p');
      p.textContent = textOrParts as string;
      messageContent.appendChild(p);
    } else if (role === 'error') {
      playAudioCue('error');
      messageWrapper.classList.add('error-message');
      messageContent.textContent = textOrParts as string;
    }
  }

  // Make images clickable
  messageContent.querySelectorAll('img').forEach(img => {
      img.addEventListener('click', () => openImageModal(img.src));
  });

  const timestamp = document.createElement('span');
  timestamp.className = 'timestamp';
  timestamp.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  messageWrapper.appendChild(messageContent);
  messageWrapper.appendChild(timestamp);

  chatContainer.appendChild(messageWrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (role === 'model' && !isStreaming && !isImageLoading) {
    const textPart = Array.isArray(textOrParts) ? textOrParts.find(p => 'text' in p) : textOrParts;
    if(textPart){
       addAudioControls(messageWrapper);
    }
    addFeedbackControls(messageWrapper);
  }

  return messageWrapper;
}

function appendSources(messageElement, groundingChunks) {
  if (!messageElement || !groundingChunks) return;
  const webChunks = groundingChunks.filter(chunk => chunk.web && chunk.web.uri);
  if (webChunks.length === 0) return;

  const sourcesContainer = document.createElement('div');
  sourcesContainer.className = 'sources-container';
  sourcesContainer.innerHTML = '<h4>Sources</h4>';
  const list = document.createElement('ol');
  webChunks.forEach(chunk => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = chunk.web.uri;
    link.textContent = chunk.web.title || chunk.web.uri;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    listItem.appendChild(link);
    list.appendChild(listItem);
  });
  sourcesContainer.appendChild(list);
  const contentEl = messageElement.querySelector('.message-content');
  if (contentEl) {
    contentEl.appendChild(sourcesContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function setLoading(isLoading) {
  const buttonsToDisable = [submitBtn, imageGenBtn, uploadBtn, voiceBtn, cameraBtn, newChatBtn];
  buttonsToDisable.forEach(btn => { if(btn) btn.disabled = isLoading });
  
  if(promptInput) promptInput.disabled = isLoading;
  if(sendIcon) (sendIcon as HTMLElement).hidden = isLoading;
  if(loader) (loader as HTMLElement).hidden = !isLoading;
  if(imageGenBtn) (imageGenBtn as HTMLElement).style.display = isLoading ? 'none' : 'flex';

  if (isLoading) {
    chatContainer?.setAttribute('aria-busy', 'true');
  } else {
    chatContainer?.removeAttribute('aria-busy');
    clearInput();
  }
}

function clearInput() {
  if (promptInput) {
    promptInput.value = "";
    promptInput.style.height = 'auto';
    (promptInput as HTMLTextAreaElement).placeholder = 'Ask about wellness or medications...';
  }
  if (fileUpload) fileUpload.value = "";
  if (filePreview) {
    filePreview.innerHTML = "";
    filePreview.hidden = true;
  }
  if(inputRow) inputRow.classList.remove('input-row--active');
}

// --- FILE HANDLING ---
function handleFileUpload() {
  const file = fileUpload.files[0];
  if (!file) {
    if (filePreview) filePreview.hidden = true;
    return;
  }

  // File size check (e.g., 10MB limit)
  const MAX_FILE_SIZE_MB = 10;
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      addMessage("error", `File is too large. Please select a file smaller than ${MAX_FILE_SIZE_MB}MB.`);
      fileUpload.value = ""; // Clear the selected file
      return;
  }

  if (welcomeContainer) {
    welcomeContainer.style.display = 'none';
  }

  playAudioCue('upload');
  filePreview.innerHTML = "";
  filePreview.hidden = false;
  inputRow.classList.add('input-row--active');
  (promptInput as HTMLTextAreaElement).placeholder = 'Ask about the file...';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-preview-btn';
  removeBtn.innerHTML = '&times;';
  removeBtn.onclick = () => {
    fileUpload.value = "";
    filePreview.hidden = true;
    (promptInput as HTMLTextAreaElement).placeholder = 'Ask about wellness or medications...';
    if (!promptInput.value) {
      inputRow.classList.remove('input-row--active');
    }
  };

  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    filePreview.appendChild(img);
  } else {
    filePreview.innerHTML = `<div class="file-info-preview"><span>${file.name}</span></div>`;
  }
  filePreview.appendChild(removeBtn);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.toString().split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

// --- THEME MANAGEMENT ---
function applyInitialTheme() {
    try {
      const savedTheme = localStorage.getItem('theme') || 'light';
      document.body.dataset.theme = savedTheme;
      updateThemeToggle(savedTheme);
    } catch (e) {
      console.warn("Could not access localStorage to apply theme.", e);
      document.body.dataset.theme = 'light';
      updateThemeToggle('light');
    }
}

function toggleTheme() {
    const currentTheme = document.body.dataset.theme || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = newTheme;
    try {
      localStorage.setItem('theme', newTheme);
    } catch(e) {
      console.warn("Could not save theme to localStorage.", e);
    }
    updateThemeToggle(newTheme);
}

function updateThemeToggle(theme) {
    if(!sunIcon || !moonIcon || !hljsTheme) return;
    if (theme === 'dark') {
        sunIcon.hidden = true;
        moonIcon.hidden = false;
        hljsTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";

    } else {
        sunIcon.hidden = false;
        moonIcon.hidden = true;
        hljsTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css";
    }
}

// --- CHAT HISTORY MANAGEMENT ---
function saveChatHistory() {
  try {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
  } catch(e) {
    console.warn("Could not save chat history to localStorage.", e);
  }
}

function loadChatHistory() {
    try {
      const savedHistory = localStorage.getItem('chatHistory');
      if (savedHistory) {
          chatHistory = JSON.parse(savedHistory);
          if (!chatContainer) return;
          chatContainer.innerHTML = ''; // Clear welcome message
          chatHistory.forEach(message => {
              if (message.role === 'user') {
                  addMessage('user', message.parts.find(p => 'text' in p)?.text || "");
              } else if (message.role === 'model') {
                  addMessage('model', message.parts);
              }
          });

          if(chatHistory.length > 0 && welcomeContainer) {
              welcomeContainer.style.display = 'none';
          }
      }
    } catch(e) {
      console.error("Failed to load or parse chat history from localStorage. Starting fresh.", e);
      chatHistory = [];
      try {
        localStorage.removeItem('chatHistory');
      } catch(removeError) {
        console.error("Failed to remove corrupted chat history.", removeError);
      }
    }
}

function startNewChat() {
    if (confirm("Are you sure you want to start a new chat? Your current conversation will be cleared.")) {
        chatHistory = [];
        try {
          localStorage.removeItem('chatHistory');
        } catch(e) {
          console.warn("Could not remove chat history from localStorage.", e);
        }
        if(chatContainer) chatContainer.innerHTML = '';
        if (welcomeContainer) {
          welcomeContainer.style.display = 'block';
        }
    }
}


// --- KEYBOARD SHORTCUTS ---
function handleGlobalKeyDown(e) {
  if (e.key === 'Escape') {
    if (cameraModal && !cameraModal.hidden) closeCamera();
    if (imageViewerModal && !imageViewerModal.hidden) closeImageModal();
  }
}

// --- MODALS (CAMERA & IMAGE VIEWER) ---
async function openCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    (cameraView as HTMLVideoElement).srcObject = cameraStream;
    if (cameraModal) cameraModal.hidden = false;
  } catch (err) {
    console.error("Error accessing camera:", err);
    let msg = "Could not access the camera. Please check permissions.";
    if (err.name === 'NotAllowedError') msg = "Camera access was denied. Please allow camera permissions in your browser settings.";
    if (err.name === 'NotFoundError') msg = "No camera found on this device.";
    addMessage("error", msg);
  }
}

function closeCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  if (cameraModal) cameraModal.hidden = true;
}

function captureImage() {
  const canvas = cameraCanvas as HTMLCanvasElement;
  const video = cameraView as HTMLVideoElement;
  if (!canvas || !video) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if(!blob) {
      addMessage("error", "Failed to capture image from camera.");
      return;
    }
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileUpload.files = dataTransfer.files;
    fileUpload.dispatchEvent(new Event('change', { bubbles: true }));
    closeCamera();
  }, 'image/jpeg');
}

function openImageModal(src) {
    if(imageViewerContent) (imageViewerContent as HTMLImageElement).src = src;
    if(imageViewerModal) imageViewerModal.hidden = false;
}

function closeImageModal() {
    if(imageViewerModal) imageViewerModal.hidden = true;
    if(imageViewerContent) (imageViewerContent as HTMLImageElement).src = "";
}

// --- VOICE INPUT AND VISUALIZER ---

function toggleVoiceRecognition() {
  if (isRecording) {
    stopVoiceRecognition();
  } else {
    startVoiceRecognition();
  }
}

function startVoiceRecognition() {
  try {
    recognition = new SpeechRecognition();
  } catch(e) {
    addMessage("error", "Speech recognition is not supported by your browser.");
    return;
  }
  
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    micIcon.hidden = true;
    stopIcon.hidden = false;
    voiceBtn.classList.add('recording');
    promptInput.placeholder = "Listening...";
    startVisualizer();
    inputRow.classList.add('input-row--active');
  };

  recognition.onend = () => { 
    if (isRecording) {
      stopVoiceRecognition(); 
    }
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    promptInput.value = final + interim;
    promptInput.style.height = 'auto';
    promptInput.style.height = (promptInput.scrollHeight) + 'px';
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    let errorMessage = `Voice input error: ${event.error}`;
    if (event.error === 'no-speech') {
        errorMessage = "No speech was detected. Please try again.";
    } else if (event.error === 'not-allowed') {
        errorMessage = "Microphone access was denied. Please allow microphone permissions in your browser settings.";
    }
    addMessage("error", errorMessage);
    stopVoiceRecognition();
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("Could not start speech recognition:", e);
    addMessage("error", `Could not start voice input: ${e.message}`);
    stopVoiceRecognition();
  }
}

function stopVoiceRecognition() {
  if (recognition) {
    recognition.onend = null;
    recognition.stop();
    recognition = null;
  }
  isRecording = false;
  if(micIcon) micIcon.hidden = false;
  if (stopIcon) {
    stopIcon.hidden = true;
    (stopIcon as HTMLElement).style.transform = 'scale(1)'; // Reset transform
  }
  if(voiceBtn) voiceBtn.classList.remove('recording');
  if(promptInput) {
    promptInput.placeholder = "Ask about wellness or medications...";
    if (promptInput.value.trim()) {
      sendMessage();
    }
  }
  stopVisualizer();
  if (promptInput && !promptInput.value && fileUpload && !fileUpload.files[0]) {
    inputRow.classList.remove("input-row--active");
  }
}

async function startVisualizer() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new(window.AudioContext || (window as any).webkitAudioContext)();
    source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    gainNode = audioContext.createGain();

    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    source.connect(gainNode).connect(analyser);
    promptInput.style.display = 'none';
    visualizerContainer.style.display = 'flex';
    setTimeout(() => { if(visualizerContainer) visualizerContainer.style.opacity = '1'; }, 10);
    if(visualizerControls) visualizerControls.hidden = false;

    draw();
  } catch (err) {
    console.error('Error accessing microphone for visualizer:', err);
    let msg = 'Could not access microphone for visualization. Please check permissions.';
    if (err.name === 'NotAllowedError') msg = 'Microphone access denied. Please allow microphone permissions in browser settings.';
    addMessage('error', msg);
    stopVoiceRecognition();
  }
}

function stopVisualizer() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  
  if(promptInput) promptInput.style.display = 'block';
  if(visualizerContainer) {
    visualizerContainer.style.opacity = '0';
    visualizerContainer.style.display = 'none';
  }
  if(visualizerControls) visualizerControls.hidden = true;
}

function draw() {
  if (!isRecording || !analyser || !dataArray) return;

  animationFrameId = requestAnimationFrame(draw);
  analyser.getByteFrequencyData(dataArray);

  const canvas = voiceVisualizer as HTMLCanvasElement;
  if (!canvas) return;
  const canvasCtx = canvas.getContext('2d');
  const { width, height } = canvas;
  const average = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
  const normalized = Math.min(average / 150, 1);

  // Dynamically scale the stop icon based on volume
  const scale = 1 + normalized * 0.4; // Scale from 1 up to 1.4
  if (stopIcon) {
    (stopIcon as HTMLElement).style.transform = `scale(${scale})`;
  }

  // Dynamically change visualizer color based on volume
  const primaryColor = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();
  const secondaryColor = getComputedStyle(document.body).getPropertyValue('--accent-secondary').trim();
  const dangerColor = getComputedStyle(document.body).getPropertyValue('--danger').trim();
  
  let color = primaryColor;
  if (normalized > 0.3) {
    color = secondaryColor;
  }
  if (normalized > 0.6) {
    color = dangerColor;
  }
  
  const time = Date.now() * 0.005;
  const totalAmp = 2 + (height / 2.5) * normalized;

  canvasCtx.clearRect(0, 0, width, height);
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = color; // Use the dynamic color
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, height / 2);

  for (let x = 0; x < width; x++) {
    const angle = (x / width) * Math.PI * 6 + time;
    const y = Math.sin(angle) * totalAmp;
    const jitter = (dataArray[Math.floor((x / width) * dataArray.length)] / 255 - 0.5) * 15 * normalized;
    canvasCtx.lineTo(x, height / 2 + y + jitter);
  }
  canvasCtx.stroke();
}

function toggleMute() {
  if (!gainNode || !audioContext) return;
  const isMuted = gainNode.gain.value === 0;
  gainNode.gain.setValueAtTime(isMuted ? parseFloat((volumeSlider as HTMLInputElement).value) : 0, audioContext.currentTime);
  unmutedIcon.hidden = !isMuted;
  mutedIcon.hidden = isMuted;
}

function changeVolume(event) {
  if (!gainNode || !audioContext || gainNode.gain.value === 0) return;
  gainNode.gain.setValueAtTime(event.target.value, audioContext.currentTime);
}

// --- AUDIO OUTPUT & PLAYBACK ---

function addAudioControls(messageElement) {
    if (!messageElement || messageElement.querySelector('.audio-controls')) return;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'audio-controls';

    const playPauseBtn = document.createElement('button');
    playPauseBtn.className = 'feedback-btn play-pause-btn';
    playPauseBtn.setAttribute('aria-label', 'Play audio');
    playPauseBtn.innerHTML = `<svg class="play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"></path></svg>
                             <svg class="pause-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" hidden><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
                             <div class="loader audio-loader" hidden></div>`;

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.className = 'audio-volume-slider';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.05';
    volumeSlider.value = '1';
    volumeSlider.setAttribute('aria-label', 'Volume');

    playPauseBtn.onclick = () => handlePlayPause(messageElement, playPauseBtn);
    volumeSlider.oninput = (e) => handleVolumeChange(e.target as HTMLInputElement);

    controlsContainer.append(playPauseBtn, volumeSlider);
    messageElement.appendChild(controlsContainer);
}


async function handlePlayPause(messageElement, button) {
    const messageId = messageElement.id;
    const contentElement = messageElement.querySelector('.message-content');
    if (!contentElement) return;
    const textToSpeak = contentElement.textContent;
    if (!textToSpeak || textToSpeak.trim().length === 0) return;

    if (currentAudioMessageId === messageId && currentAudioSource) {
        currentAudioSource.stop();
        // The onended event will handle cleanup
        return;
    }

    if (currentAudioSource) {
        currentAudioSource.stop();
    }

    if (audioBuffersCache[messageId]) {
        playAudio(audioBuffersCache[messageId], messageId, button);
    } else {
        await generateAndPlayAudio(textToSpeak, messageId, button);
    }
}

function handleVolumeChange(slider) {
    if (currentGainNode) {
        currentGainNode.gain.value = parseFloat(slider.value);
    }
}


async function generateAndPlayAudio(text, messageId, button) {
    const playIcon = button.querySelector('.play-icon');
    const pauseIcon = button.querySelector('.pause-icon');
    const loader = button.querySelector('.audio-loader');

    playIcon.hidden = true;
    loader.hidden = false;
    button.disabled = true;

    try {
        if (!ai) throw new Error("AI not initialized.");
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("No audio data returned from API.");

        if (!outputAudioContext || outputAudioContext.state === 'closed') {
           outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        
        const audioBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, outputAudioContext, 24000, 1);
        audioBuffersCache[messageId] = audioBuffer;
        
        playAudio(audioBuffer, messageId, button);

    } catch (error) {
        console.error("Error generating or playing audio:", error);
        addMessage("error", `Sorry, I couldn't generate the audio: ${getFriendlyErrorMessage(error)}`);
        playIcon.hidden = false;
    } finally {
        loader.hidden = true;
        button.disabled = false;
    }
}

function playAudio(audioBuffer, messageId, button) {
    if (!outputAudioContext) return;
    
    // Resume context if it was suspended by browser policy
    if (outputAudioContext.state === 'suspended') {
        outputAudioContext.resume();
    }

    const source = outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = outputAudioContext.createGain();
    const volumeSlider = button.parentElement.querySelector('.audio-volume-slider') as HTMLInputElement;
    gainNode.gain.value = volumeSlider ? parseFloat(volumeSlider.value) : 1;
    
    source.connect(gainNode);
    gainNode.connect(outputAudioContext.destination);
    source.start(0);

    currentAudioSource = source;
    currentGainNode = gainNode;
    currentAudioMessageId = messageId;
    
    // UI update
    button.querySelector('.play-icon').hidden = true;
    button.querySelector('.pause-icon').hidden = false;
    button.setAttribute('aria-label', 'Pause audio');

    source.onended = () => {
        // Reset UI for the button that just finished
        button.querySelector('.play-icon').hidden = false;
        button.querySelector('.pause-icon').hidden = true;
        button.setAttribute('aria-label', 'Play audio');
        
        // Clear global state only if this was the active source
        if (currentAudioMessageId === messageId) {
            currentAudioSource = null;
            currentGainNode = null;
            currentAudioMessageId = null;
        }
    };
}


function decode(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    return new Uint8Array(0);
  }
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // This is a custom raw PCM decoder, as browsers' native decodeAudioData expects a file format header.
  if (data.length === 0) return ctx.createBuffer(numChannels, 0, sampleRate);
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize from 16-bit signed integer to a float between -1.0 and 1.0
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


// --- MISC HELPERS ---
function addFeedbackControls(messageElement) {
  if (!messageElement || messageElement.querySelector('.image-loader-container') || messageElement.querySelector('.feedback-container')) return;

  const feedbackContainer = document.createElement('div');
  feedbackContainer.className = 'feedback-container';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'feedback-btn copy-btn';
  const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>`;
  const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg>`;
  copyBtn.innerHTML = copyIcon;
  copyBtn.onclick = () => {
    const content = messageElement.querySelector('.message-content')?.textContent || '';
    navigator.clipboard.writeText(content).then(() => {
      copyBtn.innerHTML = checkIcon;
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.innerHTML = copyIcon;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
        console.error("Failed to copy text:", err);
        addMessage("error", "Could not copy text to clipboard.");
    });
  };

  const thumbsUpBtn = document.createElement('button');
  thumbsUpBtn.className = 'feedback-btn';
  thumbsUpBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"></path></svg>`;
  const thumbsDownBtn = document.createElement('button');
  thumbsDownBtn.className = 'feedback-btn';
  thumbsDownBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"></path></svg>`;
  thumbsUpBtn.onclick = () => handleFeedbackClick(messageElement.id, 'up', thumbsUpBtn, thumbsDownBtn);
  thumbsDownBtn.onclick = () => handleFeedbackClick(messageElement.id, 'down', thumbsUpBtn, thumbsDownBtn);
  
  feedbackContainer.append(copyBtn, thumbsUpBtn, thumbsDownBtn);
  messageElement.appendChild(feedbackContainer);
}

function handleFeedbackClick(messageId, vote, btnUp, btnDown) {
  try {
    const feedback = JSON.parse(localStorage.getItem('messageFeedback')) || {};
    feedback[messageId] = vote;
    localStorage.setItem('messageFeedback', JSON.stringify(feedback));
  } catch(e) {
    console.warn("Could not save feedback to localStorage.", e);
  }

  btnUp.disabled = true;
  btnDown.disabled = true;
  if (vote === 'up') btnUp.classList.add('selected');
  else btnDown.classList.add('selected');
}

function playAudioCue(type) {
  try {
    const audioCtx = new(window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain).connect(audioCtx.destination);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);

    const ramps = {
      send: { t: 'sine', f: 500, g: 0.1, r1: 0.05, r2: 0.15, d: 0.2 },
      receive: { t: 'sine', f: 600, g: 0.08, r1: 0.05, r2: 0.2, d: 0.25 },
      error: { t: 'square', f: 150, g: 0.1, r1: 0.05, r2: 0.3, d: 0.35 },
      upload: { t: 'triangle', f: 440, f2: 660, ft: 0.1, g: 0.1, r1: 0.05, r2: 0.25, d: 0.3 },
      imageGenStart: { t: 'sawtooth', f: 220, g: 0.05, r1: 0.05, r2: 0.4, d: 0.45 },
      processing: { t: 'sawtooth', f: 100, f2: 150, ft: 0.1, g: 0.04, r1: 0.05, r2: 0.2, d: 0.25 },
      imageGenSuccess: { t: 'sine', f: 880, f2: 1200, ft: 0.1, g: 0.1, r1: 0.05, r2: 0.2, d: 0.25 },
    };

    const p = ramps[type];
    if (!p) return;
    osc.type = p.t as OscillatorType;
    osc.frequency.setValueAtTime(p.f, audioCtx.currentTime);
    if (p.f2) osc.frequency.linearRampToValueAtTime(p.f2, audioCtx.currentTime + p.ft);
    gain.gain.exponentialRampToValueAtTime(p.g, audioCtx.currentTime + p.r1);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + p.r2);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + p.d);
  } catch (e) {
    console.warn("Could not play audio cue.", e);
  }
}

function getFriendlyErrorMessage(error) {
  const msg = error?.toString() || "An unknown error occurred.";
  if (msg.includes('API key not valid')) return 'API Key Error: Please ensure your API key is configured correctly.';
  if (msg.includes('fetch') || msg.includes('NetworkError')) return 'Network Error: Please check your internet connection.';
  if (msg.includes('400') || msg.includes('Invalid argument')) return 'Invalid Request: The data sent to the AI was invalid. Please try again.';
  if (msg.includes('429')) return 'Rate Limit Exceeded: The service is busy. Please wait a moment before sending another request.';
  if (msg.includes('500') || msg.includes('503')) return 'Server Error: The AI service is temporarily unavailable. Please try again later.';
  if (msg.includes('[SAFETY]') || msg.includes('blocked by safety')) return 'Content Moderation: The request or response was blocked due to safety settings. Please rephrase your prompt.';
  return 'An unexpected error occurred. Please see the console for details.';
}

function isResponseInsufficient(text) {
  if (text === null || text === undefined) return true;
  const trimmedText = text.trim();
  if (trimmedText.length === 0) return true;
  // This list checks for common refusal patterns and disclaimer-only responses.
  const patterns = [
      /\[Wellness Guide\]/gi, /\[Advisory Notice\].*?issues\./gi, /\[🚨 IMMEDIATE DANGER ALERT\].*?NOW\./gi,
      /Full Disclaimer A: WELLNESS ADVISORY.*?treatment\./gis,
      /Full Disclaimer B: CRITICAL HEALTH WARNING.*?immediately\./gis,
      /Full Disclaimer C \(Refusal\).*?active\.\)/gis,
      /I am a safety-first, ethical AI.*?professional immediately\./gis,
      /I (am unable to|cannot|can't) (provide|answer|fulfill|generate|give|assist with|create content of that nature)/gi,
      /as an AI,? I am not able to/gi, /I do not have the ability to/gi,
      /(for your safety|due to my safety guidelines|as a safety precaution|based on my safety policies)/gi,
      /I'm sorry, but I cannot/gi, /Unfortunately, I am unable to/gi,
      /My apologies, but I'm not supposed to/gi, /I must decline this request/gi,
      /It is outside of my capabilities to/gi, /I am not designed to/gi,
      /As a large language model/gi, /My instructions prevent me from/gi,
      /That request goes against my safety policies/gi, /I'm unable to provide information on that topic/gi,
      /cannot provide specific medical advice/gi, /crucial to consult with a qualified healthcare provider/gi,
      /My purpose is to provide general information and not to replace professional medical advice/gi,
      /I am not a medical professional/gi, /It is important to seek advice from a medical professional/gi,
      /Please consult your doctor or pharmacist/gi, /This information is for educational purposes only/gi,
      /I am only an AI assistant/gi, /However, I can't give you medical advice/gi,
      /This information should not be used as a substitute for professional medical advice, diagnosis, or treatment\./gi,
      /Always seek the advice of your physician or other qualified health provider/gi,
      /If you are in a crisis or may have an emergency, please call your local emergency services immediately\./gi,
      /I cannot assist with that as it falls outside my safety guidelines\./gi,
      /I must emphasize that I am an AI/gi,
  ];
  
  let substantiveContent = trimmedText;
  for (const p of patterns) { 
      substantiveContent = substantiveContent.replace(p, ''); 
  }
  // If after removing all disclaimers and refusals, there's very little text left, it's insufficient.
  return substantiveContent.trim().length < 25;
}