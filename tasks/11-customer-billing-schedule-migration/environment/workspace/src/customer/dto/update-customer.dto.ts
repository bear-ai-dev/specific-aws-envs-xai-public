import { CreateCustomerDto } from './create-customer.dto';
import { ApiHideProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
    /**
     * The Unique ID associated with your specific business account
     * @example myCoolCorp
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;
}
