import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsRFC3339, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoicePaymentTerm } from '../entities/invoice.entity';
import { EndTimeRangeValidation, StartTimeBeforeFirstOfMonth, StartTimeRangeValidation } from './timeRangeValidator';
import { ManualInvoiceValidation } from './manualInvoiceValidation';

export class CreateInvoicesDto {
    /**
     * The ID for the Business Entity using MeteringCo
     * @example 123MyCoolCorp980
     */

    @IsString()
    @ApiProperty()
    @IsOptional()
    public businessID: string;

    /**
     *
     * The client ID assocaited with the Business Entity, this is the name for the business which will be used in the invoce
     * @example Khols
     */

    @IsString()
    @IsNotEmpty()
    @ApiProperty()
    public customerId: string;

    /**
     *
     * The Itemized collection of elements to be billed. These could be instance compute hours, or number of users
     * @example [{ name "MyService", "startTime": "2016-09-18T17:34:02.666Z", "endTime": "2022-09-18T17:34:02.666Z", "quantity": 2,"price": "2.5"}]
     */

    @ManualInvoiceValidation('items')
    public items: Array<any>;

    /**
     * The date the invoice is to be generated for
     * @example "2020-09-18T17:34:02.666Z"
     */
    @IsOptional()
    @IsDateString()
    @ApiProperty()
    public invoiceDate?: string;

    /**
     *
     * The Payment Term for the invoice. This is the number of days until the invoice is considered past due. Default is "none"
     * @example "net30"
     */
    @IsEnum(InvoicePaymentTerm)
    @IsOptional()
    @ApiProperty()
    public invoicePaymentTerm?: InvoicePaymentTerm;

    @IsRFC3339()
    @IsOptional()
    @StartTimeRangeValidation('start')
    @StartTimeBeforeFirstOfMonth('start')
    @ApiProperty({
        name: 'start',
        required: false,
        example: '2020-09-01T13:37:00.000Z',
        description:
            'The start time the invoice is to be generated for, if not provided the first day of the current month (UTC) will be used',
    })
    public start?: string;

    @IsRFC3339()
    @IsOptional()
    @EndTimeRangeValidation('end')
    @ApiProperty({
        name: 'end',
        required: false,
        example: '2020-09-18T17:34:02.666Z',
        description:
            'The end time the invoice is to be generated for, if not provided now in UTC will be used. <br><br>  <i> If provided EndTime must be after startTime and must also be after the first day of the current month </i>',
    })
    public end?: string;
}
