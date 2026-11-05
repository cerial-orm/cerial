/**
 * The `cbor.2` codec Cerial connects with. SDK 2.2.1 (and 2.2.2) reads a CBOR integer of at most 2^53 as a
 * number, then its u64 tag handler builds `new U64(number)`, which refuses 2^53 because that number is not a
 * safe integer. The error is thrown while decoding the message, so the whole response is lost: a row holding
 * a u64 of exactly 2^53 never arrives. This codec hands that one value to the SDK's handler as a bigint.
 */

import { CborCodec, type CodecOptions, type Codecs } from 'surrealdb';

/** The `cbor.2` tag of a u64. */
const TAG_U64 = 186;

class U64CborCodec extends CborCodec {
  constructor(options: CodecOptions) {
    super({ ...options, version: 2 });
    const decodeU64 = this.tagged[TAG_U64];
    // The CBOR reader returns a bigint above 2^53, so the number 2^53 can only be exactly 2^53
    if (decodeU64) this.tagged[TAG_U64] = (value: unknown) => decodeU64(value === 2 ** 53 ? BigInt(value) : value);
  }
}

/** The `codecs` option of every Surreal instance Cerial opens. */
export const CERIAL_CODECS: Codecs = { cbor2: (options) => new U64CborCodec(options) };
