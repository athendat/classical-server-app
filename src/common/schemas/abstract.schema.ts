import { Prop } from "@nestjs/mongoose";

import { v4 as uuidv4 } from 'uuid';

export class AbstractSchema {
    @Prop({ type: String, required: true, unique: true, default: () => uuidv4() })
    id: string;

    @Prop({ type: String, required: true, ref: 'User' })
    userId: string;

    @Prop({ type: Date, default: Date.now })
    createdAt?: Date;

    @Prop({ type: Date, default: Date.now })
    updatedAt?: Date;
}