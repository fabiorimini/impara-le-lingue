// Array cronologia
let history = [];
let isLoading = false;

// Prompt base
const basePrompt =
  "Tu es un professeur de français. Parle toujours en français niveau A1. Utilise des phrases très courtes, simples et naturelles. Corrige uniquement les erreurs claires de grammaire ou de vocabulaire. Après ta réponse, pose toujours une petite question simple pour continuer la conversation. Garde toujours des réponses courtes.\n\n";

const SPEAKER_LANG = "fr-FR";
const DEFAULT_MODEL = "baidu/cobuddy:free";
const API_ENDPOINT = "https://fabio-ai-chat.vercel.app/api/chat-a1";

// =========================
// PULIZIA TESTO PER LA VOCE
// =========================
function cleanForSpeech(text) {
  return text
    .replace(/[*]/g, "")                     // rimuove asterischi
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")  // rimuove emoji faccine
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")  // rimuove simboli vari
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")  // rimuove simboli trasporto
    .replace(/[\u{2600}-\u{26FF}]/gu, "")    // rimuove simboli extra
    .replace(/_/g, " ")                      // rimuove underscore
    .replace(/\s+/g, " ")                    // normalizza spazi
    .trim();
}

// =========================
// RICONOSCIMENTO VOCALE (Chrome OK, Edge fallback)
// =========================
function getSpeechRecognition() {
  if ("webkitSpeechRecognition" in window) return window.webkitSpeechRecognition;
  if ("SpeechRecognition" in window) return window.SpeechRecognition;
  return null;
}

const SpeechRecognition = getSpeechRecognition();

// INVIO TESTO
document.getElementById("send-btn").addEventListener("click", sendMessage);
document.getElementById("user-input").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

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
  const model = localStorage.getItem("selectedModel") || DEFAULT_MODEL;
  const shortHistory = history.slice(-6).join("\n");
  const fullPrompt = basePrompt + shortHistory;

  fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: fullPrompt, model, max_tokens: 120, temperature: 0.3 })
  })
  .then(r => r.json())
  .then(data => {
    if (data.reply) {
      addMessage("AI", data.reply);
      speakText(data.reply);
      history.push("Professeur: " + data.reply);
    }
  })
  .catch(err => addMessage("AI", "Erreur réseau: " + err))
  .finally(() => isLoading = false);
}

// MOSTRA MESSAGGI
function addMessage(sender, text) {
  const log = document.getElementById("chat-log");
  const p = document.createElement("p");
  p.innerHTML = `<strong>${sender}:</strong> ${text}`;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

// VOCE INPUT (FR)
document.getElementById("voice-btn").addEventListener("click", () => {
  speechSynthesis.cancel();

  if (!SpeechRecognition) {
    addMessage("AI", "Il riconoscimento vocale non è supportato su questo browser. Usa Chrome.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = SPEAKER_LANG;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = e => {
    const text = e.results[0][0].transcript.trim();
    if (!text) return;
    evaluateQuality(text);
    document.getElementById("user-input").value = text;
    sendMessage();
  };

  recognition.onerror = e => {
    addMessage("AI", "Errore riconoscimento vocale: " + e.error);
  };

  recognition.start();
});

// VOCE OUTPUT (FR)
function speakText(text) {
  speechSynthesis.cancel();
  const clean = cleanForSpeech(text);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = SPEAKER_LANG;
  utter.rate = 0.65;
  speechSynthesis.speak(utter);
}

// ASCOLTA (FR)
document.getElementById("listen-btn").addEventListener("click", () => {
  speechSynthesis.cancel();
  const last = document.getElementById("chat-log").lastElementChild;
  if (!last) return;
  let text = last.innerText.trim();
  if (!text.startsWith("AI:")) return;
  text = text.replace("AI:", "").trim();
  speakText(text);
});

// CHIARIMENTO (IT)
document.getElementById("clarify-btn").addEventListener("click", () => {
  speechSynthesis.cancel();

  if (!SpeechRecognition) {
    addMessage("AI", "Il riconoscimento vocale non è supportato su questo browser. Usa Chrome.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "it-IT";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = e => {
    const text = e.results[0][0].transcript.trim();
    addMessage("Tu", text);
    evaluateQuality(text);

    const clarifyPrompt =
      basePrompt +
      "L’étudiant pose maintenant une question en italien. Réponds uniquement en français A1.\n\nÉtudiant (italien): " +
      text;

    fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: clarifyPrompt, model: DEFAULT_MODEL, max_tokens: 120, temperature: 0.3 })
    })
    .then(r => r.json())
    .then(data => {
      if (data.reply) {
        addMessage("AI", data.reply);
        speakText(data.reply);
        history.push("Professeur: " + data.reply);
      }
    });
  };

  recognition.start();
});

// TRADUZIONE (IT)
document.getElementById("translate-btn").addEventListener("click", () => {
  const last = document.getElementById("chat-log").lastElementChild;
  if (!last) return;
  let text = last.innerText.replace("AI:", "").replace("Professeur:", "").trim();

  const translatePrompt =
    "Traduisez ce texte vers l’italien. Donne uniquement la traduction italienne.\n\n" + text;

  fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: translatePrompt, model: DEFAULT_MODEL, max_tokens: 120, temperature: 0.3 })
  })
  .then(r => r.json())
  .then(data => { if (data.reply) speakItalianOnly(data.reply); });
});

function speakItalianOnly(text) {
  speechSynthesis.cancel();
  const clean = cleanForSpeech(text);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "it-IT";
  utter.rate = 0.95;
  speechSynthesis.speak(utter);
}

// VALUTAZIONE QUALITÀ
async function evaluateQuality(userText) {
  const evalPrompt =
    "Évalue cette phrase de l’étudiant de 0 à 10, donne seulement le nombre:\n\n" +
    userText;

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

// INFO MODELLO
document.addEventListener("DOMContentLoaded", () => {
  const defaultModel = DEFAULT_MODEL;
  const selectedModel = localStorage.getItem("selectedModel") || defaultModel;

  const box = document.getElementById("model-info-box");
  if (box) {
    box.textContent = "Modello AI in uso: " + selectedModel;
  }
});

