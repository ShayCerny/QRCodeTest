import qrData from "./qr_data.json" assert { type: "json" };
const { alignmentPatternPositions, characterCapacities } = qrData;

export const version = 2;
export const size = 17 + version * 4;
const targetWidth = screen.width * 0.3;
export const pixelSize = targetWidth / size;
export const padding = pixelSize * 4;
export const width = size * pixelSize + padding * 2;

export const grid = Array.from({ length: size }, () => new Array(size).fill(null));
const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

const coords = alignmentPatternPositions[version];
const last = coords[coords.length - 1];
const alignmentCenters = [];

for (const r of coords) {
	for (const c of coords) {
		if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
		alignmentCenters.push([r, c]);
	}
}

function finders() {
	const positions = [
		[0, 0],
		[size - 7, 0],
		[0, size - 7],
	];

	for (const [startCol, startRow] of positions) {
		for (let i = 0; i < 7; i++) {
			for (let j = 0; j < 7; j++) {
				const isOuterBorder = i === 0 || i === 6 || j === 0 || j === 6;
				const isCenter3x3 = i >= 2 && i <= 4 && j >= 2 && j <= 4;

				grid[startCol + i][startRow + j] = isOuterBorder || isCenter3x3 ? 1 : 0;
				reserved[startCol + i][startRow + j] = true;
			}
		}
	}
}

function alignments() {
	for (const [r, c] of alignmentCenters) {
		for (let i = -2; i <= 2; i++) {
			for (let j = -2; j <= 2; j++) {
				const isOuterBorder = i === -2 || i === 2 || j === -2 || j === 2;
				const isCenter = i === 0 && j === 0;

				grid[r + i][c + j] = isOuterBorder || isCenter ? 1 : 0;
				reserved[r + i][c + j] = true;
			}
		}
	}
}

function timing() {
	for (let x = 7; x <= size - 8; x++) {
		grid[6][x] = x % 2 === 0 ? 1 : 0;
		reserved[6][x] = true;
	}
	for (let y = 7; y <= size - 8; y++) {
		grid[y][6] = y % 2 === 0 ? 1 : 0;
		reserved[y][6] = true;
	}
}

function darkModule() {
	grid[4 * version + 9][8] = 1;
	reserved[4 * version + 9][8] = true;
}

export function generate() {
	finders();
	alignments();
	timing();
	darkModule();
}
