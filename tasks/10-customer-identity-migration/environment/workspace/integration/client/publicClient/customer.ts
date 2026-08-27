import { ACCESS_TOKEN, Address, API_BASE_URL, MAX_RETRY } from './init';
import fetch from 'cross-fetch';
import { sleep } from '../../utils/utils';

/*
 * Private, don't EXPORT to avoid name conflicts.
 * All operations for this resource should be encapsulated in this class.
 */
const RESOURCE_PATH = '/customers';

export enum TaxExempt {
    Exempt = 'exempt',
    None = 'none',
}

export enum PaymentChannel {
    Stripe = 'stripe',
}

export class Customer {
    customerName: string;
    email: string;
    taxExempt: TaxExempt;
    customerId: string;
    address: Address;
    paymentChannel: PaymentChannel;
    paymentChannelOptions: {};
    customerVatId: string;
    constructor(
        id: string = '',
        name: string = '',
        email: string = '',
        taxExempt: TaxExempt = TaxExempt.None,
        address: Address = null,
        paymentChannel: PaymentChannel = null,
        paymentChannelOptions: {} = null
    ) {
        this.customerName = name;
        this.email = email;
        this.taxExempt = taxExempt;
        this.customerId = id;
        this.address = address;
        this.paymentChannel = paymentChannel;
        this.paymentChannelOptions = paymentChannelOptions;
    }

    async create({
        customerName,
        email,
        taxExempt,
        address,
        paymentChannel,
        paymentChannelOptions,
        customerVatId,
    }): Promise<any> {
        const body = {
            customerName,
            email,
            taxExempt,
            address,
            paymentChannel,
            paymentChannelOptions,
            customerVatId,
        };
        const res = await fetch(API_BASE_URL + RESOURCE_PATH, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify(body),
        });
        if (res.status <= 201) {
            this.customerName = customerName;
            this.email = email;
            this.taxExempt = taxExempt;
            this.customerId = (await res.json()).customerId;
            this.address = address;
            this.paymentChannel = paymentChannel;
            this.paymentChannelOptions = paymentChannelOptions;
            this.customerVatId = customerVatId;
            return this.customerId;
        } else {
            throw await res.json();
        }
    }
    async update(): Promise<any> {
        throw new Error('Method not implemented.');
    }
    async delete(): Promise<any> {
        if (!this.customerId) {
            throw new Error('Customer not initialized');
        }
        for (let retries = 0; retries < MAX_RETRY; retries++) {
            const res = await fetch(`${API_BASE_URL}${RESOURCE_PATH}/${this.customerId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            });
            if (res.status <= 201) {
                this.customerId = null;
                Object.keys(this).forEach((key) => {
                    this[key] = null;
                });
                return;
            } else if (retries === MAX_RETRY - 1) {
                throw new Error(JSON.stringify(await res.json(), null, 2));
            } else {
                await sleep(1000 * (retries + 1));
            }
        }
    }
    async get(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    async getAll(): Promise<any> {
        const res = await fetch(`${API_BASE_URL}${RESOURCE_PATH}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        });
        if (res.status <= 201) {
            return (await res.json()).data;
        } else {
            throw new Error(JSON.stringify(await res.json(), null, 2));
        }
    }
}
