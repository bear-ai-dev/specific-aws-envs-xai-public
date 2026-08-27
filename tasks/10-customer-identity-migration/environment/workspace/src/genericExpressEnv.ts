import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { TimingInterceptor } from './interceptors/timing.interceptor';
import { BusinessIDInterceptor } from './interceptors/businessID.interceptor';
import { UsersService } from './users/users.service';
import { InfluxService } from './influx/influx.service';
import { FiveHundreadInternalErrorInterceptor } from './interceptors/500InternalResponseHandler';
import { useContainer } from 'class-validator';
import * as session from 'express-session';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalInterceptors(
        new TimingInterceptor(),
        new BusinessIDInterceptor(new UsersService(new InfluxService())),
        new FiveHundreadInternalErrorInterceptor()
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use(
        session.default({
            secret: process.env.SESSION_SECRET,
        })
    );
    console.log(`Starting a Generic Express Application for STAGE: ${process.env.STAGE}`);
    console.log(`process.env.INFLUX_URL: ${process.env.INFLUX_URL}`);
    console.log(`process.env.REDIS_URL: ${process.env.REDIS_URL}`);
    console.log(`process.env.REDIS_PORT: ${process.env.REDIS_PORT}`);
    console.log(`process.env.AUTH0_ISSUER_URL: ${process.env.AUTH0_ISSUER_URL}`);
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    await app.init();
    await app.listen(3000);
}

bootstrap();
