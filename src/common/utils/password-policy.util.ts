import { BadRequestException } from '@nestjs/common';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'letmein',
  'welcome',
  'admin',
  'admin123',
  'abc123',
  'iloveyou',
  'monkey',
  'dragon',
  '111111',
  '000000',
  '1234',
  '12345',
  'football',
  'princess',
  'sunshine',
  'superman',
  'shadow',
  'michael',
  '654321',
  'passw0rd',
  'P@ssw0rd',
  'p@ssw0rd',
  'changeme',
]);

export function assertPasswordMeetsPolicy(password: string): void {
  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    throw new BadRequestException(
      'That password is too common or easily guessed. Please choose a more unique password.',
    );
  }
}
