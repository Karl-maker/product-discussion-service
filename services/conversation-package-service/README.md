# Conversation Package Service

CRUD service for conversation packages and transcript analysis. Packages have name, description, category, tags, and a list of conversations; each conversation has name, instruction, and targets (key, description, check, optional amount). Transcript analysis uses OpenAI GPT-4o to return ~3 feedback items and saves results by userId for lookup.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/packages` | Create a package |
| GET | `/packages` | List packages |
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

**Auth:** Optional.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | — | Filter by category |
| `page_number` | number | 1 | Page number (1-based) |
| `page_size` | number | 20 | Items per page |

**Example:** `GET /packages?category=language&page_number=1&page_size=10`

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

### GET /packages/{id}

Get a single package by ID.

**Auth:** Optional.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Package ID (e.g. `pkg-1234567890-abc`) |

**Response:** `200 OK` – full package object.

**Errors:** Returns error if package not found (handler may return 500 with message "Package not found").

---

### PUT /packages/{id}

Update an existing package. Only provided fields are updated.

**Auth:** Optional.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Package ID |

**Request body:** Same shape as POST; all fields optional except that you are updating. Omitted fields keep their current values.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New name |
| `description` | string | New description |
| `category` | string | New category |
| `tags` | string[] | New tags |
| `conversations` | array | New conversations (same structure as POST) |

**Example:** `PUT /packages/pkg-xxx` with body `{ "name": "Updated name" }`

**Response:** `200 OK` – full updated package object.

---

### DELETE /packages/{id}

Delete a package by ID.

**Auth:** Optional.

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

**Response:** `201 Created`

- The service calls OpenAI GPT-4o (JSON mode) to analyze the transcript.
- The AI returns ~3 feedback objects. Each has `content`, `isPositive`, and `targets` (array of target **keys** that met their `check`; keys not met are omitted).
- The response is validated; if the AI returns invalid JSON or wrong schema, the service returns an error and does not save.
- The result is stored by `userId`, `conversationPackageId`, and `topicKey` for later retrieval.

```json
{
  "feedback": [
    { "content": "You used a clear greeting.", "isPositive": true, "targets": ["say-hello"] },
    { "content": "Try to avoid informal slang in this context.", "isPositive": false, "targets": [] }
  ],
  "saved": true
}
```

---

### GET /packages/analysis-results

List transcript analysis results for the current user. Results are stored by userId and can be filtered by package and topic.

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
        ]
      },
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
- Each item must have:
  - `content`: string
  - `isPositive`: boolean
  - `targets`: array of strings (target keys only)

If validation fails, an error is returned and the result is not saved.

---

## Environment

| Variable | Description |
|---------|-------------|
| `CONVERSATION_PACKAGES_TABLE` | DynamoDB table name for packages |
| `ANALYSIS_RESULTS_TABLE` | DynamoDB table name for analysis results (keyed by userId) |
| `PROJECT_NAME` | Project prefix (default used for OpenAI secret name) |
| `ENVIRONMENT` | Environment (e.g. dev, prod; used for OpenAI secret name) |

OpenAI API key is loaded from Secrets Manager: `{PROJECT_NAME}-{ENVIRONMENT}-openai-api-key`.
