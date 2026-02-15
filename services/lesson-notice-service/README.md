# Lesson Notice Service

EventBridge-triggered Lambda that runs on a schedule (default: every 6 hours). It:

1. Scans the conversation-packages table for user-owned packages (has `userId`).
2. Builds "latest package per user" by `updatedAt` (only one notice per user, for their most recent package).
3. For each user (up to 100 per run), checks the **notice-sent** DynamoDB table: if a notice was sent in the last **7 days**, skips that user.
4. For users not skipped: resolves user email (optional `USER_EMAIL_TABLE`), builds a lesson email payload, sends it to the **email-service SQS queue**, and records the send in the notice-sent table (TTL 7 days).

The email payload matches the format consumed by the email-service (e.g. wittytalk-core-service): `template: "lesson.hbs"`, `header`, `to`, `content: { email, lessonName, description, note, pastFeedback, lessonUrl }`. Another service (email-service Lambda) consumes the queue and sends the actual email.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `CONVERSATION_PACKAGES_TABLE` | Yes | DynamoDB table name for packages (same as conversation-service). |
| `NOTICE_SENT_TABLE` | Yes | DynamoDB table for tracking sent notices (TTL 7 days). |
| `EMAIL_QUEUE_URL` | Yes | SQS queue URL for email-service (e.g. from wittytalk-core-service). |
| `USER_EMAIL_TABLE` | No | If set, DynamoDB table for userId → email (e.g. conversation-users with `email` attribute, or dedicated table with PK=USER#userId, SK=PROFILE). If not set, users without email are skipped. |
| `ANALYSIS_RESULTS_TABLE` | No | If set, recent feedback for the user is included in the email (max 5). |
| `LESSON_BASE_URL` | No | Base URL for lesson links (default: https://app.wittytalk.ai). |

## Infra (Terraform)

- **Schedule**: `schedule_cron` variable (default: `cron(0 */6 * * ? *)` = every 6 hours UTC). Change it to adjust how often the Lambda runs.
- **CI**: Set repo variable `EMAIL_QUEUE_URL` (and optionally `SCHEDULE_CRON`) to deploy lesson-notice-service from talk-to-me CI.
