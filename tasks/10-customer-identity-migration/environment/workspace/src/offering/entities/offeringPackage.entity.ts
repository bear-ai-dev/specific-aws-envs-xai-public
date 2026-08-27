import { Point } from '@influxdata/influxdb-client';
import { Logger } from '@nestjs/common';
import { ApiHideProperty } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { InfluxService } from '../../influx/influx.service';
import { OfferingVisibility, validBillingCycles } from '../dto/createOffering.dto';

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

    public discount?: string;

    /**
     * PrePaid Credit amount assoaciated with the package, is taken off the total calculated
     * @example "$20.00"
     */
    public prepaidCredit?: string;

    /**
     * The type of plan, usage based, or tier
     * @example usage-based
     * @example tier
     */
    public offeringType?: string;

    /**
     * The time frame when an automatic bill should be sent leave empty for no automated billing
     * @example "monthly"
     * @example "annual"
     */
    public billingCycle?: validBillingCycles;

    /**
     * The Human Readable name for the offering
     */
    public offeringName: string;

    /**
     * Currently only USD is supported as a currency, more will come in the future with localization.
     * It is not required that you pass in USD. However you can if you would like.
     */
    public currency = 'USD';

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

    constructor(offeringPackageEntity: OfferingPackageEntity) {
        if (offeringPackageEntity) {
            const {
                offeringName,
                currency,
                offeringType,
                discount,
                billingCycle,
                offeringId,
                businessID,
                dimensionIds = [],
                softDelete = false,
                offeringVisibility = OfferingVisibility.public,
                prepaidCredit,
            } = offeringPackageEntity;
            this.offeringName = offeringName;
            this.currency = currency ? currency : 'USD';
            this.offeringType = offeringType;
            this.billingCycle = billingCycle;
            this.offeringVisibility = offeringVisibility;
            this.dimensionIds = dimensionIds;
            this.offeringId = offeringId;
            this.businessID = businessID;
            this.discount = discount;
            this.softDelete = softDelete;
            this.prepaidCredit = prepaidCredit;
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
        aggregatePriceDocumentPoint.tag('billingCycle', offeringPackageEntity.billingCycle);
        aggregatePriceDocumentPoint.tag('businessID', offeringPackageEntity.businessID);
        aggregatePriceDocumentPoint.tag('discount', offeringPackageEntity.discount);
        aggregatePriceDocumentPoint.tag('prepaidCredit', offeringPackageEntity.prepaidCredit);
        aggregatePriceDocumentPoint.tag('offeringId', offeringPackageEntity.offeringId);

        offeringPackageEntity.dimensionIds.forEach((dimensionId) => {
            aggregatePriceDocumentPoint.tag(`dimensionId_${dimensionId}`, dimensionId);
        });

        if (offeringPackageEntity.softDelete) {
            aggregatePriceDocumentPoint.tag('softDelete', 'deleted');
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
            discount,
            offeringVisibility,
            prepaidCredit,
            ...rest
        } = dbModel;
        const dimensionIds = Object.keys(rest)
            .filter((key) => /dimensionId/.test(key))
            .reduce((acc, key) => {
                acc.push(rest[key]);
                return acc;
            }, []);

        const input = {
            offeringName: _value,
            billingCycle,
            currency,
            businessID,
            offeringId,
            offeringType,
            dimensionIds,
            discount,
            offeringVisibility,
            prepaidCredit,
        };
        return new OfferingPackageEntity(input);
    }
}
