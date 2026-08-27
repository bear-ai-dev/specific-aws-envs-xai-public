import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export type AuthorizedRequest = Request & {
    user: {
        businessID: string;
        sub: string;
    };
};

@Injectable()
export class LocalJWTAuthGuard implements CanActivate {
    constructor(private jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        let token: string;
        console.log(request?.path, 'Path for request inside LocalJWTAuthGuard');
        if (request?.path === '/onboarding/stripe/redirect') {
            console.log('Inside the local jwt auth guard, request path is /onboarding/stripe/redirect');
            token = this.extractTokenFromStateParam(request);
        } else {
            token = this.extractTokenFromHeader(request);
        }
        if (!token) {
            throw new UnauthorizedException();
        }
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.JWT_SECRET,
            });
            // 💡 We're assigning the payload to the request object here
            // so that we can access it in our route handlers
            request['user'] = payload;
        } catch (e) {
            throw new UnauthorizedException();
        }
        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }

    private extractTokenFromStateParam(request) {
        const { state } = request.query;
        console.log('state param: ', state);
        return state;
    }
}
