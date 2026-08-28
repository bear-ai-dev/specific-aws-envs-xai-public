import { Point } from '@influxdata/influxdb-client';
import { Logger } from '@nestjs/common';
import { ApiHideProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';
import { InfluxService } from '../../influx/influx.service';
import { Address, StripePaymentChannelOptions, paymentChannel, TaxExempt } from '../dto/create-customer.dto';

export class CustomerEntity {
    private static readonly logger = new Logger(CustomerEntity.name);

    @ApiHideProperty()
    public static _measurement = 'CustomerConfig';

    /**
     * Unique identifier assigned by MeteringCo
     * <br><br>
     * Example: `"e345f409-daca-4144-91d2-0a0f87c96581"`
     */
    public customerId: string;

    @ApiHideProperty()
    public businessID?: string;

    /**
     * The friendly, human-readable name of the customer
     */
    public customerName: string;

    /**
     * The payment channel associated with a customer
     */
    public paymentChannel: paymentChannel;

    /**
     * Customer email address
     */
    @IsEmail()
    @IsOptional()
    public email?: string;

    /**
     * Configuration options for the payment channel.
     * For Stripe payment, `stripeCustomerId` is required.
     * See example below.
     * <br><br>
     * Example `{"stripeCustomerId": "acct-xxxxxxxxxxxxxx"}`
     */
    public paymentChannelOptions?: StripePaymentChannelOptions;

    /**
     * Soft deletes a customer from the system.
     * @example true
     */
    @ApiHideProperty()
    public softDelete?: boolean;

    /**
     * The address of the customer
     *  */
    public address?: Address;

    /**
     * The VAT ID of the customer.
     * Every VAT identification number must begin with the code of the country concerned and
     * followed by a block of digits or characters.
     * <br><br>
     * Example `"GB VAT 123456789"`
     */
    public customerVatId?: string;

    /**
     * Whether the customer is exempt from paying taxes
     *
     * Default: `"none"`
     */
    public taxExempt?: TaxExempt;

    constructor({
        customerId,
        businessID = undefined,
        customerName,
        softDelete = undefined,
        paymentChannel,
        paymentChannelOptions,
        email = '',
        address,
        customerVatId,
        taxExempt = TaxExempt.none,
    }: CustomerEntity) {
        this.customerId = customerId;
        this.customerName = customerName;
        this.businessID = businessID;
        this.softDelete = softDelete;
        this.paymentChannel = paymentChannel;
        this.paymentChannelOptions = paymentChannelOptions;
        this.email = email;
        this.address = address;
        this.customerVatId = customerVatId;
        this.taxExempt = taxExempt;
    }
    static transformer(customerEntity: CustomerEntity, influxService: InfluxService): Array<Point> {
        const customerEntityPoint = influxService.getPoint(CustomerEntity._measurement);

        customerEntityPoint.tag('customerId', customerEntity.customerId);
        customerEntityPoint.tag('businessID', customerEntity.businessID);
        customerEntityPoint.tag('paymentChannel', customerEntity.paymentChannel);
        customerEntityPoint.tag('customerVatId', customerEntity.customerVatId);
        customerEntityPoint.tag('taxExempt', customerEntity.taxExempt);
        customerEntityPoint.tag('email', customerEntity.email);
        customerEntityPoint.stringField('customerName', customerEntity.customerName);
        if (customerEntity.address) {
            customerEntityPoint.tag('address', JSON.stringify(customerEntity.address));
        }

        if (customerEntity.paymentChannelOptions) {
            Object.keys(customerEntity.paymentChannelOptions).forEach((key) => {
                customerEntityPoint.tag(`paymentChannelOptions_${key}`, customerEntity.paymentChannelOptions[key]);
            });
        }
        if (customerEntity.softDelete) {
            customerEntityPoint.tag('softDelete', 'deleted');
        }
        // All Entity Transformers should return an array of points, keep logic consistent, even if there is only one element
        return [customerEntityPoint];
    }

    static dbModelToEntity(dbModel) {
        const { _value, customerId, paymentChannel, email, address, customerVatId, taxExempt, ...rest } = dbModel;

        const paymentChannelOptions = Object.keys(rest)
            .filter((key) => /paymentChannelOptions_/.test(key))
            .reduce((acc, key) => {
                acc[key.split('paymentChannelOptions_')[1]] = rest[key];
                return acc;
            }, {}) as CustomerEntity['paymentChannelOptions'];
        return new CustomerEntity({
            email,
            customerName: _value,
            customerId,
            paymentChannel,
            paymentChannelOptions,
            address: address ? JSON.parse(address) : {},
            customerVatId,
            taxExempt,
        });
    }
}
