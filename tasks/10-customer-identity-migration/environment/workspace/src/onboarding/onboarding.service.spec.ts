import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { PrivateAPISettingsModule } from '../setting/settings.module';

describe('OnboardingService', () => {
    let service: OnboardingService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [OnboardingService],
            imports: [PrivateAPISettingsModule],
        }).compile();

        service = module.get<OnboardingService>(OnboardingService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
