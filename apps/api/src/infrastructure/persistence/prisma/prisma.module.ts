import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UserContext } from '../rls/user.context';

@Global()
@Module({
  providers: [PrismaService, UserContext],
  exports: [PrismaService, UserContext],
})
export class PrismaModule {}
