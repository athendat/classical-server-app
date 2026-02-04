import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

/**
 * Subdocumento para dirección de negocio
 */
@Schema({ _id: false })
export class AddressSchema {
    @Prop({ type: String, required: true })
    address: string;

    @Prop({ type: String, required: true })
    city: string;

    @Prop({ type: String, required: true })
    state: string;

    @Prop({ type: String, required: true })
    zipCode: string;

    @Prop({ type: String, required: false })
    country?: string;
}

export const AddressSchemaFactory = SchemaFactory.createForClass(AddressSchema);