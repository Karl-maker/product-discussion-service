# Package Generation Service

Consumes voice session SQS messages (batch of 5), uses the user’s **analysis results** and **OpenAI GPT-4o** to generate or update a **single package per language** for that user. Tracks “last processed” per user+language so it never processes the same analysis result twice.

**Rate limit:** At most **one lesson per user per day** (UTC). If a session is processed for a user today, any further sessions for that user in the same day are skipped until the next calendar day.

## Flow

1. **SQS** – Lambda is triggered by the voice-session FIFO queue (up to 5 messages per invocation).
2. **Message** – Each record is a session: `sessionId`, `userId`, `targetLanguage`, `createdAt`. Skip when `userId` or `targetLanguage` is missing.
3. **State** – If this user already had a lesson generated today (UTC), skip. Otherwise load `lastProcessedAt` for `(userId, language)` from the generation-state table.
4. **Analysis results** – Fetch recent analysis results for that user; keep only those with `createdAt > lastProcessedAt` and (when set) `targetLanguage` matching the message language.
5. **Existing package** – Load the user’s package for that language from the conversation-packages table (at most one).
6. **OpenAI** – Call GPT-4o with:
   - Language and optional existing package (evolve, no duplicate words).
   - Recent analysis (targets hit/missed, feedback, words used).
   - Instructions: first topic(s) = **review** (AI must start with a specific word to test the user); then one **new lesson**; speaking-focused; content/notes with words, pronunciation, what to work on.
7. **Save** – Upsert the package (same `id` if updating) with `userId` and `language`; update `lastProcessedAt` for `(userId, language)` and set “last lesson date” for the user to today (UTC).
8. **SNS** – Publish a `package.generated` event to the configured SNS topic so other services (e.g. email) can subscribe and react.

## Package shape

- **One package per user per language** (create or update in place).
- **Conversations**: First one or two are **review** (instruction explicitly tells the AI to start with a word/phrase to test the user); then one **new lesson** building on previous material.
- **No duplicate words** across the curriculum; only evolve from existing.
- **Notes**: What they’re learning, what to work on, words with pronunciation/writing.
- **Speaking-focused**: Instructions specify the language and that the goal is speaking practice.

## Environment

| Variable | Description |
|----------|-------------|
| `GENERATION_STATE_TABLE` | DynamoDB table for last-processed timestamp per user+language |
| `CONVERSATION_PACKAGES_TABLE` | DynamoDB table for packages (same as conversation-package-service) |
| `ANALYSIS_RESULTS_TABLE` | DynamoDB table for transcript analysis results |
| `PACKAGE_GENERATED_TOPIC_ARN` | SNS topic ARN to publish when a package is generated/updated (optional; if unset, no notification is sent) |
| `PROJECT_NAME` | Project prefix (e.g. for OpenAI secret) |
| `ENVIRONMENT` | Environment (e.g. dev, prod) |

OpenAI API key is read from Secrets Manager: `{PROJECT_NAME}-{ENVIRONMENT}-openai-api-key`.

### SNS event (package.generated)

When a package is created or updated, the service publishes to the SNS topic (if `PACKAGE_GENERATED_TOPIC_ARN` is set). Message body (JSON):

- `event`: `"package.generated"`
- `userId`: string
- `language`: string
- `packageId`: string
- `packageName`: string
- `generatedAt`: ISO timestamp
- `updated`: boolean (true if package was updated, false if newly created)

Subscribers (e.g. email, Lambda) can use this to send notifications or trigger downstream flows.

## Infra

- **Terraform**: `infra/services/package-generation-service`
- **Lambda**: SQS event source (batch size 5), timeout 60s.
- **State table**: PK `USER#<userId>`, SK `LANGUAGE#<language>` with `lastProcessedAt` (ISO string); and SK `LAST_LESSON_DAY` with `lastLessonDate` (UTC date `YYYY-MM-DD`) for the one-lesson-per-user-per-day limit.
- **IAM**: Read analysis results; read+write conversation packages and generation state; Secrets Manager (OpenAI); SQS receive/delete on the voice-session queue; SNS Publish to the package-generated topic.
- **SNS topic**: `{project}-{environment}-package-generated` – created by Terraform; subscribe (email, Lambda, SQS, etc.) to react to package generation.

The voice-session queue is the one produced to by the voice-session-service; this service is the consumer.
