import fetch from "node-fetch";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type { ConversationTarget } from "../domain/types/package.types";
import type { TranscriptAnalysisResult } from "../domain/types/package.types";
import { validateTranscriptAnalysisSchema } from "../domain/validation/analysis-schema";

export interface AnalyzeTranscriptInput {
  targets: ConversationTarget[];
  transcript: string;
  /** When set, include words the user said in this language (word, pronunciation, meaning). */
  targetLanguage?: string;
}

export class OpenAIClient {
  private apiKey: string | null = null;

  async initialize(projectName: string, environment: string): Promise<void> {
    const secretName = `${projectName}-${environment}-openai-api-key`;
    const secretsClient = new SecretsManagerClient({ region: "us-east-1" });

    try {
      const response = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretName })
      );

      const secretString = response.SecretString || "";
      try {
        const parsed = JSON.parse(secretString) as Record<string, unknown>;
        const key = parsed.key ?? parsed.apiKey ?? secretString;
        this.apiKey = typeof key === "string" ? key : String(key);
      } catch {
        this.apiKey = secretString;
      }
    } catch (error) {
      throw new Error(
        `Failed to load OpenAI API key from Secrets Manager: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async analyzeTranscript(input: AnalyzeTranscriptInput): Promise<TranscriptAnalysisResult> {
    if (!this.apiKey) {
      throw new Error("OpenAIClient not initialized");
    }

    const targetsDescription = input.targets
      .map(
        (t) =>
          `- key: "${t.key}", description: ${t.description}, check: ${t.check}${t.amount != null ? `, amount: ${t.amount}` : ""}`
      )
      .join("\n");

    const withTargetLanguage = Boolean(input.targetLanguage?.trim());
    const targetLanguageName = input.targetLanguage?.trim() ?? "";

    const systemPrompt = `You are an expert at analyzing conversation transcripts against learning targets.
Return a JSON object with a key "feedback" whose value is an array of approximately 3 feedback objects.
Each feedback object must have:
- "content": string (one clear feedback message)
- "isPositive": boolean (true if the feedback is encouraging, false if it points out something to improve)
- "targets": array of strings. Include a target's key ONLY if the transcript met that target's "check" requirement (e.g. said the word enough times, covered the point, avoided the word). Omit keys for targets that were not met.
${withTargetLanguage ? `
When a target language is provided, also include a key "wordsUsed": an array of objects for each distinct word or short phrase the USER said in that language (use an empty array if the user said nothing in that language). Each object must have:
- "word": string (the word or phrase as written in the target language)
- "pronunciation": string (phonetic or IPA pronunciation, or "N/A" if not applicable)
- "meaning": string (brief meaning in English)
Include only words/phrases actually spoken by the user in the transcript, not by the AI.` : ""}

Return ONLY valid JSON, no markdown or extra text.`;

    const wordsUsedHint = withTargetLanguage
      ? ` Also include "wordsUsed": [ { "word": "...", "pronunciation": "...", "meaning": "..." }, ... ] for each word the user said in ${targetLanguageName}.`
      : "";

    const userPrompt = `Targets:
${targetsDescription}

Transcript to analyze:
---
${input.transcript}
---

Return JSON: { "feedback": [ { "content": "...", "isPositive": true/false, "targets": ["key1", ...] }, ... ] }${wordsUsedHint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("OpenAI request timed out after 25s");
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response missing content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI response is not valid JSON");
    }

    return validateTranscriptAnalysisSchema(parsed);
  }
}
