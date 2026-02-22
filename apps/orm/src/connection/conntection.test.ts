import { describe, expect, test } from 'bun:test';
import { C } from '../main';

describe('Cerial Connection', () => {
  /// we need to handle strict surreal mode disable to test those
  //   test('Should create a new instance of Cerial and connect to the database with only url', async () => {
  //     const cerial = new C({
  //       url: 'http://127.0.0.1:8000',
  //     });
  //     await cerial.connect();

  //     expect(cerial.isConnected()).toBeTrue();
  //   });

  //   test('Should create a new instance of Cerial and connect to the database with user "root" and password "root"', async () => {
  //     const cerial = new C({
  //       url: 'http://127.0.0.1:8000',
  //       auth: {
  //         user: 'root',
  //         password: 'root',
  //       },
  //     });
  //     await cerial.connect();

  //     expect(cerial.isConnected()).toBeTrue();
  //   });

  //   test('Should create a new instance of Cerial and connect to the database with user "root" and password "root" and namespace "main"', async () => {
  //     const cerial = new C({
  //       url: 'http://127.0.0.1:8000',
  //       auth: {
  //         user: 'root',
  //         password: 'root',
  //       },
  //       namespace: 'main',
  //     });
  //     await cerial.connect();

  //     expect(cerial.isConnected()).toBeTrue();
  //   });

  test('Should create a new instance of Cerial and connect to the database with user "root" and password "root" and namespace "main" and database "main"', async () => {
    const cerial = new C({
      url: 'http://127.0.0.1:8000',
      auth: {
        user: 'root',
        password: 'root',
      },
      namespace: 'main',
      database: 'main',
    });
    await cerial.connect();

    expect(cerial.isConnected()).toBeTrue();
  });
});
