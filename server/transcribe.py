from flask import Flask, request, jsonify
import requests
import tempfile, os, subprocess, wave, struct, math

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
SILENCE_THRESHOLD = int(os.environ.get("SILENCE_RMS_THRESHOLD", 500))

def compute_rms(wav_path):
    """Compute Root Mean Square energy of a WAV file. Returns 0 on error."""
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
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", wav_path],
        capture_output=True
    )
    return wav_path

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

        if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 500:
            return jsonify({"text": ""}), 200

        rms = compute_rms(wav_path)
        if rms < SILENCE_THRESHOLD:
            print(f"Silence detected (RMS={rms:.0f} < {SILENCE_THRESHOLD}), skipping.")
            return jsonify({"text": ""}), 200

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
                timeout=10
            )

        if response.status_code == 200:
            result = response.json()
            text = result.get("transcript", "").strip()
            lang = result.get("language_code", "en-IN")
            print(f"Sarvam [{lang}] (RMS={rms:.0f}): {text}")
            return jsonify({"text": text, "language": lang})
        else:
            print(f"Sarvam error: {response.status_code} - {response.text}")
            return jsonify({"text": ""}), 200

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
    print(f"Sarvam STT service ready on port {transcribe_port} (silence threshold RMS={SILENCE_THRESHOLD})")
    app.run(port=transcribe_port, debug=False)

