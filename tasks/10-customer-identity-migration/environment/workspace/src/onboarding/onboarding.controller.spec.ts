import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PrivateAPISettingsModule } from '../setting/settings.module';

describe('OnboardingController', () => {
    let controller: OnboardingController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [OnboardingController],
            providers: [OnboardingService],
            imports: [PrivateAPISettingsModule],
        }).compile();

        controller = module.get<OnboardingController>(OnboardingController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
