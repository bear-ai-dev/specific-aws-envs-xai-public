import { resetSettingsInput, sampleBasicSettings, Setting } from '../client/privateClient/settings';

describe('Settings CRUD', () => {
    test('Set basic settings', async () => {
        const data = await Setting.update(sampleBasicSettings);
        expect(data).toEqual(new Setting(sampleBasicSettings));
    });

    test('cloud IAM should be checked and fail if given a role MeteringCo cannot assume', async () => {
        const res = await Setting.update({ cloudIAM: { iamRoleArn: 'wow a fake role', externalId: 'foobar' } });
        expect(res.statusCode).toEqual(400);
        expect(res.message[0]).toEqual(expect.stringContaining('IAM'));
    });
});
