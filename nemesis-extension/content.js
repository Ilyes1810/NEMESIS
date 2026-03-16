// content.js - Sonde et UI Phase 3 (Debug)
console.log("🟢 NEMESIS Content Script chargé.");

let debounceTimer;
const DEBOUNCE_DELAY = 2000;
const PUNCTUATION_TRIGGERS = ['.', '!', '?', ','];

// --- CRÉATION DE L'INDICATEUR VISUEL (UI) ---
const indicator = document.createElement('div');
indicator.id = "nemesis-indicator";
Object.assign(indicator.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '100px',
    height: '30px',
    borderRadius: '15px',
    backgroundColor: '#808080',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2147483647',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    transition: 'all 0.3s ease',
    pointerEvents: 'none',
    fontFamily: 'sans-serif'
});
indicator.innerText = "NEMESIS: Init";
document.body.appendChild(indicator);

// --- ÉCOUTE DES RETOURS DU SERVEUR VIA BACKGROUND.JS ---
chrome.runtime.onMessage.addListener((message) => {
    console.log("📥 Message reçu dans Content Script:", message);
    if (message.type === 'IA_VERIFICATION_RESULT') {
        const result = message.payload;
        if (result.conforme) {
            indicator.style.backgroundColor = '#2ECC40'; // Vert
            indicator.innerText = "CONFORME";
        } else {
            indicator.style.backgroundColor = '#FF4136'; // Rouge
            indicator.innerText = "ERREUR IA";
            indicator.title = result.erreur_detectee;
            console.error(`🔴 ALERTE CONFORMITÉ: ${result.erreur_detectee}`);
        }
    } else if (message.type === 'KILL_SWITCH_STATE') {
        if (message.active) {
            indicator.style.backgroundColor = '#FF4136';
            indicator.innerText = "BLOQUÉ";
        } else {
            indicator.style.backgroundColor = '#2ECC40';
            indicator.innerText = "ACTIF";
        }
    }
});

// --- LOGIQUE DE CAPTURE INTELLIGENTE ---
document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const text = target.value;
        const lastChar = text.trim().slice(-1);

        console.log(`✍️ Saisie détectée: "${text.slice(-10)}"`);

        clearTimeout(debounceTimer);

        const sendData = () => {
            if (text.trim().length > 0) {
                console.log("🚀 Envoi du texte pour analyse...");
                chrome.runtime.sendMessage({
                    type: 'TEXT_CAPTURED',
                    payload: text,
                    sourceUrl: window.location.href
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("❌ Erreur sendMessage:", chrome.runtime.lastError);
                    } else {
                        console.log("✅ Message envoyé avec succès, réponse:", response);
                    }
                });
            }
        };

        // Déclenchement immédiat sur ponctuation ou après 2s d'inactivité
        if (PUNCTUATION_TRIGGERS.includes(lastChar)) {
            console.log("⚡ Déclenchement ponctuation !");
            sendData();
        } else {
            debounceTimer = setTimeout(sendData, DEBOUNCE_DELAY);
        }
    }
}, true);
