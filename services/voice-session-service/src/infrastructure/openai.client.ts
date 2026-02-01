import fetch from "node-fetch";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export interface CreateSessionInput {
  instructions?: string;
}

export interface CreateSessionOutput {
  client_secret: string;
  expires_at: string;
  session_id: string;
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
    sessionId: string
  ): Promise<CreateSessionOutput> {
    if (!this.apiKey) {
      throw new Error("OpenAIClient not initialized");
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview",
          instructions: instructions,
          voice: "coral",
          temperature: 0.6,
          input_audio_transcription: {
            model: "gpt-4o-transcribe"
          }
        }),
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
    };
  }
}
