import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { InfluxModule } from '../influx/influx.module';

@Module({
    controllers: [UsersController],
    providers: [UsersService],
    imports: [InfluxModule],
    exports: [UsersService],
})
export class UsersModule {}
