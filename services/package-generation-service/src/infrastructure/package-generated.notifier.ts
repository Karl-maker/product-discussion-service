import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import type { StoredPackage } from "./repositories/user-package.repository";

export interface PackageGeneratedEvent {
  event: "package.generated";
  userId: string;
  language: string;
  packageId: string;
  packageName: string;
  generatedAt: string;
  updated: boolean;
}

export interface PackageGeneratedNotifier {
  notify(pkg: StoredPackage, updated: boolean): Promise<void>;
}

export class SNSPackageGeneratedNotifier implements PackageGeneratedNotifier {
  private readonly topicArn: string;
  private readonly client: SNSClient;

  constructor(topicArn: string) {
    this.topicArn = topicArn;
    this.client = new SNSClient({});
  }

  async notify(pkg: StoredPackage, updated: boolean): Promise<void> {
    if (!this.topicArn) return;
    const payload: PackageGeneratedEvent = {
      event: "package.generated",
      userId: pkg.userId,
      language: pkg.language,
      packageId: pkg.id,
      packageName: pkg.name,
      generatedAt: pkg.updatedAt,
      updated,
    };
    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(payload),
        Subject: updated ? "Package updated" : "Package generated",
      })
    );
  }
}
