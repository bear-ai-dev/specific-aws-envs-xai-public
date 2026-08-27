import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoicesService } from '../invoice/invoices.service.js';
import { SettingsService } from '../setting/settings.service.js';
import { ConfigurationResponse, PortalPagesConfigurationDto } from './dto/configuration.dto.js';
import { CustomerService } from '../customer/customer.service.js';
import { CustomerBillingResponse } from './dto/customer.dto.js';
import { InvoiceStatus } from '../invoice/entities/InvoiceStatus.js';
import { InvoiceListItem, ListInvoicesResponse } from './dto/list-invoices.dto.js';
import { ReadSingleInvoiceResponse } from './dto/single-invoice.dto.js';
import { Billing } from '../billing/entities/billing.entity.js';
import { DatetimeUtils } from '../utils/datetime.js';
import { UsageService } from '../usage/usage.service.js';
import { AggregatedUsageResponse, GetCustomerStripePortalResponse } from '../customer/dto/read-customer.dto.js';
import { UsageOfCurrentBillingCycle } from './dto/usage.dto.js';
import { UpdatePortalCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class PortalService {
    private static readonly logger = new Logger(PortalService.name);

    constructor(
        readonly invoicesService: InvoicesService,
        readonly settingService: SettingsService,
        readonly customerService: CustomerService,
        readonly usageService: UsageService,
    ) {}

    async findInvoice({ businessID, invoiceId, download, customerId }): Promise<ReadSingleInvoiceResponse> {
        const { message, data } = await this.invoicesService.findOne(businessID, invoiceId, download);
        if (!data.length || data[0].customerId !== customerId) {
            throw new NotFoundException(`Invoice ${invoiceId} not found`);
        }

        return { message, data: [{ ...data[0] }] };
    }

    async findInvoices(businessID: string, customerId: string): Promise<ListInvoicesResponse> {
        const invoices = await this.invoicesService.findAll(businessID, customerId, true);
        return {
            message: invoices.length ? 'Found invoices for customer' : 'No invoices found for customer',
            data: invoices.map((invoice) => new InvoiceListItem(invoice)),
        };
    }
    async updateConfiguration({ businessID, subject, ...fields }: PortalPagesConfigurationDto) {
        await this.settingService.update({ businessID, subject, ...fields });
        return { message: 'updated portal configuration' };
    }
    async findConfiguration(businessID: string): Promise<ConfigurationResponse> {
        const latestSetting = await this.settingService.findLatestSetting({ businessID });
        return { message: 'Found portal configuration', logoUrl: latestSetting.logoUrl, pages: latestSetting.pages };
    }

    async findCustomer(businessID: string, customerId: string): Promise<CustomerBillingResponse> {
        const customerReadResponse = await this.customerService.findOne({ businessID, customerId });
        const customerData = customerReadResponse.data[0];
        return CustomerBillingResponse.from({
            ...customerData,
            invoices: customerData.invoices?.filter(
                (invoice) =>
                    invoice.invoiceStatus !== InvoiceStatus.VOIDED && invoice.invoiceStatus !== InvoiceStatus.DRAFT,
            ),
        });
    }

    async updateCustomer(businessID: string, customerId: string, { address, offeringId }: UpdatePortalCustomerDto) {
        await this.customerService.update({ businessID, customerId, address, offeringId }, customerId);
        return { message: 'Customer updated', customerId };
    }

    async getStripePortalUrl(businessID: string, customerId: string): Promise<GetCustomerStripePortalResponse> {
        return this.customerService.getStripePortalUrl({ businessID, customerId });
    }

    async findUsageOfCurrentBillingCycle(businessID: string, customerId: string): Promise<UsageOfCurrentBillingCycle> {
        const {
            data: [customer],
        } = await this.customerService.findOne({ businessID, customerId });
        if (!customer.offering) {
            return {
                message: 'Customer no Offerings found',
                data: [],
            };
        }

        const { currentBillingCycleStartTime } = Billing.billingCycleToTimeRange(customer.offering.billingCycle);
        const startTime = DatetimeUtils.max([currentBillingCycleStartTime, customer.offeringEnrollmentDate]);
        const endTime = new Date().toISOString();
        const aggregatedData = await this.usageService.findUsageForCustomer(
            { businessID, customerId, customer },
            {
                startTime,
                endTime,
            },
        );

        return {
            message: 'Found customer usage data',
            data: (aggregatedData as AggregatedUsageResponse[]).map((aggregatedDimension) => ({
                dimensionId: aggregatedDimension.dimensionId,
                startTime,
                endTime,
                value: `${aggregatedDimension.usage.reduce((acc, current) => acc + parseFloat(current.value), 0)}`,
            })),
        };
    }
}
