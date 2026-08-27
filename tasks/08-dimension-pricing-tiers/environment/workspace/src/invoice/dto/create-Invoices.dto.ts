import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsRFC3339, IsString } from 'class-validator';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { InvoicePaymentTerm } from '../entities/InvoicePaymentTerm.js';
import { StartTimeRangeValidation } from './timeRangeValidator.js';
import { InvoiceLineItemValidation, ManualInvoiceValidation } from './manualInvoiceValidation.js';
import { SupportedCurrencies } from '../../offering/dto/SupportedCurrencies.js';
import { ReadCustomerResponseData } from '../../customer/entities/customer.entity.js';
import { InvoiceLineItems } from '../entities/invoice.entity.js';

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
     * @example [{ name "MyService", "quantity": 2,"price": "2.5"}]
     */

    @ManualInvoiceValidation('items')
    @InvoiceLineItemValidation('items')
    @ApiProperty({ isArray: true, type: 'object', example: [{ name: 'MyService', quantity: '2', price: '2.5' }] })
    public items: Array<any> | InvoiceLineItems;

    /**
     * The date the invoice is to be generated for
     * @example "2020-09-18T17:34:02.666Z"
     */
    @IsOptional()
    @IsDateString()
    @ApiProperty()
    public invoiceDate?: string;

    /**
     * The currency the invoice is to be generated in. If no Currency is passed in the currency used by the customer will be used.
     * <br><br>
     * Example: `"EUR"`
     * @example "EUR"
     *
     */
    @IsOptional()
    @ApiProperty({ enum: SupportedCurrencies })
    public currency?: SupportedCurrencies;

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
    @ApiProperty({
        name: 'end',
        required: false,
        example: '2020-09-18T17:34:02.666Z',
        description:
            'The end time the invoice is to be generated for, if not provided now in UTC will be used. <br><br>  <i> If provided EndTime must be after startTime and must also be after the first day of the current month </i>',
    })
    public end?: string;
}

/*
 To be used when the customer is first created. Since its possible that the customer object is not in the database yet. 
 Additionally can be used to reduce the number of calls to the DB for the same information.
*/
export class CustomerInvoiceDto extends OmitType(CreateInvoicesDto, ['customerId']) {
    customer?: ReadCustomerResponseData;
}

export class CreateInvoiceResponseDto {
    invoiceId: string;
    message: string;
}
