import { Offering } from '../client/publicClient/offering';

describe('Offering CRUD', () => {
    test('Delete all offerings', async () => {
        const offerings: Offering[] = [];
        const offeringClient = new Offering();
        const response = await offeringClient.getAll();
        response.forEach((offeringMetadata) => {
            offerings.push(new Offering(offeringMetadata.offeringId));
        });

        await Promise.all(
            offerings.map(async (offering) => {
                try {
                    await offering.delete();
                } catch (e) {
                    console.debug(e);
                }
            })
        );
    });
});
