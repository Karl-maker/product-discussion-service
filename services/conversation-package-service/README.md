# Conversation Package Service

CRUD service for conversation packages and transcript analysis. Packages have name, description, category, tags, and a list of conversations; each conversation has name, instruction, and targets (key, description, check, optional amount). Optional fields (all backwards compatible): **notes** (title, details, content), **userId** (user-specific packages; only visible to the owner when JWT is present), and **language** (for filtering). Transcript analysis uses OpenAI GPT-4o to return ~3 feedback items and saves results by userId for lookup.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/packages` | Create a package |
| GET | `/packages` | List packages |
| GET | `/packages/mine` | List only the current user's packages (auth required; 404 if none) |
| GET | `/packages/{id}` | Get one package |
| PUT | `/packages/{id}` | Update a package |
| DELETE | `/packages/{id}` | Delete a package |
| POST | `/packages/analyze-transcript` | Analyze transcript against targets (auth required) |
| GET | `/packages/analysis-results` | List analysis results for the current user (auth required) |

---

## Endpoints

### POST /packages

Create one or many conversation packages.

**Auth:** Optional (no JWT required).

**Request body:** Either a **single package object** or an **array of package objects**. Each package has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Package name |
| `description` | string | No | Package description |
| `category` | string | Yes | Category (e.g. for filtering) |
| `tags` | string[] | No | Tags (default `[]`) |
| `conversations` | array | No | List of conversations (default `[]`) |
| `notes` | object | No | Optional notes: `title`, `details`, `content` (all optional strings) |
| `language` | string | No | Optional language (e.g. for list filtering) |

When **Auth** (JWT) is present, the created package is stored with `userId` from the token so it becomes user-specific (only you can see it in list/get).

Each item in `conversations`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | — | Conversation name |
| `instruction` | string | — | Instruction for the conversation |
| `targets` | array | — | List of targets |

Each target:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique identifier (used in analysis feedback) |
| `description` | string | — | What the target is |
| `check` | string | — | Criterion the AI uses to decide if the target was met |
| `amount` | number | No | Optional numeric requirement |

**Example – single package:**

```json
{
  "name": "Spanish greetings",
  "description": "Practice basic greetings",
  "category": "language",
  "tags": ["spanish", "beginner"],
  "conversations": [
    {
      "name": "Greetings",
      "instruction": "Practice saying hello and goodbye.",
      "targets": [
        { "key": "say-hola", "description": "Say hola", "check": "user said hola or equivalent at least once", "amount": 1 }
      ]
    }
  ]
}
```

**Example – many packages at once:**

```json
[
  { "name": "Spanish greetings", "category": "language", "tags": ["spanish"], "conversations": [] },
  { "name": "French basics", "category": "language", "tags": ["french"], "conversations": [] }
]
```

**Response:** `201 Created`

- **Single package:** response body is the created package object.
- **Array of packages:** response body is `{ "data": [ package, ... ] }` (empty array returns `{ "data": [] }`).

Single-package response:

```json
{
  "id": "pkg-1234567890-abc",
  "name": "Spanish greetings",
  "description": "Practice basic greetings",
  "category": "language",
  "tags": ["spanish", "beginner"],
  "conversations": [...],
  "createdAt": "2026-01-30T12:00:00.000Z",
  "updatedAt": "2026-01-30T12:00:00.000Z"
}
```

Response may also include optional `notes`, `userId`, and `language` when set.

Bulk response:

```json
{
  "data": [
    { "id": "pkg-xxx", "name": "Spanish greetings", "category": "language", ... },
    { "id": "pkg-yyy", "name": "French basics", "category": "language", ... }
  ]
}
```

---

### GET /packages

List conversation packages with optional filters and pagination.

**Auth:** Optional. When **no JWT** is sent, only packages without a `userId` (public packages) are returned. When **JWT is present**, the list includes both public packages and packages whose `userId` matches the authenticated user.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | — | Filter by category |
| `language` | string | — | Filter by package language |
| `page_number` | number | 1 | Page number (1-based) |
| `page_size` | number | 20 | Items per page |

**Example:** `GET /packages?category=language&language=es&page_number=1&page_size=10`

**Response:** `200 OK`

```json
{
  "amount": 5,
  "data": [
    {
      "id": "pkg-xxx",
      "name": "Spanish greetings",
      "description": "...",
      "category": "language",
      "tags": ["spanish"],
      "conversations": [...],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": {
    "page_size": 10,
    "page_number": 1,
    "total_pages": 1
  }
}
```

---

### GET /packages/mine

List **only** the current user's packages (packages where `userId` matches the JWT user). Optional filter by `language`. If the user has no packages (matching the optional language filter), the response is **404** with message "none found".

**Auth:** Required (Bearer JWT).

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `language` | string | — | Filter by package language |
| `page_number` | number | 1 | Page number (1-based) |
| `page_size` | number | 20 | Items per page |

**Example:** `GET /packages/mine?language=es`

**Response:** `200 OK` – same shape as `GET /packages` (`amount`, `data`, `pagination`).

**Errors:** `404` with `error: "NOT_FOUND"`, `message: "none found"` when the user has no packages (for the given language, if specified). `401` when no valid JWT is provided.

---

### GET /packages/{id}

Get a single package by ID.

**Auth:** Optional for **public** packages (no `userId`). For **user-specific** packages (package has `userId`), a valid JWT is required and the package is returned only if the token’s user is the owner; otherwise the response is "Package not found".

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Package ID (e.g. `pkg-1234567890-abc`) |

**Response:** `200 OK` – full package object (may include optional `notes`, `userId`, `language`).

**Errors:** Returns error if package not found (handler may return 500 with message "Package not found").

---

### PUT /packages/{id}

Update an existing package. Only provided fields are updated.

**Auth:** Optional.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Package ID |

**Request body:** Same shape as POST; all fields optional. Omitted fields keep their current values. **User-specific packages** (with `userId`) can only be updated when the request includes a JWT for the owner.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New name |
| `description` | string | New description |
| `category` | string | New category |
| `tags` | string[] | New tags |
| `conversations` | array | New conversations (same structure as POST) |
| `notes` | object | Optional notes: `title`, `details`, `content` |
| `language` | string | Optional language |

**Example:** `PUT /packages/pkg-xxx` with body `{ "name": "Updated name" }`

**Response:** `200 OK` – full updated package object.

---

### DELETE /packages/{id}

Delete a package by ID.

**Auth:** Optional for public packages. **User-specific** packages can only be deleted when the request includes a JWT for the owner; otherwise "Package not found" is returned.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Package ID |

**Response:** `200 OK`

```json
{
  "deleted": true
}
```

**Errors:** Returns error if package not found.

---

### POST /packages/analyze-transcript

Analyze a transcript against a list of targets using OpenAI GPT-4o. Returns ~3 feedback items; each item includes only the target keys that met their check. The result is saved in DynamoDB by userId, conversationPackageId, and topicKey.

**Auth:** Required (Bearer JWT; `userId` is taken from the token).

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationPackageId` | string | Yes | Package ID (for storage/lookup) |
| `topicKey` | string | Yes | Topic identifier (e.g. conversation or scenario key) |
| `targets` | array | Yes | Targets to evaluate (each with `key`, `description`, `check`, optional `amount`) |
| `transcript` | string | Yes | Full transcript text to analyze |
| `targetLanguage` | string | No | If set, response may include `wordsUsed` only when the user said words strictly in this language (never words from other languages) |

**Example request:**

```json
{
  "conversationPackageId": "pkg-xxx",
  "topicKey": "greetings",
  "targets": [
    { "key": "say-hello", "description": "Say hello", "check": "user said hello or equivalent at least once", "amount": 1 },
    { "key": "avoid-slang", "description": "Avoid slang", "check": "user did not use slang" }
  ],
  "transcript": "User: Hi there. AI: Hello! How are you? User: I'm good, thanks."
}
```

With target language (e.g. Spanish):

```json
{
  "conversationPackageId": "pkg-xxx",
  "topicKey": "greetings",
  "targetLanguage": "Spanish",
  "targets": [
    { "key": "say-hola", "description": "Say hola", "check": "user said hola or equivalent at least once", "amount": 1 }
  ],
  "transcript": "User: Hola. AI: ¡Hola! ¿Cómo estás? User: Muy bien, gracias."
}
```

**Response:** `201 Created`

- The service calls OpenAI GPT-4o (JSON mode) to analyze the transcript.
- The AI returns ~3 feedback objects. Each has `content`, `isPositive`, and `targets` (array of target **keys** that met their `check`; keys not met are omitted).
- When `targetLanguage` is provided, the response may include `wordsUsed` only if the user said at least one word strictly in that language. `wordsUsed` contains only words that are actually in the target language (words from other languages are never included). If the user said nothing in the target language, `wordsUsed` is omitted. Each object has `word`, `pronunciation`, and `meaning`.
- The response is validated; if the AI returns invalid JSON or wrong schema, the service returns an error and does not save.
- The result is stored by `userId`, `conversationPackageId`, and `topicKey` for later retrieval. Each stored record includes `feedback`, `wordsUsed` (if any), the `targetLanguage` requested, `targetsHit` (targets that were met, with key, description, check, amount), and `targetsMissed` (targets not met, same detail). Items expire after 90 days (DynamoDB TTL).

**Response body (without target language):**

```json
{
  "feedback": [
    { "content": "You used a clear greeting.", "isPositive": true, "targets": ["say-hello"] },
    { "content": "Try to avoid informal slang in this context.", "isPositive": false, "targets": [] }
  ],
  "saved": true
}
```

**Response body (with `targetLanguage`):**

```json
{
  "feedback": [
    { "content": "You said hola clearly.", "isPositive": true, "targets": ["say-hola"] }
  ],
  "wordsUsed": [
    { "word": "Hola", "pronunciation": "/ˈola/", "meaning": "Hello" },
    { "word": "gracias", "pronunciation": "/ˈɡraθjas/", "meaning": "thank you" }
  ],
  "saved": true
}
```

---

### GET /packages/analysis-results

List transcript analysis results for the current user. Results are stored by userId and can be filtered by package and topic. Stored records include `feedback`, `wordsUsed`, `targetLanguage`, `targetsHit` and `targetsMissed` (each an array of targets with `key`, `description`, `check`, `amount`). Results expire after 90 days (TTL).

**Auth:** Required (Bearer JWT).

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `conversationPackageId` | string | — | Filter by package ID |
| `topicKey` | string | — | Filter by topic (use with `conversationPackageId`) |
| `limit` | number | 50 | Max number of results (e.g. 1–100) |

**Example:** `GET /packages/analysis-results?conversationPackageId=pkg-xxx&limit=20`

**Response:** `200 OK`

```json
{
  "amount": 2,
  "data": [
    {
      "userId": "user-123",
      "conversationPackageId": "pkg-xxx",
      "topicKey": "greetings",
      "result": {
        "feedback": [
          { "content": "...", "isPositive": true, "targets": ["say-hello"] }
        ],
        "wordsUsed": [
          { "word": "Hola", "pronunciation": "/ˈola/", "meaning": "Hello" }
        ]
      },
      "targetLanguage": "Spanish",
      "targetsHit": [
        { "key": "say-hola", "description": "Say hola", "check": "user said hola or equivalent at least once", "amount": 1 }
      ],
      "targetsMissed": [
        { "key": "use-formal-you", "description": "Use formal you (usted)", "check": "user used usted form", "amount": 1 }
      ],
      "createdAt": "2026-01-30T12:00:00.000Z"
    }
  ]
}
```

---

## Schema validation (AI response)

The service validates the OpenAI response for `POST /packages/analyze-transcript` before saving or returning:

- Root must be an object with a `feedback` array.
- `feedback` must have between 1 and 10 items.
- Each feedback item must have:
  - `content`: string
  - `isPositive`: boolean
  - `targets`: array of strings (target keys only)
- When the request included `targetLanguage`, the AI may return an optional `wordsUsed` array only for words strictly in that language. If present, it is validated:
  - `wordsUsed` must be an array of at most 50 items.
  - Each item must have `word`, `pronunciation`, and `meaning` (all strings).
  - The service only returns `wordsUsed` when the user actually spoke words in the target language; otherwise the key is omitted.

If validation fails, an error is returned and the result is not saved.

---

## Backwards compatibility

All new package fields are **optional**: `notes`, `userId`, and `language`. Existing packages and clients that do not send these fields continue to work unchanged. Listing without JWT returns only packages that have no `userId` (public packages). Listing with JWT returns public packages plus the caller’s user-specific packages.

---

## Environment

| Variable | Description |
|---------|-------------|
| `CONVERSATION_PACKAGES_TABLE` | DynamoDB table name for packages |
| `ANALYSIS_RESULTS_TABLE` | DynamoDB table name for analysis results (keyed by userId) |
| `PROJECT_NAME` | Project prefix (default used for OpenAI secret name) |
| `ENVIRONMENT` | Environment (e.g. dev, prod; used for OpenAI secret name) |

OpenAI API key is loaded from Secrets Manager: `{PROJECT_NAME}-{ENVIRONMENT}-openai-api-key`.
