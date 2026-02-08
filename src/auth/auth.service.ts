import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginDto, RegisterDto, RegisterInstructorDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
import { MailService } from './mail.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /* ─── Register ─── */
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
    });

    return this.generateTokens(user.id, user.email, user.role);
  }

  /* ─── Register Instructor (pending approval) ─── */
  async registerInstructor(dto: RegisterInstructorDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password);
    await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'INSTRUCTOR',
        status: 'PENDING',
      },
    });

    return { message: 'Your request is pending admin approval.' };
  }

  /* ─── Login ─── */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Account lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account is temporarily locked. Try again later.');
    }

    // Verify password
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockUntil =
        attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          ...(lockUntil ? { lockedUntil: lockUntil } : {}),
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Block pending / rejected instructors
    if (user.status === 'PENDING') {
      throw new ForbiddenException('Your account is pending admin approval.');
    }
    if (user.status === 'REJECTED') {
      throw new ForbiddenException('Your instructor application has been rejected.');
    }

    return this.generateTokens(user.id, user.email, user.role);
  }

  /* ─── Refresh ─── */
  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    // Verify refresh JWT
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('REFRESH_TOKEN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Refresh token revoked');

    // Compare hash
    const hash = this.hashToken(refreshToken);
    if (hash !== user.refreshTokenHash) {
      // Possible token theft — revoke
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Rotate
    return this.generateTokens(user.id, user.email, user.role);
  }

  /* ─── Profile ─── */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bio: true,
        totalPoints: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /* ─── Logout ─── */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  /* ─── Forgot Password ─── */
  async forgotPassword(dto: ForgotPasswordDto, appType: 'admin' | 'learner') {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If that email is registered, you will receive a reset link shortly.' };
    }

    // Invalidate any existing unused tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a cryptographically secure token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
      },
    });

    // Build reset URL based on app type
    const frontendUrl = appType === 'admin'
      ? this.config.get('ADMIN_FRONTEND_URL', 'http://localhost:5173')
      : this.config.get('LEARNER_FRONTEND_URL', 'http://localhost:5174');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await this.mail.sendPasswordResetEmail(user.email, resetUrl);
    } catch {
      this.logger.error(`Failed to send reset email to ${dto.email}`);
    }

    return { message: 'If that email is registered, you will receive a reset link shortly.' };
  }

  /* ─── Reset Password ─── */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset link.');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('This reset link has already been used.');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired.');
    }

    // Hash the new password and update user
    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Password has been reset successfully. You can now sign in.' };
  }

  /* ─── Helpers ─── */
  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload as any, {
      secret: this.config.get<string>('JWT_SECRET')!,
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m') as any,
    });

    const refreshToken = this.jwt.sign(payload as any, {
      secret: this.config.get<string>('REFRESH_TOKEN_SECRET')!,
      expiresIn: this.config.get('REFRESH_TOKEN_EXPIRES_IN', '7d') as any,
    });

    // Store refresh token hash
    const refreshHash = this.hashToken(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, email, role },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
