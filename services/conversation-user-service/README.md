# Conversation User Service

Stores and retrieves conversation user profile: language, targetLanguage, profession, timezone, country, purposeOfUsage.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users` | Create a user profile (body: `userId` + optional fields) |
| GET | `/users/{userId}` | Get profile by userId |
| PUT | `/users/{userId}` | Update profile (partial body) |

## Request / response

**POST /users** – body: `userId` (required), `language`, `targetLanguage`, `profession`, `timezone`, `country`, `purposeOfUsage` (all optional). Returns created profile (201).

**GET /users/{userId}** – returns profile or error if not found (200).

**PUT /users/{userId}** – body: any subset of `language`, `targetLanguage`, `profession`, `timezone`, `country`, `purposeOfUsage`. Creates profile if it does not exist. Returns updated profile (200).

## Environment

- `CONVERSATION_USERS_TABLE` – DynamoDB table name
