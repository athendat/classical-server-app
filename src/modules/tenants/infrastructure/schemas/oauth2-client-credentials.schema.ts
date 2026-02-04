import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false })
export class OAuth2ClientCredentialsSchema {
    
    @Prop({ type: String, required: true })
    clientId: string;
    
    @Prop({ type: String, required: true })
    clientSecret: string;
}

export const OAuth2ClientCredentialsSchemaFactory = SchemaFactory.createForClass(OAuth2ClientCredentialsSchema);
