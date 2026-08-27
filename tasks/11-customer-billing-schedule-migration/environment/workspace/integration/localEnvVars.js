/* eslint-disable @typescript-eslint/no-var-requires */

const fetch = require('cross-fetch');
const { promises } = require('fs');

process.env.API_URL = 'http://localhost:3000';
process.env.STAGE = 'local';
process.env.INTEGRATION_TEST_BUSINESS_ID = 'integrationTest';
process.env.INFLUX_URL = 'http://localhost:8086';

const MS_CONVERSION_FACTOR = 1000;
const TEN_SECONDS = 10000;
const {
    client_id,
    client_secret,
    influx_token,
    test_1_aws_account_id,
    test_1_aws_access_key_id,
    test_1_aws_secret_access_key,
    test_2_aws_account_id,
    test_2_aws_access_key_id,
    test_2_aws_secret_access_key,
} = require('./secret.json');

process.env.TEST_1_ACCOUNT_ID = test_1_aws_account_id;
process.env.TEST_1_AWS_ACCESS_KEY_ID = test_1_aws_access_key_id;
process.env.TEST_1_AWS_SECRET_ACCESS_KEY = test_1_aws_secret_access_key;
process.env.TEST_2_ACCOUNT_ID = test_2_aws_account_id;
process.env.TEST_2_AWS_ACCESS_KEY_ID = test_2_aws_access_key_id;
process.env.TEST_2_AWS_SECRET_ACCESS_KEY = test_2_aws_secret_access_key;
const getAndSetTokenAndUser = async () => {
    // Need to set this up and get it from another developer
    console.log('grabbing from auth0');
    const response = await fetch('https://auth.meteringco.tech/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            client_id,
            client_secret,
            audience: 'https://example1234.execute-api.us-east-1.amazonaws.com',
            grant_type: 'client_credentials',
        }),
    });

    const { expires_in, access_token } = await response.json();

    const futureExpireTime = new Date(Date.now() + expires_in * MS_CONVERSION_FACTOR);
    await promises.writeFile(
        './integration/token_cache.json',
        JSON.stringify({ access_token, expires_in: futureExpireTime })
    );
    process.env.API_ACCESS_TOKEN = access_token;

    // set user
    await fetch(`${process.env.API_URL}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: `${client_id}@clients`, businessID: process.env.INTEGRATION_TEST_BUSINESS_ID }),
    });
};
module.exports = async () => {
    try {
        // try to read file
        const cache = require('./token_cache.json');
        process.env.INFLUX_TOKEN = influx_token;
        // Only use the data in the cache if its not 10 seconds away from expiring
        const cacheDate = new Date(cache.expires_in);
        if (cache.access_token && cacheDate.getTime() > Date.now() + TEN_SECONDS) {
            process.env.API_ACCESS_TOKEN = cache.access_token;
            await fetch(`${process.env.API_URL}/users`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subject: `${client_id}@clients`,
                    businessID: process.env.INTEGRATION_TEST_BUSINESS_ID,
                }),
            });
        } else {
            console.log('cache miss');
            await getAndSetTokenAndUser();
        }
    } catch (error) {
        console.log('Error', error);
    }
};
