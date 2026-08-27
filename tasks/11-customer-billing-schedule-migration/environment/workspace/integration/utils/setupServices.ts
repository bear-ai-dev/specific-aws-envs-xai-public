import { CreateCustomerDto, paymentChannel } from '../../src/customer/dto/create-customer.dto';
import fetch from 'cross-fetch';
import { CreateDimensionDto } from '../../src/dimensions/dto/create-dimension.dto';

import {
    CreateOfferingDTO,
    offeringType,
    OfferingVisibility,
    validBillingCycles,
} from '../../src/offering/dto/createOffering.dto';
import { CreateServiceDto } from '../../src/services/dto/createService.dto';
import {
    CreateMeasurementConfigDto,
    CreateMeasurementConfigurationResponse,
    measurementMode,
} from '../../src/measurement-config/dto/create-measurement-config.dto';
import {
    supportedCloudPlatforms,
    SupportedResources,
    SupportedAgentHostingPlatforms,
} from '../../src/measurement-config/entities/measurement-config.entity';
import { ACCESS_TOKEN } from '../client/publicClient/init';

export const retryAndBackoff = async (fn: () => Promise<any>, retries: number, backoff: number) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            await new Promise((resolve) => setTimeout(resolve, backoff));
        }
    }
    throw lastError;
};

const commitOfferingDocumet = async (offeringDoc: CreateOfferingDTO) => {
    const createOfferingDocument = await fetch(`${process.env.API_URL}/offerings/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(offeringDoc),
    });
    const createdOfferingResponse = await createOfferingDocument.json();
    if (createdOfferingResponse.statusCode !== 404) {
        return createdOfferingResponse;
    }
    throw new Error('Offering creation failed');
};
const commitServiceDocument = async (serviceDoc: CreateServiceDto) => {
    const createdServiceResponse = await fetch(`${process.env.API_URL}/services/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceDoc),
    });
    const serviceResponseJSON = await createdServiceResponse.json();
    if (serviceResponseJSON.statusCode !== 404) {
        return serviceResponseJSON;
    }
    throw new Error('Service creation failed');
};
const readServiceDoc = async (serviceId: string) => {
    const serviceResponse = await fetch(`${process.env.API_URL}/services/${serviceId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    });

    const serviceResponseJSON = await serviceResponse.json();
    if (serviceResponseJSON.statusCode !== 404) {
        return serviceResponseJSON;
    }
    throw new Error('No service found');
};

export const commitMeasurementDocument = async (
    measurementDoc: CreateMeasurementConfigDto
): Promise<CreateMeasurementConfigurationResponse> => {
    const createdMeasurementResponse = await fetch(`${process.env.API_URL}/measurements/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(measurementDoc),
    });
    const measurementResponseJSON = await createdMeasurementResponse.json();
    if (measurementResponseJSON.statusCode !== 404) {
        return measurementResponseJSON;
    }
    throw new Error('Measurement creation failed');
};

export const setupServices = async (dimensions: Array<CreateDimensionDto>, applicationId = '') => {
    const YESTERDAY = new Date((Date.now() - 86400000) / 1000);
    const ONE_HOUR_IN_SECONDS = 3600;
    const ONE_HOUR_AFTER_YESTERDAY = new Date(YESTERDAY.getTime() + ONE_HOUR_IN_SECONDS);

    const dimensionIds = await Promise.all(
        dimensions.map(async (dimension) => {
            const dimensionDoc = await fetch(`${process.env.API_URL}/dimensions/`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dimension),
            });
            const dimensionJson = await dimensionDoc.json();
            expect(dimensionJson).toEqual(
                expect.objectContaining({ message: expect.anything(), dimensionId: expect.anything() })
            );
            return dimensionJson.dimensionId;
        })
    );
    const inputCustomerDocument: CreateCustomerDto = {
        customerName: 'HealthCareCorp',
        paymentChannel: paymentChannel.manual,
        email: 'integrationTest@meteringco.tech',
    };
    const createCustomerDocument = await fetch(`${process.env.API_URL}/customers/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inputCustomerDocument),
    });

    const customerResponse = await createCustomerDocument.json();
    expect(customerResponse).toEqual(
        expect.objectContaining({ message: expect.anything(), customerId: expect.anything() })
    );

    const inputOfferingDocument: CreateOfferingDTO = {
        offeringVisibility: OfferingVisibility.public,
        offeringType: offeringType['usage-based'],
        billingCycle: validBillingCycles.monthly,
        offeringName: 'podCPuOffering',
        currency: 'USD',
        dimensionIds,
    };
    const createdOfferingResponse = await retryAndBackoff(
        async () => {
            const res = await commitOfferingDocumet(inputOfferingDocument);
            return res;
        },
        5,
        1000
    );
    expect(createdOfferingResponse).toEqual(
        expect.objectContaining({ message: expect.anything(), offeringId: expect.anything() })
    );

    const inputServiceDocument: CreateServiceDto = {
        serviceName: 'my-cpu-test-service',
        offeringId: createdOfferingResponse.offeringId,
        customerId: customerResponse.customerId,
        applicationId: applicationId ? applicationId : undefined,
    };

    const serviceResponseJson = await retryAndBackoff(
        async () => {
            const res = await commitServiceDocument(inputServiceDocument);
            return res;
        },
        5,
        1000
    );

    expect(serviceResponseJson).toEqual(
        expect.objectContaining({ message: expect.anything(), serviceId: expect.anything() })
    );
    const readServiceResponseJson = await retryAndBackoff(
        async () => {
            const res = await readServiceDoc(serviceResponseJson.serviceId);
            return res;
        },
        5,
        1000
    );
    return readServiceResponseJson.data[0].serviceId;
};

export const ebsProvisionedVolumeMeasurementDto = {
    measurementName: 'ebsProvisionedVolume - Measurement - Integration Test',
    measurementMode: measurementMode.infrastructureBased,
    measurementConfiguration: {
        iamRoleArn: 'arn:aws:iam::647662420899:role/meteringco-read-only',
        cloudPlatform: supportedCloudPlatforms.aws,
        region: 'us-east-1',
        resourceType: SupportedResources.ebs,
    },
};
export const ebsSnapshotMeasurementDto = {
    measurementName: 'ebsProvisionedVolume - Measurement - Integration Test',
    measurementMode: measurementMode.infrastructureBased,
    measurementConfiguration: {
        iamRoleArn: 'arn:aws:iam::647662420899:role/meteringco-read-only',
        cloudPlatform: supportedCloudPlatforms.aws,
        region: 'us-east-1',
        resourceType: SupportedResources.ebssnapshot,
    },
};

export const podCpuHourMeasurement = {
    measurementName: 'ebsProvisionedVolume - Measurement - Integration Test',
    measurementMode: measurementMode.agentBased,
    measurementConfiguration: {
        iamRoleArn: 'arn:aws:iam::647662420899:role/meteringco-read-only',
        hostingPlatform: SupportedAgentHostingPlatforms.eks,
    },
};
