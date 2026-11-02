import { describe, expect, it } from 'bun:test';
import { subcommandIndex } from '../../../../src/cli/commands/migrate';

describe('subcommandIndex', () => {
  it('finds the subcommand first, last and after a flag that takes a value', () => {
    expect(subcommandIndex(['status'])).toBe(0);
    expect(subcommandIndex(['status', '--config', 'x.json'])).toBe(0);
    expect(subcommandIndex(['--config', 'x.json', 'status'])).toBe(2);
    expect(subcommandIndex(['-C', 'x.json', 'status'])).toBe(2);
    expect(subcommandIndex(['--url', 'http://h:1', '--name', 'a', 'plan'])).toBe(4);
  });

  it('does not skip the next argument after a flag written with =, or after a boolean flag', () => {
    expect(subcommandIndex(['--config=x.json', 'status'])).toBe(1);
    expect(subcommandIndex(['--json', 'status'])).toBe(1);
  });

  it('finds none when only flags are given', () => {
    expect(subcommandIndex([])).toBe(-1);
    expect(subcommandIndex(['--config', 'x.json'])).toBe(-1);
  });
});
