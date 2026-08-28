import fetch from 'cross-fetch';
import { CreateDimensionDto, roundingEnum, timeBasedUnits } from '../../src/dimensions/dto/create-dimension.dto';
import { infrastructureType } from '../../src/dimensions/dto/create-dimension.dto';
import {
    CreateOfferingDTO,
    CreateOfferingResponse,
    offeringType,
    OfferingVisibility,
    validBillingCycles,
} from '../../src/offering/dto/createOffering.dto';
import { ReadOfferingResponseDTO } from '../../src/offering/dto/readOffering.dto';
import { UpdateOfferingDto } from '../../src/offering/dto/updateOfferingDto';
import { retryAndBackoff } from '../utils/setupServices';

describe('Offerings', () => {
    const EbsProvisionedCapacitydimensionDocumentInput: CreateDimensionDto = {
        dimensionName: 'bar',
        usageIncrement: 1,
        rounding: roundingEnum['floor'],
        consumptionPrice: '20.00',
        consumptionUnit: { type: 'time', unit: timeBasedUnits['second'] },
    };

    const EbsSnapshot: CreateDimensionDto = {
        dimensionName: 'bar',
        usageIncrement: 1,
        rounding: roundingEnum['floor'],
        consumptionPrice: '20.00',
        consumptionUnit: { type: 'time', unit: timeBasedUnits['second'] },
    };
    const getOfferingDoc = async (createdOfferingResponse) => {
        const getOriginalFullOfferingResponse = await fetch(
            `${process.env.API_URL}/offerings/${createdOfferingResponse.offeringId}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`,
                },
            }
        );

        const readOriginalOfferingResponse = await getOriginalFullOfferingResponse.json();
        return readOriginalOfferingResponse;
    };
    test('Should handle Updates correctly to new Offerings', async () => {
        const provisionedCapacityResponse = await fetch(`${process.env.API_URL}/dimensions/`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(EbsProvisionedCapacitydimensionDocumentInput),
        });

        const provisionedDimensionResponse = await provisionedCapacityResponse.json();
        expect(provisionedDimensionResponse).toEqual(
            expect.objectContaining({ message: expect.anything(), dimensionId: expect.anything() })
        );

        const snapshotDimensionDoc = await fetch(`${process.env.API_URL}/dimensions/`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(EbsSnapshot),
        });

        const snapshotDimensionResponse = await snapshotDimensionDoc.json();
        expect(snapshotDimensionResponse).toEqual(
            expect.objectContaining({ message: expect.anything(), dimensionId: expect.anything() })
        );
        const inputOfferingDocument: CreateOfferingDTO = {
            offeringVisibility: OfferingVisibility.private,
            discount: '20%',
            prepaidCredit: '20.00',
            offeringType: offeringType['usage-based'],
            billingCycle: validBillingCycles.monthly,
            offeringName: 'myReallyNeatOffering',
            currency: 'USD',
            dimensionIds: [provisionedDimensionResponse.dimensionId],
        };

        const createOfferingDocument = await fetch(`${process.env.API_URL}/offerings/`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(inputOfferingDocument),
        });
        const createdOfferingResponse: CreateOfferingResponse = await createOfferingDocument.json();
        expect(createdOfferingResponse).toEqual(
            expect.objectContaining({ message: expect.anything(), offeringId: expect.anything() })
        );

        const getOriginalFullOfferingResponse = await fetch(
            `${process.env.API_URL}/offerings/${createdOfferingResponse.offeringId}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`,
                },
            }
        );

        const readOriginalOfferingResponse = await retryAndBackoff(
            async () => {
                const res = await getOfferingDoc(createdOfferingResponse);
                return res;
            },
            5,
            1000
        );
        const {
            data: [{ offeringId, offeringName, discount, dimensions, offeringType: responseOfferingType }],
        }: ReadOfferingResponseDTO = readOriginalOfferingResponse;
        const dimensionIdsFromResponse = dimensions.map(({ dimensionId }) => dimensionId);
        if (inputOfferingDocument.discount && /^(\d+|(\.\d+))(\.\d+)?%$/.test(inputOfferingDocument.discount)) {
            inputOfferingDocument.discount = (parseFloat(inputOfferingDocument.discount) / 100).toFixed(3);
        }
        expect(offeringId).toEqual(createdOfferingResponse.offeringId);
        expect(offeringName).toEqual(inputOfferingDocument.offeringName);
        expect(discount).toEqual(inputOfferingDocument.discount);
        expect(responseOfferingType).toEqual(inputOfferingDocument.offeringType);
        expect(dimensionIdsFromResponse.length).toEqual(1);
        expect(dimensionIdsFromResponse[0]).toEqual(provisionedDimensionResponse.dimensionId);

        const updateOfferingPayload: UpdateOfferingDto = {
            offeringId: createdOfferingResponse.offeringId,
            offeringName: 'foobar',
            dimensionIds: [snapshotDimensionResponse.dimensionId],
        };
        const updateOfferingDocumentResponse = await fetch(`${process.env.API_URL}/offerings/`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(updateOfferingPayload),
        });
        const updatedOfferingResponseJson: CreateOfferingResponse = await updateOfferingDocumentResponse.json();
        expect(updatedOfferingResponseJson).toEqual(
            expect.objectContaining({ message: expect.anything(), offeringId: expect.anything() })
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const getUpdatedOfferingResponse = await fetch(
            `${process.env.API_URL}/offerings/${createdOfferingResponse.offeringId}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`,
                },
            }
        );

        const readUpdatedOfferingResponse = await getUpdatedOfferingResponse.json();

        const {
            data: [
                {
                    offeringId: updatedOfferingId,
                    offeringName: updatedOfferingname,
                    discount: updatedOfferingDiscount,
                    dimensions: updatedOfferingDimensions,
                },
            ],
        }: ReadOfferingResponseDTO = readUpdatedOfferingResponse;
        const updatedDimensionIds = updatedOfferingDimensions.map(({ dimensionId }) => dimensionId);
        // OfferingId shouldn't change
        expect(updatedOfferingId).toEqual(createdOfferingResponse.offeringId);

        expect(updatedOfferingname).toEqual(updateOfferingPayload.offeringName);

        // Discount wasn't changed from original request
        expect(updatedOfferingDiscount).toEqual(inputOfferingDocument.discount);

        expect(updatedDimensionIds.length).toEqual(2);

        expect(updatedDimensionIds).toEqual(
            expect.arrayContaining([snapshotDimensionResponse.dimensionId, provisionedDimensionResponse.dimensionId])
        );
    });
});
