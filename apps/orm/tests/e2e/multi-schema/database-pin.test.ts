import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { CerialValidationError } from '../../../src/errors';
import {
  connectionFor,
  type GeneratedFixture,
  generateFixture,
  importClient,
  type RuntimeClient,
  rawQuery,
} from './runtime-helpers';

const EAST_DB = 'ms_rt_pin_east';
const WEST_DB = 'ms_rt_pin_west';

const isConnected = (client: RuntimeClient): boolean => client.getSurreal() !== undefined;

/**
 * The error a client raises when it is connected to a database it was not generated for.
 *
 * A generated client resolves its own copy of the error classes, so the thrown error is not an
 * instance of the class this file imports even though it is the same class by identity of name and
 * code. The shape is asserted instead, which is what a caller can rely on across that boundary.
 */
async function refusalOf(client: RuntimeClient, database: string | undefined): Promise<CerialValidationError> {
  try {
    await client.connect(database === undefined ? { url: connectionFor('x').url } : connectionFor(database));
  } catch (error) {
    const refusal = error as CerialValidationError & { name: string; code: string };
    expect(refusal.name).toBe(CerialValidationError.name);
    expect(refusal.code).toBe('C3000');
    expect(refusal.operation).toBe('connect');

    return refusal;
  }
  throw new Error('Expected connect() to be refused');
}

// Two entries map MsRtPinned to ms_rt_pinned and set different databases. Generation allows that, so the
// generated clients are what stop a caller pointing both at one database.
describe('a table shared by two entries on different databases', () => {
  let fixture: GeneratedFixture;
  let east: RuntimeClient;
  let west: RuntimeClient;

  beforeAll(async () => {
    fixture = await generateFixture('pinned-collision');
    await rawQuery(`DEFINE DATABASE IF NOT EXISTS ${EAST_DB};`);
    await rawQuery(`DEFINE DATABASE IF NOT EXISTS ${WEST_DB};`);

    const EastClient = await importClient(fixture.outputs.east!, 'EastCerialClient');
    const WestClient = await importClient(fixture.outputs.west!, 'WestCerialClient');
    east = new EastClient();
    west = new WestClient();
  });

  afterAll(async () => {
    await east?.disconnect();
    await west?.disconnect();
    await rawQuery(`REMOVE DATABASE IF EXISTS ${EAST_DB};`);
    await rawQuery(`REMOVE DATABASE IF EXISTS ${WEST_DB};`);
    await fixture?.cleanup();
  });

  it('generated both entries', () => {
    expect(fixture.result.success).toBe(true);
  });

  it('refuses to connect the east client to the west database, naming everything involved', async () => {
    const error = await refusalOf(east, WEST_DB);

    expect(error.message).toContain("table 'ms_rt_pinned'");
    expect(error.message).toContain("entry 'east'");
    expect(error.message).toContain("entry 'west'");
    expect(error.message).toContain(`generated for database '${EAST_DB}'`);
    expect(error.message).toContain(`targets database '${WEST_DB}'`);
    expect(isConnected(east)).toBe(false);
  });

  it('refuses to connect the west client to the east database', async () => {
    const error = await refusalOf(west, EAST_DB);

    expect(error.message).toContain("entry 'west'");
    expect(error.message).toContain(`generated for database '${WEST_DB}'`);
    expect(error.message).toContain(`targets database '${EAST_DB}'`);
    expect(isConnected(west)).toBe(false);
  });

  it('refuses a connection that names no database, since it cannot be shown to be the right one', async () => {
    const error = await refusalOf(east, undefined);

    expect(error.message).toContain('targets no database');
    expect(isConnected(east)).toBe(false);
  });

  it('refuses a database name that only differs in case', async () => {
    const error = await refusalOf(east, EAST_DB.toUpperCase());

    expect(error.message).toContain(`targets database '${EAST_DB.toUpperCase()}'`);
  });

  it('connects each client to its own database', async () => {
    await east.connect(connectionFor(EAST_DB));
    await west.connect(connectionFor(WEST_DB));

    expect(isConnected(east)).toBe(true);
    expect(isConnected(west)).toBe(true);
  });

  it('connects with no argument, using the database embedded at generation', async () => {
    await east.disconnect();
    await east.connect();

    expect(isConnected(east)).toBe(true);
  });
});
