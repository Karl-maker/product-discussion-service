import fetch from "node-fetch";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type {
  GeneratedPackage,
  AnalysisResultRecord,
  PackageConversation,
  PackageNotes,
} from "../domain/types";
import type { StoredPackage } from "./repositories/user-package.repository";

export interface GeneratePackageInput {
  targetLanguage: string;
  existingPackage: StoredPackage | null;
  /** Analysis results since last processed (newest first). */
  analysisResults: AnalysisResultRecord[];
}

export class PackageGenerationOpenAIClient {
  private apiKey: string | null = null;

  async initialize(projectName: string, environment: string): Promise<void> {
    const secretName = `${projectName}-${environment}-openai-api-key`;
    const client = new SecretsManagerClient({ region: "us-east-1" });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    const secretString = response.SecretString || "";
    try {
      const parsed = JSON.parse(secretString) as Record<string, unknown>;
      this.apiKey = typeof parsed.key === "string" ? parsed.key : String(parsed.apiKey ?? secretString);
    } catch {
      this.apiKey = secretString;
    }
  }

  async generatePackage(input: GeneratePackageInput): Promise<GeneratedPackage> {
    if (!this.apiKey) throw new Error("OpenAI client not initialized");

    const systemPrompt = buildSystemPrompt(input.targetLanguage);
    const userPrompt = buildUserPrompt(input);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

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
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI response missing content");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI response is not valid JSON");
    }

    return validateGeneratedPackage(parsed, input.targetLanguage);
  }
}

function buildSystemPrompt(targetLanguage: string): string {
  return `You are a warm, personal language teacher designing a one-on-one curriculum. Your tone is like a teacher with a single student: encouraging, clear, and tailored. You generate a single learning package for ONE target language (${targetLanguage}).

Output a JSON object with exactly these keys: name, description (short, required), category, tags (array of strings), conversations, notes (object with optional title, details, content), targetLanguage.

RULES:
1. The user must have at most ONE package per target language. Your output is that one package for the given target language.
2. PACKAGE NAME: Do NOT include the word "package" in the name. Use a short, personal title (e.g. "My Japanese", "Spanish with you", "Your French path").
3. PACKAGE DESCRIPTION: Always include a short description (one or two sentences) that summarizes what this package covers and the focus (e.g. "Review and new greetings. Practice saying hello and thanks in ${targetLanguage}."). Keep it brief and personal.
4. CONVERSATIONS: Array of conversation topics. Each has: name, instruction, targets (array of { key, description, check, amount? }).
   - Conversation NAMES: Use exactly two words. For review conversations, the name MUST start with "Review: " then two words (e.g. "Review: Greetings practice", "Review: Key phrases"). For lesson conversations, just two words (e.g. "Weather talk", "Ordering food").
   - The FIRST one or two conversations must be REVIEW: test what the user already learned. For each review conversation, the instruction MUST explicitly tell the AI to START the conversation with a specific word or phrase (e.g. "Start the conversation by saying [word] and encourage the user to respond in ${targetLanguage}") so the user is tested on that word.
   - After review, add ONE new lesson conversation that builds on previous material. No duplicate words: only introduce NEW words/concepts; reuse existing words only in review.
5. SPEAKING-FOCUSED: Instructions must state the target language (${targetLanguage}) and that the goal is speaking practice. Write as if instructing the AI tutor: personal, teacher-to-student. The AI should conduct the conversation in the target language where appropriate and prompt the user to speak.
6. TARGETS:
   - description: Keep SHORT (one brief phrase; e.g. "Say hello", "Use the new word").
   - check: Write as an instruction for the AI that will analyze the transcript. Use the form "Did the user [do X]?" or "Did the user say [word/phrase]?" (e.g. "Did the user say konnichiwa?", "Did the user greet in ${targetLanguage}?", "Did the user use the word for thank you?"). One clear, yes/no question per target.
   - key (unique slug), optional amount as before. Review targets: check that the user said or used the review word correctly; new lesson targets: check new objectives.
7. NOTES: Keep notes SHORT. Put in notes.content (or notes.details) only the essentials: a few key words/phrases with pronunciation and meaning; one line on what they're learning; one line on what to work on next if relevant. Use bullet points or 2–4 short lines max. No long paragraphs.
8. Use category "language" and tags that include the target language name and "speaking".`;
}

function buildUserPrompt(input: GeneratePackageInput): string {
  const { targetLanguage, existingPackage, analysisResults } = input;
  const parts: string[] = [];

  parts.push(`Target language: ${targetLanguage}`);
  parts.push("");

  if (existingPackage) {
    parts.push("EXISTING PACKAGE (evolve from this; do not duplicate words already covered):");
    parts.push(JSON.stringify({
      name: existingPackage.name,
      description: existingPackage.description,
      conversations: existingPackage.conversations,
      notes: existingPackage.notes,
    }, null, 2));
    parts.push("");
  } else {
    parts.push("No existing package for this user/language. Create a new beginner package.");
    parts.push("");
  }

  if (analysisResults.length > 0) {
    parts.push("RECENT ANALYSIS RESULTS (what the user did since last run — use this to decide review and next steps):");
    analysisResults.forEach((r, i) => {
      parts.push(`--- Result ${i + 1} (${r.createdAt}, topic: ${r.topicKey}) ---`);
      parts.push(`Targets HIT: ${JSON.stringify(r.targetsHit.map(t => t.key))}`);
      parts.push(`Targets MISSED: ${JSON.stringify(r.targetsMissed.map(t => t.key))}`);
      if (r.result.feedback?.length) {
        parts.push("Feedback:");
        r.result.feedback.forEach(f => {
          parts.push(`  - [${f.isPositive ? "positive" : "needs work"}] ${f.content}`);
        });
      }
      if (r.result.wordsUsed?.length) {
        parts.push("Words user said in target language: " + r.result.wordsUsed.map(w => w.word).join(", "));
      }
      parts.push("");
    });
    parts.push("From the above: include REVIEW of what they missed or struggled with; then ONE new topic building on it. Do not duplicate words; only evolve.");
  } else {
    parts.push("No new analysis results since last run. If there is an existing package, output an evolved version (e.g. add one small new lesson or adjust notes). If no existing package, create a first lesson.");
  }

  parts.push("");
  parts.push("Return ONLY valid JSON with keys: name, description, category, tags, conversations, notes, targetLanguage. No markdown.");

  return parts.join("\n");
}

function validateGeneratedPackage(parsed: unknown, targetLanguage: string): GeneratedPackage {
  const o = parsed as Record<string, unknown>;
  if (!o || typeof o !== "object") throw new Error("Generated package must be an object");

  const name = String(o.name ?? "My Lessons");
  const description = o.description !== undefined ? String(o.description) : undefined;
  const category = String(o.category ?? targetLanguage);
  const tags = Array.isArray(o.tags) ? (o.tags as string[]) : [targetLanguage, "speaking"];
  const targetLang = String(o.targetLanguage ?? o.language ?? targetLanguage);

  const conversations = Array.isArray(o.conversations)
    ? (o.conversations as unknown[]).map(validateConversation)
    : [];

  let notes: PackageNotes | undefined;
  if (o.notes != null && typeof o.notes === "object") {
    const n = o.notes as Record<string, unknown>;
    notes = {
      title: typeof n.title === "string" ? n.title : undefined,
      details: typeof n.details === "string" ? n.details : undefined,
      content: typeof n.content === "string" ? n.content : undefined,
    };
  }

  return {
    name,
    description,
    category,
    tags,
    conversations,
    notes,
    targetLanguage: targetLang,
  };
}

function validateConversation(c: unknown): PackageConversation {
  const o = (c as Record<string, unknown>) ?? {};
  return {
    name: String(o.name ?? "Conversation"),
    instruction: String(o.instruction ?? ""),
    targets: Array.isArray(o.targets)
      ? (o.targets as unknown[]).map((t) => {
          const x = (t as Record<string, unknown>) ?? {};
          return {
            key: String(x.key ?? ""),
            description: String(x.description ?? ""),
            check: String(x.check ?? ""),
            amount: typeof x.amount === "number" ? x.amount : undefined,
          };
        })
      : [],
  };
}
