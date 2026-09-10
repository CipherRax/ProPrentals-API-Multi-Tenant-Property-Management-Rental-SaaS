import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { resolve } from 'path';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // CORP must allow cross-origin so the web app (frontendUrl) can render
  // uploaded images via <img> tags; otherwise browsers block them despite CORS.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: false,
    }),
  );
  app.enableCors({
    origin: config.get<string>('frontendUrl'),
    credentials: true,
  });

  // Serve locally uploaded images (storage provider "local") statically
  // so PropertyImage / UnitImage URLs work in dashboards and the marketplace.
  app.use(
    '/uploads',
    express.static(resolve(process.cwd(), config.get<string>('storage.localDir') ?? 'uploads')),
  );

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
    .setTitle('Habita API')
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
  console.log(`Habita API running on port ${port} — docs at /docs`);
}

bootstrap();
