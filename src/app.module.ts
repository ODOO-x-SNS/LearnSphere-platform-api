import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { LessonsModule } from './lessons/lessons.module';
import { UploadsModule } from './uploads/uploads.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PointsModule } from './points/points.module';
import { BadgesModule } from './badges/badges.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { ReportsModule } from './reports/reports.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Structured logging
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        autoLogging: true,
        serializers: {
          req: (req: any) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: any) => ({ statusCode: res.statusCode }),
        },
      },
    }),

    // BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379')).hostname,
          port: Number(
            new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379')).port || 6379,
          ),
        },
      }),
    }),

    // Core modules
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    LessonsModule,
    UploadsModule,
    QuizzesModule,
    EnrollmentsModule,
    InvitationsModule,
    ReviewsModule,
    PointsModule,
    BadgesModule,
    AuditLogModule,
    ReportsModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule {}
