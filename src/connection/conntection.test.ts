import { S, SurrealOM } from '../main';
import { describe, expect, afterAll, test } from 'bun:test';

describe('SurrealOM Connection', () => {
  /// we need to handle strict surreal mode disable to test those
  //   test('Should create a new instance of SurrealOM and connect to the database with only url', async () => {
  //     const surrealOM = new S({
  //       url: 'http://127.0.0.1:8000',
  //     });
  //     await surrealOM.connect();

  //     expect(surrealOM.isConnected()).toBeTrue();
  //   });

  //   test('Should create a new instance of SurrealOM and connect to the database with user "root" and password "root"', async () => {
  //     const surrealOM = new S({
  //       url: 'http://127.0.0.1:8000',
  //       auth: {
  //         user: 'root',
  //         password: 'root',
  //       },
  //     });
  //     await surrealOM.connect();

  //     expect(surrealOM.isConnected()).toBeTrue();
  //   });

  //   test('Should create a new instance of SurrealOM and connect to the database with user "root" and password "root" and namespace "main"', async () => {
  //     const surrealOM = new S({
  //       url: 'http://127.0.0.1:8000',
  //       auth: {
  //         user: 'root',
  //         password: 'root',
  //       },
  //       namespace: 'main',
  //     });
  //     await surrealOM.connect();

  //     expect(surrealOM.isConnected()).toBeTrue();
  //   });

  test('Should create a new instance of SurrealOM and connect to the database with user "root" and password "root" and namespace "main" and database "main"', async () => {
    const surrealOM = new S({
      url: 'http://127.0.0.1:8000',
      auth: {
        user: 'root',
        password: 'root',
      },
      namespace: 'main',
      database: 'main',
    });
    await surrealOM.connect();

    expect(surrealOM.isConnected()).toBeTrue();
  });
});
