// import { Test, TestingModule } from '@nestjs/testing';
// import { INestApplication } from '@nestjs/common';
// import request from 'supertest';
// import { IngestionModule } from './../src/ingestion.module';

// describe('IngestionController (e2e)', () => {
//   let app: INestApplication;

//   beforeEach(async () => {
//     const moduleFixture: TestingModule = await Test.createTestingModule({
//       imports: [IngestionModule],
//     }).compile();

//     app = moduleFixture.createNestApplication();
//     await app.init();
//   });

//   it('/ingestion/check (GET)', () => {
//     return request(app.getHttpServer())
//       .get('/ingestion/check')
//       .expect(200)
//       .expect({ status: 'ok' });
//   });
// });
