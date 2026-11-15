# Three Doors Python API

Run the local API from the repository root:

```sh
python3 -m backend.server
```

The server reads `.env` and `backend/.env` at startup. Copy `backend/.env.example`
to `backend/.env` and add provider credentials there. Keep the file untracked.

## Translation and speech

`POST /api/translate` sends generated plain-language text to DeepL. The image and
raw OCR text stay in the browser. `POST /api/speech` sends only the translated
text and selected language code to Gemini, then returns WAV audio to the browser.
DeepL remains the translation provider; Gemini handles speech only.

Enable cloud speech with a paid Gemini API tier by setting
`GEMINI_TTS_PAID_TIER_CONFIRMED=true`. Restart the server after changing its
environment.
