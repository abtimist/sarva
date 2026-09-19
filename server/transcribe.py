from flask import Flask, request, jsonify
import requests
import tempfile, os, subprocess, wave, struct, math, time

def load_env():
    for env_path in [".env", "../.env", "server/.env"]:
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")
            break

load_env()

app = Flask(__name__)

SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")
SILENCE_THRESHOLD = int(os.environ.get("SILENCE_RMS_THRESHOLD", 400))
MIN_AUDIO_SIZE = int(os.environ.get("MIN_AUDIO_SIZE", 2000))
start_time = time.time()

def compute_rms(wav_path):
    try:
        with wave.open(wav_path, 'r') as wf:
            n_frames = wf.getnframes()
            if n_frames == 0:
                return 0
            raw = wf.readframes(n_frames)
            num_samples = len(raw) // 2
            if num_samples == 0:
                return 0
            samples = struct.unpack(f'{num_samples}h', raw[:num_samples * 2])
            rms = math.sqrt(sum(s * s for s in samples) / num_samples)
            return rms
    except Exception:
        return 0

def convert_to_wav(input_path):
    wav_path = input_path + ".wav"
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
            capture_output=True, timeout=15
        )
        if result.returncode != 0:
            print(f"ffmpeg error: {result.stderr.decode()[:200]}")
            return None
        return wav_path
    except FileNotFoundError:
        print("ffmpeg not found!")
        return None
    except subprocess.TimeoutExpired:
        print("ffmpeg timeout")
        return None

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "uptime": round(time.time() - start_time, 1),
        "api_key_set": bool(SARVAM_API_KEY),
        "silence_threshold": SILENCE_THRESHOLD,
    })

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"text": ""}), 200

    audio_file = request.files["audio"]

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav(tmp_path)
        if not wav_path or not os.path.exists(wav_path):
            return jsonify({"text": ""}), 200

        file_size = os.path.getsize(wav_path)
        if file_size < MIN_AUDIO_SIZE:
            return jsonify({"text": ""}), 200

        rms = compute_rms(wav_path)
        if rms < SILENCE_THRESHOLD:
            print(f"Silence (RMS={rms:.0f} < {SILENCE_THRESHOLD}), skip.")
            return jsonify({"text": ""}), 200

        if not SARVAM_API_KEY:
            return jsonify({"text": "", "error": "API key not set"}), 500

        with open(wav_path, "rb") as f:
            response = requests.post(
                "https://api.sarvam.ai/speech-to-text",
                headers={"api-subscription-key": SARVAM_API_KEY},
                files={"file": ("audio.wav", f, "audio/wav")},
                data={
                    "model": "saaras:v3",
                    "language_code": "unknown",
                    "with_timestamps": "false",
                    "debug_mode": "false"
                },
                timeout=15
            )

        if response.status_code == 200:
            result = response.json()
            text = result.get("transcript", "").strip()
            lang = result.get("language_code", "en-IN")
            print(f"[{lang}] RMS={rms:.0f} size={file_size}: {text}")
            return jsonify({"text": text, "language": lang})
        elif response.status_code == 429:
            print("Rate limited, backing off...")
            return jsonify({"text": "", "error": "rate_limited"}), 429
        else:
            print(f"Sarvam {response.status_code}: {response.text[:200]}")
            return jsonify({"text": ""}), 200

    except requests.Timeout:
        print("Sarvam timeout")
        return jsonify({"text": "", "error": "timeout"}), 504
    except requests.ConnectionError:
        print("Cannot reach Sarvam API")
        return jsonify({"text": "", "error": "connection_error"}), 502
    except Exception as e:
        print("Transcribe error:", e)
        return jsonify({"text": ""}), 200
    finally:
        try:
            if tmp_path: os.unlink(tmp_path)
            if wav_path and os.path.exists(wav_path): os.unlink(wav_path)
        except:
            pass

if __name__ == "__main__":
    transcribe_port = int(os.environ.get("TRANSCRIBE_PORT", 5001))
    print(f"STT service on port {transcribe_port} (RMS threshold={SILENCE_THRESHOLD}, min_size={MIN_AUDIO_SIZE})")
    app.run(port=transcribe_port, debug=False)
