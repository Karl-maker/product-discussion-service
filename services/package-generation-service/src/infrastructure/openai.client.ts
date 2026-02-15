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

export interface UserContextForPackage {
  profession?: string;
  initialFluency?: string;
  purposeOfUsage?: string;
}

export interface GeneratePackageInput {
  targetLanguage: string;
  existingPackage: StoredPackage | null;
  /** Analysis results since last processed (newest first). */
  analysisResults: AnalysisResultRecord[];
  /** User profile: profession, fluency, purpose — personalize lessons and pace by this. */
  userContext?: UserContextForPackage;
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
    const timeoutId = setTimeout(() => controller.abort(), 150_000);

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
2. PACKAGE NAME: One to two words only. Must be unique to the goal of this lesson and explain what the user is learning (e.g. "Greetings basics", "Introductions practice", "Weather talk", "Ordering food"). Do NOT include the word "package" or generic titles like "My Japanese". Each package name should reflect the specific focus of the 10 conversations.
3. PACKAGE DESCRIPTION: Always include a short description (one or two sentences) that summarizes what this package covers and the focus (e.g. "Review and new greetings. Practice saying hello and thanks in ${targetLanguage}."). Keep it brief and personal.
4. CONVERSATIONS: Output exactly 10 conversations. Each has: name, description (short, required), instruction, targets (array of { key, description, check, amount? }). Each conversation MUST have at least 3 targets.
   - CONVERSATION DESCRIPTION: Every conversation MUST have a short description (one sentence) explaining what this conversation is about and what the user will practice. Write in the user's language.
   - Conversation NAMES: Use exactly two words. For the single review conversation, the name MUST start with "Quick review: " then two words (e.g. "Quick review: Greetings"). For lesson conversations, just two words (e.g. "Weather talk", "Ordering food").
   - ONE QUICK REVIEW, THEN MOVE ON: Put all revisions in ONE conversation at the start. Name it "Quick review: [topic]" (e.g. "Quick review: Greetings"). In that single conversation, the tutor does a short back-and-forth: ask "How would you respond to [situation X]?" or "What would you say if [Y]?" → user responds → tutor gives brief revision or praise, then next prompt. Do not spread review across 2–3 conversations; group it in one, then the remaining 9 conversations are lessons.
   - DON'T RE-REVIEW UNLESS BAD FEEDBACK: If the last lesson or last package already reviewed something, do NOT bring it back in quick review unless the user had bad feedback or missed targets on it. Use RECENT ANALYSIS RESULTS: only include in quick review what they need to touch on (e.g. one thing they struggled with) or a brief "we use every time we meet" opener. Then push forward.
   - PUSH THE USER TO EXPAND: Focus lessons on expanding what they've learnt—new situations, new ways to use the same words, longer exchanges. Use back-and-forth "How would you respond to [xyz]?" as the main revision style: tutor sets a scenario, user responds in ${targetLanguage}, tutor gives feedback. That counts as revision; no need to re-drill the same phrase in isolation.
   - TOPIC ADVANCEMENT: Look at the past words the user said (in RECENT ANALYSIS RESULTS). If the user seems advanced in a topic (e.g. consistently hitting targets, good feedback), MOVE ON—do not keep drilling it. Add new topics or deeper variants. If they struggled, include only that in the one quick-review conversation, then progress.
   - The remaining 9 conversations (after the one Quick review) are lesson conversations that build on previous material. Progress from basics to slightly more complex; only introduce NEW words/concepts in each. No duplicate words across lessons; each lesson adds something new.
   - FLOW AND PROGRESSION: Make the 10 conversations flow into each other and build on each other. Each lesson should naturally lead to the next (e.g. greetings → asking how someone is → saying thanks and goodbye → next meeting). Later conversations should assume and use what was practiced earlier. The package should feel like one continuous learning arc, not a set of disconnected topics.
5. INSTRUCTION STYLE (critical): Write instructions so the AI tutor takes time with the user and does NOT blast long sentences. The tutor must: (a) introduce or remind the user of one word or concept first; (b) then prompt the user to try (e.g. "How would you respond to this?" or "What would you say?") and wait for their response; (c) only after the user responds, give the revision or correct phrasing. Emphasize pacing: one step at a time, give the user time to think and speak. No long monologues; short turns and clear prompts.
6. SPEAKING-FOCUSED: Instructions must state the target language (${targetLanguage}) and that the goal is speaking practice. Write as if instructing the AI tutor: personal, teacher-to-student. The AI should conduct the conversation in the target language where appropriate and prompt the user to speak.
7. TARGETS: Every conversation must have at least 3 targets. Focus targets on: (a) words or phrases to say, (b) pronunciation, (c) responding to a question with a specific phrase.
   - Words to say: description like "Say [word/phrase] in ${targetLanguage}", check like "Did the user say [word/phrase]?" (specify the exact word or phrase).
   - Pronunciation: description like "Pronounce [word] clearly" or "Say [word] with correct pronunciation", check like "Did the user attempt to pronounce [word]?" or "Did the user say [word] with acceptable pronunciation?".
   - Respond to question: description like "Respond to [question/situation] with [expected phrase or type of answer]", check like "Did the user respond to the tutor's question with [phrase or equivalent]?" (be specific about what a good response contains).
   - description: Keep SHORT but concrete (e.g. "Say konnichiwa", "Pronounce arigatou correctly", "Respond to 'How are you?' with a greeting or feeling").
   - check: One clear yes/no question for the transcript analyzer. key (unique slug), optional amount as before.
8. NOTES: Always include notes.title, notes.details, and notes.content (all three STRICTLY required). notes.title: MUST describe the theme of the lesson (e.g. "Greetings and introducing yourself", "Asking how someone is")—not generic labels like "Study guide". notes.details: brief summary (e.g. what this package focuses on, 1–2 sentences). notes.content: Do NOT use lists or bullet points. Write a short paragraph in the user's language (not in ${targetLanguage}) that describes what the user will learn in this lesson and what they will improve (e.g. what skills or phrases they'll practice, what they'll get better at). One flowing paragraph only.
9. Use category "language" and tags that include the target language name and "speaking".
10. WHEN THE USER PROMPT INCLUDES "ABOUT THE USER" (profession, initial fluency, purpose of usage):
   - TARGET STRONGLY: Design the package and every lesson around who they are and why they are learning. Use vocabulary, scenarios, and goals that fit their profession and purpose (e.g. doctor → medical terms and patient interactions; travel → phrases for booking, directions, dining; business → meetings and email; exams → formal and academic phrases). Personalize the lesson names, instructions, and notes so the user sees themselves in the content.
   - PACE BY FLUENCY: initialFluency drives how aggressive the package is. Beginner = gentle pace, more repetition, smaller steps, clearer scaffolding. Intermediate = moderate pace, less repetition, assume some retention. Advanced = aggressive pace: fewer repeats, assume they pick up quickly, push new material and longer exchanges; do not over-explain or drill basics they likely know.
   - DO NOT RE-REVIEW: If something was already reviewed in the previous package or the last run and the user did well (targets hit, positive feedback), do NOT bring it back in quick review or as new material. Treat it as known from now on. Only include in quick review what they actually struggled with or missed. In future lessons, assume they know previously covered material unless analysis showed they missed it.`;
}

function buildUserPrompt(input: GeneratePackageInput): string {
  const { targetLanguage, existingPackage, analysisResults, userContext } = input;
  const parts: string[] = [];

  parts.push(`Target language: ${targetLanguage}`);
  parts.push("");

  if (userContext && (userContext.profession || userContext.initialFluency || userContext.purposeOfUsage)) {
    parts.push("ABOUT THE USER (use this to target the package and personalize every lesson):");
    if (userContext.profession) parts.push(`- Profession: ${userContext.profession}`);
    if (userContext.initialFluency) parts.push(`- Initial fluency: ${userContext.initialFluency}`);
    if (userContext.purposeOfUsage) parts.push(`- Purpose of learning: ${userContext.purposeOfUsage}`);
    parts.push("");
    parts.push("Target the package strongly to their profession and purpose. Pace lessons by their fluency (see system rules). Do not review again what they already reviewed successfully in the last run—expect them to know it in future.");
    parts.push("");
  }

  if (existingPackage) {
    parts.push("LAST PACKAGE (the user's current package — compare and progress from it):");
    parts.push(JSON.stringify({
      name: existingPackage.name,
      description: existingPackage.description,
      conversations: existingPackage.conversations,
      notes: existingPackage.notes,
    }, null, 2));
    parts.push("");
    parts.push("CRITICAL: (1) Your new package name MUST be different from the above (existing name: \"" + existingPackage.name + "\"). Pick a new 1–2 word name that reflects the next learning goal. (2) Your package MUST progress from this one: new or expanded topics, next steps in the learning arc; do not repeat the same name or the same focus.");
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
    parts.push("From the above: (1) One Quick review conversation only—group all revisions there; use 'How would you respond to [xyz]?' back-and-forth as revision, then move on. (2) Do NOT re-review what they already reviewed successfully; treat it as known. Only include in quick review what they missed or had bad feedback on. (3) Push the user to expand on what they learnt; build new lessons from what they said and what they missed. Do not duplicate words; only evolve.");
  } else {
    parts.push("No new analysis results since last run. If there is an existing package above, output an evolved version: use a different package name (not the same as the last one), add or adjust lessons so the package progresses. Remember: do not review again material they already covered successfully—expect them to know it. If no existing package, create a first lesson.");
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
    ? (o.conversations as unknown[]).map((c, i) => validateConversation(c, i))
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

const MIN_TARGETS_PER_CONVERSATION = 3;

const PLACEHOLDER_TARGETS: Array<{ key: string; description: string; check: string }> = [
  { key: "say-words", description: "Say the target words or phrases in the conversation", check: "Did the user say the target words or phrases?" },
  { key: "pronunciation", description: "Use clear pronunciation for the new words", check: "Did the user attempt to pronounce the words clearly?" },
  { key: "respond-to-question", description: "Respond to the tutor's question with an appropriate phrase", check: "Did the user respond to the tutor's question with a relevant phrase?" },
];

function ensureAtLeastThreeTargets(
  targets: Array<{ key: string; description: string; check: string; amount?: number }>,
  conversationIndex: number
): Array<{ key: string; description: string; check: string; amount?: number }> {
  if (targets.length >= MIN_TARGETS_PER_CONVERSATION) return targets;
  const padded = [...targets];
  let i = 0;
  while (padded.length < MIN_TARGETS_PER_CONVERSATION) {
    const p = PLACEHOLDER_TARGETS[i % PLACEHOLDER_TARGETS.length];
    padded.push({
      key: `conv-${conversationIndex}-${p.key}`,
      description: p.description,
      check: p.check,
    });
    i++;
  }
  return padded;
}

function validateConversation(c: unknown, index: number): PackageConversation {
  const o = (c as Record<string, unknown>) ?? {};
  const rawTargets = Array.isArray(o.targets)
    ? (o.targets as unknown[]).map((t) => {
        const x = (t as Record<string, unknown>) ?? {};
        return {
          key: String(x.key ?? ""),
          description: String(x.description ?? ""),
          check: String(x.check ?? ""),
          amount: typeof x.amount === "number" ? x.amount : undefined,
        };
      })
    : [];
  const targets = ensureAtLeastThreeTargets(rawTargets, index);
  return {
    name: String(o.name ?? "Conversation"),
    description: o.description !== undefined ? String(o.description) : undefined,
    instruction: String(o.instruction ?? ""),
    targets,
  };
}
