# Clip Results Service

API for clip attempt scores (0–1), per-clip snapshot (average score, total likes), and likes (one per user per clip) with quick lookup by `userId` and `clipId`.

## Base path

All endpoints are under **`/clip-results`** (or `/{stage}/clip-results` if using a stage, e.g. `/v1/clip-results`).

---

## Endpoints

### Submit a clip result (attempt)

Record a single attempt for a user and clip. Score is clamped to 0–1. The clip snapshot’s average score is updated.

- **Method:** `POST`
- **Path:** `/clip-results`
- **Body (JSON):**
  - `userId` (string, required)
  - `clipId` (string, required)
  - `score` (number, required) — between 0 and 1
  - `attemptedAt` (string, optional) — ISO timestamp; defaults to now
- **Response (201):**
  - `attempt`: `{ userId, clipId, score, attemptedAt }`
  - `snapshot`: `{ clipId, averageScore, totalAttempts, totalLikes, updatedAt }`

---

### Get latest result for user + clip

Fetch the most recent attempt for a given user and clip. Use this to quickly find a user’s latest result by `userId` and `clipId`.

- **Method:** `GET`
- **Path:** `/clip-results/latest`
- **Query:**
  - `userId` (required)
  - `clipId` (required)
- **Response (200):**  
  `{ userId, clipId, score, attemptedAt }`
- **Errors:** `404` if no attempt exists for that user and clip.

---

### Get clip snapshot

Get the current snapshot for a clip: average score, total attempts, total likes.

- **Method:** `GET`
- **Path:** `/clip-results/snapshot`
- **Query:**
  - `clipId` (required)
- **Response (200):**  
  `{ clipId, averageScore, totalAttempts, totalLikes, updatedAt }`
- **Errors:** `404` if no snapshot exists yet for that clip.

---

### Like a clip

Record a like for a user and clip. One like per user per clip; repeated calls are idempotent (return existing like).

- **Method:** `POST`
- **Path:** `/clip-results/likes`
- **Body (JSON):**
  - `userId` (string, required)
  - `clipId` (string, required)
- **Response (201):**
  - `liked`: `true`
  - `likedAt`: ISO timestamp (existing or new)

---

### Unlike a clip

Remove a user’s like for a clip. Snapshot `totalLikes` is decremented.

- **Method:** `DELETE`
- **Path:** `/clip-results/likes`
- **Query:**
  - `userId` (required)
  - `clipId` (required)
- **Response (200):**  
  `{ removed: true }` or `{ removed: false }` if there was no like.

---

### Get user’s likes (quick find)

List all clips a user has liked. Use for quick lookup of “what did this user like?”

- **Method:** `GET`
- **Path:** `/clip-results/likes`
- **Query:**
  - `userId` (required)
- **Response (200):**  
  `{ likes: [ { userId, clipId, likedAt }, ... ] }`

---

### Check if user liked a clip

Check whether a user has liked a given clip (quick lookup).

- **Method:** `GET`
- **Path:** `/clip-results/likes/check`
- **Query:**
  - `userId` (required)
  - `clipId` (required)
- **Response (200):**
  - `liked`: boolean
  - `likedAt`: ISO timestamp (present only when `liked` is true)

---

## Summary

| Purpose                         | Endpoint                      | Notes                                                |
|---------------------------------|-------------------------------|------------------------------------------------------|
| Latest result by userId + clipId| `GET /clip-results/latest`    | 404 if none                                          |
| Score 0–1, many attempts        | `POST /clip-results`          | Updates snapshot average                             |
| Snapshot (avg, total likes)     | `GET /clip-results/snapshot`  | Snapshot of average score and total likes per clip   |
| One like per user per clip      | `POST /clip-results/likes`    | Idempotent                                           |
| Remove like                     | `DELETE /clip-results/likes`  | Decrements snapshot totalLikes                      |
| Quick find user’s likes         | `GET /clip-results/likes`     | All likes for a user                                 |
| Quick check like                | `GET /clip-results/likes/check` | Whether user liked clip + likedAt                  |
