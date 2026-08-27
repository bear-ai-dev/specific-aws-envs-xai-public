import { OmitType } from '@nestjs/swagger';
import { AmountPaidLedgerEntity } from '../entities/payment.entity';

export class AmountPaidLedgerResponse extends OmitType(AmountPaidLedgerEntity, ['businessID'] as const) {
    constructor(amountPaidLedgerEntity: AmountPaidLedgerEntity) {
        super(amountPaidLedgerEntity);
    }
}
