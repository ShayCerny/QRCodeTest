/**
 * QR code mask evaluation.
 *
 * Implements the four penalty rules from the QR spec and selects the mask
 * pattern (0–7) that minimises the total penalty score.
 *
 * Evaluation flow for each candidate mask:
 *   1. Clone the unmasked grid and flip every non-reserved cell that satisfies
 *      the mask condition.
 *   2. Sum the four penalty scores.
 * The mask with the lowest total is returned.
 *
 * Penalty rules:
 *   Rule 1 — five or more consecutive same-color modules in a row or column:
 *             +3 for a run of exactly 5, +1 for each additional module.
 *   Rule 2 — 2×2 block of same-color modules: +3 per block.
 *   Rule 3 — 11-module finder-like pattern in a row or column: +40 per match.
 *   Rule 4 — dark module proportion far from 50 %: +10 per 5 % deviation.
 */

/**
 * The eight QR mask conditions. Returns true when (row, col) should be flipped.
 * @type {Array<(r: number, c: number) => boolean>}
 */
export const MASK_PATTERNS = [
	(r, c) => (r + c) % 2 === 0,
	(r, c) => r % 2 === 0,
	(r, c) => c % 3 === 0,
	(r, c) => (r + c) % 3 === 0,
	(r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
	(r, c) => (r * c) % 2 + (r * c) % 3 === 0,
	(r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
	(r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

// Null cells (unreserved format-info placeholders) are treated as light (0).
function mod(grid, r, c) {
	return grid[r][c] === 1 ? 1 : 0;
}

// ─── Penalty rules ────────────────────────────────────────────────────────────

/**
 * Rule 1: five or more consecutive same-color modules in any row or column.
 * Penalty = 3 + (run_length − 5) for each qualifying run.
 */
function penaltyRule1(grid, size) {
	let penalty = 0;

	const addRun = (len) => { if (len >= 5) penalty += 3 + (len - 5); };

	for (let r = 0; r < size; r++) {
		let run = 1;
		for (let c = 1; c < size; c++) {
			if (mod(grid, r, c) === mod(grid, r, c - 1)) { run++; }
			else { addRun(run); run = 1; }
		}
		addRun(run);
	}

	for (let c = 0; c < size; c++) {
		let run = 1;
		for (let r = 1; r < size; r++) {
			if (mod(grid, r, c) === mod(grid, r - 1, c)) { run++; }
			else { addRun(run); run = 1; }
		}
		addRun(run);
	}

	return penalty;
}

/**
 * Rule 2: 2×2 block of same-color modules.
 * Penalty = 3 per block.
 */
function penaltyRule2(grid, size) {
	let penalty = 0;
	for (let r = 0; r < size - 1; r++) {
		for (let c = 0; c < size - 1; c++) {
			const m = mod(grid, r, c);
			if (mod(grid, r,     c + 1) === m &&
			    mod(grid, r + 1, c    ) === m &&
			    mod(grid, r + 1, c + 1) === m) {
				penalty += 3;
			}
		}
	}
	return penalty;
}

/**
 * Rule 3: 11-module finder-like pattern in any row or column.
 * Both orientations are checked: 10111010000 and 00001011101.
 * Penalty = 40 per occurrence.
 */
const PATTERN_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
const PATTERN_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

function matchesEither(seq) {
	return PATTERN_A.every((v, i) => v === seq[i]) ||
	       PATTERN_B.every((v, i) => v === seq[i]);
}

function penaltyRule3(grid, size) {
	let penalty = 0;

	for (let r = 0; r < size; r++) {
		for (let c = 0; c <= size - 11; c++) {
			const seq = Array.from({ length: 11 }, (_, i) => mod(grid, r, c + i));
			if (matchesEither(seq)) penalty += 40;
		}
	}

	for (let c = 0; c < size; c++) {
		for (let r = 0; r <= size - 11; r++) {
			const seq = Array.from({ length: 11 }, (_, i) => mod(grid, r + i, c));
			if (matchesEither(seq)) penalty += 40;
		}
	}

	return penalty;
}

/**
 * Rule 4: proportion of dark modules deviates from 50 %.
 * Find the nearest multiples of 5 % above and below the actual percentage;
 * take the smaller distance and divide by 5, multiply by 10.
 */
function penaltyRule4(grid, size) {
	let dark = 0;
	const total = size * size;
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c] === 1) dark++;
		}
	}
	const percent = (dark / total) * 100;
	const prev5   = Math.floor(percent / 5) * 5;
	const next5   = prev5 + 5;
	return Math.min(Math.abs(prev5 - 50), Math.abs(next5 - 50)) / 5 * 10;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Applies a mask pattern to a copy of the grid, leaving reserved cells intact.
 *
 * @param {(number|null)[][]} grid     - Source grid (0/1/null)
 * @param {boolean[][]}       reserved - Reserved cell map from the QR instance
 * @param {number}            maskIndex - Mask pattern index (0–7)
 * @returns {(number|null)[][]} New grid with the mask applied
 */
function applyMaskToGrid(grid, reserved, maskIndex) {
	const size = grid.length;
	const copy = grid.map(row => [...row]);
	const fn   = MASK_PATTERNS[maskIndex];
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (!reserved[r][c] && fn(r, c)) copy[r][c] ^= 1;
		}
	}
	return copy;
}

/**
 * Evaluates all 8 mask patterns against the four penalty rules and returns the
 * index with the lowest total penalty.
 *
 * The QR instance must have placeData() called before this function is invoked.
 * Reserved cells (finders, alignment, timing, format info) are left unchanged
 * during evaluation.
 *
 * @param {import('./qr-generator.js').QR} qr - Populated QR instance (unmasked)
 * @returns {number} Best mask pattern index (0–7)
 */
export function selectBestMask(qr) {
	let bestMask    = 0;
	let bestPenalty = Infinity;

	for (let mask = 0; mask < 8; mask++) {
		const maskedGrid = applyMaskToGrid(qr.grid, qr.reserved, mask);
		const penalty    =
			penaltyRule1(maskedGrid, qr.size) +
			penaltyRule2(maskedGrid, qr.size) +
			penaltyRule3(maskedGrid, qr.size) +
			penaltyRule4(maskedGrid, qr.size);

		if (penalty < bestPenalty) {
			bestPenalty = penalty;
			bestMask    = mask;
		}
	}

	return bestMask;
}

/**
 * Applies a mask pattern in-place to the non-reserved cells of a QR instance.
 *
 * Call this after selectBestMask() and before writeFormatInfo().
 *
 * @param {import('./qr-generator.js').QR} qr        - QR instance to modify
 * @param {number}                          maskIndex - Mask pattern index (0–7)
 */
export function applyMask(qr, maskIndex) {
	const fn = MASK_PATTERNS[maskIndex];
	for (let r = 0; r < qr.size; r++) {
		for (let c = 0; c < qr.size; c++) {
			if (!qr.reserved[r][c] && fn(r, c)) qr.grid[r][c] ^= 1;
		}
	}
}
