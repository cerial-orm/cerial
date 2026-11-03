import type { TypeFilesMode } from '../../cli/config/types';

/** File name of a type-only generated file: `.d.ts` under `'dts'`, `.ts` under `'ts'` */
export function typeFileName(name: string, typeFiles: TypeFilesMode): string {
  return typeFiles === 'dts' ? `${name}.d.ts` : `${name}.ts`;
}
