/* eslint-disable @typescript-eslint/no-var-requires */

const fetch = require('cross-fetch');
process.env.API_URL = 'https://api.qa.meteringco.tech';
process.env.STAGE = 'qa';
process.env.INTEGRATION_TEST_BUSINESS_ID = 'integrationTest';

const getAndSetToken = async () => {
    console.log('grabbing from auth0');
    const response = await fetch('https://auth.meteringco.tech/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.AUTH0_CLIENT_ID,
            client_secret: process.env.AUTH0_CLIENT_SECRET,
            audience: 'https://example1234.execute-api.us-east-1.amazonaws.com',
            grant_type: 'client_credentials',
        }),
    });

    const { access_token } = await response.json();
    // TODO: Set token in github and retrieve from there
    process.env.API_ACCESS_TOKEN = access_token;
    await fetch(`${process.env.API_URL}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subject: `${process.env.AUTH0_CLIENT_ID}@clients`,
            businessID: process.env.INTEGRATION_TEST_BUSINESS_ID,
        }),
    });
};
module.exports = async () => {
    try {
        await getAndSetToken();
    } catch (error) {
        console.log('Error', error);
    }
};
