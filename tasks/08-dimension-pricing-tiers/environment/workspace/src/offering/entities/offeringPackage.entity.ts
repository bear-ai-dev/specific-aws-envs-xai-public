import { Point } from '@influxdata/influxdb-client';
import { Logger, NotFoundException } from '@nestjs/common';
import { ApiHideProperty } from '@nestjs/swagger';
import { InfluxService } from '../../influx/influx.service.js';
import { OfferingVisibility, ValidBillingCycles } from '../dto/createOffering.dto.js';
import { SupportedCurrencies } from '../dto/SupportedCurrencies.js';
import { SchedulerStatus, schedulerType, SupportedMeasurementFrequencies } from '../../scheduler/dto/scheduler.dto.js';
import { SchedulerService } from '../../scheduler/scheduler.service.js';
import { InvoiceLineItem, InvoiceLineItems } from '../../invoice/entities/invoice.entity.js';
import { InvoicesService } from '../../invoice/invoices.service.js';
import { DatetimeUtils } from '../../utils/datetime.js';
import { ReadOfferingResponseData } from '../dto/readOffering.dto.js';
import { CustomerService } from '../../customer/customer.service.js';
import { AggregatedUsageResponse } from '../../customer/dto/read-customer.dto.js';
import { ReadDimensionResponseData } from '../../dimensions/dto/read-dimension.dto.js';
import { Billing } from '../../billing/entities/billing.entity.js';
import { ReadCustomerResponseData } from '../../customer/entities/customer.entity.js';
import { OfferingType } from './OfferingType.js';
import { CreateBillingReportDto } from '../../billing/dto/createBillingReport.dto.js';
import { serializeError } from 'serialize-error';
import { AuditScope } from '../../audit/entities/audit.interface.js';
import { AuditService } from '../../audit/audit.service.js';
import { InvoicePaymentTerm } from '../../invoice/entities/InvoicePaymentTerm.js';
import { AnalyticsService } from '../../analytics/analytics.service.js';
import { CreditService } from '../../credit/credit.service.js';
import { ReadSettingsResponseData } from '../../setting/dto/read-setting.dto.js';
import { InvoiceGeneration } from '../../setting/dto/update-settings.dto.js';
import { CustomerContractDiscount } from '../../contract/dto/customerContractDiscount.js';

export abstract class Offering {
    static readonly logger = new Logger(Offering.name);
    public offeringType: OfferingType;
    public offeringName: string;
    protected schedulerService?: SchedulerService;
    protected customerService?: CustomerService;
    protected invoicesService: InvoicesService;
    public businessID: string;
    public customerId: string;
    public freeTrialLength?: string;
    public freeTrialEndDate?: string;
    public discount: CustomerContractDiscount;
    public settings: ReadSettingsResponseData;
    public minimumCharge?: number;
    public priorOfferingEnrollmentDate?: string;
    public consolidatedInvoice?: boolean;
    public queueInvoice: boolean;
    public readonly billingCycle: ValidBillingCycles;
    public dimensions: ReadOfferingResponseData['dimensions'] = [];
    public currency?: SupportedCurrencies;

    abstract enroll(subject: string, customer?: ReadCustomerResponseData): void;
    abstract unenroll({
        customer,
        shouldCreditRemainingPlan,
        isChangeOfPlan,
    }: {
        customer: ReadCustomerResponseData;
        shouldCreditRemainingPlan?: boolean;
        isChangeOfPlan?: boolean;
        creditService?: CreditService;
    }): void;
    static getCurrency({
        customer,
        offering,
    }: {
        customer?: { [k: string]: any; currency?: SupportedCurrencies };
        offering?: { [k: string]: any; currency?: SupportedCurrencies };
    }): SupportedCurrencies {
        Offering.logger.log(
            `Getting currency for customer ${customer?.customerId}, offering ${offering?.offeringName}, customer currency ${customer?.currency}`,
        );
        if (customer?.currency) {
            return customer.currency;
        } else if (offering?.currency) {
            return offering?.currency;
        } else {
            return SupportedCurrencies.USD;
        }
    }
    static determineRemainingMinimumCharge({
        startDate,
        endDate,
        price,
        exchangeRate,
        negative,
    }: {
        startDate: Date;
        endDate: Date;
        price: number;
        exchangeRate: number;
        negative: boolean;
    }): number {
        const billingMSSeconds: number = Math.round(Math.abs(endDate.getTime() - startDate.getTime()));
        const amountDue: number =
            Math.round(
                100 *
                    price *
                    exchangeRate *
                    (billingMSSeconds / DatetimeUtils.totalMiliSecondsInMonthGivenDay(startDate)) *
                    (negative ? -1 : 1),
            ) / 100;

        return amountDue;
    }
    static minimumChargeOverride({
        minimumCharge,
        lineItems,
        freeTrialEndDate,
        offeringName,
        isUnenrollment,
        startDate,
        endDate,
        exchangeRate,
        offeringEnrollmentDate,
    }: {
        minimumCharge: number;
        lineItems: InvoiceLineItems;
        freeTrialEndDate?: string;
        offeringName: string;
        isUnenrollment?: boolean;
        startDate: Date;
        endDate: Date;
        exchangeRate: number;
        offeringEnrollmentDate: Date;
    }): InvoiceLineItems {
        // If the total of all line items is less than the minimum charge, then we return a new InvoiceLineItems with the minimum charge as the only lineItem
        // Otherwise, we return the original lineItems
        const total = lineItems.getTotal();
        if (minimumCharge) {
            let minimumChargeAmountDue: number;
            if (isUnenrollment) {
                minimumChargeAmountDue = Offering.determineRemainingMinimumCharge({
                    startDate:
                        offeringEnrollmentDate &&
                        DatetimeUtils.dateIsBetweenTwoDates(offeringEnrollmentDate, startDate, endDate)
                            ? DatetimeUtils.beginningOfDay(offeringEnrollmentDate)
                            : startDate,
                    endDate,
                    exchangeRate,
                    negative: false,
                    price: minimumCharge,
                });
            } else if (
                offeringEnrollmentDate &&
                DatetimeUtils.dateIsBetweenTwoDates(offeringEnrollmentDate, startDate, endDate)
            ) {
                minimumChargeAmountDue = Offering.determineRemainingMinimumCharge({
                    startDate: DatetimeUtils.beginningOfDay(offeringEnrollmentDate),
                    endDate,
                    exchangeRate,
                    negative: false,
                    price: minimumCharge,
                });
            } else {
                minimumChargeAmountDue = minimumCharge;
            }
            if (total < minimumChargeAmountDue) {
                const lineItemObj = new InvoiceLineItems();
                lineItemObj.addLineItem(
                    new InvoiceLineItem(`${offeringName} (Minimum Fee)`, 1, minimumChargeAmountDue),
                );

                if (freeTrialEndDate && !DatetimeUtils.isDateInPast(new Date(freeTrialEndDate))) {
                    lineItemObj.addLineItem(
                        new InvoiceLineItem(
                            `${offeringName} (Minimum Fee) - Free Trial`,
                            1,
                            -1 * minimumChargeAmountDue,
                        ),
                    );
                }
                return lineItemObj;
            } else {
                return lineItems;
            }
        } else {
            return lineItems;
        }
    }
    static async createFreeTrialJob({
        schedulerService,
        customerId,
        businessID,
        subject,
        msBetweenNowAndFreeTrialEndDate,
    }: {
        schedulerService: SchedulerService;
        customerId: string;
        businessID: string;
        subject: string;
        msBetweenNowAndFreeTrialEndDate: number;
    }): Promise<void> {
        await schedulerService.emitOne({
            schedulerId: `${businessID}#${customerId}#free-trial`,
            payload: {
                delay: msBetweenNowAndFreeTrialEndDate,
                sub: subject,
                schedulerStatus: 'live',
                schedulerType: 'billing',
                businessID: businessID,
                scheduleParameters: {
                    customerId: customerId,
                    businessID: businessID,
                    freeTrialEnd: true,
                } as CreateBillingReportDto,
            },
        });
    }
    protected async registerBillingSchedule(subject: string, freeTrialEndDate?: string): Promise<void> {
        if (freeTrialEndDate) {
            const msBetweenNowAndFreeTrialEndDate = DatetimeUtils.getMSDifferenceFromRightNow(
                new Date(freeTrialEndDate),
            );
            await Offering.createFreeTrialJob({
                schedulerService: this.schedulerService,
                customerId: this.customerId,
                businessID: this.businessID,
                subject,
                msBetweenNowAndFreeTrialEndDate,
            });
            await this.schedulerService.create({
                schedulerID: this.customerId,
                schedulerType: schedulerType.billing,
                schedulerStatus: SchedulerStatus.live,
                scheduleParameters: { customerId: this.customerId, businessID: this.businessID },
                rate: SupportedMeasurementFrequencies.monthly,
                subject,
                businessID: this.businessID,
                startDate: freeTrialEndDate,
            });
        } else {
            await this.schedulerService.create({
                schedulerID: this.customerId,
                schedulerType: schedulerType.billing,
                schedulerStatus: SchedulerStatus.live,
                scheduleParameters: { customerId: this.customerId, businessID: this.businessID },
                rate: SupportedMeasurementFrequencies.monthly,
                subject,
                businessID: this.businessID,
            });
        }
    }

    protected async deregisterBillingSchedule(): Promise<void> {
        try {
            await this.schedulerService.remove({
                schedulerID: this.customerId,
                businessID: this.businessID,
                isBillingQueue: true,
            });
        } catch (e) {
            AuditService.publishEvent({
                message: 'Failed to remove billing scheduler',
                topic: AuditScope.ERROR,
                data: [{ error: serializeError(e), customerId: this.customerId, businessID: this.businessID }],
            });
        }

        try {
            await this.schedulerService.remove({
                schedulerID: `${this.customerId}#free-trial`,
                businessID: this.businessID,
                isBillingQueue: true,
            });
        } catch (e) {
            if (e instanceof NotFoundException) {
                Offering.logger.log('No free trial scheduler found');
            } else {
                AuditService.publishEvent({
                    message: 'Failed remove free trial scheduler',
                    topic: AuditScope.ERROR,
                    data: [{ error: serializeError(e), customerId: this.customerId, businessID: this.businessID }],
                });
            }
        }
    }
    static async getLineItemsForUsage({
        startDate,
        endDate,
        customer,
        lineItems,
        negative,
        businessID,
        customerId,
        customerService,
        dimensions,
        offeringInstance,
    }: {
        startDate: Date;
        endDate: Date;
        customer?: ReadCustomerResponseData;
        lineItems: InvoiceLineItems;
        negative?: boolean;
        businessID: string;
        customerId: string;
        customerService: CustomerService;
        dimensions: ReadOfferingResponseData['dimensions'];
        offeringInstance: Offering;
    }): Promise<InvoiceLineItems> {
        const usage = await customerService.findUsageForCustomer(
            {
                businessID,
                customerId,
                customer,
            },
            {
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
            },
        );

        const aggregateUsageData = usage?.data as AggregatedUsageResponse[];

        const dimensionMap = dimensions.reduce((acc, dimension) => {
            acc[dimension.dimensionId] = dimension;
            return acc;
        }, {}) as Record<string, ReadDimensionResponseData>;
        const dimensionTotals = aggregateUsageData.reduce((acc, usageElement) => {
            const { dimensionId } = usageElement;

            const total = Billing.usageToTotal(usageElement, dimensionMap[dimensionId]);

            if (acc[dimensionId]) {
                acc[dimensionId] += parseFloat(total);
                acc[dimensionId] = acc[dimensionId].toFixed(2);
            } else {
                acc[dimensionId] = parseFloat(total);
                acc[dimensionId] = acc[dimensionId].toFixed(2);
            }

            return acc;
        }, {}) as Record<string, number>;
        let exchangeRate = 1;

        if (Offering.getCurrency({ customer, offering: offeringInstance }) !== SupportedCurrencies.USD) {
            console.log('Inside exchange rate');
            exchangeRate = await AnalyticsService.getExchangeRate({
                currency: Offering.getCurrency({ customer, offering: offeringInstance }),
            });
            lineItems.addTerms(
                `Invoice dynamically calculated with realtime currency exchange rate €${exchangeRate.toFixed(
                    2,
                )} = $1.00`,
            );
        }

        Object.keys(dimensionTotals).forEach((dimensionId) => {
            const unitCost = Number(
                (parseFloat(dimensionMap[dimensionId].consumptionPrice) * exchangeRate).toFixed(
                    Offering.getDecimalsForNumber(parseFloat(dimensionMap[dimensionId].consumptionPrice)) === 0
                        ? 2
                        : Offering.getDecimalsForNumber(parseFloat(dimensionMap[dimensionId].consumptionPrice)),
                ),
            );
            const shouldDisplayLineItem = Billing.determineIfLineItemShown({
                Offering: offeringInstance,
                dimension: dimensionMap[dimensionId],
                totalUsage: dimensionTotals[dimensionId] as number,
                unitCost,
                freeDimensionOnInvoice: offeringInstance.settings?.freeDimensionOnInvoice,
            });
            if (shouldDisplayLineItem) {
                const {
                    usageIncrement,
                    consumptionUnit: { unit, type },
                } = dimensionMap[dimensionId];
                // Handle currency conversion

                const { displayName, total: displayTotal } = InvoiceLineItem.prepareLineItem({
                    total: dimensionTotals[dimensionId],
                    dimensionType: type,
                    dimensionId,
                    dimensionName: dimensionMap[dimensionId].dimensionName,
                    offeringName: offeringInstance.offeringName,
                    usageIncrement: parseInt(usageIncrement),
                    dimensionUnit: unit,
                    negative,
                });
                lineItems.addLineItem(new InvoiceLineItem(displayName, displayTotal, unitCost));
            }
        });

        return lineItems;
    }
    static addDiscountLineItem(discount: Offering['discount'], lineItems: InvoiceLineItems): InvoiceLineItems {
        // If there is a discount, loop over the line items via a  getLineItems call, and then a reduce, calculate the percentage discount, and then add the discount line item as a negative line item.
        if (discount?.percentage) {
            const lineItemTotal = lineItems.getTotal();
            const discountAmount = lineItemTotal * (parseFloat(discount.percentage) / 100);
            const discountQuantity = 1;
            lineItems.addLineItem(
                new InvoiceLineItem(`Discount - ${discount.name}`, discountQuantity, discountAmount * -1),
            );
            return lineItems;
        } else {
            return lineItems;
        }
    }
    static getDecimalsForNumber(number: number): number {
        const numberString = number.toString();
        const decimalIndex = numberString.indexOf('.');
        if (decimalIndex === -1) {
            return 0;
        }
        return numberString.length - decimalIndex - 1;
    }
    abstract processFreeTrialEnd({ customer }: { customer: ReadCustomerResponseData }): Promise<string>;

    abstract offcycleBilling({
        startDate,
        endDate,
        customer,
        invoiceDate,
        invoicePaymentTerm,
        isManual,
    }: {
        startDate: Date;
        endDate: Date;
        customer?: ReadCustomerResponseData;
        invoiceDate: string;
        invoicePaymentTerm?: InvoicePaymentTerm;
        isManual?: boolean;
    }): Promise<string>;
    abstract processBilling(
        startDate?: Date,
        endDate?: Date,
        customer?: ReadCustomerResponseData,
        calculateUsage?: boolean,
    ): Promise<string>;
    public static getInstance(
        offeringConfig: ReadOfferingResponseData,
        customerId: string,
        businessID: string,
        invoicesService: InvoicesService,
        settings: ReadSettingsResponseData,
        schedulerService?: SchedulerService,
        customerService?: CustomerService,
        freeTrialEndDate?: string,
    ): Offering {
        const {
            offeringType,
            offeringName,
            subscriptionPrice,
            dimensions,
            freeTrialLength,
            billingCycle,
            currency,
            minimumCharge,
        } = offeringConfig; // TODO check input and defend from invalid input
        switch (offeringType) {
            case OfferingType.usageBased:
                return new UsageBased({
                    offeringName,
                    businessID,
                    customerId,
                    invoicesService,
                    schedulerService,
                    customerService,
                    dimensions,
                    freeTrialEndDate,
                    freeTrialLength,
                    billingCycle,
                    currency: currency as unknown as SupportedCurrencies,
                    settings,
                    minimumCharge,
                });
            case OfferingType.subscription:
                return new Subscription({
                    subscriptionPrice,
                    offeringName,
                    businessID,
                    customerId,
                    invoicesService,
                    schedulerService,
                    customerService,
                    dimensions,
                    freeTrialEndDate,
                    freeTrialLength,
                    billingCycle,
                    currency: currency as unknown as SupportedCurrencies,
                    settings,
                    minimumCharge,
                });
        }
    }
    public static calculateFreeTrialEndDate(freeTrialLength: string): string {
        const freeTrialEndDate = new Date();
        freeTrialEndDate.setDate(freeTrialEndDate.getDate() + parseInt(freeTrialLength));
        return DatetimeUtils.endOfDay(freeTrialEndDate).toISOString();
    }

    protected constructor({
        offeringType,
        offeringName,
        businessID,
        customerId,
        invoicesService,
        schedulerService,
        dimensions,
        customerService,
        freeTrialLength,
        freeTrialEndDate,
        billingCycle,
        currency,
        settings,
        minimumCharge,
        discount,
    }: {
        offeringType: OfferingType;
        offeringName: string;
        businessID: string;
        customerId: string;
        invoicesService: InvoicesService;
        schedulerService?: SchedulerService;
        customerService?: CustomerService;
        dimensions: ReadOfferingResponseData['dimensions'];
        freeTrialLength?: string;
        freeTrialEndDate?: string;
        billingCycle: ValidBillingCycles;
        currency?: SupportedCurrencies;
        settings: ReadSettingsResponseData;
        minimumCharge?: string;
        discount?: CustomerContractDiscount;
    }) {
        this.offeringType = offeringType ? offeringType : OfferingType.usageBased;
        this.offeringName = offeringName;
        this.businessID = businessID;
        this.customerId = customerId;
        this.schedulerService = schedulerService;
        this.invoicesService = invoicesService;
        this.dimensions = dimensions?.length ? dimensions : [];
        this.customerService = customerService;
        this.freeTrialLength = freeTrialLength;
        this.freeTrialEndDate = freeTrialEndDate;
        this.billingCycle = billingCycle;
        this.currency = currency ? currency : SupportedCurrencies.USD;
        this.settings = settings;
        if (minimumCharge) {
            this.minimumCharge = parseFloat(minimumCharge);
        }
        if (discount) {
            this.discount = discount;
        }
    }
}

export class Subscription extends Offering {
    subscriptionPrice: number;

    async enroll(subject: string, customer: ReadCustomerResponseData): Promise<void> {
        const today: Date = new Date();
        Offering.logger.debug(
            `Enrolling customer ${customer.customerId} in ${this.offeringName}. FreeTrialEndDate: ${this.freeTrialEndDate}`,
        );
        if (this.freeTrialEndDate) {
            await this.registerBillingSchedule(subject, this.freeTrialEndDate);
        } else {
            let offeringUprade = false;
            if (
                this.priorOfferingEnrollmentDate &&
                DatetimeUtils.dateIsLessThan24HoursAgoUTC(new Date(this.priorOfferingEnrollmentDate))
            ) {
                offeringUprade = true;
            }
            await this.processBilling(
                today,
                DatetimeUtils.lastDayOfMonth(),
                customer,
                false,
                true,
                undefined,
                offeringUprade,
            );

            await this.registerBillingSchedule(subject);
        }
    }

    public calculateRemainingAmountForSubscription({
        startDate,
        endDate,
        exchangeRate,
        negative,
    }: {
        startDate: Date;
        endDate: Date;
        exchangeRate?: number;
        negative?: boolean;
    }): number {
        console.log(startDate, 'Start', endDate, 'End');
        const billingMSSeconds: number = Math.round(Math.abs(endDate.getTime() - startDate.getTime()));
        console.log('billing MS: ', billingMSSeconds);
        console.log('MS in month: ', DatetimeUtils.totalMiliSecondsInMonthGivenDay(startDate));
        const amountDue: number =
            Math.round(
                100 *
                    this.subscriptionPrice *
                    exchangeRate *
                    (billingMSSeconds / DatetimeUtils.totalMiliSecondsInMonthGivenDay(startDate)) *
                    (negative ? -1 : 1),
            ) / 100;

        return amountDue;
    }
    calculateSubscriptionLineItem({
        startDate,
        endDate,
        negative,
        lineItems,
        exchangeRate,
    }: {
        startDate: Date;
        endDate: Date;
        negative: boolean;
        lineItems: InvoiceLineItems;
        exchangeRate: number;
    }): InvoiceLineItems {
        lineItems.addLineItem(
            new InvoiceLineItem(
                this.offeringName,
                1,
                this.calculateRemainingAmountForSubscription({ startDate, endDate, exchangeRate, negative }),
                'Subscription',
            ),
        );

        return lineItems;
    }
    async offcycleBilling({
        startDate,
        endDate,
        customer,
        invoiceDate,
        invoicePaymentTerm,
        calculateSubscription = true,
        isManual = false,
    }: {
        startDate: Date;
        endDate: Date;
        customer?: ReadCustomerResponseData;
        invoiceDate: string;
        invoicePaymentTerm?: InvoicePaymentTerm;
        calculateSubscription: boolean;
        isManual: boolean;
    }): Promise<string> {
        const lineItems = new InvoiceLineItems();
        let exchangeRate = 1;
        if (Offering.getCurrency({ customer, offering: this }) !== SupportedCurrencies.USD) {
            exchangeRate = await AnalyticsService.getExchangeRate({
                currency: Offering.getCurrency({ customer, offering: this }),
            });
            lineItems.addTerms(
                `Invoice dynamically calculated with realtime currency exchange rate €${exchangeRate.toFixed(
                    2,
                )} = $1.00`,
            );
        }
        if (calculateSubscription) {
            this.calculateSubscriptionLineItem({ lineItems, startDate, endDate, negative: false, exchangeRate });
        }
        await Offering.getLineItemsForUsage({
            startDate,
            endDate,
            customer,
            lineItems,
            businessID: this.businessID,
            customerId: this.customerId,
            customerService: this.customerService,
            negative: false,
            offeringInstance: this,
            dimensions: this.dimensions,
        });

        const invoiceResponse = await this.invoicesService.create(
            {
                businessID: this.businessID,
                customer: customer,
                customerId: this.customerId,
                items: lineItems,
                invoiceDate: invoiceDate ? invoiceDate : startDate.toISOString(),
                currency: Offering.getCurrency({ customer, offering: this }),
                invoicePaymentTerm,
            },
            isManual,
        );
        return invoiceResponse.invoiceId;
    }
    async processBilling(
        startDateOverride: Date,
        endDateOverride: Date,
        customer?: ReadCustomerResponseData,
        calculateUsage = false,
        calculateSubscription = true,
        invoiceDateOverride?: string,
        offeringUpgrade?: boolean,
    ): Promise<string> {
        const { endTime, startTime, subscriptionEnd, subscriptionStart } = Billing.billingCycleToTimeRange(
            this.billingCycle,
        );
        const startDate = startDateOverride ? startDateOverride : DatetimeUtils.beginningOfDay(new Date(startTime));
        const endDate = endDateOverride ? endDateOverride : DatetimeUtils.endOfDay(new Date(endTime));

        const lineItems = new InvoiceLineItems();
        let exchangeRate = 1;
        if (Offering.getCurrency({ customer, offering: this }) !== SupportedCurrencies.USD) {
            exchangeRate = await AnalyticsService.getExchangeRate({
                currency: Offering.getCurrency({ customer, offering: this }),
            });
            lineItems.addTerms(
                `Invoice dynamically calculated with realtime currency exchange rate €${exchangeRate.toFixed(
                    2,
                )} = $1.00`,
            );
        }
        if (calculateSubscription && !this.freeTrialEndDate) {
            // If the customer is not currently in a free trial
            Subscription.logger.log(
                `subscription start: ${subscriptionStart},  subscription end: ${subscriptionEnd}. No free trial`,
            );
            this.calculateSubscriptionLineItem({
                lineItems,
                startDate: offeringUpgrade
                    ? new Date()
                    : DatetimeUtils.beginningOfDay(new Date(startDateOverride ? startDate : subscriptionStart)),
                endDate: DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                negative: false,
                exchangeRate,
            });
        }
        if (calculateSubscription && this.freeTrialEndDate) {
            // If the customer is currently in a free trial
            if (
                DatetimeUtils.dateIsBetweenTwoDates(
                    DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                    DatetimeUtils.beginningOfDay(new Date(startDateOverride ? startDate : subscriptionStart)),
                    new Date(this.freeTrialEndDate),
                )
            ) {
                Subscription.logger.log(
                    `free trial end date: ${this.freeTrialEndDate},  subscription end: ${subscriptionEnd}. Usage is negated for the whole subscription period`,
                );
                // The customer is currently in a free trial and it extends through the subscription time
                this.calculateSubscriptionLineItem({
                    lineItems,
                    startDate: DatetimeUtils.beginningOfDay(
                        new Date(startDateOverride ? startDate : subscriptionStart),
                    ),
                    endDate: DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                    negative: true,
                    exchangeRate,
                });
                this.calculateSubscriptionLineItem({
                    lineItems,
                    startDate: DatetimeUtils.beginningOfDay(
                        new Date(startDateOverride ? startDate : subscriptionStart),
                    ),
                    endDate: DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                    negative: false,
                    exchangeRate,
                });
            } else if (
                DatetimeUtils.dateIsBetweenTwoDates(
                    new Date(this.freeTrialEndDate),
                    DatetimeUtils.beginningOfDay(new Date(startDateOverride ? startDate : subscriptionStart)),
                    DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                )
            ) {
                // If the customer is in a free trial but it ends before the end of the subscription period
                Subscription.logger.log(
                    `Free trial is in the current billing cycle: ${this.freeTrialEndDate}, ${new Date(
                        subscriptionEnd,
                    ).toISOString()}`,
                );
                this.calculateSubscriptionLineItem({
                    lineItems,
                    startDate: DatetimeUtils.beginningOfDay(
                        new Date(startDateOverride ? startDate : subscriptionStart),
                    ),
                    endDate: new Date(this.freeTrialEndDate),
                    negative: true,
                    exchangeRate,
                });
                this.calculateSubscriptionLineItem({
                    lineItems,
                    startDate: DatetimeUtils.beginningOfDay(
                        new Date(startDateOverride ? startDate : subscriptionStart),
                    ),
                    endDate: new Date(this.freeTrialEndDate),
                    negative: false,
                    exchangeRate,
                });
            } else {
                // Free trial is in the past billing cycle
                this.calculateSubscriptionLineItem({
                    lineItems,
                    startDate: offeringUpgrade
                        ? new Date(startDateOverride ? startDate : subscriptionStart)
                        : DatetimeUtils.beginningOfDay(new Date(startDateOverride ? startDate : subscriptionStart)),
                    endDate: DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                    negative: false,
                    exchangeRate,
                });
            }
        }

        if (calculateUsage) {
            // If there is a free trial end date in the past billing cycle, negate the usage for the free trial period
            if (
                this.freeTrialEndDate &&
                DatetimeUtils.dateIsBetweenTwoDates(new Date(this.freeTrialEndDate), startDate, endDate)
            ) {
                // Negate the usage for the free trial period
                await Offering.getLineItemsForUsage({
                    startDate,
                    endDate: new Date(this.freeTrialEndDate),
                    customer,
                    lineItems,
                    negative: true,
                    businessID: this.businessID,
                    customerId: this.customerId,
                    customerService: this.customerService,
                    offeringInstance: this,
                    dimensions: this.dimensions,
                });
            } else if (
                this.freeTrialEndDate &&
                DatetimeUtils.dateIsBetweenTwoDates(endDate, startDate, new Date(this.freeTrialEndDate))
            ) {
                // The customer is currently in a free trial
                await Offering.getLineItemsForUsage({
                    startDate,
                    endDate,
                    customer,
                    lineItems,
                    negative: true,
                    businessID: this.businessID,
                    customerId: this.customerId,
                    customerService: this.customerService,
                    offeringInstance: this,
                    dimensions: this.dimensions,
                });
            }

            await Offering.getLineItemsForUsage({
                startDate,
                endDate,
                customer,
                lineItems,
                businessID: this.businessID,
                customerId: this.customerId,
                customerService: this.customerService,
                negative: false,
                offeringInstance: this,
                dimensions: this.dimensions,
            });
        }
        if (this?.discount?.name) {
            if (!this.discount.endDate || !DatetimeUtils.isDateInPast(new Date(this.discount.endDate))) {
                Offering.addDiscountLineItem(this.discount, lineItems);
            }
        }
        const invoiceResponse = await this.invoicesService.create({
            businessID: this.businessID,
            customer: customer,
            customerId: this.customerId,
            items: lineItems,
            invoiceDate: invoiceDateOverride
                ? invoiceDateOverride
                : startDateOverride
                ? startDate.toISOString()
                : subscriptionStart,
            currency: Offering.getCurrency({ customer, offering: this }),
        });
        const invoiceID = invoiceResponse.invoiceId;
        return invoiceID;
    }

    async unenroll({
        customer,
        shouldCreditRemainingPlan,
        creditService,
    }: {
        customer: ReadCustomerResponseData;
        shouldCreditRemainingPlan: boolean;
        creditService: CreditService;
    }): Promise<void> {
        const { subscriptionStart, subscriptionEnd } = Billing.billingCycleToTimeRange(this.billingCycle);
        const now = DatetimeUtils.getCurrentUTCTime();
        const calculateSubscription = false;
        const calculateUsage = true;
        const invoiceDateOverride = DatetimeUtils.getCurrentUTCTime().toISOString();
        if (shouldCreditRemainingPlan) {
            const amountCredit = this.calculateRemainingAmountForSubscription({
                startDate: now,
                endDate: DatetimeUtils.endOfDay(new Date(subscriptionEnd)),
                exchangeRate: await AnalyticsService.getExchangeRate({
                    currency: Offering.getCurrency({ customer, offering: this }),
                }),
                negative: false,
            });

            await creditService.create({
                transactionAmount: amountCredit.toFixed(2),
                customerId: customer?.customerId,
                businessID: this.businessID,
                timestamp: now.toISOString(),
                metadata: {
                    reason: `Credit for unenrollment from ${this.offeringName}`,
                    offeringId: customer?.offeringId,
                },
            });
        }
        await this.processBilling(
            new Date(subscriptionStart),
            now,
            customer,
            calculateUsage,
            calculateSubscription,
            invoiceDateOverride,
        );
        await this.deregisterBillingSchedule();
    }
    async processFreeTrialEnd({ customer }: { customer: ReadCustomerResponseData }) {
        const lineItems = new InvoiceLineItems();
        const { subscriptionEnd } = Billing.billingCycleToTimeRange(this.billingCycle);
        const startDate = new Date(this.freeTrialEndDate);
        Offering.logger.log(
            `subscription end: ${subscriptionEnd}, start date: ${startDate} in processing free trial end date`,
        );
        let exchangeRate = 1;
        if (Offering.getCurrency({ customer, offering: this }) !== SupportedCurrencies.USD) {
            exchangeRate = await AnalyticsService.getExchangeRate({
                currency: Offering.getCurrency({ customer, offering: this }),
            });
            lineItems.addTerms(
                `Invoice dynamically calculated with realtime currency exchange rate €${exchangeRate.toFixed(
                    2,
                )} = $1.00`,
            );
        }
        this.calculateSubscriptionLineItem({
            lineItems,
            startDate,
            endDate: new Date(subscriptionEnd),
            negative: false,
            exchangeRate,
        });
        UsageBased.logger.log(
            `Creating free trial end invoice for ${this.offeringName} for ${
                this.customerId
            }, lineItems: ${JSON.stringify(lineItems.getLineItems())}`,
        );
        const { invoiceId } = await this.invoicesService.create({
            businessID: this.businessID,
            customerId: this.customerId,
            items: lineItems,
            invoiceDate: startDate.toISOString(),
            customer,
        });
        return invoiceId;
    }

    constructor({
        subscriptionPrice,
        offeringName,
        businessID,
        customerId,
        invoicesService,
        schedulerService,
        customerService,
        dimensions,
        freeTrialEndDate,
        freeTrialLength,
        billingCycle,
        currency,
        settings,
        minimumCharge,
    }: {
        subscriptionPrice: number;
        offeringName: string;
        businessID: string;
        customerId: string;
        invoicesService: InvoicesService;
        schedulerService?: SchedulerService;
        customerService?: CustomerService;
        dimensions?: ReadOfferingResponseData['dimensions'];
        freeTrialEndDate?: string;
        freeTrialLength?: string;
        billingCycle?: ValidBillingCycles;
        currency?: SupportedCurrencies;
        settings: ReadSettingsResponseData;
        minimumCharge?: string;
    }) {
        super({
            offeringType: OfferingType.subscription,
            offeringName,
            businessID,
            customerId,
            invoicesService,
            schedulerService,
            customerService,
            dimensions,
            freeTrialEndDate,
            freeTrialLength,
            billingCycle,
            currency,
            settings,
            minimumCharge,
        });
        this.subscriptionPrice = subscriptionPrice;
    }
}

export class UsageBased extends Offering {
    static readonly logger = new Logger(UsageBased.name);
    isUnenrollment: boolean;
    async enroll(subject: string): Promise<void> {
        await this.registerBillingSchedule(subject);
    }

    async offcycleBilling({
        startDate,
        endDate,
        customer,
        invoiceDate,
        invoicePaymentTerm,
        isManual = false,
    }: {
        startDate: Date;
        endDate: Date;
        customer?: ReadCustomerResponseData;
        invoiceDate?: string;
        invoicePaymentTerm?: InvoicePaymentTerm;
        isManual?: boolean;
    }): Promise<string> {
        const lineItems = new InvoiceLineItems();
        await Offering.getLineItemsForUsage({
            startDate,
            endDate,
            customer,
            lineItems,
            negative: false,
            businessID: this.businessID,
            customerId: this.customerId,
            customerService: this.customerService,
            offeringInstance: this,
            dimensions: this.dimensions,
        });
        const { invoiceId } = await this.invoicesService.create(
            {
                businessID: this.businessID,
                customer: customer,
                customerId: this.customerId,
                items: lineItems,
                invoiceDate: invoiceDate ? invoiceDate : endDate.toISOString(),
                currency: Offering.getCurrency({ customer, offering: this }),
                invoicePaymentTerm,
            },
            isManual,
        );
        return invoiceId;
    }

    async processFreeTrialEnd({ customer }: { customer: ReadCustomerResponseData }) {
        const lineItems = new InvoiceLineItems();
        const startDate = customer?.freeTrialStartDate
            ? new Date(customer?.freeTrialStartDate)
            : DatetimeUtils.daysBeforeDate(new Date(this.freeTrialEndDate), parseInt(this.freeTrialLength));
        const dayAfterFreeTrialEndDate = DatetimeUtils.beginningOfTomorrow(new Date(this.freeTrialEndDate));
        await Offering.getLineItemsForUsage({
            startDate,
            endDate: dayAfterFreeTrialEndDate,
            customer,
            lineItems,
            negative: true,
            businessID: this.businessID,
            customerId: this.customerId,
            customerService: this.customerService,
            offeringInstance: this,
            dimensions: this.dimensions,
        });
        UsageBased.logger.log(
            `Creating free trial end invoice for ${this.offeringName} for ${
                this.customerId
            }, lineItems: ${JSON.stringify(lineItems.getLineItems())}`,
        );
        const { invoiceId } = await this.invoicesService.create({
            businessID: this.businessID,
            customer: customer,
            customerId: this.customerId,
            items: lineItems,
            invoiceDate: dayAfterFreeTrialEndDate.toISOString(),
            currency: Offering.getCurrency({ customer, offering: this }),
        });

        return invoiceId;
    }
    async processBilling(
        startDateOverride: Date,
        endDateOveride: Date,
        customer?: ReadCustomerResponseData,
    ): Promise<string> {
        let startDate: Date;
        let endDate: Date;
        const { startTime, endTime, currentBillingCycleStartTime } = Billing.billingCycleToTimeRange(this.billingCycle);
        startDate = startDateOverride ? startDateOverride : new Date(startTime);
        endDate = endDateOveride ? endDateOveride : new Date(endTime);

        startDate = DatetimeUtils.beginningOfDay(startDate);
        endDate = DatetimeUtils.endOfDay(endDate);
        const lineItems = new InvoiceLineItems();
        // Free Trial end date is only set in cases where its either during a free trial, or after the free trial but before the next billing cycle
        UsageBased.logger.log(
            `Processing billing for ${
                this.offeringName
            } from ${startDate.toISOString()} to ${endDate.toISOString()}, with free trial end date ${
                this.freeTrialEndDate
            }`,
        );
        if (
            this.freeTrialEndDate &&
            DatetimeUtils.dateIsBetweenTwoDates(new Date(this.freeTrialEndDate), startDate, endDate)
        ) {
            await Offering.getLineItemsForUsage({
                startDate,
                endDate: new Date(this.freeTrialEndDate),
                customer,
                lineItems,
                negative: true,
                businessID: this.businessID,
                customerId: this.customerId,
                customerService: this.customerService,
                offeringInstance: this,
                dimensions: this.dimensions,
            });
        } else if (
            this.freeTrialEndDate &&
            DatetimeUtils.dateIsBetweenTwoDates(endDate, startDate, new Date(this.freeTrialEndDate))
        ) {
            // The customer is currently in a free trial
            await Offering.getLineItemsForUsage({
                startDate,
                endDate,
                customer,
                lineItems,
                negative: true,
                businessID: this.businessID,
                customerId: this.customerId,
                customerService: this.customerService,
                offeringInstance: this,
                dimensions: this.dimensions,
            });
        }

        await Offering.getLineItemsForUsage({
            startDate,
            endDate,
            customer,
            lineItems,
            negative: false,
            businessID: this.businessID,
            customerId: this.customerId,
            customerService: this.customerService,
            offeringInstance: this,
            dimensions: this.dimensions,
        });
        UsageBased.logger.log(
            `Creating invoice for ${this.offeringName} for ${this.customerId}, lineItems: ${JSON.stringify(
                lineItems.getLineItems(),
            )}`,
        );
        let exchangeRate = 1;
        if (Offering.getCurrency({ customer, offering: this }) !== SupportedCurrencies.USD) {
            console.log('Inside exchange rate');
            exchangeRate = await AnalyticsService.getExchangeRate({
                currency: Offering.getCurrency({ customer, offering: this }),
            });
        }
        const endLineItems = Offering.minimumChargeOverride({
            minimumCharge: this.minimumCharge,
            lineItems,
            freeTrialEndDate: this.freeTrialEndDate,
            offeringName: this.offeringName,
            isUnenrollment: this.isUnenrollment,
            startDate,
            endDate,
            exchangeRate,
            offeringEnrollmentDate: customer?.offeringEnrollmentDate
                ? new Date(customer?.offeringEnrollmentDate)
                : undefined,
        });
        if (this?.discount?.name) {
            Offering.addDiscountLineItem(this.discount, endLineItems);
        }
        const invoiceInput = {
            businessID: this.businessID,
            customer: customer,
            customerId: this.customerId,
            items: endLineItems,
            invoiceDate: endDate.toISOString(),
            currency: Offering.getCurrency({ customer, offering: this }),
        };
        UsageBased.logger.debug(
            `Finished Invoice Input, processing with the following parameters: QueueInvoice: ${this.queueInvoice}, Consolidate Invoice: ${this.consolidatedInvoice}`,
        );
        if (this.queueInvoice) {
            await this.invoicesService.queueInvoice(invoiceInput);
        } else if (!this.consolidatedInvoice) {
            const { invoiceId } = await this.invoicesService.create(invoiceInput);
            return invoiceId;
        }
        if (this.consolidatedInvoice) {
            const { invoiceId } = await this.invoicesService.consolidateInvoice({
                startTime: this.isUnenrollment
                    ? await this.determineStartTimeForInvoiceConsolidation({
                          customerId: this.customerId,
                          businessID: this.businessID,
                          billingCycleStartTime: currentBillingCycleStartTime,
                      })
                    : startTime,
                endTime: this.isUnenrollment ? new Date().toISOString() : endTime,
                customerId: this.customerId,
                businessID: this.businessID,
                invoiceDate: endDate.toISOString(),
                initalLineItems: !this.queueInvoice ? endLineItems : undefined,
            });
            return invoiceId;
        }
        return;
    }
    async determineStartTimeForInvoiceConsolidation({
        customerId,
        businessID,
        billingCycleStartTime,
    }: {
        customerId: string;
        businessID: string;
        billingCycleStartTime: string;
    }) {
        const ledger = await this.customerService.getCustomerLedger({ customerId, businessID });
        let startTime = billingCycleStartTime;
        // Assumes that the ledger is sorted by date in descending order
        if (ledger?.data) {
            // Checks to see the last time a customer has had no offering associated with their account.
            // If that time is before the start of the current billing cycle, then the start time is the start of the current billing cycle
            // If that time is during the current billing cycle we use that start time.
            // Prevents the case of a customer cancelling plans regularlly and then re-enrolling in the same billing cycle,
            // which would cause the invoice to be consolidated with incorrect values
            for (const item of ledger.data) {
                if (!item?.offeringId) {
                    if (new Date(startTime).getTime() < new Date(item._time).getTime()) {
                        startTime = item._time;
                        break;
                    } else {
                        break;
                    }
                }
            }
        }
        return startTime;
    }

    async unenroll({ customer, isChangeOfPlan }): Promise<void> {
        const { currentBillingCycleStartTime } = Billing.billingCycleToTimeRange(this.billingCycle);
        UsageBased.logger.debug(
            `Running Unenrollment for Customer: ${customer?.customerId}, isChangeOfPlan: ${isChangeOfPlan}, currentBillingCycleStartTime: ${currentBillingCycleStartTime}, settingsInvoiceGeneration: ${this.settings?.invoiceGeneration}`,
        );
        UsageBased.logger.debug(
            `BooleanCheck: ${
                isChangeOfPlan && this.settings?.invoiceGeneration === InvoiceGeneration.consolidatedPerBillingCycle
            }`,
        );
        if (this.settings?.invoiceGeneration === InvoiceGeneration.consolidatedPerBillingCycle) {
            this.queueInvoice = true;
        }
        if (!isChangeOfPlan && this.settings?.invoiceGeneration === InvoiceGeneration.consolidatedPerBillingCycle) {
            this.consolidatedInvoice = true;
        }
        UsageBased.logger.debug(`Setting queueInvoice to ${this.queueInvoice}`);
        UsageBased.logger.debug(`Setting consolidatedInvoice to ${this.consolidatedInvoice}`);
        this.isUnenrollment = true;
        await this.processBilling(new Date(currentBillingCycleStartTime), new Date(), customer);
        await this.deregisterBillingSchedule();
        this.isUnenrollment = false;
    }

    constructor({
        offeringName,
        customerId,
        invoicesService,
        schedulerService,
        dimensions,
        businessID,
        customerService,
        freeTrialLength,
        freeTrialEndDate,
        billingCycle,
        currency,
        settings,
        minimumCharge,
    }: {
        offeringName: string;
        businessID: string;
        customerId: string;
        invoicesService: InvoicesService;
        schedulerService?: SchedulerService;
        customerService?: CustomerService;
        dimensions: ReadOfferingResponseData['dimensions'];
        freeTrialLength?: string;
        freeTrialEndDate?: string;
        billingCycle?: ValidBillingCycles;
        currency?: SupportedCurrencies;
        settings: ReadSettingsResponseData;
        minimumCharge?: string;
    }) {
        super({
            offeringType: OfferingType.usageBased,
            offeringName,
            customerId,
            invoicesService,
            schedulerService,
            dimensions,
            businessID,
            customerService,
            freeTrialLength,
            freeTrialEndDate,
            billingCycle,
            currency,
            settings,
            minimumCharge,
        });
    }
}

export class OfferingPackageEntity {
    private static readonly logger = new Logger(OfferingPackageEntity.name);
    public static _measurement = 'OfferingDocument';

    @ApiHideProperty()
    public softDelete?: boolean;

    /**
     *
     * The visibility of the offering, specifically if its private or public.
     * A private offering can only be associated with a single service, while a public offering can be associated with many.
     *
     * Private offerings are typically used for enterprise deals which contain discounts or prepaid credits.
     *
     * @example "private"
     * @example "public"
     * **/
    public offeringVisibility?: OfferingVisibility;

    /**
     * Discount associated with the package, is applied to the total package which includes each associated dimension
     * @example "20%"
     * @example "0%"
     */

    public discount?: CustomerContractDiscount;

    /**
     * PrePaid Credit amount assoaciated with the package, is taken off the total calculated
     * @example "$20.00"
     */
    public prepaidCredit?: string;

    /**
     * The type of offering.
     *
     * @example usage-based
     * @example subscription
     */
    public offeringType?: string;

    /**
     * The price of the subscription. Must be a positive number.
     */
    public subscriptionPrice?: number;

    /**
     * The time frame when an automatic bill should be sent leave empty for no automated billing
     * @example "monthly"
     * @example "annual"
     */
    public billingCycle?: ValidBillingCycles;

    /**
     * The Human Readable name for the offering
     */
    public offeringName: string;

    /**
     * Currently only USD is supported as a currency, more will come in the future with localization.
     * It is not required that you pass in USD. However you can if you would like.
     */
    public currency?: SupportedCurrencies;

    /**
     * The collection of dimensions, these are the specific units which need to be metered for on a service. Each dimension must be unique for a given offering.
     * For post requests to the price document endpoint it is NOT required.
     * To add dimensions use the /dimensions endpoint
     *
     */
    public dimensionIds?: Array<string>;

    /**
     * The Unique ID associated with your specific business account
     * @example "myCoolCorp"
     */
    public businessID: string;

    /**
     * The Unique ID defining the offering
     * @example "092f9444-851a-43fb-9503-2228dc01b1be"
     */
    public offeringId: string;

    /**
     *  The Length of the Free trial for the offering. For subscriptions this must be a positive integer which indicates the number of billing cycles.
     * For usage based this must be a positive integer which indicates the number of days.
     * @example "1"
     */
    public freeTrialLength?: string;

    /**
     * A minimum charge to be billed to the customer in the event that the customer's bill is less than the minimum charge. This includes usage and subscription charges.
     * <br><br>Example: `"32.00"` for $32.00.
     * @example "32.00"
     */
    public minimumCharge?: string;

    /**
     * An optional key-value map of additional metadata to associate with the offerings.
     * such as environment, purpose, owner, developer, contract number,
     * or any arbitrary data to be associated with this usage record.
     * <br><br>
     * Example `{"environment": "staging", "purpose": "proof-of-concept", "owner": "John Doe", "workspaceId": "1234567890"}`
     **/
    public metadata?: Record<string, string | number | null>;

    constructor(offeringPackageEntity: OfferingPackageEntity) {
        if (offeringPackageEntity) {
            OfferingPackageEntity.logger.log(
                `Currency: ${offeringPackageEntity.currency}, OfferingName: ${offeringPackageEntity.offeringName}}`,
            );
            const {
                offeringName,
                currency,
                offeringType,
                subscriptionPrice,
                billingCycle,
                offeringId,
                businessID,
                dimensionIds = [],
                softDelete = false,
                offeringVisibility = OfferingVisibility.public,
                prepaidCredit,
                freeTrialLength,
                minimumCharge,
                metadata,
            } = offeringPackageEntity;
            this.offeringName = offeringName;
            this.currency = currency ? currency : SupportedCurrencies.USD;
            this.offeringType = offeringType ? offeringType : OfferingType.usageBased;
            this.subscriptionPrice = subscriptionPrice ? subscriptionPrice : 0;
            this.billingCycle = billingCycle ? billingCycle : ValidBillingCycles.monthly;
            this.offeringVisibility = offeringVisibility;
            this.dimensionIds = dimensionIds;
            this.offeringId = offeringId;
            this.businessID = businessID;
            this.softDelete = softDelete;
            this.prepaidCredit = prepaidCredit;
            this.freeTrialLength = freeTrialLength;
            this.minimumCharge = minimumCharge;
            this.metadata = metadata;
        }
    }
    // Should not use `this` context is a pure transformation of the data and doesn't alter the state
    static transformer(offeringPackageEntity: OfferingPackageEntity, influxService: InfluxService): Array<Point> {
        // Take in a pricing package entity
        // Return a collection of points to be commited to TSDB

        const aggregatePriceDocumentPoint = influxService.getPoint(OfferingPackageEntity._measurement);

        aggregatePriceDocumentPoint.stringField('offeringName', offeringPackageEntity.offeringName);

        aggregatePriceDocumentPoint.tag('currency', offeringPackageEntity.currency);
        aggregatePriceDocumentPoint.tag('offeringVisibility', offeringPackageEntity.offeringVisibility);
        aggregatePriceDocumentPoint.tag('offeringType', offeringPackageEntity.offeringType);
        aggregatePriceDocumentPoint.tag('subscriptionPrice', offeringPackageEntity.subscriptionPrice.toString());
        aggregatePriceDocumentPoint.tag(
            'billingCycle',
            offeringPackageEntity.billingCycle ? offeringPackageEntity.billingCycle : ValidBillingCycles.monthly,
        );
        aggregatePriceDocumentPoint.tag('businessID', offeringPackageEntity.businessID);
        aggregatePriceDocumentPoint.tag('prepaidCredit', offeringPackageEntity.prepaidCredit);
        aggregatePriceDocumentPoint.tag('offeringId', offeringPackageEntity.offeringId);

        offeringPackageEntity.dimensionIds.forEach((dimensionId) => {
            aggregatePriceDocumentPoint.tag(`dimensionId_${dimensionId}`, dimensionId);
        });

        if (offeringPackageEntity.softDelete) {
            aggregatePriceDocumentPoint.tag('softDelete', 'deleted');
        }
        if (offeringPackageEntity.freeTrialLength) {
            aggregatePriceDocumentPoint.tag('freeTrialLength', offeringPackageEntity.freeTrialLength);
        }
        if (offeringPackageEntity.minimumCharge) {
            aggregatePriceDocumentPoint.tag('minimumCharge', offeringPackageEntity.minimumCharge);
        }
        if (offeringPackageEntity?.metadata) {
            aggregatePriceDocumentPoint.tag('metadata', JSON.stringify(offeringPackageEntity?.metadata));
        }

        return [aggregatePriceDocumentPoint];
    }

    static dbModelToEntity(dbModel): OfferingPackageEntity {
        const {
            _value,
            billingCycle,
            currency,
            businessID,
            offeringId,
            offeringType,
            subscriptionPrice,
            offeringVisibility,
            prepaidCredit,
            freeTrialLength,
            minimumCharge,
            metadata: influxMetadata,
            ...rest
        } = dbModel;
        const dimensionIds = Object.keys(rest)
            .filter((key) => /dimensionId/.test(key))
            .reduce((acc, key) => {
                if (rest[key]) {
                    acc.push(rest[key]);
                }
                return acc;
            }, []);
        const input = {
            offeringName: _value,
            billingCycle: billingCycle ? billingCycle : ValidBillingCycles.monthly,
            currency,
            businessID,
            offeringId,
            offeringType,
            subscriptionPrice: Number(subscriptionPrice),
            dimensionIds,
            offeringVisibility,
            prepaidCredit,
            freeTrialLength,
            minimumCharge,
            metadata: influxMetadata ? JSON.parse(influxMetadata) : undefined,
        };
        return new OfferingPackageEntity(input);
    }
}
