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
          model: "gpt-4-turbo",
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
  return `You are a warm, personal language teacher designing a one-on-one curriculum. Your tone is like a teacher with a single student: encouraging, clear, and tailored. You generate a single learning package for ONE target language (${targetLanguage}). Write all explanations, notes, and instructions in the user's language (the language they use when not speaking ${targetLanguage}—e.g. English; infer from context if not specified). Guide the user on pronunciation: include phonetic spelling, "say it like...", or simple pronunciation tips so they can practice saying words correctly.

Output a JSON object with exactly these keys: name, description (short, required), category, tags (array of strings), conversations, notes (object with title (required), details (required), content (required)), targetLanguage.

RULES:
1. The user must have at most ONE package per target language. Your output is that one package for the given target language.
2. PACKAGE NAME: Do NOT include the word "package" in the name. Use a short, personal title (e.g. "My Japanese", "Spanish with you", "Your French path").
3. PACKAGE DESCRIPTION: Always include a short description (one or two sentences) that summarizes what this package covers and the focus (e.g. "Review and new greetings. Practice saying hello and thanks in ${targetLanguage}."). Keep it brief and personal.
4. CONVERSATIONS: Output exactly 10 conversations. Each has: name, description (short, required), instruction, targets (array of { key, description, check, amount? }).
   - CONVERSATION DESCRIPTION: Every conversation MUST have a short description (one sentence) explaining what this conversation is about and what the user will practice. Write in the user's language.
   - Conversation NAMES: Use exactly two words. For review conversations, the name MUST start with "Review: " then two words (e.g. "Review: Greetings practice"). For lesson conversations, just two words (e.g. "Weather talk", "Ordering food").
   - ALWAYS PROGRESS: Do NOT keep reviewing the same material if you already reviewed it last time. Each run must move forward. Use the RECENT ANALYSIS RESULTS and past words the user said to decide what to do next.
   - REVIEW = basic introductions we use every time: Start the first 2–3 conversations with basic introductions as the review (hello, thanks, how are you—the phrases we use every time we meet). The instruction MUST tell the AI tutor to (1) remind the user that they've said these before and we use them every time we meet, and (2) START the conversation with a specific word or phrase so the user responds in ${targetLanguage}. Do not re-drill the same review from the previous package; treat introductions as the standing "review" and build from the last lesson.
   - From the last lesson, teach a NEW way to introduce or expand on introductions (e.g. different formality, "nice to meet you", asking name). For the first few lessons, base expansion on what the user said last time: if they used "hello" and "thanks", add "how are you" or "my name is"; keep expanding introductions. Then move to new topics.
   - TOPIC ADVANCEMENT: Look at the past words the user said (in RECENT ANALYSIS RESULTS). If the user seems advanced in a topic (e.g. consistently hitting targets, using words correctly, good feedback), MOVE ON from that topic—do not keep drilling it. Add new topics or deeper variants. If they struggled, do one more focused review then progress.
   - The remaining conversations (7–8) are lesson conversations that build on previous material. Progress from basics to slightly more complex; only introduce NEW words/concepts in each; reuse existing words only in the introduction/review conversations. No duplicate words across lessons; each lesson adds something new.
5. INSTRUCTION STYLE (critical): Write instructions so the AI tutor takes time with the user and does NOT blast long sentences. The tutor must: (a) introduce or remind the user of one word or concept first; (b) then prompt the user to try (e.g. "How would you respond to this?" or "What would you say?") and wait for their response; (c) only after the user responds, give the revision or correct phrasing. Emphasize pacing: one step at a time, give the user time to think and speak. No long monologues; short turns and clear prompts.
6. SPEAKING-FOCUSED: Instructions must state the target language (${targetLanguage}) and that the goal is speaking practice. Write as if instructing the AI tutor: personal, teacher-to-student. The AI should conduct the conversation in the target language where appropriate and prompt the user to speak.
7. TARGETS:
   - description: Keep SHORT (one brief phrase; e.g. "Say hello", "Use the new word").
   - check: Write as an instruction for the AI that will analyze the transcript. Use the form "Did the user [do X]?" or "Did the user say [word/phrase]?" (e.g. "Did the user say konnichiwa?", "Did the user greet in ${targetLanguage}?", "Did the user use the word for thank you?"). One clear, yes/no question per target.
   - key (unique slug), optional amount as before. Review targets: check that the user said or used the review word correctly; new lesson targets: check new objectives.
8. NOTES: Always include notes.title, notes.details, and notes.content (all three STRICTLY required). notes.title: MUST describe the theme of the lesson (e.g. "Greetings and introducing yourself", "Asking how someone is")—not generic labels like "Study guide". notes.details: brief summary (e.g. what this package focuses on, 1–2 sentences). notes.content: Do NOT use lists or bullet points. Write a short paragraph in the user's language (not in ${targetLanguage}) that describes what the user will learn in this lesson and what they will improve (e.g. what skills or phrases they'll practice, what they'll get better at). One flowing paragraph only.
9. Use category "language" and tags that include the target language name and "speaking".`;
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
    parts.push("RECENT ANALYSIS RESULTS (all results since last process — use these to decide review, progression, and topic advancement):");
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
    parts.push("From the above: (1) Do not repeat the same review as last time—progress. Use basic introductions (we use every time we meet) as review; expand on introductions from the last lesson; (2) If the user seems advanced in a topic (words said, targets hit), move on from that topic; (3) Build new lessons from what they said and what they missed. Do not duplicate words; only evolve.");
  } else {
    parts.push("No new analysis results since last run. If there is an existing package, output an evolved version (e.g. add one small new lesson or adjust notes). If no existing package, create a first lesson.");
  }

  parts.push("");
  parts.push("Return ONLY valid JSON with keys: name, description, category, tags, conversations (exactly 10), notes, targetLanguage. No markdown.");

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
    const detailsStr = typeof n.details === "string" ? n.details : "";
    const contentStr = typeof n.content === "string" ? n.content : "";
    const titleStr = typeof n.title === "string" && n.title.trim() ? n.title.trim() : "Study notes";
    notes = {
      title: titleStr,
      details: detailsStr || contentStr,
      content: contentStr || detailsStr,
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
    description: o.description !== undefined ? String(o.description) : undefined,
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
