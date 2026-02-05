import { Module } from "@nestjs/common";

import { EmvcoService } from "./emvco.service";

@Module({
    providers: [EmvcoService],
    exports: [EmvcoService],
})
export class EmvcoModule {
}