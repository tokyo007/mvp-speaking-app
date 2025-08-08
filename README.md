# Speaking MVP (TutorLMS + Azure Pronunciation Assessment)

This is a minimal Flask app you can host and embed in a TutorLMS lesson (via `<iframe>`). It records audio in the browser, converts to WAV 16k mono on the server, and calls Azure Speech for:
- **Course A**: Phrase practice (use the displayed phrase as the reference text)
- **Course B**: Prompt response (transcribe first, then use the transcript as the reference text to score)

## Quick Start

1) Ensure `ffmpeg` is installed on your server (Linux: `apt-get install ffmpeg`).
2) Create a virtualenv and install deps:
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
3) Copy `.env.example` to `.env` and set your Azure keys:
```
SPEECH_KEY=YOUR_KEY
SPEECH_REGION=japaneast
```
4) Run locally:
```
python app.py
```
Open http://localhost:5000

## Embed in TutorLMS
Add an HTML block in a lesson and paste:
```html
<iframe src="https://YOUR-APP-DOMAIN/" width="100%" height="1000" style="border:none;"></iframe>
```
(Use HTTPS in production.)

## API Endpoints
- `POST /assess_phrase` form-data: `phrase`, `language` (en-US default), `audio` (file)
- `POST /assess_prompt` form-data: `language`, `audio` (file)

## Notes
- Browser recording uses `MediaRecorder` (webm/opus). Server converts to WAV 16k using ffmpeg.
- For more detailed word-level results, inspect the `detail.NBest[0].words` in the JSON response.
- Tune grading with `granularity` and `enable_miscue` in `app.py`.
