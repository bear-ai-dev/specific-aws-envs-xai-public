import {
    Inject,
    Injectable,
    Logger,
    NotAcceptableException,
    NotFoundException,
    forwardRef,
    ConflictException,
} from '@nestjs/common';
import { CreateOfferingDTO, CreateOfferingResponse, supportedCurrencies } from './dto/createOffering.dto';
import { ReadOfferingResponseData, ReadOfferingResponseDTO, ReadPricingDTO } from './dto/readOffering.dto';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { InfluxService } from '../influx/influx.service';
import { OfferingPackageEntity } from './entities/offeringPackage.entity';
import { DeleteOfferingDTO, DeleteOfferingResponse } from './dto/deleteOffering.dto';
import { DimensionsService } from '../dimensions/dimensions.service';
import { UpdateOfferingDto } from './dto/updateOfferingDto';
import { randomUUID } from 'crypto';
import { CustomerService } from '../customer/customer.service';

@Injectable()
export class OfferingService {
    private static readonly logger = new Logger(OfferingService.name);
    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionService: DimensionsService,
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService
    ) {}

    async findAll({ businessID }): Promise<ReadOfferingResponseDTO> {
        const offeringIds = await this.InfluxService.getAllOfferingIds({ businessID });
        const errors = [];
        const results = await Promise.all(
            offeringIds.map(async ({ offeringId }) => {
                try {
                    const {
                        data: [createOfferingDto],
                    } = await this.findOne({ businessID, offeringId });
                    return createOfferingDto;
                } catch (error) {
                    if (error.status === 404) {
                        // If a subset of documents are missing then catch the error and continue
                        // This realistically should never happen, since we are gathering all the ids from the same DB, but you never know
                        errors.push(error.message);
                    } else {
                        throw error;
                    }
                }
            })
        );
        if (errors.length) {
            OfferingService.logger.log(`Errors occured in find all Offerings, likely some Ids were disconnected`);
            OfferingService.logger.error(errors);
        }
        const filtered = results.filter((r) => r);
        if (results.length && results.length > 0) {
            return { data: filtered, message: 'Found Offerings' };
        } else {
            return { data: [], message: 'No Offerings found' };
        }
    }

    async findOne({ businessID, offeringId }: ReadPricingDTO): Promise<ReadOfferingResponseDTO> {
        OfferingService.logger.log(`Finding a offering document: ${offeringId} for Business: ${businessID}`);
        const offeringDbModels = await this.InfluxService.getLatestOfferingConfig({ businessID, offeringId });

        if (offeringDbModels.length) {
            const readOfferingResponseData = await Promise.all(
                offeringDbModels.map(async (offerDbModel): Promise<ReadOfferingResponseData> => {
                    const entity = OfferingPackageEntity.dbModelToEntity(offerDbModel);
                    const { dimensionIds, ...rest } = new CreateOfferingDTO(entity);
                    const dimensionData = await Promise.all(
                        entity.dimensionIds.map(async (dimensionId) => {
                            const {
                                data: [dimensionInfo],
                            } = await this.dimensionService.findOne({ businessID, dimensionId });
                            return dimensionInfo;
                        })
                    );
                    if (rest.discount) {
                        rest.discount = /^(\d+|(\.\d+))(\.\d+)?%$/.test(rest.discount)
                            ? (parseFloat(rest.discount) / 100).toFixed(3)
                            : parseFloat(rest.discount).toFixed(3);
                    }
                    if (rest.prepaidCredit) {
                        if (/^[ \t]*[0-9]+\.?[0-9]+[ \t]*(\$|usd|USD)?$/.test(rest.prepaidCredit)) {
                            rest.prepaidCredit = rest.prepaidCredit.match(/[0-9]+\.?[0-9]+/)[0];
                        } else if (/^[ \t]*(\$|usd|USD)?[ \t]*[0-9]+\.?[0-9]+$/.test(rest.prepaidCredit)) {
                            rest.prepaidCredit = rest.prepaidCredit.match(/[0-9]+\.?[0-9]+/)[0];
                        }
                        rest.prepaidCredit = parseFloat(rest.prepaidCredit).toString();
                    }
                    return { dimensions: dimensionData, offeringId: entity.offeringId, ...rest };
                })
            );

            return { data: readOfferingResponseData, message: 'Found Offering' };
        } else {
            throw new NotFoundException(`No offering documents matching ID offeringId:${offeringId}`);
        }
    }
    async create(createOfferingDTO: CreateOfferingDTO): Promise<CreateOfferingResponse> {
        OfferingService.logger.log('Creating a new Offering', createOfferingDTO);
        if (createOfferingDTO.discount) {
            if (parseFloat(createOfferingDTO.discount) < 0 || parseFloat(createOfferingDTO.discount) > 100) {
                throw new NotAcceptableException(`Discount value is invalid: ${createOfferingDTO.discount}`);
            } else if (/^(\d+|(\.\d+))(\.\d+)?%$/.test(createOfferingDTO.discount)) {
                createOfferingDTO.discount = (parseFloat(createOfferingDTO.discount) / 100).toFixed(3);
            }
        }
        if (createOfferingDTO.prepaidCredit) {
            if (/^[ \t]*[0-9]+\.?[0-9]+[ \t]*(\$|usd|USD)?$/.test(createOfferingDTO.prepaidCredit)) {
                createOfferingDTO.prepaidCredit = createOfferingDTO.prepaidCredit.match(/[0-9]+\.?[0-9]+/)[0];
            } else if (/^[ \t]*(\$|usd|USD)?[ \t]*[0-9]+\.?[0-9]+$/.test(createOfferingDTO.prepaidCredit)) {
                createOfferingDTO.prepaidCredit = createOfferingDTO.prepaidCredit.match(/[0-9]+\.?[0-9]+/)[0];
            } else {
                throw new NotAcceptableException(
                    `Price is invalid: ${createOfferingDTO.prepaidCredit} should be valid price format: 9.99, $9.99, USD9.99, 9.99$, 9.99USD`
                );
            }
            createOfferingDTO.prepaidCredit = parseFloat(createOfferingDTO.prepaidCredit).toString();
        }
        const { dimensionIds = [], businessID } = createOfferingDTO;

        // Validate dimensions exist
        await Promise.all(
            dimensionIds.map(async (dimensionId) => this.dimensionService.findOne({ dimensionId, businessID }))
        );
        const { loadPoints } = this.InfluxService;
        const entity = new OfferingPackageEntity({
            businessID,
            currency: 'USD',
            ...createOfferingDTO,
            offeringId: randomUUID(),
        });
        const packageDbModel = OfferingPackageEntity.transformer(entity, this.InfluxService);
        OfferingService.logger.log(packageDbModel);
        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', packageDbModel);
        return { message: 'Loaded Offering Document and Dimensions', offeringId: entity.offeringId };
    }

    async update({
        offeringId,
        businessID,
        dimensionIds: updatedIdList,
        ...updatedFields
    }: UpdateOfferingDto): Promise<CreateOfferingResponse> {
        OfferingService.logger.log('Updating an Offering');
        console.log('inside the update function');
        const {
            data: [{ dimensions, ...rest }],
        } = await this.findOne({ offeringId, businessID });
        let dimensionIds = dimensions.map(({ dimensionId }) => dimensionId);
        if (updatedIdList?.length) {
            //Validating Dimensions exist

            await Promise.all(
                updatedIdList.map(async (dimensionId) => this.dimensionService.findOne({ dimensionId, businessID }))
            );
            const elements = dimensionIds.filter((dimensionId) => {
                const duplicateId = updatedIdList.find((updatedDimensionId) => dimensionId === updatedDimensionId);
                return !duplicateId;
            });

            dimensionIds = [...elements, ...updatedIdList];
        }
        const { loadPoints } = this.InfluxService;
        const entity = new OfferingPackageEntity({
            dimensionIds,
            ...rest,
            ...updatedFields,
            businessID,
            offeringId,
            currency: supportedCurrencies['USD'],
        });
        const packageDbModel = OfferingPackageEntity.transformer(entity, this.InfluxService);
        OfferingService.logger.log(packageDbModel);
        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', packageDbModel);
        return { message: 'Loaded Offering Document and Dimensions', offeringId: entity.offeringId };
    }
    async delete({ businessID, offeringId }: DeleteOfferingDTO): Promise<DeleteOfferingResponse> {
        OfferingService.logger.log(`Attempting to delete offering: ${offeringId} for ${businessID}`);
        const offeringDbModels = await this.InfluxService.getLatestOfferingConfig({ businessID, offeringId });
        try {
            const { data: customerIds } = await this.customerService.findAllCustomersWithOfferingId({
                businessID,
                offeringId,
            });
            if (customerIds.length) {
                throw new ConflictException(
                    `Cannot delete offering when they are attached to customers, remove customers from offerings before deleting. Current customerIds using the offering: ${customerIds.reduce(
                        (acc, { customerId }) => {
                            acc += `${customerId}   `;
                            return acc;
                        },
                        ''
                    )} `
                );
            }
        } catch (error) {
            if (error instanceof NotFoundException) {
                // Ignore
            } else {
                throw error;
            }
        }
        if (offeringDbModels.length) {
            const { loadPoints } = this.InfluxService;
            const entity = OfferingPackageEntity.dbModelToEntity(offeringDbModels[0]);
            entity.softDelete = true;
            entity.businessID = businessID;
            const points = OfferingPackageEntity.transformer(entity, this.InfluxService);
            OfferingService.logger.log('Points to delete', points);

            await loadPoints(`${process.env.STAGE}-config`, `meteringco`, points);

            return { message: 'Deleted Offering', offeringId: entity.offeringId };
        } else {
            throw new NotFoundException(`No offering documents matching ID offeringId:${offeringId}`);
        }
    }

    async findOfferingIdsByDimensionId({
        businessID,
        dimensionId,
    }: {
        businessID: string;
        dimensionId: string;
    }): Promise<{ data: Array<string>; message: string }> {
        OfferingService.logger.log(`Attempting to find offeringIds by dimensionId: ${dimensionId} for ${businessID}`);
        const dbModels = await this.InfluxService.getAllOfferingIdsByDimensionId({ businessID, dimensionId });
        if (dbModels.length) {
            const offeringIds = dbModels.map(({ offeringId }) => offeringId);
            return { data: offeringIds, message: 'Found offeringIds' };
        } else {
            throw new NotFoundException(`No offering documents matching dimensionId: ${dimensionId}`);
        }
    }
}
