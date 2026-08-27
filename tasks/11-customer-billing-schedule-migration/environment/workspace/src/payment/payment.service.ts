import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { StripePaymentDto, currency } from './dto/stripePayment.dto';
import { paymentChannel as paymentChannelEnum } from '../customer/dto/create-customer.dto';
import Stripe from 'stripe';
import { CustomerService } from '../customer/customer.service';
import { CreatePaymentDto } from './dto/createPayment.dto';
import { SettingsService } from '../setting/settings.service';
import { supportedCurrencies } from '../offering/dto/createOffering.dto';

@Injectable()
export class PaymentService {
    private static readonly logger = new Logger(PaymentService.name);
    constructor(
        @Inject(forwardRef(() => SettingsService)) readonly settingsService: SettingsService,
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService
    ) {}

    async payment({
        businessID,
        total,
        currency: arguementCurrency,
        paymentChannelOptions,
        paymentChannel,
    }: CreatePaymentDto) {
        // Check to see if business is authorized to bill the client and the information matches
        const [{ stripeAccountId }] = await this.settingsService.findAll({ businessID });
        if (paymentChannel === paymentChannelEnum['Stripe']) {
            const stripeCustomerID = paymentChannelOptions.stripeCustomerId;
            PaymentService.logger.log(
                `Creating stripe payment with the following data: amount: ${total} currency: ${arguementCurrency} customer: ${stripeCustomerID} stripeAccountId: ${stripeAccountId}`
            );
            const chargeResponse = await this.stripePayment({
                amount: total,
                currency: arguementCurrency === supportedCurrencies.USD && currency.usd,
                businessID,
                customer: stripeCustomerID,
                stripeAccountId,
            });
            return chargeResponse;
        }
    }

    private async stripePayment({
        amount,
        currency,
        customer,
        stripeAccountId,
    }: StripePaymentDto): Promise<Stripe.Response<Stripe.PaymentIntent>> {
        const stripe = new Stripe(process.env.STRIPE_TOKEN, { apiVersion: '2022-08-01' });
        const paymentMethods = await stripe.customers.listPaymentMethods(
            customer,
            {
                type: 'card',
            },
            { stripeAccount: stripeAccountId }
        );
        let customerPaymentMethod;
        if (paymentMethods) {
            const { data } = paymentMethods;
            if (data.length) {
                customerPaymentMethod = data[0].id;
            }
        }
        const charge = await stripe.paymentIntents.create(
            {
                amount: amount * 100,
                currency,
                customer,
                payment_method: customerPaymentMethod,
                confirm: true,
            },
            {
                stripeAccount: stripeAccountId,
            }
        );
        return charge;
    }
}
