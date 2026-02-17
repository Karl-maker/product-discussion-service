# Clip Package Service

API for video clip packages: metadata (thumbnail, media URL, character, used words, caption, language). Clips are stored in DynamoDB; media can be hosted in the project’s S3 clip bucket and served via the attached CDN.

**Base path:** `/clip-packages`

### UsedWord shape (matches analytics)

Each item in `usedWords` has the same fields as the analytics/analysis `wordsUsed` response, plus `timestamp`:

| Field          | Type   | Description |
|----------------|--------|-------------|
| `word`         | string | Word as written in the target language. |
| `pronunciation`| string | Phonetic or IPA pronunciation. |
| `meaning`      | string | Brief meaning (e.g. in English). |
| `timestamp`    | string | Where it occurred (e.g. `"00:00:02"` in the clip or transcript). |

---

## Endpoints

### POST /clip-packages

Create a new clip package.

**Request body:**

| Field         | Type     | Required | Description |
|---------------|----------|----------|-------------|
| `thumbnailUrl` | string   | Yes      | URL of the thumbnail image (e.g. CDN or S3). |
| `mediaUrl`     | string   | Yes      | URL of the video/media file. |
| `characterName`| string   | No       | Optional character or scene name. |
| `usedWords`    | array    | Yes      | Words used in the clip; same shape as analytics `wordsUsed` plus `timestamp`. Each item: `{ word, pronunciation, meaning, timestamp }`. |
| `caption`      | string   | Yes      | Caption or description for the clip. |
| `language`     | string   | Yes      | Language code (e.g. `japanese`, `spanish`). Used for filtering on GET. |

**Example:**

```json
{
  "thumbnailUrl": "https://cdn.example.com/clips/thumb-1.jpg",
  "mediaUrl": "https://cdn.example.com/clips/video-1.mp4",
  "characterName": "Hana",
  "usedWords": [
    { "word": "こんにちは", "pronunciation": "konnichiwa", "meaning": "hello", "timestamp": "00:00:02" },
    { "word": "ありがとう", "pronunciation": "arigatou", "meaning": "thank you", "timestamp": "00:00:05" }
  ],
  "caption": "Greetings and thanks",
  "language": "japanese"
}
```

**Response:** `201 Created` — the created clip package (includes `id`, `createdAt`, `updatedAt`).

---

### GET /clip-packages

List clip packages by language, with optional character filter, pagination, and randomized order.

**Query parameters:**

| Parameter       | Type   | Required | Default | Description |
|-----------------|--------|----------|---------|-------------|
| `language`      | string | Yes      | —       | Filter by language (e.g. `japanese`). Aliases: `lang`. |
| `characterName` | string | No       | —       | Filter by character name. Alias: `character`. |
| `page`          | number | No       | `1`     | Page number (1-based). |
| `pageSize`      | number | No       | `10`    | Items per page (1–50). Alias: `page_size`. |
| `randomize`     | boolean| No       | `true`  | If `true`, return items in random order each request. Set to `false` or `0` to disable. |

**Example:**

```
GET /clip-packages?language=japanese&characterName=Hana&page=1&pageSize=10
```

**Response:** `200 OK`

```json
{
  "items": [
    {
      "id": "clip-1234567890-abc",
      "thumbnailUrl": "https://...",
      "mediaUrl": "https://...",
      "characterName": "Hana",
      "usedWords": [{ "word": "こんにちは", "pronunciation": "konnichiwa", "meaning": "hello", "timestamp": "00:00:02" }],
      "caption": "Greetings",
      "language": "japanese",
      "createdAt": "2025-01-15T12:00:00.000Z",
      "updatedAt": "2025-01-15T12:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "hasMore": true
}
```

---

### GET /clip-packages/:id

Fetch a single clip package by ID.

**Response:** `200 OK` — the clip package object.  
**Errors:** `404 Not Found` if the id does not exist.

---

### PUT /clip-packages/:id

Update an existing clip package. All body fields are optional; only provided fields are updated.

**Request body (all optional):**

| Field          | Type  | Description |
|----------------|-------|-------------|
| `thumbnailUrl`  | string| New thumbnail URL. |
| `mediaUrl`      | string| New media URL. |
| `characterName`| string| New character name (use empty string to clear). |
| `usedWords`    | array | New list of `{ word, pronunciation, meaning, timestamp }` (same as analytics). |
| `caption`      | string| New caption. |
| `language`     | string| New language code. |

**Response:** `200 OK` — the updated clip package.  
**Errors:** `404 Not Found` if the id does not exist.

---

### DELETE /clip-packages/:id

Delete a clip package.

**Response:** `200 OK`

```json
{ "deleted": true }
```

**Errors:** `404 Not Found` if the id does not exist.

---

## Error responses

| Status | Body |
|--------|------|
| `400`  | `{ "error": "VALIDATION_ERROR", "message": "..." }` — e.g. missing required query param `language` on GET list. |
| `404`  | `{ "error": "NOT_FOUND", "message": "..." }` — clip package or resource not found. |
| `500`  | `{ "error": "INTERNAL_ERROR", "message": "..." }` — server error. |

---

## Infrastructure

- **DynamoDB:** Clip package metadata (table: `{project}-{env}-clip-packages`).
- **S3:** Optional clip media bucket `{project}-{env}-clip` (URLs in `mediaUrl` / `thumbnailUrl` can point to this or any URL).
- **CloudFront:** CDN in front of the clip bucket; use the CDN base URL for public clip URLs when using the project bucket.
