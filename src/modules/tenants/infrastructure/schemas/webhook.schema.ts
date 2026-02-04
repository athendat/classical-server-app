import { Schema, Prop, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false })
export class WebhookSchema {
    @Prop({ type: String, required: true })
    id: string;

    @Prop({ type: String, required: false, default: null })
    url?: string | null;

    @Prop({ type: [String], required: true, default: [] })
    events: string[];

    @Prop({ type: Boolean, default: true })
    active: boolean;

    @Prop({ type: String, required: true })
    secret: string;

    @Prop({ type: Date, default: Date.now })
    createdAt: Date;

    @Prop({ type: Date, default: Date.now })
    updatedAt: Date;
}

export const WebhookSchemaFactory = SchemaFactory.createForClass(WebhookSchema);