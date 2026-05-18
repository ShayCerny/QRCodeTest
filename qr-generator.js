/**
 * QR code structural pattern generator.
 *
 * Builds the fixed structural portions of a QR matrix — finder patterns,
 * alignment patterns, timing strips, and the required dark module — onto a
 * 2D grid before data or format information is placed.
 *
 * Key exports:
 *   grid     — 2D array of module values (1 = dark, 0 = light, null = not yet set)
 *   reserved — 2D boolean array; true where a structural pattern occupies a cell
 *   generate — draws all structural patterns onto grid and reserved
 */

import qrData from "./qr_data.json" assert { type: "json" };
const { alignmentPatternPositions } = qrData;

// ─── QR spec constants ────────────────────────────────────────────────────────

/** Finder patterns are always 7×7 modules. */
const FINDER_SIZE = 7;

/**
 * Row and column index where the horizontal and vertical timing strips run.
 * Per the QR spec, timing strips always occupy row 6 and column 6 (0-indexed).
 */
const TIMING_STRIP = 6;

/**
 * Column of the required dark module. Per the spec, the dark module is always
 * at column 8; the row is determined by the formula (4 * version + 9).
 */
const DARK_MODULE_COL = 8;

// ─── Canvas / grid dimensions ─────────────────────────────────────────────────

export const version = 2;

/** Total module width/height of the QR matrix. QR spec formula: 4 * version + 17. */
export const size = 4 * version + 17;

const targetWidth = screen.width * 0.3;

/** Width of a single module in pixels, scaled so the QR code fills 30% of screen width. */
export const pixelSize = targetWidth / size;

/** Padding in pixels on each side, equivalent to a 4-module quiet zone. */
export const padding = pixelSize * 4;

/** Total canvas width/height in pixels (grid + padding on both sides). */
export const width = size * pixelSize + padding * 2;

// ─── Grid and reserved arrays ─────────────────────────────────────────────────

/**
 * The QR module grid. Each cell is 1 (dark), 0 (light), or null (not yet placed).
 * Indexed as grid[row][col], where row 0 is the top and col 0 is the left.
 */
export const grid = Array.from({ length: size }, () => new Array(size).fill(null));

/**
 * Tracks which cells are occupied by structural patterns (finders, alignments,
 * timing strips, dark module). The data placement step must skip reserved cells.
 */
const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

// ─── Alignment pattern centres ────────────────────────────────────────────────

const coords = alignmentPatternPositions[version];
const last   = coords[coords.length - 1];
const alignmentCenters = [];

// Build the list of alignment centre coordinates, skipping any position that
// would overlap the three finder patterns (corners: top-left, top-right, bottom-left).
for (const r of coords) {
	for (const c of coords) {
		const overlapsTopLeft    = r === TIMING_STRIP && c === TIMING_STRIP;
		const overlapsTopRight   = r === TIMING_STRIP && c === last;
		const overlapsBottomLeft = r === last          && c === TIMING_STRIP;
		if (overlapsTopLeft || overlapsTopRight || overlapsBottomLeft) continue;
		alignmentCenters.push([r, c]);
	}
}

// ─── Pattern drawing functions ────────────────────────────────────────────────

/**
 * Draws the three 7×7 finder patterns in the top-left, bottom-left, and
 * top-right corners of the grid.
 *
 * Each finder has a solid outer border, a hollow 5×5 ring, and a solid 3×3
 * center. Scanners use these three identical shapes to locate and orient the code.
 * The 1-module separator that surrounds each finder is left null here and will
 * be written as light during data/format placement.
 */
function finders() {
	const positions = [
		[0,                  0               ], // top-left
		[size - FINDER_SIZE, 0               ], // bottom-left
		[0,                  size - FINDER_SIZE], // top-right
	];

	for (const [startRow, startCol] of positions) {
		for (let i = 0; i < FINDER_SIZE; i++) {
			for (let j = 0; j < FINDER_SIZE; j++) {
				const isOuterBorder = i === 0 || i === 6 || j === 0 || j === 6;
				const isCenter3x3   = i >= 2 && i <= 4 && j >= 2 && j <= 4;

				grid[startRow + i][startCol + j]     = isOuterBorder || isCenter3x3 ? 1 : 0;
				reserved[startRow + i][startCol + j] = true;
			}
		}
	}
}

/**
 * Draws alignment patterns at the spec-defined positions for the current version.
 *
 * Each pattern is a 5×5 square with a hollow center ring and a single dark center
 * module. Larger QR versions use more alignment patterns to help scanners correct
 * for perspective distortion. Centres that would overlap a finder pattern are skipped.
 */
function alignments() {
	for (const [r, c] of alignmentCenters) {
		for (let i = -2; i <= 2; i++) {
			for (let j = -2; j <= 2; j++) {
				const isOuterBorder = i === -2 || i === 2 || j === -2 || j === 2;
				const isCenter      = i === 0 && j === 0;

				grid[r + i][c + j]     = isOuterBorder || isCenter ? 1 : 0;
				reserved[r + i][c + j] = true;
			}
		}
	}
}

/**
 * Draws the horizontal and vertical timing strips along row 6 and column 6.
 *
 * The strips alternate dark/light (even index = dark) between the finder patterns.
 * Scanners read these to determine module size and derive the coordinate grid.
 * The loop also covers the separator positions at both ends, which naturally
 * receive a light value (odd index) from the alternating pattern.
 */
function timing() {
	for (let x = FINDER_SIZE; x <= size - FINDER_SIZE - 1; x++) {
		grid[TIMING_STRIP][x]     = x % 2 === 0 ? 1 : 0;
		reserved[TIMING_STRIP][x] = true;
	}
	for (let y = FINDER_SIZE; y <= size - FINDER_SIZE - 1; y++) {
		grid[y][TIMING_STRIP]     = y % 2 === 0 ? 1 : 0;
		reserved[y][TIMING_STRIP] = true;
	}
}

/**
 * Places the required dark module at row (4 * version + 9), column 8.
 *
 * Every valid QR code must have this module dark per the spec. Its position is
 * fixed regardless of version, data content, or masking pattern.
 */
function darkModule() {
	grid[4 * version + 9][DARK_MODULE_COL]     = 1;
	reserved[4 * version + 9][DARK_MODULE_COL] = true;
}

/**
 * Draws all structural patterns onto the grid in spec order.
 *
 * Call this before placing format information or data modules. The order matters:
 * finders first so alignment/timing checks can skip reserved cells correctly.
 */
export function generate() {
	finders();
	alignments();
	timing();
	darkModule();
}
