import { Inject, Injectable, Logger, NotFoundException, forwardRef, ConflictException } from '@nestjs/common';
import { CreateCustomerDto, CreateCustomerResponseDto } from './dto/create-customer.dto';
import { InfluxService } from '../influx/influx.service';
import { CustomerEntity } from './entities/customer.entity';
import { v4 } from 'uuid';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerInvoiceMetadata, ReadCustomerResponseData } from './dto/read-customer.dto';
import { Invoice } from '../invoice/entities/invoice.entity';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SchedulerStatus, SupportedMeasurementFrequencies, schedulerType } from '../scheduler/dto/scheduler.dto';
import { CronExpression } from '@nestjs/schedule';
import { ServicesService } from '../services/services.service';

@Injectable()
export class CustomerService {
    private static readonly logger = new Logger(CustomerService.name);
    constructor(
        readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService
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

    async findAll({ businessID }): Promise<{ data: ReadCustomerResponseData[]; message: string }> {
        CustomerService.logger.log(`Finding customers for ${businessID}`);
        const customerDBModels = await this.InfluxService.getLatestCustomers({ businessID });
        if (customerDBModels.length > 0) {
            const response = [];
            for (let i = 0; i < customerDBModels.length; i++) {
                const dbModel = customerDBModels[i];
                const entity = CustomerEntity.dbModelToEntity(dbModel);
                const { customerId } = entity;
                const { data: invoices } = await this.findInvoicesByCustomer({
                    customerId,
                    businessID,
                });
                response.push(new ReadCustomerResponseData(entity, invoices));
            }
            return {
                data: response,
                message: 'Found Customers',
            };
        } else {
            return { data: [], message: 'No Customers Found' };
        }
    }

    async findOne({ customerId, businessID }): Promise<{ data: CustomerEntity[]; message: string }> {
        CustomerService.logger.log(`Finding saasClientID: ${customerId} for ${businessID}`);
        const customerConfig = await this.InfluxService.getLatestCustomer({ businessID, customerId });
        if (customerConfig.length > 0) {
            const { data: invoices } = await this.findInvoicesByCustomer({
                customerId,
                businessID,
            });
            return {
                data: [new ReadCustomerResponseData(CustomerEntity.dbModelToEntity(customerConfig[0]), invoices)],
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
            const customerResults = await this.servicesService.findAllServicesWithCustomerId({
                customerId,
                businessID,
            });
            if (customerResults?.data?.length) {
                throw new ConflictException(
                    `Cannot delete customer when they are attached to services, delete services before deleting customer. Current serviceIds associated with the customer: ${customerResults.data.reduce(
                        (acc, { serviceId }) => {
                            acc += `${serviceId}   `;
                            return acc;
                        },
                        ''
                    )} `
                );
            }
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
}
