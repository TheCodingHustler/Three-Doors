# Medication reader backend route contract

The feature keeps OCR, cropping, and pattern parsing in the browser. It sends no
image data to the backend. The optional parser fallback may receive extracted OCR
text only. Automatic translation may receive only the generated plain-language
sentences; it must not receive the image or raw OCR text.

The Three Doors Python backend implements the translation routes below. It reads
`DEEPL_AUTH_KEY` from the environment, the root `.env`, or ignored `backend/.env`.
The key remains server-side.

## `GET /api/translate/languages`

Return provider-supported target languages for English source text:

```json
{
  "languages": [
    { "code": "es", "name": "Spanish" },
    { "code": "fr", "name": "French" }
  ]
}
```

The browser uses its last-known target-language catalog if this route is
unavailable and clearly reports that automatic translation is unavailable.

## `POST /api/translate`

Request:

```json
{
  "texts": ["Medication: Example medicine.", "Please confirm this label information with your pharmacist."],
  "targetLanguage": "es"
}
```

Response must contain one translated string per input, in the same order:

```json
{
  "translatedTexts": ["...", "..."]
}
```

Keep provider credentials on the server. Treat output as automatic translation;
the UI always displays the English source beside it and retains the pharmacist
reminder.

## `POST /api/speech`

The browser sends only the already translated text and the selected language
code. The backend uses Gemini TTS and returns WAV audio as base64. The image,
raw OCR text, and English original are not sent to the speech route. The audio
player stays in the browser; playback requires a user click.

Request:

```json
{
  "text": "النص المترجم",
  "language": "ar"
}
```

Response:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/wav"
}
```

The speech route uses the server-side `GEMINI_API_KEY`; it does not change or
replace DeepL translation. Use a paid Gemini API tier for prescription text:
Google's [current pricing page](https://ai.google.dev/gemini-api/docs/pricing)
says paid-tier requests are not used to improve Google products, while
free-tier data may be used for that purpose. The route stays disabled until
`GEMINI_TTS_PAID_TIER_CONFIRMED=true` is set in `backend/.env`.

## Optional `POST /api/parse-label`

The current feature uses a local all-unclear stub so the pattern parser remains
authoritative. If a server-backed fallback is added later, accept only
`{ "text": "...extracted OCR text..." }`. It must return source excerpts with
every candidate field; the client validates each candidate against that text
before accepting it. Until a real, validated provider is approved, return
`isStub: true` and unclear fields rather than inferred medication values.
