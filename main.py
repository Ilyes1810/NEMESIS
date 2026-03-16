import json
import threading
import time
import os
from datetime import datetime
import uvicorn
import pywinctl
from fastapi import FastAPI, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import google.generativeai as genai
from pynput import keyboard, mouse
import mss
from PIL import Image
import io
import tkinter as tk
import ctypes
import pandas as pd
import docx
import PyPDF2

app = FastAPI(title="NEMESIS - Cerveau Local")

# --- CONFIGURATION ---
KEYS_FILE = "keys.json"
CORPUS_FOLDER = "corpus"
LOG_FOLDER = "logs"

if not os.path.exists(LOG_FOLDER):
    os.makedirs(LOG_FOLDER)

SYSTEM_ACTIVE = True 

# --- LOGGING DES VIOLATIONS ---
def log_violation(source, window, error, rule):
    log_file = os.path.join(LOG_FOLDER, "history.json")
    entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": source,
        "window": window,
        "error": error,
        "rule": rule
    }
    
    history = []
    if os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except:
            history = []
    
    history.append(entry)
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=4, ensure_ascii=False)

def play_custom_sound():
    sound_path = r"Airplane Beep Sound Effect Part 2.mp3"
    if os.path.exists(sound_path):
        try:
            ctypes.windll.winmm.mciSendStringW("close mp3_alert", None, 0, 0)
            ctypes.windll.winmm.mciSendStringW(f'open "{sound_path}" type mpegvideo alias mp3_alert', None, 0, 0)
            ctypes.windll.winmm.mciSendStringW("play mp3_alert", None, 0, 0)
        except Exception as e:
            print(f"❌ Erreur lecture son : {e}")

# --- ROTATION DES CLÉS API ---
class KeyRotator:
    def __init__(self, filename):
        self.filename = filename
        self.keys = []
        self.current_index = 0
        self.load_keys()

    def load_keys(self):
        if os.path.exists(self.filename):
            try:
                with open(self.filename, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.keys = data.get("api_keys", [])
                    print(f"🔑 {len(self.keys)} clés API chargées.")
            except Exception as e:
                print(f"❌ Erreur lecture {self.filename}: {e}")
        
    def get_current_model(self):
        if not self.keys: return None
        genai.configure(api_key=self.keys[self.current_index])
        return genai.GenerativeModel("gemini-1.5-flash")

    def rotate(self):
        if not self.keys: return False
        self.current_index = (self.current_index + 1) % len(self.keys)
        return True

rotator = KeyRotator(KEYS_FILE)
IA_ENABLED = len(rotator.keys) > 0
model = rotator.get_current_model() if IA_ENABLED else None

# --- CHARGEMENT DU CORPUS ---
def load_knowledge_base(folder_path: str) -> str:
    knowledge_text = ""
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
        return ""
    
    for root, _, files in os.walk(folder_path):
        for file in files:
            file_path = os.path.join(root, file)
            ext = file.lower()
            try:
                content = ""
                if ext.endswith((".txt", ".md")):
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                elif ext.endswith(".docx"):
                    doc = docx.Document(file_path)
                    content = "\n".join([p.text for p in doc.paragraphs])
                elif ext.endswith(".pdf"):
                    with open(file_path, "rb") as f:
                        pdf = PyPDF2.PdfReader(f)
                        content = "\n".join([page.extract_text() or "" for page in pdf.pages])
                elif ext.endswith((".xlsx", ".xls")):
                    df_dict = pd.read_excel(file_path, sheet_name=None)
                    for sheet, df in df_dict.items():
                        content += f"\n[Feuille: {sheet}]\n{df.to_string(index=False)}\n"
                
                if content:
                    knowledge_text += f"\n--- DOCUMENT: {file} ---\n{content}\n"
            except Exception as e:
                print(f"❌ Erreur {file}: {e}")
    return knowledge_text

# --- LOGIQUE HUD (INDICATEUR VISUEL) ---
class NemesisHUD:
    def __init__(self):
        self.root = None
        self.dot = None
        self.error_msg = ""
        self.is_alert = False
        self.pulse_timer = None

    def setup(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True, "-transparentcolor", "white")
        self.root.geometry("25x25+10+10")
        self.root.configure(bg="white")
        self.canvas = tk.Canvas(self.root, width=25, height=25, bg="white", highlightthickness=0)
        self.canvas.pack()
        self.dot = self.canvas.create_oval(4, 4, 21, 21, fill="#2ecc71", outline="")
        self.root.mainloop()

    def update_state(self, conforme, message=None):
        if not self.root: return
        color = "#2ecc71" if conforme else "#e74c3c"
        self.error_msg = message or ""
        self.is_alert = not conforme
        self.root.after(0, lambda: self.canvas.itemconfig(self.dot, fill=color))
        if not conforme:
            self.root.after(8000, self.reset_state)

    def reset_state(self):
        if self.root:
            self.canvas.itemconfig(self.dot, fill="#2ecc71")
            self.is_alert = False

nemesis_hud = NemesisHUD()
threading.Thread(target=nemesis_hud.setup, daemon=True).start()

# --- MONITORING ET SÉCURITÉ ---
state_lock = threading.Lock()
is_kill_switch_active = False
active_window_title = ""

def monitor_os_windows():
    global is_kill_switch_active, active_window_title
    while True:
        try:
            window = pywinctl.getActiveWindow()
            if window and window.title:
                title = window.title.lower()
                # On pourrait charger la blacklist depuis un JSON ici
                is_compromised = "banque" in title or "password" in title 
                with state_lock:
                    is_kill_switch_active = is_compromised
                    active_window_title = title
        except: pass
        time.sleep(1)

threading.Thread(target=monitor_os_windows, daemon=True).start()

def verify_compliance(text: str = None, image: bytes = None, window_title: str = None):
    global model
    if not IA_ENABLED or not SYSTEM_ACTIVE: return
    
    corpus = load_knowledge_base(CORPUS_FOLDER)
    prompt = f"""Tu es NEMESIS. Analyse la conformité selon ce corpus : {corpus}. 
    Fenêtre : {window_title}. Réponds UNIQUEMENT en JSON : 
    {{"conforme": bool, "erreur_detectee": "str", "regle_en_cause": "str"}}"""
    
    parts = [prompt]
    if text: parts.append(f"Texte: {text}")
    if image: parts.append(Image.open(io.BytesIO(image)))

    try:
        response = model.generate_content(parts, generation_config={"response_mime_type": "application/json"})
        res = json.loads(response.text)
        nemesis_hud.update_state(res['conforme'], res.get('erreur_detectee'))
        if not res['conforme']:
            threading.Thread(target=play_custom_sound, daemon=True).start()
            log_violation("SCAN", window_title, res.get('erreur_detectee'), res.get('regle_en_cause'))
        return res
    except Exception as e:
        print(f"⚠️ Erreur API: {e}")
        rotator.rotate()
        model = rotator.get_current_model()

# --- LISTENERS (CLAVIER / SOURIS) ---
class GlobalInputMonitor:
    def __init__(self):
        self.buffer = ""
    
    def on_press(self, key):
        if not SYSTEM_ACTIVE or is_kill_switch_active: return
        try:
            if hasattr(key, 'char') and key.char: self.buffer += key.char
            elif key == keyboard.Key.space: self.buffer += " "
            
            if len(self.buffer) > 50 or key == keyboard.Key.enter:
                text = self.buffer
                self.buffer = ""
                threading.Thread(target=verify_compliance, kwargs={"text": text, "window_title": active_window_title}).start()
        except: pass

input_mon = GlobalInputMonitor()
keyboard.Listener(on_press=input_mon.on_press).start()

# --- ROUTES FASTAPI ---
@app.get("/")
async def dashboard():
    return {"status": "NEMESIS Online", "active": SYSTEM_ACTIVE}

@app.post("/stop")
async def stop():
    global SYSTEM_ACTIVE
    SYSTEM_ACTIVE = False
    return {"status": "stopped"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)