import { describe, expect, it } from 'bun:test';
import { parseArgs } from '../../../src/cli/parser';

describe('parseArgs', () => {
  describe('existing flags (regression)', () => {
    it('should parse -s flag', () => {
      const result = parseArgs(['-s', './schemas']);

      expect(result.schema).toBe('./schemas');
    });

    it('should parse --schema flag', () => {
      const result = parseArgs(['--schema', './my-schemas']);

      expect(result.schema).toBe('./my-schemas');
    });

    it('should parse -o flag', () => {
      const result = parseArgs(['-o', './output']);

      expect(result.output).toBe('./output');
    });

    it('should parse --output flag', () => {
      const result = parseArgs(['--output', './out']);

      expect(result.output).toBe('./out');
    });

    it('should parse -w flag', () => {
      const result = parseArgs(['-w']);

      expect(result.watch).toBe(true);
    });

    it('should parse -v flag', () => {
      const result = parseArgs(['-v']);

      expect(result.verbose).toBe(true);
    });

    it('should parse -c flag', () => {
      const result = parseArgs(['-c']);

      expect(result.clean).toBe(true);
    });

    it('should parse -l flag', () => {
      const result = parseArgs(['-l', 'full']);

      expect(result.log).toBe('full');
    });

    it('should parse bare path as schema', () => {
      const result = parseArgs(['./my-schema.cerial']);

      expect(result.schema).toBe('./my-schema.cerial');
    });

    it('should parse multiple flags together', () => {
      const result = parseArgs(['-s', './schemas', '-o', './out', '-v', '-c']);

      expect(result.schema).toBe('./schemas');
      expect(result.output).toBe('./out');
      expect(result.verbose).toBe(true);
      expect(result.clean).toBe(true);
    });
  });

  describe('-n / --name flag', () => {
    it('should parse -n flag', () => {
      const result = parseArgs(['-n', 'auth']);

      expect(result.name).toBe('auth');
    });

    it('should parse --name flag', () => {
      const result = parseArgs(['--name', 'auth']);

      expect(result.name).toBe('auth');
    });

    it('should parse -n with other flags', () => {
      const result = parseArgs(['-s', './schemas', '-o', './out', '-n', 'MyDb']);

      expect(result.schema).toBe('./schemas');
      expect(result.output).toBe('./out');
      expect(result.name).toBe('MyDb');
    });

    it('should handle name with special characters', () => {
      const result = parseArgs(['-n', 'my-client']);

      expect(result.name).toBe('my-client');
    });
  });

  describe('-C / --config flag', () => {
    it('should parse -C flag', () => {
      const result = parseArgs(['-C', './config.ts']);

      expect(result.config).toBe('./config.ts');
    });

    it('should parse --config flag', () => {
      const result = parseArgs(['--config', './cerial.config.ts']);

      expect(result.config).toBe('./cerial.config.ts');
    });

    it('should parse -C with other flags', () => {
      const result = parseArgs(['-C', './config.ts', '-v']);

      expect(result.config).toBe('./config.ts');
      expect(result.verbose).toBe(true);
    });

    it('should handle config path with directory', () => {
      const result = parseArgs(['-C', './configs/cerial.config.ts']);

      expect(result.config).toBe('./configs/cerial.config.ts');
    });
  });

  describe('all flags combined', () => {
    it('should parse -n and -C together', () => {
      const result = parseArgs(['-n', 'auth', '-C', './config.ts']);

      expect(result.name).toBe('auth');
      expect(result.config).toBe('./config.ts');
    });

    it('should parse all flags at once', () => {
      const result = parseArgs([
        '-s',
        './schemas',
        '-o',
        './out',
        '-n',
        'MyClient',
        '-C',
        './cerial.config.ts',
        '-c',
        '-v',
        '-l',
        'full',
      ]);

      expect(result.schema).toBe('./schemas');
      expect(result.output).toBe('./out');
      expect(result.name).toBe('MyClient');
      expect(result.config).toBe('./cerial.config.ts');
      expect(result.clean).toBe(true);
      expect(result.verbose).toBe(true);
      expect(result.log).toBe('full');
    });
  });

  describe('empty / no args', () => {
    it('should return empty options for no args', () => {
      const result = parseArgs([]);

      expect(result).toEqual({});
    });
  });
});
