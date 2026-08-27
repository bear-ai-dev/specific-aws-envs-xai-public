import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { DeletedStripeAccountAssociationResponse, OnboardingDto, OnboardingResponseDTO } from './dto/onboarding.dto';
import { Stripe } from 'stripe';
import { SettingsService } from '../setting/settings.service';

@Injectable()
export class OnboardingService {
    private static readonly logger = new Logger(OnboardingService.name);
    constructor(private settingsService: SettingsService) {}
    async create({ businessID }: OnboardingDto): Promise<OnboardingResponseDTO> {
        const [{ stripeAccountId }] = await this.settingsService.findAll({ businessID });

        if (stripeAccountId) {
            throw new ConflictException(`Stripe Account already onboarded StripeAccountID: ${stripeAccountId}`);
        } else {
            const stripe = new Stripe(process.env.STRIPE_TOKEN, { apiVersion: '2022-08-01' });

            const account = await stripe.accounts.create({ type: 'standard' });
            // The response will include a URL. In the application layer this will be used to redirect the user to a stripe page where

            const accountLink = await stripe.accountLinks.create({
                account: account.id,
                refresh_url: 'https://app.meteringco.tech',
                return_url: 'https://app.meteringco.tech',
                type: 'account_onboarding',
            });
            try {
                OnboardingService.logger.log(
                    `Adding Setting information with stripe accountID: ${account.id}, BusinessID: ${businessID}`
                );
                await this.settingsService.update({ businessID, stripeAccountId: account.id });
            } catch (error) {
                OnboardingService.logger.error(
                    `Failed to link Stripe Account with user StripeAccount: ${stripeAccountId}`,
                    error
                );
                throw new InternalServerErrorException('Failed to link account to user, try again');
            }
            return {
                message: 'Stripe Account information for onboarding',
                data: [{ url: accountLink.url, expires: accountLink.expires_at }],
            };
        }
    }

    async remove({ businessID }): Promise<DeletedStripeAccountAssociationResponse> {
        const [{ stripeAccountId }] = await this.settingsService.findAll({ businessID });
        if (stripeAccountId) {
            const stripe = new Stripe(process.env.STRIPE_TOKEN, { apiVersion: '2022-08-01' });
            try {
                const { id, deleted } = await stripe.accounts.del(stripeAccountId);
                // Create a new entry in the ledger for the user, this time without the stripe account ID
                await this.settingsService.update({ stripeAccountId: null, businessID });
                return { id, deleted, message: 'Sucessfully deleted stripe connect association' };
            } catch (error) {
                OnboardingService.logger.error(`Failed to delete Stripe Account for business: ${businessID}`, error);
                throw new InternalServerErrorException('Failed to Delete Stripe Account for User, try again');
            }
        } else {
            OnboardingService.logger.log('No Stripe account associated with user');
            throw new NotFoundException('No Stripe account associated with user, cannot delete');
        }
    }
}
