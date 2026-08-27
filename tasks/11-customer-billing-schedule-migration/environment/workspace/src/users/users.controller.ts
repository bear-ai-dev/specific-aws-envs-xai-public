import { Controller, Get, Post, Body, Param, UseGuards, Req, ConflictException, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { UserPermissions } from './user.permissions';
import { PermissionsGuard } from '../authz/PermissionsGaurd';
import { LoginGuard } from '../authz/login.gaurd';
import { Issuer } from 'openid-client';
import { sendEmail } from '../utils/aws/ses';

@ApiBearerAuth('bearer')
@Controller('users')
@ApiTags('Users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @UseGuards(PermissionsGuard([UserPermissions.ADMIN]))
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

    @UseGuards(LoginGuard)
    @Get('login')
    userLogin(@Req() request: Request) {
        // No Operation, taken care of in the LoginGuard for the redirect
    }

    @UseGuards(LoginGuard)
    @Get('redirect')
    async userRedirect(@Param() something, @Req() request: Request, @Res() res) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        console.log('The Params', something, request?.user);

        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-ignore
            await this.usersService.findOne({ subject: request?.user?.sub });
            return res.redirect(
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                //@ts-ignore
                `https://meteringco.retool.com/embedded/public/1dfe6e7b-4808-47bb-a951-15bfcfdd11f6?token=${request?.user?.access_token}`
            );
        } catch (e) {
            if (e instanceof ConflictException) {
                sendEmail(
                    'New User Signup',
                    'MeteringCo System Notification',
                    'no-reply@meteringco.tech',
                    'team@meteringco.tech',
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    //@ts-ignore
                    `New User Signup: ${JSON.stringify(request?.user, null, 2)}`,
                    'MeteringCo System Notification',
                    'no-reply@meteringco.tech'
                );
                return res.redirect(`https://app.meteringco.tech/sign-up`);
            }
        }
    }
}
