import { describe, expect, it } from 'bun:test';
import { parseMigrateArgs } from '../../../../src/cli/migrate/args';
import { resolveMigrateConnection } from '../../../../src/cli/migrate/connection';
import { CerialConnectionError, CerialValidationError } from '../../../../src/errors';

const CONFIG = {
  url: 'http://config:8000',
  namespace: 'config_ns',
  database: 'config_db',
  auth: { username: 'config_user', password: 'config_pass' },
};
const ENV = {
  CERIAL_DB_URL: 'http://env:8000',
  CERIAL_DB_NAMESPACE: 'env_ns',
  CERIAL_DB_DATABASE: 'env_db',
  CERIAL_DB_USERNAME: 'env_user',
  CERIAL_DB_PASSWORD: 'env_pass',
};
const FLAGS = { url: 'http://flag:8000', namespace: 'flag_ns', database: 'flag_db', username: 'flag_user' };

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }

  return '';
}

describe('resolveMigrateConnection precedence', () => {
  it('flag wins over env', () => {
    const resolved = resolveMigrateConnection(FLAGS, ENV, undefined);

    expect(resolved).toEqual({
      url: 'http://flag:8000',
      namespace: 'flag_ns',
      database: 'flag_db',
      auth: { username: 'flag_user', password: 'env_pass' },
    });
  });

  it('flag wins over config', () => {
    const resolved = resolveMigrateConnection(FLAGS, {}, CONFIG);

    expect(resolved).toEqual({
      url: 'http://flag:8000',
      namespace: 'flag_ns',
      database: 'flag_db',
      auth: { username: 'flag_user', password: 'config_pass' },
    });
  });

  it('env wins over config', () => {
    const resolved = resolveMigrateConnection({}, ENV, CONFIG);

    expect(resolved).toEqual({
      url: 'http://env:8000',
      namespace: 'env_ns',
      database: 'env_db',
      auth: { username: 'env_user', password: 'env_pass' },
    });
  });

  it('config applies when neither flag nor env is set', () => {
    expect(resolveMigrateConnection({}, {}, CONFIG)).toEqual(CONFIG);
  });

  it('resolves field by field across the sources', () => {
    const resolved = resolveMigrateConnection({ namespace: 'flag_ns' }, { CERIAL_DB_DATABASE: 'env_db' }, CONFIG);

    expect(resolved.url).toBe('http://config:8000');
    expect(resolved.namespace).toBe('flag_ns');
    expect(resolved.database).toBe('env_db');
    expect(resolved.auth).toEqual({ username: 'config_user', password: 'config_pass' });
  });

  it('treats an empty env variable as unset', () => {
    expect(resolveMigrateConnection({}, { CERIAL_DB_URL: '' }, CONFIG).url).toBe('http://config:8000');
  });

  it('omits auth when no source sets credentials', () => {
    const resolved = resolveMigrateConnection({}, {}, { url: 'http://x:8000', namespace: 'n', database: 'd' });

    expect(resolved.auth).toBeUndefined();
  });
});

describe('resolveMigrateConnection refusals', () => {
  it('refuses a url with userinfo and leaks no part of it', () => {
    const url = 'http://root:hunter2secret@db.internal:8000';
    const message = messageOf(() => resolveMigrateConnection({ url }, {}, CONFIG));

    expect(message).not.toBe('');
    expect(message).not.toContain('hunter2secret');
    expect(message).not.toContain('root:');
    expect(message).not.toContain('db.internal');
  });

  it('words the userinfo refusal for migrate as a connection error', () => {
    const url = 'http://root:hunter2secret@db.internal:8000';
    const run = () => resolveMigrateConnection({ url }, {}, CONFIG);
    const message = messageOf(run);

    expect(run).toThrow(CerialConnectionError);
    expect(message).toContain('CERIAL_DB_USERNAME');
    expect(message).toContain('CERIAL_DB_PASSWORD');
    expect(message).not.toMatch(/generat/i);
    expect(message).not.toMatch(/CERIAL_DB_(USER|PASS)\b/);
    expect(message).not.toContain('hunter2secret');
    expect(message).not.toContain('db.internal');
  });

  it('refuses userinfo that arrives from env or config too', () => {
    const url = 'http://root:hunter2secret@db.internal:8000';

    expect(messageOf(() => resolveMigrateConnection({}, { CERIAL_DB_URL: url }, CONFIG))).not.toBe('');
    expect(messageOf(() => resolveMigrateConnection({}, {}, { ...CONFIG, url }))).not.toContain('hunter2secret');
  });

  it('refuses when no url is set anywhere, naming where to set it', () => {
    expect(() => resolveMigrateConnection({}, {}, undefined)).toThrow(CerialConnectionError);
    const message = messageOf(() => resolveMigrateConnection({}, {}, undefined));

    expect(message).toContain('--url');
    expect(message).toContain('CERIAL_DB_URL');
  });

  it('refuses when no namespace is set anywhere, naming where to set it', () => {
    const message = messageOf(() => resolveMigrateConnection({}, {}, { url: 'http://x:8000', database: 'd' }));

    expect(message).toContain('--namespace');
    expect(message).toContain('CERIAL_DB_NAMESPACE');
    expect(() => resolveMigrateConnection({}, {}, { url: 'http://x:8000', database: 'd' })).toThrow(
      CerialConnectionError,
    );
  });

  it('refuses when no database is set anywhere, naming where to set it', () => {
    const message = messageOf(() => resolveMigrateConnection({}, {}, { url: 'http://x:8000', namespace: 'n' }));

    expect(message).toContain('--database');
    expect(message).toContain('CERIAL_DB_DATABASE');
  });

  it('refuses a username without a password, and the reverse', () => {
    const base = { url: 'http://x:8000', namespace: 'n', database: 'd' };

    expect(messageOf(() => resolveMigrateConnection({ username: 'u' }, {}, base))).toContain('CERIAL_DB_PASSWORD');
    expect(messageOf(() => resolveMigrateConnection({}, { CERIAL_DB_PASSWORD: 'p' }, base))).toContain('--username');
  });
});

describe('parseMigrateArgs', () => {
  it('parses connection flags, booleans and positionals', () => {
    const { flags, positionals } = parseMigrateArgs([
      'plan.surql',
      '--url',
      'http://127.0.0.1:8000',
      '--namespace=main',
      '--allow-destructive',
    ]);

    expect(flags).toEqual({ url: 'http://127.0.0.1:8000', namespace: 'main', 'allow-destructive': true });
    expect(positionals).toEqual(['plan.surql']);
  });

  it('refuses a url that is not a url, naming --url', () => {
    expect(() => parseMigrateArgs(['--url', 'nonsense'])).toThrow(CerialValidationError);
    expect(messageOf(() => parseMigrateArgs(['--url', 'nonsense']))).toContain('--url');
  });

  it('refuses a url with a non-database scheme', () => {
    expect(messageOf(() => parseMigrateArgs(['--url', 'file:///etc/passwd']))).toContain('--url');
  });

  it('refuses a value-less connection flag, naming it', () => {
    expect(messageOf(() => parseMigrateArgs(['--namespace']))).toContain('--namespace');
    expect(messageOf(() => parseMigrateArgs(['--database=']))).toContain('--database');
  });

  it('refuses a misspelled flag by name instead of dropping it', () => {
    expect(() => parseMigrateArgs(['--allow-destrucive'])).toThrow(CerialValidationError);
    expect(messageOf(() => parseMigrateArgs(['--allow-destrucive']))).toContain('--allow-destrucive');
  });

  it('refuses a password flag', () => {
    expect(messageOf(() => parseMigrateArgs(['--password', 'secretvalue']))).not.toContain('secretvalue');
    expect(() => parseMigrateArgs(['--password', 'secretvalue'])).toThrow(CerialValidationError);
  });

  it('refuses a boolean flag given a value', () => {
    expect(messageOf(() => parseMigrateArgs(['--allow-data-loss=yes']))).toContain('--allow-data-loss');
  });

  it('accepts -C as the short form of --config', () => {
    expect(parseMigrateArgs(['-C', 'cerial.config.json']).flags.config).toBe('cerial.config.json');
    expect(parseMigrateArgs(['-Ccerial.config.json']).flags.config).toBe('cerial.config.json');
  });
});
