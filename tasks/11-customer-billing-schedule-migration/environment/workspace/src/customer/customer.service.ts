import { Inject, Injectable, Logger, NotFoundException, forwardRef, ConflictException } from '@nestjs/common';
import { CreateCustomerDto, CreateCustomerResponseDto } from './dto/create-customer.dto';
import { InfluxService } from '../influx/influx.service';
import { CustomerEntity, CustomerInvoiceMetadata, ReadCustomerResponseData } from './entities/customer.entity';
import { v4 } from 'uuid';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Invoice } from '../invoice/entities/invoice.entity';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SchedulerStatus, SupportedMeasurementFrequencies, schedulerType } from '../scheduler/dto/scheduler.dto';
import { ServicesService } from '../services/services.service';
import { OfferingService } from '../offering/offering.service';
import { ReadUsageForCustomerDto } from '../usage/dto/read-usage.dto';
import { QueryParamUsageDto, ReadCustomerUsageData } from './dto/read-customer.dto';
import { UsageService } from '../usage/usage.service';

export type CustomerReadResponse = { data: ReadCustomerResponseData[]; message: string };

@Injectable()
export class CustomerService {
    private static readonly logger = new Logger(CustomerService.name);
    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService,
        @Inject(forwardRef(() => UsageService)) readonly usageService: UsageService
    ) {}

    async create(createCustomerDto: CreateCustomerDto, subject: string): Promise<CreateCustomerResponseDto> {
        CustomerService.logger.log('Customer DTO', createCustomerDto);
        const customerId = v4();
        const { loadPoints } = this.InfluxService;
        const customerEntity = new CustomerEntity({ ...createCustomerDto, customerId });
        const points = CustomerEntity.transformer(customerEntity, this.InfluxService);
        CustomerService.logger.log('Points', points);
        await loadPoints(`${process.env.STAGE}-config`, `meteringco`, points);
        await this.schedulerService.create({
            schedulerID: customerId,
            schedulerType: schedulerType.billing,
            schedulerStatus: SchedulerStatus.live,
            scheduleParameters: { customerId, businessID: createCustomerDto.businessID },
            rate: SupportedMeasurementFrequencies.monthly,
            subject,
            businessID: createCustomerDto.businessID,
        });
        return { message: 'New customer added', customerId: customerEntity.customerId };
    }

    private async findInvoicesByCustomer({ businessID, customerId }) {
        CustomerService.logger.log(`Finding invoices for customer ${customerId} of business ${businessID}`);
        const invoiceDbModels = await this.InfluxService.getInvoicesForCustomer({ businessID, customerId });
        CustomerService.logger.debug(JSON.stringify(invoiceDbModels));
        if (invoiceDbModels.length > 0) {
            const responseData = invoiceDbModels.map(
                (dbModel) => new CustomerInvoiceMetadata(Invoice.fromDBModel(dbModel))
            );
            return { data: responseData, message: 'Found invoices for customer' };
        } else {
            return { data: [], message: 'No invoices found for customer' };
        }
    }

    async findAll({ businessID }): Promise<CustomerReadResponse> {
        CustomerService.logger.log(`Finding customers for ${businessID}`);
        const customerDBModels = await this.InfluxService.getLatestCustomers({ businessID });
        if (customerDBModels.length > 0) {
            const response = await Promise.all(
                customerDBModels.map(
                    async ({ customerId, ...rest }) =>
                        (
                            await this.buildReadCustomerResponse({
                                customerConfig: [{ customerId, ...rest }],
                                customerId,
                                businessID,
                            })
                        ).data[0]
                )
            );

            return {
                data: response,
                message: 'Found Customers',
            };
        } else {
            return { data: [], message: 'No Customers Found' };
        }
    }

    async findOne({ customerId, businessID }): Promise<CustomerReadResponse> {
        CustomerService.logger.log(`Finding saasClientID: ${customerId} for ${businessID}`);
        const customerConfig = await this.InfluxService.getLatestCustomer({ businessID, customerId });
        return this.buildReadCustomerResponse({
            customerConfig,
            customerId,
            businessID,
        });
    }
    async findAllCustomersWithOfferingId({ businessID, offeringId }): Promise<CustomerReadResponse> {
        const res = await this.InfluxService.getAllCustomersByOfferingId({ businessID, offeringId });
        if (res.length > 0) {
            const response = await Promise.all(
                res.map(
                    async ({ customerId, ...rest }) =>
                        (
                            await this.buildReadCustomerResponse({
                                customerConfig: [{ customerId, ...rest }],
                                customerId,
                                businessID,
                            })
                        ).data[0]
                )
            );

            return {
                data: response,
                message: 'Found Customers',
            };
        } else {
            return { data: [], message: 'No Customers Found' };
        }
    }

    private async buildReadCustomerResponse({ customerConfig, customerId, businessID }): Promise<CustomerReadResponse> {
        if (customerConfig.length > 0) {
            const entity = CustomerEntity.dbModelToEntity(customerConfig[0]);
            CustomerService.logger.debug(JSON.stringify(entity));
            const { data: invoices } = await this.findInvoicesByCustomer({
                customerId,
                businessID,
            });
            let customerOffering;
            if (entity?.offeringId) {
                try {
                    const {
                        data: [offering],
                    } = await this.offeringService.findOne({ businessID, offeringId: entity?.offeringId });
                    customerOffering = offering;
                } catch (e) {
                    if (e instanceof NotFoundException) {
                        CustomerService.logger.log(`Offering with ID: ${entity?.offeringId} not found`);
                    } else {
                        throw e;
                    }
                }
            }

            return {
                data: [new ReadCustomerResponseData(entity, invoices, customerOffering)],
                message: 'Found Customer',
            };
        } else {
            throw new NotFoundException(`Customer with ID: ${customerId} not found`);
        }
    }

    async remove({ customerId, businessID }): Promise<{ message: string; customerId: string }> {
        CustomerService.logger.log(`Attempting to delete customerId: ${customerId} for ${businessID}`);
        const customerConfig = await this.InfluxService.getLatestCustomer({ businessID, customerId });
        if (customerConfig.length === 0) {
            throw new NotFoundException(`Customer with ID: ${customerId} not found`);
        } else {
            const { loadPoints } = this.InfluxService;
            const entity = CustomerEntity.dbModelToEntity(customerConfig[0]);
            entity.softDelete = true;
            entity.businessID = businessID;
            const points = CustomerEntity.transformer(entity, this.InfluxService);
            CustomerService.logger.log('Points to delete', points);
            try {
                await this.schedulerService.remove({ schedulerID: customerId, businessID, isBillingQueue: true });
            } catch (e) {
                if (e instanceof NotFoundException) {
                    CustomerService.logger.log(`Scheduler for customer ${customerId} not found`);
                } else {
                    throw e;
                }
            }
            await loadPoints(`${process.env.STAGE}-config`, `meteringco`, points);
        }
        return { message: 'Deleted Customer', customerId };
    }

    async update({ customerId, businessID, ...updatedFields }: UpdateCustomerDto): Promise<CreateCustomerResponseDto> {
        CustomerService.logger.log(`Attempting to update saasClientID: ${customerId} for ${businessID}`);
        const {
            data: [{ ...rest }],
        } = await this.findOne({ customerId, businessID });
        const { loadPoints } = this.InfluxService;
        const customerEntity = new CustomerEntity({ ...rest, ...updatedFields, customerId, businessID });
        const points = CustomerEntity.transformer(customerEntity, this.InfluxService);
        CustomerService.logger.log('Points', points);
        await loadPoints(`${process.env.STAGE}-config`, `meteringco`, points);
        return { message: 'Customer updated added', customerId: customerId };
    }

    async findUsageForCustomer(
        { businessID, customerId }: ReadUsageForCustomerDto,
        overrides: QueryParamUsageDto
    ): Promise<ReadCustomerUsageData> {
        CustomerService.logger.log('Getting Usage for a customer', { businessID, customerId });
        const usageDoc = await this.usageService.findUsageForCustomer({ customerId, businessID }, overrides);

        if (usageDoc.length > 0) {
            return { data: usageDoc, message: 'Found usage' };
        } else {
            return { data: [], message: 'No Customer usage found' };
        }
    }
}
const memes = [
    {
        result: '_result',
        table: 0,
        _start: '1970-01-01T05:00:00Z',
        _stop: '2023-03-11T18:01:08.828Z',
        _time: '2023-03-11T18:00:58.734376199Z',
        _value: 'Wall Street Trading',
        _field: 'customerName',
        _measurement: 'CustomerConfig',
        address:
            '{"countryCode":"us","postalCode":"W1J 8AJ","state":"London","city":"London","streetLineOne":"1 Downing Street","streetLineTwo":""}',
        businessID: 'myCoolCorp',
        customerId: 'b9459f53-054b-4437-8ecd-b6f8070344fc',
        customerVatId: 'VAT GB 1234567',
        email: 'matt.sun@meteringco.tech',
        offeringId: 'bc546e8a-3a2c-4089-8133-1efac1759ff5',
        paymentChannel: 'Stripe',
        paymentChannelOptions_stripeCustomerId: 'acct-xxxxxxxxxxxxxxxx',
        taxExempt: 'none',
    },
];
