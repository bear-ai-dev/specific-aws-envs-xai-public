import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import serverlessExpress from '@vendia/serverless-express';
import { Callback, Context, Handler } from 'aws-lambda';
import { TimingInterceptor } from './interceptors/timing.interceptor';
import { BusinessIDInterceptor } from './interceptors/businessID.interceptor';
import { UsersService } from './users/users.service';
import { InfluxService } from './influx/influx.service';

let server: Handler;

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalInterceptors(
        new TimingInterceptor(),
        new BusinessIDInterceptor(new UsersService(new InfluxService()))
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
    console.log('Starting a Lambda Application');
    const expressApp = app.getHttpAdapter().getInstance();
    return serverlessExpress({ app: expressApp });
}
export const handler: Handler = async (event: any, context: Context, callback: Callback) => {
    server = server ?? (await bootstrap());

    return server(event, context, callback);
};
