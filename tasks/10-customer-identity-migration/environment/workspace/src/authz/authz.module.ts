import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { OidcStrategy, buildOpenIdClient } from './oidc.strategy';
import { SessionSerializer } from './sessionSerializer';

const OidcStrategyFactory = {
    provide: 'OidcStrategy',
    useFactory: async () => {
        const client = await buildOpenIdClient(); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
        const strategy = new OidcStrategy(client);
        return strategy;
    },
};
@Module({
    imports: [PassportModule.register({ session: true, defaultStrategy: ['jwt', 'oidc'] })],
    providers: [JwtStrategy, OidcStrategyFactory, SessionSerializer],
    exports: [PassportModule],
})
export class AuthzModule {}
