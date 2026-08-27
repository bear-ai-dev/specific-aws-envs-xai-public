import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PublicAPIOfferingModule } from './offering/offering.module';
import { PublicAPIServicesModule } from './services/services.module';
import { PublicAPICustomerModule } from './customer/customer.module';
import { BillingModule } from './billing/billing.module';
import { MeasurementConfigModule } from './measurement-config/measurement-config.module';
import { PublicAPIDimensionsModule } from './dimensions/dimensions.module';
import {
    AgentAccessInformation,
    InfrastructureAccessInformation,
} from './measurement-config/entities/measurement-config.entity';
import { UsageModule } from './usage/usage.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    const config = new DocumentBuilder()
        .setTitle('MeteringCo API')
        // .setDescription('For user documentation of the platform, please visit https://docs.meteringco.tech.')
        .setDescription(
            `
For developer documentation of the platform, please visit https://docs.meteringco.tech.

## Authentication
MeteringCo API supports **bearer token** as the authentication method.
Steps to set up authentication:
1. Sign up with MeteringCo platform and get **client id** and **client secret**.
2. Make a POST request to the auth endpoint \`https://auth.meteringco.tech/oauth/token\` with the following body:
\`\`\`json
{
        audience: 'https://example1234.execute-api.us-east-1.amazonaws.com',
        grant_type: 'client_credentials',
        client_id: <your client id>,
        client_secret: <your client secret>
}
\`\`\`
3. Use the access token in the response to make requests to the MeteringCo API. Here is an example of the response:
\`\`\`json
{
        data: {
            access_token: <your access token>,
            expires_in: 86400,
            token_type: 'Bearer'
        }
}
\`\`\`
4. To use MeteringCo API, add in the header of your request:
\`\`\`json
{
        Authorization: "Bearer <your access token>"
}
\`\`\`

## API Endpoints
MeteringCo API has the following endpoints:
- Sandbox Environment API: \`https://api.int.meteringco.tech\`
- Product Environment API: \`https://api.prod.meteringco.tech\`
        `
        )
        .setVersion('v1.10')
        .addTag('Usage', 'Measure and collect usage data.')
        .addTag('Dimensions', 'Manage dimensions in MeteringCo.')
        .addTag('Offerings', 'Manage offerings in MeteringCo.')
        .addTag('Customers', 'Manage customers in MeteringCo.')
        .addTag('Services', 'Manage services in MeteringCo.')
        .addTag('Measurements', 'Manage measurements in MeteringCo.')
        .addServer('https://api.int.meteringco.tech', 'Sandbox Environment API')
        .addServer('https://api.prod.meteringco.tech', 'Product Environment API')
        .addBearerAuth(
            {
                type: 'oauth2',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                in: 'Header',
                description: 'Use bearer token to authenticate `Bearer <your access token>`',
            },
            'bearer'
        )
        .build();
    const document = SwaggerModule.createDocument(app, config, {
        include: [
            PublicAPIServicesModule,
            PublicAPIOfferingModule,
            PublicAPIDimensionsModule,
            MeasurementConfigModule,
            PublicAPICustomerModule,
            UsageModule,
        ],
    });
    writeFileSync('./docs/open-api-public-spec.json', JSON.stringify(document, null, 2));

    // For some reason the app doesn't want to close so we need to manually call app.close, I believe there may be some service which cannot initalize underneath (likely redis and bullmq)
    await app.close();
    console.log('finished!');
}
bootstrap();
