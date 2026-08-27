export const getAwsClientConfig = (region: string, credentials?: any) => ({
    region,
    ...(credentials ? { credentials } : {}),
    ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
});
