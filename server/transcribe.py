from flask import Flask, request, jsonify
import requests
import tempfile, os, subprocess

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
            print(f"Sarvam transcribed [{lang}]: {text}")
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
    print(f"Sarvam STT service ready on port {transcribe_port}")
    app.run(port=transcribe_port, debug=False)
