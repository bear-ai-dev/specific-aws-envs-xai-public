import { BasicResponseDTO } from '../../basicResponseDTO.js';
import { ReadCustomerResponseData } from '../../customer/entities/customer.entity.js';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { ReadDimensionResponseData } from '../../dimensions/dto/read-dimension.dto.js';
import { SettingsEntity } from '../../setting/entities/settings.entity.js';
import { Address } from '../../customer/dto/create-customer.dto.js';

class Dimension extends PickType(ReadDimensionResponseData, [
    'dimensionId',
    'dimensionName',
    'consumptionUnit',
    'usageIncrement',
    'usageEntitlement',
    'overageAllowed',
]) {}

class CustomerOffering {
    public offeringName: string;
    public dimensions: Array<Dimension>;
}

class CustomerBillingData extends PickType(ReadCustomerResponseData, [
    'customerName',
    'email',
    'address',
    'currency',
    'freeTrialEndDate',
    'creditBalance',
    'invoices',
    'taxExempt',
]) {
    public offering: CustomerOffering;
}
export class CustomerBillingResponse extends BasicResponseDTO {
    data: CustomerBillingData[];

    static from(customerData: ReadCustomerResponseData): CustomerBillingResponse {
        return {
            message: 'Found customer billing information',
            data: [
                {
                    customerName: customerData.customerName,
                    email: customerData.email,
                    address: customerData.address,
                    currency: customerData.currency,
                    freeTrialEndDate: customerData.freeTrialEndDate,
                    creditBalance: customerData.creditBalance,
                    invoices: customerData.invoices,
                    taxExempt: customerData.taxExempt,
                    offering: customerData?.offering && {
                        dimensions: customerData.offering.dimensions.map((dimension) => ({
                            dimensionId: dimension.dimensionId,
                            dimensionName: dimension.dimensionName,
                            consumptionUnit: dimension.consumptionUnit,
                            usageIncrement: dimension.usageIncrement,
                            usageEntitlement: dimension.usageEntitlement,
                            overageAllowed: dimension.overageAllowed,
                        })),
                        offeringName: customerData.offering.offeringName,
                    },
                },
            ],
        };
    }
}
