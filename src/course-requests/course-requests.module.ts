import { Module } from '@nestjs/common';
import { CourseRequestsService } from './course-requests.service';
import { CourseRequestsController } from './course-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CourseRequestsController],
  providers: [CourseRequestsService],
})
export class CourseRequestsModule {}
