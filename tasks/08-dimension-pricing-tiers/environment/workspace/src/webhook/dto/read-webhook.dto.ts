import { Webhook } from '../entities/webhook.entity.js';
import { WebhookType } from './create-webhook.dto.js';

export class ReadWebhookDto {
    hookUrl: string;
    id: string;
    webhookType: WebhookType;

    constructor({ webhookId, webhookType, hookUrl }: Webhook) {
        this.hookUrl = hookUrl;
        this.id = webhookId;
        this.webhookType = webhookType;
    }
}
