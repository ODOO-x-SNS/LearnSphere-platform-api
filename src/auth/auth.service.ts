import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginDto, RegisterDto } from './dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
