import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const stored = await this.storage.saveFile(file, 'avatars');

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: stored.url },
    });
    const { passwordHash: _passwordHash, ...safe } = user;

    if (current?.avatarUrl && current.avatarUrl !== stored.url) {
      await this.storage.deleteByUrl(current.avatarUrl);
    }
    return safe;
  }
}
