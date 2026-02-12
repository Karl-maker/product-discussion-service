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
  language: string;
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

    const systemPrompt = buildSystemPrompt(input.language);
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

    return validateGeneratedPackage(parsed, input.language);
  }
}

function buildSystemPrompt(language: string): string {
  return `You are an expert language curriculum designer. You generate a single learning package for a user for ONE language (${language}).

Output a JSON object with exactly these keys: name, description (optional), category, tags (array of strings), conversations, notes (object with optional title, details, content), language.

RULES:
1. The user must have at most ONE package per language. Your output is that one package for the given language.
2. CONVERSATIONS: Array of conversation topics. Each has: name, instruction, targets (array of { key, description, check, amount? }).
   - The FIRST one or two conversations must be REVIEW: test what the user already learned (e.g. words they've seen). For each review conversation, the instruction MUST explicitly tell the AI to START the conversation with a specific word or phrase (e.g. "Start the conversation by saying [word] and encourage the user to respond in ${language}") so the user is tested on that word.
   - After review, add ONE new lesson conversation that builds on previous material. No duplicate words: only introduce NEW words/concepts; reuse existing words only in review.
3. SPEAKING-FOCUSED: Instructions must state the language the user is learning (${language}) and that the goal is speaking practice. The AI should conduct the conversation in the target language where appropriate and prompt the user to speak.
4. CONTENT: Put in notes.content (or notes.details) a short study guide: words/phrases for this lesson with pronunciation and meaning; what they're learning; writing tips if relevant. Notes should also include what the user needs to work on or learn next based on their past feedback.
5. TARGETS: Each conversation has targets with key (unique slug), description, check (criterion for transcript analysis), optional amount. Review targets check that the user used the review word correctly; new lesson targets check new objectives.
6. Use category "language" and tags that include the language name and "speaking".`;
}

function buildUserPrompt(input: GeneratePackageInput): string {
  const { language, existingPackage, analysisResults } = input;
  const parts: string[] = [];

  parts.push(`Language: ${language}`);
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
  parts.push("Return ONLY valid JSON with keys: name, description, category, tags, conversations, notes, language. No markdown.");

  return parts.join("\n");
}

function validateGeneratedPackage(parsed: unknown, language: string): GeneratedPackage {
  const o = parsed as Record<string, unknown>;
  if (!o || typeof o !== "object") throw new Error("Generated package must be an object");

  const name = String(o.name ?? "Learning package");
  const description = o.description !== undefined ? String(o.description) : undefined;
  const category = String(o.category ?? "language");
  const tags = Array.isArray(o.tags) ? (o.tags as string[]) : [language, "speaking"];
  const lang = String(o.language ?? language);

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
    language: lang,
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
