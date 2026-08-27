import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { PrivateAPISettingsModule } from '../setting/settings.module';

@Module({
    controllers: [OnboardingController],
    providers: [OnboardingService],
    imports: [PrivateAPISettingsModule],
})
export class OnboardingModule {}
