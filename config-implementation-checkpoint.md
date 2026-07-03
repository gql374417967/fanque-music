# Config Implementation Checkpoint

- Goal: add in-app API key/provider configuration and diagnose Agnes 503.
- Agnes diagnosis: base URL and key reached `/models` with HTTP 200; image generation failed because old/default model names such as `agnes`, `gpt-image`, `dall-e` are unsupported. Use `agnes-image-2.1-flash`.
- Completed: `server/lib/config.js` runtime config store, `GET /api/config`, `POST /api/config`, `POST /api/config/diagnose`, provider config reads for lyrics, music, cover.
- In progress: field names unified to `minimaxMusicModel` and `agnesImageModel`; still need finish old references in `config.js`, update `publisher.js`, add frontend config panel, save supplied Agnes/MiniMax credentials, run syntax checks/restart/diagnose.
