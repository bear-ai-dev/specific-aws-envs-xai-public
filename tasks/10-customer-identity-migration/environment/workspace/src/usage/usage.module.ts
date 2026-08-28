import { Module, forwardRef } from '@nestjs/common';
import { UsageService } from './usage.service';
import { PrivateAPIUsageController, UsageController } from './usage.controller';
import { InfluxModule } from '../influx/influx.module';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { PublicAPIServicesModule } from '../services/services.module';
import { PublicAPIOfferingModule } from '../offering/offering.module';

@Module({
    controllers: [UsageController],
    providers: [UsageService],
    exports: [UsageService],
    imports: [
        InfluxModule,
        forwardRef(() => MeasurementConfigModule),
        forwardRef(() => PublicAPIDimensionsModule),
        forwardRef(() => PublicAPIServicesModule),
        forwardRef(() => PublicAPIOfferingModule),
    ],
})
export class UsageModule {}

@Module({
    controllers: [PrivateAPIUsageController],
})
export class PrivateApiUsageModule extends UsageModule {}
