import fetch from "node-fetch";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export interface CreateSessionInput {
  instructions?: string;
}

export interface CreateSessionOptions {
  /** When true, request output_modalities: ["text"] (no audio from model); default = audio output */
  textOnlyOutput?: boolean;
  /** When true, use gpt-4o-realtime-preview (stronger) instead of gpt-4o-mini-realtime-preview */
  useStrongerModel?: boolean;
}

export interface CreateSessionOutput {
  client_secret: string;
  expires_at: string;
  session_id: string;
  /** Model used for this session (for client to connect with same model) */
  model: string;
}

const MODEL_MINI = "gpt-4o-mini-realtime-preview";
const MODEL_STRONGER = "gpt-4o-realtime-preview";

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
      // Handle both JSON and plain string formats
      try {
        const parsed = JSON.parse(secretString);
        this.apiKey = parsed.key || parsed.apiKey || parsed;
      } catch {
        this.apiKey = secretString;
      }
    } catch (error) {
      throw new Error(
        `Failed to load OpenAI API key from Secrets Manager: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createSession(
    instructions: string,
    sessionId: string,
    options: CreateSessionOptions = {}
  ): Promise<CreateSessionOutput> {
    if (!this.apiKey) {
      throw new Error("OpenAIClient not initialized");
    }

    const model = options.useStrongerModel === true ? MODEL_STRONGER : MODEL_MINI;
    const payload: Record<string, unknown> = {
      model,
      instructions,
      voice: "coral",
      // Lower = more controlled, less fast / excitable speech
      temperature: 0.6,
      input_audio_transcription: {
        model: "gpt-4o-transcribe",
      },
    };
    if (options.textOnlyOutput === true) {
      payload.output_modalities = ["text"];
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const session = await response.json();

    // Use OpenAI's session ID if available, otherwise use the provided one
    const finalSessionId = session.id || session.session_id || sessionId;

    return {
      client_secret: session.client_secret.value,
      expires_at: session.expires_at,
      session_id: finalSessionId,
      model,
    };
  }
}
