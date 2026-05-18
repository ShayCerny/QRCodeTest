/**
 * QR code matrix builder.
 *
 * Instantiating QR places all structural patterns (finders + separators,
 * alignment patterns, timing strips, dark module, format/version info areas)
 * and marks them reserved. Call placeData() afterwards to fill the remaining
 * cells with the interleaved data + EC codeword stream.
 *
 * Key instance properties:
 *   version  — QR version (1–40)
 *   size     — module width/height (4 * version + 17)
 *   grid     — 2D array (1 = dark, 0 = light, null = not yet placed)
 *   reserved — 2D boolean array; true where a structural pattern occupies a cell
 */

import qrData from "./qr_data.json" assert { type: "json" };
const { alignmentPatternPositions, remainderBits } = qrData;

const FINDER_SIZE     = 7;
const TIMING_STRIP    = 6;
const DARK_MODULE_COL = 8;

/** 2-bit error correction level indicators per the QR spec. */
const ECL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

/**
 * Generator polynomial for the 10-bit BCH code that protects format information.
 * x^10 + x^8 + x^5 + x^4 + x^2 + x + 1 = 0b10100110111
 */
const FORMAT_BCH_GENERATOR = 0x537;

/** XOR mask applied to the 15-bit format string per the QR spec. */
const FORMAT_MASK = 0x5412;

export class QR {
	version;
	size;
	grid;
	reserved;
	#alignmentCenters;

	constructor(version) {
		this.version  = version;
		this.size     = 4 * version + 17;
		this.grid     = Array.from({ length: this.size }, () => new Array(this.size).fill(null));
		this.reserved = Array.from({ length: this.size }, () => new Array(this.size).fill(false));

		const coords = alignmentPatternPositions[version];
		const last   = coords[coords.length - 1];
		this.#alignmentCenters = [];
		for (const r of coords) {
			for (const c of coords) {
				if ((r === TIMING_STRIP && c === TIMING_STRIP) ||
				    (r === TIMING_STRIP && c === last)          ||
				    (r === last         && c === TIMING_STRIP)) continue;
				this.#alignmentCenters.push([r, c]);
			}
		}

		this.#finders();
		this.#alignments();
		this.#timing();
		this.#darkModule();
		this.#formatInfo();
		if (version >= 7) this.#versionInfo();
	}

	// ─── Structural pattern methods ───────────────────────────────────────────

	#finders() {
		const positions = [
			[0,                  0               ],
			[this.size - FINDER_SIZE, 0          ],
			[0,                  this.size - FINDER_SIZE],
		];

		for (const [startRow, startCol] of positions) {
			for (let i = 0; i < FINDER_SIZE; i++) {
				for (let j = 0; j < FINDER_SIZE; j++) {
					const isOuterBorder = i === 0 || i === 6 || j === 0 || j === 6;
					const isCenter3x3   = i >= 2 && i <= 4 && j >= 2 && j <= 4;
					this.grid[startRow + i][startCol + j]     = isOuterBorder || isCenter3x3 ? 1 : 0;
					this.reserved[startRow + i][startCol + j] = true;
				}
			}

			const sepRow   = startRow === 0 ? startRow + FINDER_SIZE : startRow - 1;
			const sepCol   = startCol === 0 ? startCol + FINDER_SIZE : startCol - 1;
			const colStart = Math.min(startCol, sepCol);
			const rowStart = Math.min(startRow, sepRow);

			for (let j = colStart; j <= colStart + FINDER_SIZE; j++) {
				this.grid[sepRow][j]     = 0;
				this.reserved[sepRow][j] = true;
			}
			for (let i = rowStart; i <= rowStart + FINDER_SIZE; i++) {
				this.grid[i][sepCol]     = 0;
				this.reserved[i][sepCol] = true;
			}
		}
	}

	#alignments() {
		for (const [r, c] of this.#alignmentCenters) {
			for (let i = -2; i <= 2; i++) {
				for (let j = -2; j <= 2; j++) {
					const isOuterBorder = i === -2 || i === 2 || j === -2 || j === 2;
					const isCenter      = i === 0 && j === 0;
					this.grid[r + i][c + j]     = isOuterBorder || isCenter ? 1 : 0;
					this.reserved[r + i][c + j] = true;
				}
			}
		}
	}

	#timing() {
		for (let x = FINDER_SIZE; x <= this.size - FINDER_SIZE - 1; x++) {
			this.grid[TIMING_STRIP][x]     = x % 2 === 0 ? 1 : 0;
			this.reserved[TIMING_STRIP][x] = true;
		}
		for (let y = FINDER_SIZE; y <= this.size - FINDER_SIZE - 1; y++) {
			this.grid[y][TIMING_STRIP]     = y % 2 === 0 ? 1 : 0;
			this.reserved[y][TIMING_STRIP] = true;
		}
	}

	#darkModule() {
		this.grid[4 * this.version + 9][DARK_MODULE_COL]     = 1;
		this.reserved[4 * this.version + 9][DARK_MODULE_COL] = true;
	}

	#formatInfo() {
		for (let j = 0; j <= 8; j++) {
			if (j !== TIMING_STRIP) this.reserved[8][j] = true;
		}
		for (let i = 0; i <= 8; i++) {
			if (i !== TIMING_STRIP) this.reserved[i][8] = true;
		}
		for (let j = this.size - FINDER_SIZE - 1; j < this.size; j++) {
			this.reserved[8][j] = true;
		}
		for (let i = this.size - FINDER_SIZE; i < this.size; i++) {
			this.reserved[i][8] = true;
		}
	}

	#versionInfo() {
		for (let i = 0; i < 6; i++) {
			for (let j = this.size - 11; j <= this.size - 9; j++) {
				this.reserved[i][j] = true;
			}
		}
		for (let i = this.size - 11; i <= this.size - 9; i++) {
			for (let j = 0; j < 6; j++) {
				this.reserved[i][j] = true;
			}
		}
	}

	// ─── Format information ───────────────────────────────────────────────────

	/**
	 * Writes the 15-bit format information string into both reserved copies.
	 *
	 * The string encodes the error correction level and mask pattern:
	 *   5 data bits  — 2-bit ECL indicator + 3-bit mask pattern number
	 *   10 BCH bits  — remainder of (data × x^10) ÷ generator polynomial
	 *   XOR mask     — 101010000010010, applied to the full 15 bits
	 *
	 * Copy 1 wraps the top-left finder (row 8 and col 8, skipping the timing
	 * strips). Copy 2 mirrors it across the top-right and bottom-left edges.
	 * Bit 0 (LSB) is placed first; bit 14 (MSB) last.
	 *
	 * @param {'L'|'M'|'Q'|'H'} ecLevel     - Error correction level
	 * @param {number}           maskPattern - Mask pattern index (0–7)
	 */
	writeFormatInfo(ecLevel, maskPattern) {
		const data = (ECL_BITS[ecLevel] << 3) | maskPattern;

		// BCH: shift data up 10 bits then reduce modulo the generator
		let remainder = data << 10;
		for (let i = 4; i >= 0; i--) {
			if ((remainder >> (i + 10)) & 1) remainder ^= FORMAT_BCH_GENERATOR << i;
		}

		const format = ((data << 10) | (remainder & 0x3FF)) ^ FORMAT_MASK;

		// Copy 1: position 0 (MSB) → (8,0) … position 14 (LSB) → (0,8), skipping timing strip cells
		const copy1 = [
			[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
			[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
		];

		// Copy 2: bit 0 → (size-1,8) … bit 14 → (8,size-1)
		const copy2 = [
			[this.size-1,8],[this.size-2,8],[this.size-3,8],[this.size-4,8],
			[this.size-5,8],[this.size-6,8],[this.size-7,8],
			[8,this.size-8],[8,this.size-7],[8,this.size-6],[8,this.size-5],
			[8,this.size-4],[8,this.size-3],[8,this.size-2],[8,this.size-1],
		];

		for (let bit = 0; bit < 15; bit++) {
			const value = (format >> (14 - bit)) & 1;
			this.grid[copy1[bit][0]][copy1[bit][1]] = value;
			this.grid[copy2[bit][0]][copy2[bit][1]] = value;
		}
	}

	// ─── Data placement ───────────────────────────────────────────────────────

	/**
	 * Places interleaved data + EC codewords onto the grid using the QR spec's
	 * 2-column zigzag scan pattern.
	 *
	 * Walks right-to-left in pairs of columns, alternating upward and downward
	 * passes. The vertical timing strip (col 6) is skipped. Reserved cells are
	 * left untouched; remaining cells receive the next bit from the codeword
	 * stream. Cells beyond the end of the stream are set to 0 (light).
	 *
	 * @param {number[]} codewords - Interleaved data + EC bytes (integers 0–255)
	 */
	placeData(codewords) {
		const bits = [];
		for (const byte of codewords) {
			for (let i = 7; i >= 0; i--) {
				bits.push((byte >> i) & 1);
			}
		}

		// Append the required number of trailing zero bits for this version
		for (let i = 0; i < remainderBits[this.version]; i++) {
			bits.push(0);
		}

		let bitIndex = 0;
		let upward   = true;

		for (let right = this.size - 1; right >= 1; right -= 2) {
			if (right === TIMING_STRIP) right--;

			for (let vert = 0; vert < this.size; vert++) {
				const row = upward ? this.size - 1 - vert : vert;
				for (const col of [right, right - 1]) {
					if (!this.reserved[row][col]) {
						this.grid[row][col] = bitIndex < bits.length ? bits[bitIndex++] : 0;
					}
				}
			}
			upward = !upward;
		}
	}
}
