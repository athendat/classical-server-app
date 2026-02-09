import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false })
export class OAuth2ClientCredentialsSchema {
    
    @Prop({ type: String, required: true })
    clientId: string;
    
    // clientSecret NO se almacena aquí, se guarda en Vault por seguridad
}

export const OAuth2ClientCredentialsSchemaFactory = SchemaFactory.createForClass(OAuth2ClientCredentialsSchema);
