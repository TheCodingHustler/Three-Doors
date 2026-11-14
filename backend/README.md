# Label Parser Backend Stub

This is a provisional Express backend for local integration. Confirm the shared backend language and ownership with the team before merging it into the shared app.

## Run

```sh
cp backend/.env.example backend/.env
npm --prefix backend install
npm --prefix backend run dev
```

The frontend expects the API at `http://localhost:3001/api/parse-label` by default. Override it with `VITE_PARSE_LABEL_API_URL` in the frontend environment.

## Routes

- `GET /health` returns a simple server health response.
- `POST /api/parse-label` accepts `{ "text": "...OCR text..." }` and returns the agreed fields. It never accepts or logs image data.

The parse route is a stub and deliberately returns every field as unclear. No Bedrock model is connected. The frontend calls it only when at least three core fields are unclear, preserves successful pattern-parser fields, and validates returned excerpts and values against the OCR text before accepting anything.

## DeepL translation

Set `DEEPL_AUTH_KEY` in the ignored `backend/.env` file. Never put this key in React code, commit it, or send it in chat. Restart the backend after adding the key.

- `GET /api/translate/languages` returns target languages supported by the configured DeepL account.
- `POST /api/translate` accepts `{ "texts": ["..."], "targetLanguage": "ES" }` and returns translated text strings.

The frontend sends only generated plain-language sentences to DeepL; it never sends the image or raw OCR label. It keeps the original OCR visible beside the translation and masks medication names, strengths, and numbers before requesting translation. Translation sends text to DeepL, so do not claim this mode is fully on-device/private.

Add the Bedrock implementation only after the team confirms ownership, requests model access, and defines its prompt and response validation. The Express backend is provisional; confirm the shared backend language and ownership with teammates before merging.