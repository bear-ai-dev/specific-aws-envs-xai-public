import { Module, forwardRef } from '@nestjs/common';
import { OfferingService } from './offering.service';
import { PrivateAPIOfferingController, PublicAPIOfferingController } from './offering.controller';
import { InfluxModule } from '../influx/influx.module';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { OfferingIdExistsRule } from './dto/offeringIdExists';
import { PrivateAPICustomerModule } from '../customer/customer.module';

@Module({
    controllers: [PublicAPIOfferingController],
    providers: [OfferingService, OfferingIdExistsRule],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => PublicAPIDimensionsModule),
        forwardRef(() => PrivateAPICustomerModule),
    ],
    exports: [OfferingService],
})
export class PublicAPIOfferingModule {}

@Module({
    controllers: [PrivateAPIOfferingController],
})
export class PrivateAPIOfferingModule extends PublicAPIOfferingModule {}
