// =========================
// CONFIGURAZIONE BASE
// =========================
const TEACHER_LANG = "fr";   // fr, en, es
const LEVEL = "A1";          // A1, A2, A3

const VOICE_RATE = { A1: 0.65, A2: 0.80, A3: 1.00 }[LEVEL];
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const API_ENDPOINT = "https://fabio-ai-chat.vercel.app/api/chat-a1";

// =========================
// PROMPT DINAMICI
// =========================
const PROMPTS = {
  fr: {
    A1: "Tu es un professeur de français niveau A1. Parle avec phrases très courtes, simples et naturelles. Corrige seulement les erreurs claires. Pose toujours une petite question simple.",
    A2: "Tu es un professeur de français niveau A2. Utilise vocabulaire simple mais varié. Corrige erreurs claires. Pose une question pour continuer.",
    A3: "Tu es un professeur de français niveau A3. Parle de manière naturelle mais claire. Corrige erreurs. Pose une question adaptée."
  },
  en: {
    A1: "You are an English teacher, level A1. Speak with very short and simple sentences. Correct only clear mistakes. Always ask a simple follow-up question.",
    A2: "You are an English teacher, level A2. Use simple but more varied vocabulary. Correct clear mistakes. Ask a question to continue.",
    A3: "You are an English teacher, level A3. Speak naturally but clearly. Correct mistakes. Ask a suitable question."
  },
  es: {
    A1: "Eres un profesor de español nivel A1. Habla con frases muy cortas y simples. Corrige solo errores claros. Haz siempre una pregunta sencilla.",
    A2: "Eres un profesor de español nivel A2. Usa vocabulario simple pero más variado. Corrige errores claros. Haz una pregunta para continuar.",
    A3: "Eres un profesor de español nivel A3. Habla de forma natural pero clara. Corrige errores. Haz una pregunta adecuada."
  }
};

const basePrompt = PROMPTS[TEACHER_LANG][LEVEL];

// =========================
// PULIZIA TESTO PER LA VOCE
// =========================
function cleanForSpeech(text) {
  return text
    .replace(/[*]/g, "")
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================
// VOCE
// =========================
function getVoiceLang() {
  return { fr: "fr-FR", en: "en-US", es: "es-ES" }[TEACHER_LANG];
}

function speakText(text) {
  speechSynthesis.cancel();
  const clean = cleanForSpeech(text);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = getVoiceLang();
  utter.rate = VOICE_RATE;
  speechSynthesis.speak(utter);
}

function speakItalianOnly(text) {
  speechSynthesis.cancel();
  const clean = cleanForSpeech(text);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "it-IT";
  utter.rate = 0.95;
  speechSynthesis.speak(utter);
}

// =========================
// CHAT
// =========================
let history = [];
let isLoading = false;

document.getElementById("send-btn").addEventListener("click", sendMessage);
document.getElementById("user-input").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

function addMessage(sender, text) {
  const log = document.getElementById("chat-log");
  const p = document.createElement("p");
  p.innerHTML = `<strong>${sender}:</strong> ${text}`;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

function sendMessage() {
  if (isLoading) return;
  isLoading = true;

  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text) { isLoading = false; return; }

  addMessage("Tu", text);
  input.value = "";
  evaluateQuality(text);

  history.push("Étudiant: " + text);

  // 🔥 Limitiamo la cronologia per evitare blocchi
  const shortHistory = history.slice(-2).join("\n");

  const fullPrompt = basePrompt + "\n\n" + shortHistory;
  const model = localStorage.getItem("selectedModel") || DEFAULT_MODEL;

  fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: fullPrompt,
      model,
      max_tokens: 120,
      temperature: 0.3
    })
  })
  .then(async r => {
    if (!r.ok) {
      addMessage("AI", "Errore server: " + r.status);
      return null;
    }
    return r.json();
  })
  .then(data => {
    if (!data || !data.reply) return;
    addMessage("AI", data.reply);
    speakText(data.reply);
    history.push("Professeur: " + data.reply);
  })
  .catch(err => addMessage("AI", "Errore rete: " + err))
  .finally(() => isLoading = false);
}

// =========================
// RICONOSCIMENTO VOCALE
// =========================
function getSpeechRecognition() {
  if ("webkitSpeechRecognition" in window) return window.webkitSpeechRecognition;
  if ("SpeechRecognition" in window) return window.SpeechRecognition;
  return null;
}
const SpeechRecognition = getSpeechRecognition();

document.getElementById("voice-btn").addEventListener("click", () => {
  speechSynthesis.cancel();
  if (!SpeechRecognition) {
    addMessage("AI", "Il riconoscimento vocale non è supportato su questo browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = getVoiceLang();
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = e => {
    const text = e.results[0][0].transcript.trim();
    document.getElementById("user-input").value = text;
    sendMessage();
  };

  recognition.onerror = e => addMessage("AI", "Errore riconoscimento vocale: " + e.error);
  recognition.start();
});

// =========================
// ASCOLTA ULTIMA RISPOSTA AI
// =========================
document.getElementById("listen-btn").addEventListener("click", () => {
  speechSynthesis.cancel();

  const messages = [...document.querySelectorAll("#chat-log p")].reverse();
  const lastAI = messages.find(p =>
    p.innerText.startsWith("AI:") ||
    p.innerText.startsWith("Professeur:")
  );

  if (!lastAI) return;

  let text = lastAI.innerText.replace("AI:", "").replace("Professeur:", "").trim();
  speakText(text);
});

// =========================
// CHIEDI (ITALIANO → LINGUA TARGET)
// =========================
document.getElementById("clarify-btn").addEventListener("click", () => {
  speechSynthesis.cancel();

  if (!SpeechRecognition) {
    addMessage("AI", "Il riconoscimento vocale non è supportato.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "it-IT";

  recognition.onresult = e => {
    const text = e.results[0][0].transcript.trim();
    addMessage("Tu", text);

    const langName = { fr: "français", en: "anglais", es: "espagnol" }[TEACHER_LANG];

    const clarifyPrompt =
      basePrompt +
      "\nL’étudiant pose une question en italien. Réponds uniquement en " +
      langName + " niveau " + LEVEL + ".\n\nQuestion: " + text;

    fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: clarifyPrompt, model: DEFAULT_MODEL })
    })
    .then(r => r.json())
    .then(data => {
      addMessage("AI", data.reply);
      speakText(data.reply);
    });
  };

  recognition.start();
});

// =========================
// TRADUCI (AI → ITALIANO)
// =========================
document.getElementById("translate-btn").addEventListener("click", () => {
  const messages = [...document.querySelectorAll("#chat-log p")].reverse();
  const lastAI = messages.find(p =>
    p.innerText.startsWith("AI:") ||
    p.innerText.startsWith("Professeur:")
  );

  if (!lastAI) return;

  let text = lastAI.innerText.replace("AI:", "").replace("Professeur:", "").trim();

  const translatePrompt =
    "Traduisez ce texte vers l’italien. Donne uniquement la traduction italienne.\n\n" + text;

  fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: translatePrompt, model: DEFAULT_MODEL })
  })
  .then(r => r.json())
  .then(data => speakItalianOnly(data.reply));
});

// =========================
// VALUTAZIONE QUALITÀ
// =========================
async function evaluateQuality(userText) {
  const evalPrompt =
    "Évalue cette phrase de l’étudiant de 0 à 10, donne seulement le nombre:\n\n" + userText;

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: evalPrompt,
      model: DEFAULT_MODEL,
      max_tokens: 10,
      temperature: 0.1
    })
  });

  const data = await response.json();
  const score = parseInt(data.reply);

  if (!isNaN(score)) {
    document.getElementById("score").textContent = score;
  }
}

// =========================
// INFO MODELLO
// =========================
document.addEventListener("DOMContentLoaded", () => {
  const selectedModel = localStorage.getItem("selectedModel") || DEFAULT_MODEL;
  const box = document.getElementById("model-info-box");
  if (box) box.textContent = "Modello AI in uso: " + selectedModel;
});
