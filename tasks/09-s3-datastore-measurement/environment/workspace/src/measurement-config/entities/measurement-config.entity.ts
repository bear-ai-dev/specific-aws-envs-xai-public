import { Point } from '@influxdata/influxdb-client';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, Validate } from 'class-validator';
import { aggregationType } from '../../dimensions/entities/dimensions.entity';

import { InfluxService } from '../../influx/influx.service';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { measurementMode } from '../dto/create-measurement-config.dto';
import { ReadMeasurementResponseData } from '../dto/read-measurement-config.dto';
import { ValidIAMRole } from '../../setting/dto/customIAMAuthorizer';
import { S3 } from '@aws-sdk/client-s3';

/**
 * @author Daniel Wasserlauf <daniel.wasserlauf@meteringco.tech>
 *
 * @enum The list of supported cloud platforms
 * @example "AWS"
 */
export enum supportedCloudPlatforms {
    aws = 'aws',
}
export enum SupportedResources {
    ebssnapshot = 'ebssnapshot',
    ebs = 'ebs',
    k8sPod = 'k8spod',
    ec2 = 'ec2',
    ec2Egress = 'ec2egress',
    /**
     * For internal use only
     */
    usageData = 'usageData',
}
export enum SupportedAgentHostingPlatforms {
    eks = 'k8spod',
}

export const supportedResourceHostingPlatformAggregationTypeMap = {
    [SupportedResources.k8sPod]: aggregationType.podUptime,
    [SupportedResources.ebs]: aggregationType.ebsVolume,
    [SupportedResources.ec2]: aggregationType.standard,
    [SupportedResources.ec2Egress]: aggregationType.standard,
    [SupportedResources.ebssnapshot]: aggregationType.ebsSnapshot,
    [SupportedAgentHostingPlatforms.eks]: aggregationType.podUptime,
};

export class IAMAccessCredentials {
    /**
     * The IAM role created by SaaS business and can be by MeteringCo AWS account to measure usage.
     * <br><br>
     * Example "arn:aws:iam::214826386939:role/meteringco-scraper"
     */
    @ValidIAMRole('externalId', {
        message: 'Unable to authenticate with the IAM role and External ID provided. Please double check',
    })
    @IsNotEmpty()
    @ApiProperty()
    public iamRoleArn: string;

    /**
     * The Optional ExternalID associated with the IAM role.
     */
    @IsString()
    @IsOptional()
    @ApiProperty()
    public externalId?: string;

    constructor(access) {
        if (access) {
            const { iamRoleArn, externalId } = access;
            this.externalId = externalId;
            this.iamRoleArn = iamRoleArn;
        }
    }
}

/**
 * @author Daniel Wasserlauf <daniel.wasserlauf@meteringco.tech>
 *
 * @enum The list of Supported AWS resources
 * @example "EBS"
 */

export class MeasurementConfigEntity {
    @ApiHideProperty()
    public static _measurement = 'MeasurementConfiguration';

    /**
     * The measurement method.
     * See <a href="https://docs.meteringco.tech/measure-usage-and-collect-data/measure-and-collect-usage-data-at-production-scale">Measure and Collect Usage Data at Production Scale</a> for more information.
     * <br><br>
     * Example `"agentBased"`
     */
    public measurementMode: measurementMode;

    /**
     * Unique identifier assigned by MeteringCo.
     * <br><br>
     * Example `"de388932-a7e1-11ed-afa1-0242ac120002"`
     */
    @ApiProperty()
    public measurementId: string;

    /**
     * Configurations of the measurement
     */
    public measurementConfiguration:
        | InfrastructureAccessInformation
        | AgentAccessInformation
        | DatastoreAccessInformation;

    @IsString()
    @IsOptional()
    @ApiHideProperty()
    public businessID?: string;

    /**
     * The subject associated with the user
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public subject: CreateUserDto['subject'];

    /**
     * The value indicating if a measurement configuration is soft deleted
     * */
    @ApiHideProperty()
    public softDelete?: boolean;

    public measurementName: string;
    constructor({
        measurementMode: argumentMeasurementMode,
        measurementConfiguration,
        measurementId,
        businessID,
        measurementName,
        subject,
    }: MeasurementConfigEntity) {
        this.measurementMode = argumentMeasurementMode;
        if (argumentMeasurementMode.toLowerCase() === measurementMode.infrastructureBased.toLowerCase()) {
            this.measurementConfiguration = new InfrastructureAccessInformation(
                measurementConfiguration as InfrastructureAccessInformation
            );
        } else if (argumentMeasurementMode.toLowerCase() === measurementMode.agentBased.toLowerCase()) {
            this.measurementConfiguration = new AgentAccessInformation(
                measurementConfiguration as AgentAccessInformation
            );
        } else if (argumentMeasurementMode.toLowerCase() === measurementMode.datastoreBased.toLowerCase()) {
            this.measurementConfiguration = new DatastoreAccessInformation({
                ...measurementConfiguration,
                businessID,
            } as DatastoreAccessInformation);
        }
        this.measurementId = measurementId;
        this.businessID = businessID;
        this.subject = subject;
        this.measurementName = measurementName;
    }

    static transformer(measurementConfigEntity: MeasurementConfigEntity, influxService: InfluxService): Array<Point> {
        const measurementConfigEntityPoint = influxService.getPoint(MeasurementConfigEntity._measurement);
        const {
            measurementMode: argumentMeasurementMode,
            measurementConfiguration,
            measurementId,
            businessID,
            subject,
            softDelete,
            measurementName,
        } = measurementConfigEntity;

        measurementConfigEntityPoint.stringField('measurementMode', argumentMeasurementMode);
        measurementConfigEntityPoint.tag('measurementId', measurementId);

        measurementConfigEntityPoint.tag('businessID', businessID);
        measurementConfigEntityPoint.tag('subject', subject);
        measurementConfigEntityPoint.tag('measurementName', measurementName);
        if (softDelete) {
            measurementConfigEntityPoint.tag('softDelete', 'deleted');
        }
        if (argumentMeasurementMode.toLowerCase() === measurementMode.infrastructureBased.toLowerCase()) {
            const completedPoint = InfrastructureAccessInformation.transformer(
                measurementConfiguration as InfrastructureAccessInformation,
                measurementConfigEntityPoint
            );

            return [completedPoint];
        } else if (argumentMeasurementMode.toLowerCase() === measurementMode.agentBased.toLowerCase()) {
            const completedPoint = AgentAccessInformation.transformer(
                measurementConfiguration as AgentAccessInformation,
                measurementConfigEntityPoint
            );

            return [completedPoint];
        } else if (argumentMeasurementMode.toLowerCase() === measurementMode.datastoreBased.toLowerCase()) {
            console.log('DB  transformer', measurementConfiguration);
            const completedPoint = DatastoreAccessInformation.transformer(
                measurementConfiguration as DatastoreAccessInformation,
                measurementConfigEntityPoint
            );

            return [completedPoint];
        } else {
            throw new InternalServerErrorException('Failed to Create Entity and store Measurmenent in DB');
        }
    }
    static dbModelToEntity({
        measurementId,
        _value,
        businessID,
        measurementName,
        subject,
        ...rest
    }: {
        [x: string]: any;
    }) {
        if (_value && _value.toLowerCase() === measurementMode.infrastructureBased.toLowerCase()) {
            const infrastructureAccessInformation = InfrastructureAccessInformation.dbModelToEntity({ ...rest });

            return new MeasurementConfigEntity({
                measurementId,
                measurementMode: _value,
                businessID,
                measurementConfiguration: infrastructureAccessInformation,
                subject,
                measurementName,
            });
        } else if (_value && _value.toLowerCase() === measurementMode.agentBased.toLowerCase()) {
            const agentAccessInformation = AgentAccessInformation.dbModelToEntity({
                ...rest,
            });
            return new MeasurementConfigEntity({
                measurementId,
                measurementMode: _value,
                businessID,
                measurementConfiguration: agentAccessInformation,
                subject,
                measurementName,
            });
        } else if (_value && _value.toLowerCase() === measurementMode.datastoreBased.toLowerCase()) {
            const dbAccessInformation = DatastoreAccessInformation.dbModelToEntity({
                ...rest,
            });
            return new MeasurementConfigEntity({
                measurementId,
                measurementMode: _value,
                businessID,
                measurementConfiguration: dbAccessInformation,
                subject,
                measurementName,
            });
        }
    }

    static determineAggregationTypeForMeasurement({
        measurementConfiguration: measurementConfig,
    }: MeasurementConfigEntity | ReadMeasurementResponseData) {
        if (measurementConfig instanceof InfrastructureAccessInformation) {
            return supportedResourceHostingPlatformAggregationTypeMap[measurementConfig.resourceType];
        } else if (measurementConfig instanceof AgentAccessInformation) {
            return supportedResourceHostingPlatformAggregationTypeMap[measurementConfig.hostingPlatform];
        } else {
            throw new InternalServerErrorException('Couldnt create Aggregation Schedule for Dimension');
        }
    }
    static async setupAccessIfRequired(measurementConfig: MeasurementConfigEntity) {
        if (measurementConfig.measurementMode.toLowerCase() === measurementMode.datastoreBased.toLowerCase()) {
            console.log('setting up access');
            return DatastoreAccessInformation.setupAccess(
                measurementConfig.measurementConfiguration as DatastoreAccessInformation
            );
        } else {
            return Promise.resolve();
        }
    }
}

export class MeteringCoFilters {
    /**
     *
     * The string containing the key associated with a metadata tag.
     * This could be an tag on AWS infrastructure, or a label on a kubernetes pod
     */
    @IsString()
    @IsNotEmpty()
    public key: string;
    /**
     *
     * The string containing the value associated with a metadata tag.
     * This could be an tag on AWS infrastructure, or a label on a kubernetes pod
     */
    @IsArray()
    @IsNotEmpty()
    public values: Array<string>;
}
export class InfrastructureAccessInformation extends IAMAccessCredentials {
    /**
     * Cloud infrastructure platform
     */
    @Matches(
        `^${Object.values(supportedCloudPlatforms)
            .filter((v) => typeof v !== 'number')
            .join('|')}$`,
        'i'
    )
    @IsNotEmpty()
    @ApiProperty({ enum: supportedCloudPlatforms, isArray: false, example: 'aws' })
    public cloudPlatform: supportedCloudPlatforms;

    /**
     *
     * Supported region of the infrastructure
     *
     * Example `"us-east-1"`
     */
    @IsString()
    @IsNotEmpty()
    @ApiProperty()
    public region: string;

    /**
     * Underlying resource type which MeteringCo measures usage for.
     *
     */
    @Matches(
        `^${Object.values(SupportedResources)
            .filter((v) => typeof v !== 'number')
            .join('|')}$`,
        'i'
    )
    @ApiProperty({
        enum: SupportedResources,
        isArray: false,
    })
    public resourceType: SupportedResources;

    constructor(accessInfo) {
        super({ ...accessInfo });
        if (accessInfo) {
            const { cloudPlatform, region, resourceType } = accessInfo;
            this.cloudPlatform = cloudPlatform;

            this.region = region;
            this.resourceType = resourceType;
        }
    }
    public static transformer(
        infrastructureAccessInformation: InfrastructureAccessInformation,
        influxPoint: Point
    ): Point {
        if (infrastructureAccessInformation) {
            const { iamRoleArn, externalId } = infrastructureAccessInformation;

            influxPoint.tag('iamRoleArn', iamRoleArn);
            if (externalId) {
                influxPoint.tag('externalId', externalId);
            }

            influxPoint.tag('cloudPlatform', infrastructureAccessInformation.cloudPlatform.toLowerCase());
            influxPoint.tag('region', infrastructureAccessInformation.region);
            if (infrastructureAccessInformation.resourceType) {
                influxPoint.tag('resourceType', infrastructureAccessInformation.resourceType.toLowerCase());
            }

            return influxPoint;
        }
    }

    public static dbModelToEntity({
        cloudPlatform,
        region,
        resourceType,
        iamRoleArn,
        externalId = '',
    }: {
        [x: string]: any;
    }) {
        return new InfrastructureAccessInformation({
            cloudPlatform: cloudPlatform.toLowerCase(),
            region,
            resourceType: resourceType,
            iamRoleArn,
            externalId,
        });
    }
}
export enum SupportedDatastores {
    s3 = 's3',
}
/**
 *
 * This Class represents the access information and control data structure for Datastore based Measurement solutions
 * Specifically this is the access information needed for connectors inside of Confluent Cloud to pull data from a clients env.
 * There are many different connectors with different access and control needs.
 * For example a MySQL connector is not the same as a Kinesis Connector
 * */
export class DatastoreAccessInformation {
    /**
     * Underlying resource type which meteringco connects to. Default is s3.
     *
     */
    @Matches(
        `^${Object.values(SupportedDatastores)
            .filter((v) => typeof v !== 'number')
            .join('|')}$`,
        'i'
    )
    @IsOptional()
    @ApiProperty({
        enum: SupportedDatastores,
        isArray: false,
        required: false,
        examples: ['s3'],
    })
    public datastoreType?: SupportedDatastores;

    /**
     *
     * Whether meteringco is hosting the ingestion endpoint, or it is hosted by the client. Optional, default is `true`.
     * @example 'true'
     */
    @IsString()
    @IsOptional()
    public meteringcoHosted?: 'true';

    /**
     *
     * What is the cloud environment associated with the ingestion endpoint. Optional, default is `aws`.
     * @example "aws"
     */
    @IsEnum(supportedCloudPlatforms)
    @IsOptional()
    public hostedCloud?: supportedCloudPlatforms;

    /**
     * The Unqiue ID for the cloud env where the resource is hosted. Required.
     * @example "623673123435"
     */
    @IsString()
    @IsNotEmpty()
    public cloudId: string;

    @ApiHideProperty()
    @IsOptional()
    public businessID: string;

    constructor(datastoreAccessInformation: DatastoreAccessInformation) {
        if (datastoreAccessInformation) {
            const { cloudId, hostedCloud, meteringcoHosted, datastoreType, businessID } = datastoreAccessInformation;
            this.cloudId = cloudId;
            this.hostedCloud = hostedCloud ? hostedCloud : supportedCloudPlatforms.aws;
            this.meteringcoHosted = meteringcoHosted ? meteringcoHosted : 'true';
            this.datastoreType = datastoreType ? datastoreType : SupportedDatastores.s3;
            this.businessID = businessID;
        }
    }

    public static transformer(datastoreAccessInformation: DatastoreAccessInformation, influxPoint: Point) {
        if (datastoreAccessInformation) {
            const { datastoreType: supportedDbs, meteringcoHosted, hostedCloud, cloudId } = datastoreAccessInformation;
            if (supportedDbs) influxPoint.tag('supportedDbs', supportedDbs);
            if (meteringcoHosted) influxPoint.tag('meteringcoHosted', meteringcoHosted);
            if (hostedCloud) influxPoint.tag('hostedCloud', hostedCloud);
            if (cloudId) influxPoint.tag('cloudId', cloudId);
        }
        return influxPoint;
    }

    public static dbModelToEntity({
        datastoreType,
        meteringcoHosted,
        hostedCloud,
        cloudId,
        businessID,
    }: {
        [x: string]: any;
    }) {
        return new DatastoreAccessInformation({
            datastoreType,
            meteringcoHosted,
            hostedCloud,
            cloudId,
            businessID,
        });
    }
    public static async setupAccess(dbAccessInformation: DatastoreAccessInformation) {
        const { meteringcoHosted, cloudId, datastoreType, businessID } = dbAccessInformation;

        if (meteringcoHosted && datastoreType === SupportedDatastores.s3) {
            try {
                // Add the cloudId as a root account on the policy of the S3 bucket, two hardcoded buckets for now: meteringco-usage-record-dlq-bucket and meteringco-usage-record-dump-bucket

                // Get the current policy of the bucket
                const s3 = new S3({});
                const params = {
                    Bucket: `${process.env.DB_MEASUREMENT_BUCKET_NAME}`,
                };
                const policy = await s3.getBucketPolicy(params);
                const policyJson = JSON.parse(policy.Policy);
                const statement = policyJson.Statement;
                const rootAccount = {
                    Sid: `RootAccount-${businessID}`,
                    Effect: 'Allow',
                    Principal: {
                        AWS: `arn:aws:iam::${cloudId}:root`,
                    },
                    Action: ['s3:GetObject', 's3:PutObject'],
                    Resource: [`arn:aws:s3:::${process.env.DB_MEASUREMENT_BUCKET_NAME}/${businessID}/*`],
                };
                statement.push(rootAccount);
                const newPolicy = { ...policyJson };
                newPolicy.Statement = statement;
                const newParams = {
                    Bucket: `${process.env.DB_MEASUREMENT_BUCKET_NAME}`,
                    Policy: JSON.stringify(newPolicy),
                };
                await s3.putBucketPolicy(newParams);
                // Same for DLQ
                const dlqParams = {
                    Bucket: `${process.env.DB_MEASUREMENT_DLQ_BUCKET_NAME}`,
                };
                const dlqPolicy = await s3.getBucketPolicy(dlqParams);
                const dlqPolicyJson = JSON.parse(dlqPolicy.Policy);
                const dlqStatement = dlqPolicyJson.Statement;
                const rootAccountForDLQ = {
                    Sid: `RootAccount-${businessID}`,
                    Effect: 'Allow',
                    Principal: {
                        AWS: `arn:aws:iam::${cloudId}:root`,
                    },
                    Action: ['s3:GetObject'], // Only need read for DLQ
                    Resource: [`arn:aws:s3:::${process.env.DB_MEASUREMENT_DLQ_BUCKET_NAME}/${businessID}/*`],
                };
                dlqStatement.push(rootAccountForDLQ);
                const newDLQPolicy = { ...dlqPolicyJson };
                newDLQPolicy.Statement = dlqStatement;
                const newDLQParams = {
                    Bucket: `${process.env.DB_MEASUREMENT_DLQ_BUCKET_NAME}`,
                    Policy: JSON.stringify(newDLQPolicy),
                };
                await s3.putBucketPolicy(newDLQParams);
            } catch (e) {
                if (e?.Code === 'MalformedPolicy') {
                    throw new BadRequestException(`CloudId: ${cloudId} is invalid`);
                } else {
                    throw e;
                }
            }
        }
    }
}

export class AgentAccessInformation extends IAMAccessCredentials {
    /**
     * Hosting platform of SaaS application
     *
     */
    @Matches(
        `^${Object.values(SupportedAgentHostingPlatforms)
            .filter((v) => typeof v !== 'number')
            .join('|')}$`,
        'i'
    )
    @IsNotEmpty()
    @ApiProperty({ enum: SupportedAgentHostingPlatforms, isArray: false, example: 'eks' })
    public hostingPlatform: SupportedAgentHostingPlatforms;

    constructor(agentAccessInformation: AgentAccessInformation) {
        super({ ...agentAccessInformation });
        if (agentAccessInformation) {
            const { iamRoleArn, externalId, hostingPlatform } = agentAccessInformation;
            this.iamRoleArn = iamRoleArn;
            this.externalId = externalId;
            this.hostingPlatform = hostingPlatform;
        }
    }

    public static transformer(agentAccessInformation: AgentAccessInformation, influxPoint: Point): Point {
        if (agentAccessInformation) {
            const { iamRoleArn, externalId, hostingPlatform } = agentAccessInformation;

            influxPoint.tag('iamRoleArn', iamRoleArn);
            if (externalId) {
                influxPoint.tag('externalId', externalId);
            }
            if (hostingPlatform) {
                influxPoint.tag('hostingPlatform', hostingPlatform.toLowerCase());
            } else {
                influxPoint.tag('hostingPlatform', '');
            }

            return influxPoint;
        }
        return influxPoint;
    }

    public static dbModelToEntity({ iamRoleArn, externalId = '', hostingPlatform }: { [x: string]: any }) {
        let parsedHostingPlatform;
        if (hostingPlatform) {
            parsedHostingPlatform = hostingPlatform.toLowerCase();
        }
        return new AgentAccessInformation({
            iamRoleArn,
            externalId,
            hostingPlatform: parsedHostingPlatform,
        });
    }
}

export class APIAccessInformation {
    public static transformer(aPIAccessInformation: APIAccessInformation, influxPoint: Point): Point {
        return influxPoint;
    }
}
