import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { CustomerService } from '../customer/customer.service';
import { SettingsService } from '../setting/settings.service';
import { UpdateInvoicesDto } from './dto/update-invoices.dto';
import { Invoice, InvoiceLineItem, InvoiceLineItems, InvoicePaymentTerm } from './entities/invoice.entity';
import { InfluxService } from '../influx/influx.service';
import { ReadInvoicesDto, ReadInvoicesResponse } from './dto/read-invoices.dto';
import { BasicResponseDTO } from '../basicResponseDTO';
import { PaymentService } from '../payment/payment.service';
import { CreateInvoicesDto } from './dto/create-Invoices.dto';
import { Billing } from '../billing/entities/billing.entity';
import { DimensionsService } from '../dimensions/dimensions.service';
import { GenerateOffCycleDto } from './dto/createOffcycleInvoice';
import { getFirstDayOfCurrentMonthUTC } from '../utils/shared/dateFormating';
import { UsageService } from '../usage/usage.service';
import { AggregatedUsageResponse } from '../customer/dto/read-customer.dto';

@Injectable()
export class InvoicesService {
    private static readonly logger = new Logger(InvoicesService.name);

    constructor(
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService,
        @Inject(forwardRef(() => PaymentService)) readonly paymentService: PaymentService,
        @Inject(forwardRef(() => UsageService)) readonly usageService: UsageService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionService: DimensionsService,
        @Inject(forwardRef(() => SettingsService)) readonly settingsService: SettingsService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService
    ) {}

    /**
     * @param businessID
     * @param customerId
     * @param items
     */
    async create({
        businessID,
        customerId,
        items,
        invoiceDate = new Date().toISOString(),
        invoicePaymentTerm = InvoicePaymentTerm.none,
    }: CreateInvoicesDto) {
        const invoiceLineItems = new InvoiceLineItems();
        items.forEach((item) => {
            invoiceLineItems.addLineItem(new InvoiceLineItem(item.name, item.quantity, item.unitCost));
        });
        const [settingsEntity] = await this.settingsService.findAll({ businessID });
        const customerData = await this.customerService.findOne({ businessID, customerId });
        const customerEntity = customerData.data[0];
        const newInvoice = new Invoice({
            customerId,
            invoiceLineItems: invoiceLineItems,
            invoiceDate,
            invoicePaymentTerm,
            businessID,
            paymentAPI: this.paymentService,
        });
        newInvoice.loadPropertiesFromSettingsEntity(settingsEntity);
        newInvoice.loadPropertiesFromCustomerEntity(customerEntity);
        return await newInvoice.generate();
    }

    async findOne(businessID: string, invoiceId: string, download: string): Promise<ReadInvoicesResponse> {
        InvoicesService.logger.log(`Finding invoice ${invoiceId} for business ${businessID}`);
        const [invoiceDbModel] = await this.influxService.getSingleInvoice({ businessID, invoiceId });
        if (invoiceDbModel) {
            const invoice = Invoice.fromDBModel(invoiceDbModel);
            let invoiceUrl = null;
            if (download === 'true') {
                invoiceUrl = await invoice.generatePresignedUrl();
            }
            return { data: [new ReadInvoicesDto(invoice, invoiceUrl)], message: 'Found invoice' };
        } else {
            throw new NotFoundException(`Invoice ${invoiceId} not found`);
        }
    }

    async update({ businessID, invoiceId, ...otherFields }: UpdateInvoicesDto): Promise<BasicResponseDTO> {
        InvoicesService.logger.log(`Updating invoice ${invoiceId} for business ${businessID}`);
        const {
            data: [readInvoicesDto],
        } = await this.findOne(businessID, invoiceId, 'false');
        const { invoiceDate, invoiceStatus: currentStatus, ...rest } = readInvoicesDto;

        const [settingsEntity] = await this.settingsService.findAll({ businessID });
        const customerData = await this.customerService.findOne({ businessID, customerId: rest.customerId });
        const customerEntity = customerData.data[0];
        const msg = await Invoice.handleInvoiceUpdate(
            { invoiceId, businessID, ...otherFields },
            readInvoicesDto,
            this.paymentService,
            customerEntity,
            settingsEntity
        );
        try {
            return { message: msg };
        } catch (e) {
            throw new BadRequestException(e.message);
        }
    }

    async generateInvoiceForUsageTotal({
        businessID,
        customerId,
        start,
        end,
        invoicePaymentTerm,
        invoiceDate,
    }: GenerateOffCycleDto) {
        // Get all services for the customer
        // usage for each service
        if (start) {
            start = new Date(start).toISOString();
        } else {
            // First day of the month
            start = getFirstDayOfCurrentMonthUTC().toISOString();
        }

        if (end) {
            end = new Date(end).toISOString();
        } else {
            end = new Date().toISOString();
        }
        InvoicesService.logger.log(
            `startTime: ${start}, endTime: ${end}, customerId: ${customerId}, businessID: ${businessID}, invoicePaymentTerm: ${invoicePaymentTerm}`
        );

        const res = (await this.usageService.findUsageForCustomer(
            { customerId, businessID },
            { startTime: start, endTime: end }
        )) as AggregatedUsageResponse[];

        const dimensionIdTotals = res.reduce((acc, usageElement) => {
            if (usageElement) {
                const { dimensionId } = usageElement;

                const total = Billing.usageToTotal(usageElement);
                if (acc[dimensionId]) {
                    acc[dimensionId] += parseFloat(total);
                } else {
                    acc[dimensionId] = parseFloat(total);
                }
            }

            return acc;
        }, {});
        const lineItems = await Promise.all(
            Object.keys(dimensionIdTotals).map(async (key): Promise<InvoiceLineItem> => {
                const total = dimensionIdTotals[key];
                const { data } = await this.dimensionService.findOne({ dimensionId: key, businessID });
                if (data.length) {
                    const { dimensionName, consumptionPrice } = data[0];
                    return { name: dimensionName, quantity: total, unitCost: parseFloat(consumptionPrice) };
                }
            })
        );
        InvoicesService.logger.log(`Creating invoice for customer ${customerId} for business ${businessID}`);
        InvoicesService.logger.log(`Line items: ${JSON.stringify(lineItems)}`);
        const invoice = await this.create({
            businessID,
            customerId,
            items: await Promise.all(lineItems),
            invoiceDate: invoiceDate ? new Date(invoiceDate).toISOString() : end,
            invoicePaymentTerm,
        });
        return invoice;
    }
}
