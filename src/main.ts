import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('frontendUrl'),
    credentials: true,
  });

  // API_PREFIX already encodes the version segment (default "api/v1"),
  // so future breaking versions are introduced by changing this prefix
  // per-route-group rather than double-versioning with Nest's URI versioner.
  app.setGlobalPrefix(config.get<string>('apiPrefix') || 'api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared in DTOs
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ProPrentals API')
    .setDescription(
      'Multi-tenant property management & rental SaaS platform — REST API for landlord, tenant, and platform-admin clients.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('users')
    .addTag('organizations')
    .addTag('health')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('port') || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ProPrentals API running on port ${port} — docs at /docs`);
}

bootstrap();
