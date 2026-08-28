export default {
    clients: [
        {
            saasBusinessID: 'MyCorpName',
            cloudAccount: 'AWS',
            accessCredentials: {
                iamRole: 'arn:aws:iam::839145551229:role/meteringco-read-only',
                externalId: 'externalIdTestAbc123',
            },
            pricingConfiguration: {
                SaasClientTags: ['MyCoolService', 'AnotherClient', 'abcCorp'],
                dimensions: ['cpuUtilization'],
                priceDimensionInfo: {
                    cpuUtilization: {
                        price: 0.7,
                        timeInterval: '60', // Interval for billing in minutes (we may want to restrict the client to a subset of times, like 1 hr , 1 day, 15 minutes, 30 minutes)
                    },
                },
            },
        },
        {
            saasBusisnessID: 'AzureTesting',
            cloudAccount: 'Azure',
            accessCredentials: { iamRole: '' },
            pricingConfiguration: {
                SaasClientTags: ['MyCoolService', 'AnotherClient', 'abc12345-1235-34'],
                dimensions: ['cpuUtilization'],
                priceDimensionInfo: {
                    cpuUtilization: {
                        price: 0.7,
                    },
                },
            },
        },
    ],
};
