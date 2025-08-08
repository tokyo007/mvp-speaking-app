\
import os
import json
import tempfile
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import ffmpeg
import azure.cognitiveservices.speech as speechsdk

load_dotenv()

SPEECH_KEY = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION", "japaneast")

app = Flask(__name__)
CORS(app)

def to_wav_16k_mono(input_path, output_path):
    (
        ffmpeg
        .input(input_path)
        .output(output_path, acodec='pcm_s16le', ac=1, ar='16000', loglevel="error")
        .overwrite_output()
        .run()
    )
    return output_path

def run_pronunciation_assessment(wav_path, reference_text, language="en-US"):
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = language

    audio_config = speechsdk.audio.AudioConfig(filename=wav_path)

    pron_config = speechsdk.PronunciationAssessmentConfig(
        reference_text=reference_text,
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=True
    )

    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
    pron_config.apply_to(recognizer)
    result = recognizer.recognize_once()

    if result.reason != speechsdk.ResultReason.RecognizedSpeech:
        return {
            "status": "error",
            "message": f"Recognition failed: {result.reason}",
            "raw": str(result)
        }

    pa_result = speechsdk.PronunciationAssessmentResult(result)
    json_result = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
    detail = {}
    try:
        detail = json.loads(json_result)
    except Exception:
        detail = {}

    return {
        "status": "ok",
        "referenceText": reference_text,
        "recognizedText": result.text,
        "scores": {
            "pronunciation": pa_result.pronunciation_score,
            "accuracy": pa_result.accuracy_score,
            "fluency": pa_result.fluency_score,
            "completeness": pa_result.completeness_score
        },
        "detail": detail
    }

def speech_to_text(wav_path, language="en-US"):
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = language
    audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
    result = recognizer.recognize_once()
    if result.reason != speechsdk.ResultReason.RecognizedSpeech:
        return {"status": "error", "message": f"STT failed: {result.reason}"}
    return {"status": "ok", "text": result.text}

@app.route("/")
def index():
    return render_template("index.html")

@app.post("/assess_phrase")
def assess_phrase():
    phrase = request.form.get("phrase", "").strip()
    language = request.form.get("language", "en-US").strip()
    f = request.files.get("audio")
    if not phrase:
        return jsonify({"status": "error", "message": "Missing 'phrase'"}), 400
    if not f:
        return jsonify({"status": "error", "message": "Missing 'audio' file"}), 400

    with tempfile.TemporaryDirectory() as td:
        src_path = os.path.join(td, f.filename)
        f.save(src_path)
        wav_path = os.path.join(td, "audio.wav")
        to_wav_16k_mono(src_path, wav_path)
        result = run_pronunciation_assessment(wav_path, phrase, language=language)
        return jsonify(result)

@app.post("/assess_prompt")
def assess_prompt():
    language = request.form.get("language", "en-US").strip()
    f = request.files.get("audio")
    if not f:
        return jsonify({"status": "error", "message": "Missing 'audio' file"}), 400

    with tempfile.TemporaryDirectory() as td:
        src_path = os.path.join(td, f.filename)
        f.save(src_path)
        wav_path = os.path.join(td, "audio.wav")
        to_wav_16k_mono(src_path, wav_path)

        stt = speech_to_text(wav_path, language=language)
        if stt.get("status") != "ok":
            return jsonify(stt), 400

        transcript = stt["text"] or "(no speech detected)"
        pa = run_pronunciation_assessment(wav_path, transcript, language=language)
        pa["transcriptUsedAsReference"] = transcript
        return jsonify(pa)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    app.run(host=host, port=port, debug=True)
