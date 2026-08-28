import { CreateCustomerDto, paymentChannel } from '../../customer/dto/create-customer.dto';
import { CustomerEntity } from '../../customer/entities/customer.entity';
import { supportedCurrencies } from '../../offering/dto/createOffering.dto';

export class CreatePaymentDto {
    public customerId: CreateCustomerDto['customerId'];
    public businessID: string;
    public paymentChannelOptions: CustomerEntity['paymentChannelOptions'];
    public paymentChannel: paymentChannel;
    public total: number;
    public currency: supportedCurrencies;
}
