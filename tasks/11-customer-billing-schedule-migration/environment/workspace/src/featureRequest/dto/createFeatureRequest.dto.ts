import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateFeatureRequestDto {
    /**
     * The name of the feature to be requested
     * @example KubernetesCPUBillingDimension
     */

    @IsString()
    @IsNotEmpty()
    public featureName: string;

    /**
     * The Amount of votes the associated with a single feature, should generally be 1 for each event, can be negative indicating a downvote for a feature
     * @default 1
     * @example 1
     */

    @IsNumber()
    @IsOptional()
    public votes?: number;

    /**
     * An Object containing arbitrary metadata, all fields will be saved as tags in db
     * @example {"myCoolThing": "1", "AnotherThing": "Somethingelse"}
     */
    @IsObject()
    @IsOptional()
    public metadata?: any;
}
