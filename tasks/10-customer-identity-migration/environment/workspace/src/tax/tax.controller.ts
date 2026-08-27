import { Controller } from '@nestjs/common';
import { TaxService } from './tax.service';

@Controller('tax')
export class TaxController {
    constructor(private readonly taxService: TaxService) {}
}
