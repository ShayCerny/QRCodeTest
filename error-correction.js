/**
 * Error correction module — Reed-Solomon encoding for QR codes.
 *
 * QR codes use Reed-Solomon error correction so scanners can recover data even
 * when part of the code is damaged, obscured, or dirty. The recoverable damage
 * depends on the chosen error correction level (ECL):
 *   L — up to  7% of codewords
 *   M — up to 15% of codewords
 *   Q — up to 25% of codewords
 *   H — up to 30% of codewords
 *
 * Implementation steps:
 *   1. Receive the encoded data codewords from encoder.js
 *   2. Split codewords into groups and blocks per the QR spec EC table
 *   3. For each block, perform polynomial long division in GF(256) to produce
 *      EC codewords — the remainder of (message polynomial ÷ generator polynomial)
 *   4. Interleave data blocks and EC blocks into the final message sequence
 *   5. Return the interleaved bytes ready for data module placement
 *
 * Reference: QR code specification ISO/IEC 18004, section 7.5
 */

import { errorCorrectionBlocks as ecBlockTable } from "./qr_data.js";
import gfTables from "./generator_polynomials.json" assert { type: "json" };

const { log, antilog, generatorTable } = gfTables;

/**
 * Divides a single data block's message polynomial by the generator polynomial
 * using GF(256) polynomial long division, returning the remainder as EC codewords.
 *
 * The message polynomial is formed by treating the data codewords as coefficients
 * (highest degree first). Appending ecCount zeros effectively multiplies it by
 * x^ecCount, making room for the remainder that long division will produce.
 *
 * Each division step eliminates the current leading term by scaling the generator
 * to match it, then XOR-ing (subtracting in GF(256)) the scaled generator into
 * the working remainder. After all data terms are eliminated, the trailing
 * ecCount values are the EC codewords.
 *
 * @param {number[]} block - Data codewords for one block
 * @param {number} ecCount - Number of EC codewords to generate (ecCWPerBlock)
 * @returns {number[]} EC codewords for this block
 */
function computeBlockEC(block, ecCount) {
	const generator = generatorTable[ecCount];
	const remainder = [...block, ...new Array(ecCount).fill(0)];

	for (let i = 0; i < block.length; i++) {
		if (remainder[i] === 0) continue; // zero leading term — nothing to eliminate
		const logCoeff = log[remainder[i]];
		for (let j = 0; j < generator.length; j++) {
			if (generator[j] !== 0) {
				remainder[i + j] ^= antilog[(logCoeff + log[generator[j]]) % 255];
			}
		}
	}

	return remainder.slice(block.length);
}

/**
 * Computes Reed-Solomon EC codewords for all blocks in both groups.
 *
 * Each block is encoded independently. The returned arrays mirror the shape of
 * the inputs so g1EC[i] corresponds to g1[i] and g2EC[i] corresponds to g2[i],
 * which is the shape expected by the interleaving step.
 *
 * @param {number[][]} g1 - Group 1 data blocks
 * @param {number[][]} g2 - Group 2 data blocks (may be empty)
 * @param {number} ecCount - EC codewords per block (same for all blocks)
 * @returns {{ g1EC: number[][], g2EC: number[][] }}
 */
function generateECCodewords(g1, g2, ecCount) {
	const g1EC = g1.map((block) => computeBlockEC(block, ecCount));
	const g2EC = g2.map((block) => computeBlockEC(block, ecCount));
	return { g1EC, g2EC };
}

/**
 * Computes Reed-Solomon error correction codewords for a QR code and returns
 * the fully interleaved data + EC byte sequence.
 *
 * The QR spec splits data codewords into two groups (g1, g2) of blocks, each
 * encoded independently. Interleaving is required so that a burst of physical
 * damage affects at most one codeword per block, maximising recoverability.
 *
 * @param {number[]} codewords - Encoded data codewords from encoder.js
 * @param {number} version - QR version (1–40), determines block structure
 * @param {string} ecLevel - Error correction level: 'L', 'M', 'Q', or 'H'
 * @returns {number[]} Interleaved data + EC codewords ready for module placement
 */
export function generateErrorCorrection(codewords, version, ecLevel) {
	const ecBlocks = ecBlockTable[version][ecLevel];

	// Split codewords into group 1 blocks — each block holds g1CWPerBlock codewords
	const g1 = Array.from({ length: ecBlocks.g1Blocks }, (_, i) =>
		codewords.slice(i * ecBlocks.g1CWPerBlock, (i + 1) * ecBlocks.g1CWPerBlock),
	);

	// Group 2 blocks follow immediately after group 1 in the codeword stream
	const g1Offset = ecBlocks.g1Blocks * ecBlocks.g1CWPerBlock;
	const g2 =
		ecBlocks.g2Blocks > 0
			? Array.from({ length: ecBlocks.g2Blocks }, (_, i) =>
					codewords.slice(g1Offset + i * ecBlocks.g2CWPerBlock, g1Offset + (i + 1) * ecBlocks.g2CWPerBlock),
				)
			: [];

	const { g1EC, g2EC } = generateECCodewords(g1, g2, ecBlocks.ecCWPerBlock);

	// Interleave data blocks: take one codeword from each block in round-robin order.
	// For single-block versions this is a no-op; the same loop handles both cases.
	const allDataBlocks = [...g1, ...g2];
	const allECBlocks   = [...g1EC, ...g2EC];
	const maxDataLen    = Math.max(...allDataBlocks.map(b => b.length));
	const result        = [];

	for (let i = 0; i < maxDataLen; i++) {
		for (const block of allDataBlocks) {
			if (i < block.length) result.push(block[i]);
		}
	}

	for (let i = 0; i < ecBlocks.ecCWPerBlock; i++) {
		for (const block of allECBlocks) {
			result.push(block[i]);
		}
	}

	return result;
}
