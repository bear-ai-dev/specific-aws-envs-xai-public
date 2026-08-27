import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@ApiBearerAuth('bearer')
@Controller('users')
@ApiTags('Users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('temp')
    createTemp(@Body() createUserDto: CreateUserDto) {
        const temp = true;
        const tempDate = new Date();
        const accountExpiryDate = tempDate.setDate(tempDate.getDate() + 7).toString();
        return this.usersService.create({ ...createUserDto, accountExpiryDate, temp });
    }
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findOne(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { sub } = request.user;
        return this.usersService.findOne({ subject: sub });
    }
}
