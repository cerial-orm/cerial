import { CerialGenerationError } from '../../errors';
import type { ConnectionConfig } from '../../types';

/** One schema entry with its resolved connection */
export interface EntryConnection {
  name: string;
  connection?: ConnectionConfig;
}

/** Userinfo of an unparseable url: an `@` inside the authority, i.e. before the first `/`, `?` or `#` */
const AUTHORITY_USERINFO = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i;

function hasUserinfo(url: string): boolean {
  try {
    const parsed = new URL(url);

    return Boolean(parsed.username || parsed.password);
  } catch {
    // Not parseable, so the components cannot be read; an authority holding `@` is still not safe to embed
    return AUTHORITY_USERINFO.test(url.trim());
  }
}

/**
 * Refuse a schema entry whose `url` carries a username or password.
 *
 * The generated client embeds the resolved `url` verbatim so the output directory can be committed, which
 * would write the credentials into it. Detection reads the parsed username and password, so an `@` in the
 * path or query is not userinfo. The message never includes any part of the url, because it reaches CI
 * logs. Must run before any entry is generated.
 */
export function validateConnectionUrls(entries: EntryConnection[]): void {
  const names = entries.filter((e) => e.connection && hasUserinfo(e.connection.url)).map((e) => `'${e.name}'`);
  if (!names.length) return;

  throw new CerialGenerationError(
    `Schema ${names.length > 1 ? 'entries' : 'entry'} ${names.join(', ')} ${names.length > 1 ? 'have' : 'has'} a connection url that carries credentials (user or password before the host). ` +
      'The url is embedded in the generated client, which is meant to be committed, so the credentials would be written into it. Nothing was generated. ' +
      'Remove them from the url and keep credentials in the CERIAL_DB_USER and CERIAL_DB_PASS environment variables, or pass a full config to connect().',
  );
}
