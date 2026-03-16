// background.js - Pare-feu de l'extension

const CONFIG_URL = "http://127.0.0.1:8000/config";
const LOCAL_SERVER_URL = "http://127.0.0.1:8000/capture";
let blacklist = [];

// Chargement dynamique de la configuration depuis le serveur NEMESIS
function loadBlacklist() {
    fetch(CONFIG_URL)
        .then(response => response.json())
        .then(data => {
            blacklist = data.blacklist.map(word => word.toLowerCase());
            console.log("🛡️ NEMESIS Pare-feu Web synchronisé avec le serveur.");
        })
        .catch(error => {
            console.error("⚠️ Impossible de synchroniser NEMESIS avec le serveur.", error);
        });
}

loadBlacklist();
// Synchronisation périodique toutes les 5 minutes
setInterval(loadBlacklist, 300000);

// Fonction utilitaire d'évaluation du risque
function isEnvironmentSensitive(url, title) {
    if (!url || !title) return true;
    const target = `${url} ${title}`.toLowerCase();
    const isSensitive = blacklist.some(blacklistedWord => target.includes(blacklistedWord));
    console.log(`🔍 [CHECK WEB] ${target} | Sensible : ${isSensitive}`);
    return isSensitive;
}

// Interception des messages du content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("🛰️ Background reçu message:", message.type, message);

    if (message.type === 'TEXT_CAPTURED') {
        const tabUrl = sender.tab.url;
        const tabTitle = sender.tab.title;

        console.log(`🔍 Vérification environnement: ${tabTitle} (${tabUrl})`);

        // 1. ÉVALUATION DU KILL-SWITCH WEB
        if (isEnvironmentSensitive(tabUrl, tabTitle)) {
            console.warn(`🛑 [BLOCAGE WEB] Environnement sensible.`);
            chrome.tabs.sendMessage(sender.tab.id, { type: 'KILL_SWITCH_STATE', active: true });
            sendResponse({ status: "blocked" });
            return true;
        }

        console.log("🟢 Environnement OK. Envoi au serveur local...");
        chrome.tabs.sendMessage(sender.tab.id, { type: 'KILL_SWITCH_STATE', active: false });

        fetch(LOCAL_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: message.payload,
                url: message.sourceUrl
            })
        })
            .then(response => {
                if (!response.ok) {
                    if (response.status === 403) {
                        chrome.tabs.sendMessage(sender.tab.id, { type: 'KILL_SWITCH_STATE', active: true });
                    }
                    throw new Error(`Erreur serveur : ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Envoi du résultat de vérification IA au content script pour mise à jour UI
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'IA_VERIFICATION_RESULT',
                    payload: data
                });
                sendResponse({ status: "success", data });
            })
            .catch(error => {
                console.error("Erreur réseau ou blocage OS natif.", error);
                sendResponse({ status: "error", error: error.message });
            });

        return true; // Obligatoire pour utiliser sendResponse de manière asynchrone
    }
});