# Voice Session Service

A serverless Lambda function service for creating OpenAI Realtime API voice sessions. This service handles the creation of voice conversation sessions with configurable instructions.

## Overview

The Voice Session Service is an AWS Lambda function that processes API Gateway events to create OpenAI Realtime API sessions. It stores session metadata in DynamoDB with a 30-day TTL.

### Features

- **Session Creation**: Creates OpenAI Realtime API sessions with customizable instructions
- **Session Tracking**: Records session metadata in DynamoDB with automatic expiration (30 days)
- **Instruction Templates**: Combines service-level templates with user-provided instructions
- **Secrets Management**: Retrieves OpenAI API key from AWS Secrets Manager

## Architecture

The service follows a clean architecture pattern:

```
src/
├── app/              # Application layer
│   ├── controllers/ # Request handlers
│   └── usecases/    # Business logic
├── infrastructure/  # External integrations
│   ├── openai.client.ts
│   └── repositories/
│       └── voice-session.repository.ts
└── handler/         # Lambda handler and API Gateway integration
```

## Environment Variables

The service requires the following environment variables:

### Required

- `VOICE_SESSION_QUEUE_URL` - URL of the SQS queue; this service only sends session records to the queue (no consumer here; attach another service/Lambda to the queue to process messages).
- `PROJECT_NAME` - Project name for Secrets Manager lookup
- `ENVIRONMENT` - Environment name (dev, staging, prod)

### Flow

When a voice session is created (POST /voice-session), the service creates the session with OpenAI and sends a **session record** (sessionId, userId, createdAt, expiresAt, ttl) to the SQS queue. This service does nothing else with the queue; you attach a separate consumer (e.g. another Lambda) to the queue to process messages.

## API Endpoints

### POST /voice-session

Creates a new OpenAI Realtime API voice session.

**Request Body:**
```json
{
  "instructions": "Optional custom instructions to append to the template",
  "text_only": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `instructions` | string | (template) | Custom instructions appended to the built-in template. |
| `text_only` | boolean | `false` | When `true`, session uses `output_modalities: ["text"]` (model returns text only, no audio). When `false` or omitted, session returns audio as usual. |

**Response:**
```json
{
  "client_secret": "session-client-secret-value",
  "expires_at": "2026-01-29T12:00:00Z",
  "session_id": "session-1234567890"
}
```
