import { Analytics } from '../client/privateClient/analytics';
import { Setting } from '../client/privateClient/settings';
import { sleep } from '../utils/utils';
import { ANALYTICS_PARAMETERS_INPUT } from './analyticsParameters.integration.input';

describe('Analytics CRUD', () => {
    test.concurrent.each(ANALYTICS_PARAMETERS_INPUT)(
        'Get all analytics should be defined given different parameter combinations',
        async (params) => {
            const res = await Setting.update({
                cloudIAM: { iamRoleArn: 'arn:aws:iam::647662420899:role/meteringco-read-only' },
            });
            sleep(2000);
            const response = await Analytics.getAll(params);
            expect(response).toEqual(expect.any(Array));
        }
    );
});
