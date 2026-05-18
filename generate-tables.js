/**
 * Pre-build script — generates GF(256) lookup tables and Reed-Solomon generator
 * polynomials, then writes them to generator_polynomials.json.
 *
 * Run automatically via the predev/prebuild npm hooks. Skips if the JSON already
 * exists so the computation only happens once. Delete the JSON to force a rebuild.
 *
 * Output shape:
 *   log[n]        → alpha exponent such that α^exponent = n
 *   antilog[i]    → integer value of α^i
 *   generatorTable[n] → integer coefficient array for the degree-n generator polynomial
 */

import { existsSync, writeFileSync } from "fs";

const OUTPUT_PATH = "./generator_polynomials.json";

if (existsSync(OUTPUT_PATH)) {
	console.log("generator_polynomials.json already exists, skipping.");
	process.exit(0);
}

/**
 * Builds the GF(256) log and antilog tables using α = 2 as the primitive element
 * and the primitive polynomial x⁸ + x⁴ + x³ + x² + 1 (0x11D).
 *
 * These tables turn GF(256) multiplication into integer addition:
 *   a * b = antilog[(log[a] + log[b]) % 255]
 *
 * When doubling a value reaches 256 or above, XOR with 0x11D reduces it back
 * into the 0–255 range while preserving the field's algebraic structure.
 *
 * @returns {{ log: number[], antilog: number[] }}
 */
function buildGFTables() {
	const log = new Array(256).fill(0);
	const antilog = new Array(256).fill(0);
	let val = 1;
	for (let i = 0; i < 255; i++) {
		antilog[i] = val;
		log[val] = i;
		val <<= 1;
		if (val >= 256) val ^= 0x11d; // reduce modulo the primitive polynomial
	}
	antilog[255] = 1; // α^255 wraps back to α^0 = 1
	return { log, antilog };
}

/**
 * Multiplies two GF(256) polynomials represented as integer coefficient arrays,
 * where index 0 is the highest-degree term.
 *
 * Each pair of terms is multiplied by adding their degrees (i + j) and combining
 * their alpha exponents via log/antilog. Terms of equal degree are then summed
 * with XOR, since addition in GF(256) is XOR.
 *
 * Zero coefficients are skipped to avoid log(0), which is undefined.
 *
 * @param {number[]} p - Coefficients of the first polynomial
 * @param {number[]} q - Coefficients of the second polynomial
 * @param {number[]} log - GF(256) log table
 * @param {number[]} antilog - GF(256) antilog table
 * @returns {number[]} Coefficients of the product polynomial
 */
function multiplyPoly(p, q, log, antilog) {
	const result = new Array(p.length + q.length - 1).fill(0);
	for (let i = 0; i < p.length; i++) {
		for (let j = 0; j < q.length; j++) {
			if (p[i] !== 0 && q[j] !== 0) {
				result[i + j] ^= antilog[(log[p[i]] + log[q[j]]) % 255];
			}
		}
	}
	return result;
}

/**
 * Builds Reed-Solomon generator polynomials for 1 through maxN EC codewords.
 *
 * The generator polynomial for n EC codewords is defined as:
 *   g(x) = (x + α⁰)(x + α¹) · · · (x + α^(n-1))
 *
 * Each entry is derived from the previous by multiplying in one more factor,
 * so no polynomial is recomputed from scratch. The QR spec defines generators
 * up to degree 68, covering all standard QR versions.
 *
 * @param {number} maxN - Highest degree polynomial to compute (68 for full QR support)
 * @param {number[]} log - GF(256) log table
 * @param {number[]} antilog - GF(256) antilog table
 * @returns {Object.<number, number[]>} Map of n → integer coefficient array
 */
function buildGeneratorTable(maxN, log, antilog) {
	const table = {};
	let poly = [1];
	for (let n = 1; n <= maxN; n++) {
		poly = multiplyPoly(poly, [1, antilog[n - 1]], log, antilog);
		table[n] = [...poly];
	}
	return table;
}

/**
 * Serializes the tables to JSON with each array on a single line.
 *
 * The default JSON.stringify indent would spread the 256-element log/antilog
 * arrays across 256 lines each. This keeps the file compact while still being
 * diff-friendly — each generator polynomial is one readable line.
 *
 * @param {{ log: number[], antilog: number[], generatorTable: Object }} tables
 * @returns {string} Formatted JSON string
 */
function formatJSON({ log, antilog, generatorTable }) {
	const polyLines = Object.entries(generatorTable)
		.map(([n, poly], i, arr) => {
			const comma = i < arr.length - 1 ? "," : "";
			return `    "${n}": ${JSON.stringify(poly)}${comma}`;
		})
		.join("\n");

	return [
		"{",
		`  "log": ${JSON.stringify(log)},`,
		`  "antilog": ${JSON.stringify(antilog)},`,
		`  "generatorTable": {`,
		polyLines,
		`  }`,
		"}",
	].join("\n");
}

const { log, antilog } = buildGFTables();
const generatorTable = buildGeneratorTable(68, log, antilog);

writeFileSync(OUTPUT_PATH, formatJSON({ log, antilog, generatorTable }));
console.log("Generated generator_polynomials.json");
