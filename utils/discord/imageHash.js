import sharp from "sharp";
import { imageHash } from "image-hash";

const HASH_BITS = 16;
const HASH_THRESHOLD = 10;

/** Lookup table: number of set bits per 4-bit nibble (0–15). */
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Compute a 256-bit blockhash for an image buffer.
 * Normalises to PNG first so image-hash always gets a known format.
 *
 * @param {Buffer} buffer - Raw image bytes (any format sharp supports).
 * @returns {Promise<string>} 64-char hex hash string.
 */
export async function computeHash(buffer) {
  const pngBuffer = await sharp(buffer).png().toBuffer();
  return new Promise((resolve, reject) => {
    imageHash(
      { data: pngBuffer, name: "img.png" },
      HASH_BITS,
      true,
      (err, hash) => {
        if (err) reject(err);
        else resolve(hash);
      },
    );
  });
}

/**
 * Hamming distance between two equal-length hex hash strings.
 * Returns Infinity if lengths differ.
 *
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number}
 */
export function hammingDistance(hex1, hex2) {
  if (hex1.length !== hex2.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hex1.length; i++) {
    dist += NIBBLE_BITS[parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16)];
  }
  return dist;
}

/**
 * Returns true when two hashes differ by at most `threshold` bits.
 *
 * @param {string} hex1
 * @param {string} hex2
 * @param {number} [threshold=HASH_THRESHOLD]
 * @returns {boolean}
 */
export function isSimilar(hex1, hex2, threshold = HASH_THRESHOLD) {
  return hammingDistance(hex1, hex2) <= threshold;
}

export { HASH_THRESHOLD };
