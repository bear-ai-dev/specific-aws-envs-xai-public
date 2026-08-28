import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrivateAPIOfferingModule, PublicAPIOfferingModule } from './offering/offering.module';
import { BillingModule } from './billing/billing.module';
import { InfluxModule } from './influx/influx.module';
import { PrivateAPIInvoicesModule } from './invoice/invoices.module';

import { AuthzModule } from './authz/authz.module';
import { PrivateAPIServicesModule, PublicAPIServicesModule } from './services/services.module';
import { MeasurementModule } from './measurement/measurement.module';
import { PrivateAPIDimensionsModule, PublicAPIDimensionsModule } from './dimensions/dimensions.module';
import { MargincalcModule } from './margincalc/margincalc.module';
import { FeatureRequestModule } from './featureRequest/featureRequest.module';
import { AgentMeasurementModule } from './agent-measurement/agent-measurement.module';
import { UsersModule } from './users/users.module';
import { PrivateAPICustomerModule, PublicAPICustomerModule } from './customer/customer.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { TransformerModule } from './transformer/transformer.module';
import { SchedulerModule } from './scheduler/scheduler.module';

import { EbsVolumeDataGathererModule } from './microservices/ebsVolumeDataGatherer/ebsvolumeDataGatherer.module';
import { EbsSnapshotDataGathererModule } from './microservices/ebsSnapshotDataGatherer/ebsSnapshotDataGatherer.module';
import { MeasurementConfigModule } from './measurement-config/measurement-config.module';
import { UsageModule } from './usage/usage.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CostModule } from './cost/cost.module';
import { InstanceUptimeModule } from './microservices/instanceUpTime/instanceUptime.module';
import { ReservedInstanceModule } from './microservices/reservedInstanceHistory/reservedInstance.module';
import { PrivateAPISettingsModule } from './setting/settings.module';
import { TaxModule } from './tax/tax.module';
import { PrivateAPIAnalyticsModule } from './analytics/analytics.module';
import { PaymentModule } from './payment/payment.module';
import { PrivateInboxModule } from './inbox/inbox.module';
import { AuditModule } from './audit/audit.module';
import { Ec2InstanceDataGathererModule } from './microservices/ec2InstanceDataGatherer/ec2InstanceDataGatherer.module';
import { Ec2EgressDataGathererModule } from './microservices/ec2EgressDataGatherer/ec2EgressDataGatherer.module';

@Module({
    imports: [
        ConfigModule.forRoot(),
        PublicAPIOfferingModule,
        PrivateAPIOfferingModule,
        BillingModule,
        InfluxModule,
        PrivateAPIInvoicesModule,
        AuthzModule,
        PublicAPIServicesModule,
        PrivateAPIServicesModule,
        MeasurementModule,
        PublicAPIDimensionsModule,
        PrivateAPIDimensionsModule,
        MargincalcModule,
        FeatureRequestModule,
        AgentMeasurementModule,
        UsersModule,
        PublicAPICustomerModule,
        PrivateAPICustomerModule,
        OnboardingModule,
        TransformerModule,
        SchedulerModule,
        BullModule.forRoot({
            redis: {
                host: process.env.REDIS_URL ? process.env.REDIS_URL : 'localhost',
                port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6337,
                password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : '',
            },
        }),
        EbsVolumeDataGathererModule,
        Ec2InstanceDataGathererModule,
        EbsSnapshotDataGathererModule,
        InstanceUptimeModule,
        MeasurementConfigModule,
        ReservedInstanceModule,
        UsageModule,
        CostModule,
        ScheduleModule.forRoot(),
        PrivateAPISettingsModule,
        TaxModule,
        PrivateAPIAnalyticsModule,
        PaymentModule,
        PrivateInboxModule,
        AuditModule,
        Ec2EgressDataGathererModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
