import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Observable } from 'rxjs';

/*
 The below interceptor gets the request before it hits the controlelr, and attempts to assign an BusinessID to the user.businessID field. 
 Effectively associating the request with an account ID so that its data can be specifically accessed. 

 There are few things to note with the below interceptor. 

 Specifically, that there is a specical case for temporary accounts and businessIDs associated with those. These accounts effectively share a API credentials, in order to access the API, however they must pass in their businessID in the request.
 While this is less than ideal, it allows us to provide a temporary account for clients to try out portions of the application before buying a full version. 
**/
@Injectable()
export class BusinessIDInterceptor implements NestInterceptor {
    private readonly logger = new Logger(BusinessIDInterceptor.name);
    constructor(private readonly userService: UsersService) {}
    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        // eslint-disable-next-line
        let { user, path, method, body, query } = context.switchToHttp().getRequest();
        this.logger.log(
            ` API request info${
                typeof user === 'object' ? JSON.stringify(user) : user
            }, path: ${path}, method:${method}`
        );
        // Exclude interceptor from the adding user path
        if (
            (method === 'POST' && path === '/users') ||
            (method === 'POST' && path === '/users/') ||
            (method === 'GET' && path === '/users/login') ||
            (method === 'GET' && path === '/users/redirect') ||
            path === '/' ||
            (method === 'POST' && path === '/users/temp')
        ) {
            this.logger.debug('No business ID needed for the usermanagement paths');
            return next.handle();
        }
        try {
            const { findOne } = this.userService;

            if (user && user.sub) {
                const bound = findOne.bind(this.userService); // Need to bind the context explictly here, IDK why.
                let businessID;
                try {
                    const {
                        data: [{ businessID: lookedUpID }],
                    } = await bound({ subject: user.sub });
                    businessID = lookedUpID;
                } catch (error) {
                    if (parseInt(error.status) !== 404) {
                        throw error;
                    }
                }
                this.logger.debug(`Logging BusinessID accessing MeteringCo ${businessID}`);
                if (businessID) {
                    user.businessID = businessID;
                } else if (body.businessID) {
                    const bound = findOne.bind(this.userService); // Need to bind the context explictly here, IDK why.
                    // We check to see if the businessID being passed in through the body by client is actually onboarded, and is considered a temporary account.
                    // These don't have any authentication so we can't determine who they are.
                    const {
                        data: [{ businessID, temp }],
                    } = await bound({ subject: body?.businessID });
                    this.logger.debug('interceptor, body businessID for temp account', businessID, temp, body);
                    // Basically we allow for businessID to be passed in via the body if it exists in the DB as a temporary account
                    if (businessID && temp) {
                        user.businessID = businessID;
                    } else {
                        this.logger.warn(
                            `No BusinessID found during request for temporary user: ${
                                typeof user === 'object' ? JSON.stringify(user) : user
                            }, path: ${path}, method:${method}`
                        );
                    }
                } else if (query?.businessid) {
                    const bound = findOne.bind(this.userService); // Need to bind the context explictly here, IDK why.
                    // We check to see if the businessID being passed in through the body by client is actually onboarded, and is considered a temporary account.
                    // These don't have any authentication so we can't determine who they are.
                    const {
                        data: [{ businessID, temp }],
                    } = await bound({ subject: query.businessid });
                    // Basically we allow for businessID to be passed in via the body if it exists in the DB as a temporary account
                    if (businessID && temp) {
                        user.businessID = businessID;
                    } else {
                        this.logger.warn(
                            `No BusinessID found during request for temporary user: ${
                                typeof user === 'object' ? JSON.stringify(user) : user
                            }, path: ${path}, method:${method}`
                        );
                    }
                } else {
                    this.logger.warn(
                        `No BusinessID found during request: ${
                            typeof user === 'object' ? JSON.stringify(user) : user
                        }, path: ${path}, method:${method}`
                    );
                }
            } else {
                this.logger.warn(
                    `No user found during request: ${
                        typeof user === 'object' ? JSON.stringify(user) : user
                    }, path: ${path}, method:${method}`
                );
            }

            if (user?.businessID) {
                body.businessID = user.businessID;
            }
        } catch (error) {
            console.log(error);
            throw error;
        }
        return next.handle();
    }
}
