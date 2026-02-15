# Package Notice Service

EventBridge-triggered Lambda that runs on a schedule (default: every 6 hours). It:

1. Scans the conversation packages table for user-owned packages, groups by `userId`, and keeps the **latest package per user** (by `updatedAt`).
2. Processes up to **100 users** per run.
3. For each user, checks the **notice_sent** DynamoDB table: if a notice was sent in the **last 7 days**, skips (no duplicate emails).
4. For users not skipped, fetches up to **5 past feedback** strings from the analysis results table, builds a **lesson email** payload, and sends it to the **email-service SQS queue** (consumed by email-service to send the actual email).
5. Records the send in **notice_sent** with a **TTL of 7 days** so the item expires automatically.

## Message format (SQS → email-service)

```json
{
  "template": "lesson.hbs",
  "header": "Start Practicing [Language]: [Package name]",
  "to": "<userId>",
  "content": {
    "userId": "<userId>",
    "lessonName": "<package name>",
    "description": "<package description>",
    "lessonUrl": "<app base URL>/learn",
    "note": "<optional from notes.details or notes.content>",
    "pastFeedback": ["...", "..."]
  }
}
```

The email-service resolves `to` (userId) to an email address and sends the lesson email.

## Infra

- **EventBridge rule**: Schedule is configurable via Terraform variable `schedule_cron_expression` (default: `rate(6 hours)`). Use cron for fixed times, e.g. `cron(0 */6 * * ? *)` for every 6 hours.
- **DynamoDB**: `notice_sent` table, PK = `userId`, TTL attribute `ttl` (7 days).
- **IAM**: Read conversation-packages + analysis-results; read/write notice_sent; SendMessage to the email-service queue.

## Email queue

The service sends to the **email-service** SQS queue (`{project_name}-{environment}-email-service-queue`). If that queue is in another stack (e.g. wittytalk-core-service), pass `email_service_queue_url` and `email_service_queue_arn` to Terraform and ensure the queue policy allows the package-notice Lambda role to `sqs:SendMessage`.
