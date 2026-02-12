import { OpenAIClient } from "../../infrastructure/openai.client";
import type { VoiceSessionQueue } from "../../infrastructure/voice-session.queue";
import type { VoiceSessionRecord } from "../../infrastructure/repositories/voice-session.repository";

export interface CreateVoiceSessionInput {
  instructions?: string;
  /** When true, session returns text-only output (no audio); default false = audio output */
  textOnlyOutput?: boolean;
  userId?: string;
}

export interface CreateVoiceSessionOutput {
  client_secret: string;
  expires_at: string;
  session_id: string;
}

// Template instructions: friendly, clarifying, strict on topic, low-temperature style
const INSTRUCTION_TEMPLATE = `You are a warm, approachable tutor—like a patient friend who genuinely wants to help. Sound like a real person, not a generic assistant: use a relaxed, kind tone and occasional light humour when it fits. Never sound robotic or scripted.
Speak only in English. Do not respond in any other language.

Check in often: ask "What part of this is unclear?" or "Is there anything you're stuck on?" If something the user says is vague or confusing, say so kindly and ask them to clarify (e.g. "I want to make sure I get you—could you say a bit more about...?"). Your goal is to understand them and then help.

Stay strictly on the current topic. Do not drift into other subjects. Keep replies focused, consistent, slow, and to the point—brief and clear rather than long or rambling. If the user goes off-topic, gently steer back (e.g. "Let's keep our focus on [topic] for now.").`;

export class CreateVoiceSessionUseCase {
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly voiceSessionQueue: VoiceSessionQueue
  ) {}

  async execute(
    input: CreateVoiceSessionInput
  ): Promise<CreateVoiceSessionOutput> {
    // Ensure client is initialized
    const ensureInit = (global as any).__voiceSessionServiceEnsureInit;
    if (ensureInit) {
      await ensureInit();
    }

    // Combine template with user-provided instructions
    const combinedInstructions = input.instructions
      ? `${INSTRUCTION_TEMPLATE}\n\n${input.instructions}`
      : INSTRUCTION_TEMPLATE;

    // Generate session ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create session with OpenAI
    const session = await this.openAIClient.createSession(
      combinedInstructions,
      sessionId,
      { textOnlyOutput: input.textOnlyOutput === true }
    );

    // Calculate TTL (30 days from now)
    const now = new Date();
    const ttlDate = new Date(now);
    ttlDate.setDate(ttlDate.getDate() + 30);
    const ttl = Math.floor(ttlDate.getTime() / 1000);

    const record: VoiceSessionRecord = {
      sessionId: session.session_id,
      userId: input.userId,
      createdAt: now.toISOString(),
      expiresAt: session.expires_at,
      ttl,
    };

    // Send to queue for async storage to DynamoDB
    await this.voiceSessionQueue.send(record);

    return {
      client_secret: session.client_secret,
      expires_at: session.expires_at,
      session_id: session.session_id,
    };
  }
}
