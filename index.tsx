import {
  GoogleGenAI,
  Chat
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

*5. HARD REFUSAL & ETHICAL/LEGAL GUARDRAILS (HIGH RISK):*
You must follow the *Refusal Protocol C* for all high-risk or illegal queries.
- *Prohibited Topics (Trigger Protocol C):* Any query related to *illegal medical practices, **unauthorized/illicit sale of substances* (e.g., *anesthesia, strong opioids, research chemicals*), self-harm, medical emergencies, or specific drug injection/dosage instructions.

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
let chat: Chat;

let isRecording = false;
let recognition;
// FIX: Cast window to any to access browser-specific SpeechRecognition APIs.
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

// --- DOM ELEMENTS ---
let chatContainer, chatForm, submitBtn, promptInput, sendIcon, loader,
  uploadBtn, fileUpload, filePreview, voiceBtn, micIcon, stopIcon,
  inputRow, voiceVisualizer, visualizerContainer,
  visualizerControls, muteBtn, unmutedIcon, mutedIcon, volumeSlider,
  cameraBtn, cameraModal, cameraView, cameraCanvas, captureBtn, closeCameraBtn;

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


  // Initialize chat
  initChat().catch(err => {
    addMessage("error", `Chat initialization failed:\n${err.message}`);
    console.error(err);
  });

  // Setup event listeners
  setupEventListeners();

  // Start onboarding tour if it's the first visit
  if (!localStorage.getItem('onboardingTourCompleted')) {
    startOnboardingTour();
  }
});

function setupEventListeners() {
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  uploadBtn.addEventListener("click", () => fileUpload.click());
  fileUpload.addEventListener("change", handleFileUpload);

  // Camera
  cameraBtn.addEventListener("click", openCamera);
  closeCameraBtn.addEventListener("click", closeCamera);
  captureBtn.addEventListener("click", captureImage);


  // Voice recognition
  if (SpeechRecognition) {
    voiceBtn.addEventListener("click", toggleVoiceRecognition);
  } else {
    voiceBtn.style.display = 'none';
  }

  // Visualizer controls
  muteBtn.addEventListener('click', toggleMute);
  volumeSlider.addEventListener('input', changeVolume);
}

// --- API AND CHAT LOGIC ---

async function initChat() {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.API_KEY
    });
    chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      history: [],
    });

  } catch (error) {
    console.error("Chat initialization failed:", error);
    addMessage("error", getFriendlyErrorMessage(error));
  }
}

async function sendMessage() {
  const prompt = promptInput.value.trim();
  const file = fileUpload.files[0];

  if (!prompt && !file) return;

  playAudioCue('send');
  addMessage("user", prompt);
  setLoading(true);

  const parts = [];

  if (file) {
    try {
      const base64Data = await fileToBase64(file);
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.type
        }
      });
    } catch (error) {
      addMessage("error", "Failed to read the attached file.");
      setLoading(false);
      return;
    }
  }

  if (prompt) {
    parts.push({
      text: prompt
    });
  }


  let currentResponse = "";
  let messageElement = null;

  try {
    const resultStream = await chat.sendMessageStream({
      message: parts
    });

    for await (const chunk of resultStream) {
      const chunkText = chunk.text;
      if (chunkText) {
        currentResponse += chunkText;
        if (!messageElement) {
          playAudioCue('receive');
          messageElement = addMessage("model", "", true); // Add streaming message
        }
        // Sanitize and render markdown
        const sanitizedHtml = marked.parse(currentResponse, {
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
        messageElement.querySelector('.message-content').innerHTML = sanitizedHtml;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
    if (messageElement) {
      addFeedbackControls(messageElement);
    }
  } catch (error) {
    const friendlyError = getFriendlyErrorMessage(error);
    addMessage("error", `An error occurred: ${friendlyError}`);
    console.error("Error during sendMessageStream:", error);
  } finally {
    setLoading(false);
  }
}

// --- UI AND UX FUNCTIONS ---

function addMessage(role, text, isStreaming = false) {
  const messageId = `msg-${Date.now()}-${Math.random()}`;
  const messageWrapper = document.createElement("div");
  messageWrapper.className = `message ${role}-message`;
  messageWrapper.id = messageId;

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";

  if (text) {
    if (role === 'model') {
      messageContent.innerHTML = marked.parse(text);
    } else {
      const p = document.createElement('p');
      p.textContent = text;
      messageContent.appendChild(p);
    }
  } else if (isStreaming && role === 'model') {
    // Add a placeholder for streaming content
    const loadingDots = document.createElement('div');
    loadingDots.className = 'streaming-loader';
    loadingDots.innerHTML = '<span></span><span></span><span></span>';
    messageContent.appendChild(loadingDots);
  } else if (role === 'error') {
    playAudioCue('error');
    messageWrapper.classList.add('error-message');
    messageContent.textContent = text;
  }

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

  // Add feedback controls if it's a complete model message
  if (role === 'model' && !isStreaming) {
    addFeedbackControls(messageWrapper);
  }

  return messageWrapper;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  uploadBtn.disabled = isLoading;
  voiceBtn.disabled = isLoading;
  cameraBtn.disabled = isLoading;
  promptInput.disabled = isLoading;
  (sendIcon as HTMLElement).hidden = isLoading;
  (loader as HTMLElement).hidden = !isLoading;

  if (isLoading) {
    chatContainer.setAttribute('aria-busy', 'true');
    loader.setAttribute('aria-label', 'AI is generating a response');
  } else {
    chatContainer.removeAttribute('aria-busy');
    loader.setAttribute('aria-label', 'Loading');
    clearInput();
  }
}

function clearInput() {
  promptInput.value = "";
  fileUpload.value = "";
  filePreview.innerHTML = "";
  filePreview.hidden = true;
  promptInput.style.height = 'auto';
  (promptInput as HTMLTextAreaElement).placeholder = 'Ask about wellness or medications...';
  inputRow.classList.remove('input-row--active');
}

// --- FILE HANDLING ---

function handleFileUpload() {
  const file = fileUpload.files[0];
  if (!file) {
    filePreview.hidden = true;
    (promptInput as HTMLTextAreaElement).placeholder = 'Ask about wellness or medications...';
    return;
  }

  filePreview.innerHTML = ""; // Clear previous preview
  filePreview.hidden = false;
  inputRow.classList.add('input-row--active');
  (promptInput as HTMLTextAreaElement).placeholder = 'Ask about the file and your wellness...';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-preview-btn';
  removeBtn.innerHTML = '&times;';
  removeBtn.setAttribute('aria-label', 'Remove attached file');
  removeBtn.onclick = () => {
    fileUpload.value = "";
    filePreview.hidden = true;
    filePreview.innerHTML = "";
    (promptInput as HTMLTextAreaElement).placeholder = 'Ask about wellness or medications...';
    inputRow.classList.remove('input-row--active');
  };

  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    filePreview.appendChild(img);
  } else {
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info-preview';
    fileInfo.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"></path></svg> <span>${file.name}</span>`;
    filePreview.appendChild(fileInfo);
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

// --- CAMERA ---
async function openCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      }
    });
    (cameraView as HTMLVideoElement).srcObject = cameraStream;
    cameraModal.hidden = false;
  } catch (err) {
    console.error("Error accessing camera:", err);
    addMessage("error", "Could not access the camera. Please ensure permissions are granted.");
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }
  cameraModal.hidden = true;
}

function captureImage() {
  const canvas = cameraCanvas as HTMLCanvasElement;
  const video = cameraView as HTMLVideoElement;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    const file = new File([blob], "capture.jpg", {
      type: "image/jpeg"
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileUpload.files = dataTransfer.files;

    // Manually trigger the change event
    const event = new Event('change', {
      bubbles: true
    });
    fileUpload.dispatchEvent(event);

    closeCamera();
  }, 'image/jpeg');
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
  recognition = new SpeechRecognition();
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
    if (isRecording) { // Avoid calling stop again if it was manually stopped
      stopVoiceRecognition();
    }
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    promptInput.value = finalTranscript + interimTranscript;
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    addMessage("error", `Voice input error: ${event.error}`);
    stopVoiceRecognition();
  };

  recognition.start();
}

function stopVoiceRecognition() {
  if (recognition) {
    recognition.stop();
  }
  isRecording = false;
  micIcon.hidden = false;
  stopIcon.hidden = true;
  voiceBtn.classList.remove('recording');
  promptInput.placeholder = "Ask about wellness or medications...";
  stopVisualizer();
  if (!promptInput.value && !fileUpload.files[0]) {
    inputRow.classList.remove("input-row--active");
  }
}

async function startVisualizer() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    // FIX: Cast window to any to access browser-specific webkitAudioContext.
    audioContext = new(window.AudioContext || (window as any).webkitAudioContext)();
    source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    gainNode = audioContext.createGain();

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    source.connect(gainNode);
    gainNode.connect(analyser);

    visualizerContainer.style.height = '44px';
    visualizerContainer.style.opacity = '1';
    visualizerControls.hidden = false;

    draw();
  } catch (err) {
    console.error('Error accessing microphone for visualizer:', err);
    addMessage('error', 'Could not access microphone for visualization.');
  }
}

function stopVisualizer() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  visualizerContainer.style.height = '0';
  visualizerContainer.style.opacity = '0';
  visualizerControls.hidden = true;
  animationFrameId = null;
  mediaStream = null;
}

function draw() {
  if (!isRecording) return;

  animationFrameId = requestAnimationFrame(draw);
  analyser.getByteFrequencyData(dataArray);

  const canvas = voiceVisualizer as HTMLCanvasElement;
  const canvasCtx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  canvasCtx.fillStyle = 'rgb(243, 244, 246)'; // background color
  canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

  const barWidth = (WIDTH / dataArray.length) * 1.5;
  let barHeight;
  let x = 0;

  // Pulsating effect when silent
  const time = Date.now() * 0.005;
  const pulsation = Math.sin(time) * 5 + 5;

  for (let i = 0; i < dataArray.length; i++) {
    barHeight = Math.max(dataArray[i] / 2.5, pulsation);

    canvasCtx.fillStyle = 'rgb(59, 130, 246)';
    canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

    x += barWidth + 1;
  }
}

function toggleMute() {
  if (!gainNode) return;
  const isMuted = gainNode.gain.value === 0;
  if (isMuted) {
    gainNode.gain.setValueAtTime(parseFloat((volumeSlider as HTMLInputElement).value), audioContext.currentTime);
    unmutedIcon.hidden = false;
    mutedIcon.hidden = true;
    muteBtn.setAttribute('aria-label', 'Unmute');
  } else {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    unmutedIcon.hidden = true;
    mutedIcon.hidden = false;
    muteBtn.setAttribute('aria-label', 'Mute');
  }
}

function changeVolume(event) {
  if (!gainNode || gainNode.gain.value === 0) return; // Don't change volume if muted
  gainNode.gain.setValueAtTime(event.target.value, audioContext.currentTime);
}

// --- ONBOARDING TOUR ---
function startOnboardingTour() {
  const tourSteps = [{
    element: '#input-row',
    title: 'Welcome to Friendly MBBS AI!',
    content: 'You can type your wellness questions or attach a file using the paperclip icon.',
    position: 'top'
  }, {
    element: '#camera-btn',
    title: 'Camera Input',
    content: 'Click here to use your camera to take a picture of a prescription or medication box.',
    position: 'top'
  }, {
    element: '#voice-btn',
    title: 'Voice Input',
    content: 'Prefer to speak? Click the microphone to ask your question using your voice.',
    position: 'top'
  }, {
    element: '.model-message',
    title: 'AI Responses',
    content: 'The AI\'s response will appear here. After a response is complete, you can provide feedback using the thumbs up/down icons.',
    position: 'bottom'
  }];

  let currentStep = 0;
  showTourStep(tourSteps, currentStep);
}

function showTourStep(steps, stepIndex) {
  // End tour if no more steps
  if (stepIndex >= steps.length) {
    endOnboardingTour();
    return;
  }

  // Remove previous tour element
  const existingTour = document.querySelector('.tour-popover-wrapper');
  if (existingTour) existingTour.remove();

  const step = steps[stepIndex];
  const targetElement = document.querySelector(step.element);

  if (!targetElement) {
    // If element not found, skip to next step
    showTourStep(steps, stepIndex + 1);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'tour-popover-wrapper';

  const popover = document.createElement('div');
  popover.className = `tour-popover tour-popover-${step.position}`;
  popover.innerHTML = `
        <div class="tour-content">
            <h4>${step.title}</h4>
            <p>${step.content}</p>
        </div>
        <div class="tour-navigation">
            ${stepIndex > 0 ? '<button class="tour-btn-prev">Prev</button>' : ''}
            <button class="tour-btn-next">${stepIndex === steps.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
        <button class="tour-btn-close">&times;</button>
    `;

  document.body.appendChild(wrapper);
  wrapper.appendChild(popover);

  const targetRect = targetElement.getBoundingClientRect();

  // Position popover
  if (step.position === 'top') {
    popover.style.bottom = `${window.innerHeight - targetRect.top + 10}px`;
  } else {
    popover.style.top = `${targetRect.bottom + 10}px`;
  }
  popover.style.left = `${targetRect.left + (targetRect.width / 2) - (popover.offsetWidth / 2)}px`;

  // Highlight target element
  targetElement.classList.add('tour-highlight');

  // Event listeners for navigation
  popover.querySelector('.tour-btn-next').addEventListener('click', () => {
    targetElement.classList.remove('tour-highlight');
    showTourStep(steps, stepIndex + 1);
  });

  if (stepIndex > 0) {
    popover.querySelector('.tour-btn-prev').addEventListener('click', () => {
      targetElement.classList.remove('tour-highlight');
      showTourStep(steps, stepIndex - 1);
    });
  }

  popover.querySelector('.tour-btn-close').addEventListener('click', () => {
    targetElement.classList.remove('tour-highlight');
    endOnboardingTour();
  });

  wrapper.addEventListener('click', (e) => {
    if (e.target === wrapper) {
      targetElement.classList.remove('tour-highlight');
      endOnboardingTour();
    }
  });
}

function endOnboardingTour() {
  const existingTour = document.querySelector('.tour-popover-wrapper');
  if (existingTour) existingTour.remove();
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  localStorage.setItem('onboardingTourCompleted', 'true');
}

// --- MISC HELPERS ---
function addFeedbackControls(messageElement) {
  const feedbackContainer = document.createElement('div');
  feedbackContainer.className = 'feedback-container';

  const thumbsUpBtn = document.createElement('button');
  thumbsUpBtn.className = 'feedback-btn';
  thumbsUpBtn.setAttribute('aria-label', 'Good response');
  thumbsUpBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"></path></svg>`;
  thumbsUpBtn.onclick = () => handleFeedbackClick(messageElement.id, 'up', thumbsUpBtn, thumbsDownBtn);

  const thumbsDownBtn = document.createElement('button');
  thumbsDownBtn.className = 'feedback-btn';
  thumbsDownBtn.setAttribute('aria-label', 'Bad response');
  thumbsDownBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"></path></svg>`;
  thumbsDownBtn.onclick = () => handleFeedbackClick(messageElement.id, 'down', thumbsUpBtn, thumbsDownBtn);

  feedbackContainer.appendChild(thumbsUpBtn);
  feedbackContainer.appendChild(thumbsDownBtn);
  messageElement.appendChild(feedbackContainer);
}

function handleFeedbackClick(messageId, vote, btnUp, btnDown) {
  const feedback = JSON.parse(localStorage.getItem('messageFeedback')) || {};
  feedback[messageId] = vote;
  localStorage.setItem('messageFeedback', JSON.stringify(feedback));

  btnUp.disabled = true;
  btnDown.disabled = true;

  if (vote === 'up') {
    btnUp.classList.add('selected');
  } else {
    btnDown.classList.add('selected');
  }
}

function playAudioCue(type) {
  // FIX: Cast window to any to access browser-specific webkitAudioContext.
  const audioCtx = new(window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

  switch (type) {
    case 'send':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
      break;
    case 'receive':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
      break;
    case 'error':
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
      break;
  }

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.3);
}

function getFriendlyErrorMessage(error) {
  const message = error.toString();
  if (message.includes('API key not valid')) {
    return 'API Key Error: Please ensure your API key is configured correctly.';
  }
  if (message.includes('fetch') || message.includes('NetworkError')) {
    return 'Network Error: Please check your internet connection.';
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return 'Rate Limit Exceeded: Please wait a moment before sending another request.';
  }
  if (message.includes('500') || message.includes('server error')) {
    return 'Server Error: The service is temporarily unavailable. Please try again later.';
  }
  if (message.includes('[SAFETY]')) {
    return 'Content Moderation: The response was blocked due to safety settings. Please rephrase your prompt.';
  }
  return 'An unexpected error occurred. Please see the console for details.';
}