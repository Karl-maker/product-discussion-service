# Conversation User Service

Stores and retrieves conversation user profile: language, targetLanguage, initialFluency, profession, timezone, country, purposeOfUsage. All endpoints require a valid JWT; the authenticated user's ID from the token is used as `userId`.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users` | Create profile for the authenticated user (body: optional fields only) |
| GET | `/users/me` | Get profile for the authenticated user |
| PUT | `/users/me` | Update profile for the authenticated user (partial body) |

## Request / response

- **POST /users** – Requires `Authorization: Bearer <token>`. Body: `language`, `targetLanguage`, `initialFluency`, `profession`, `timezone`, `country`, `purposeOfUsage` (all optional). `userId` is taken from the JWT. Returns created profile (201).
- **GET /users/me** – Requires `Authorization: Bearer <token>`. Returns the authenticated user's profile or 404 if not found (200).
- **PUT /users/me** – Requires `Authorization: Bearer <token>`. Body: any subset of the optional fields. Creates profile if it does not exist. Returns updated profile (200).

Missing or invalid JWT returns 401.

## Environment

- `CONVERSATION_USERS_TABLE` – DynamoDB table name
- `JWT_ACCESS_TOKEN_SECRET` – Secret for verifying JWT access tokens (from Secrets Manager)
