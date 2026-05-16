const version = 2;
const size = 17 + version * 4;
const targetWidth = screen.width * 0.3;
const pixelSize = targetWidth / size;

const width = size * pixelSize;

const grid = Array.from({ length: size }, () => new Array(size).fill(null));
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

function finders(startX, startY) {
	const positions = [
		[0, 0],
		[size - 7, 0],
		[0, size - 7],
	];

	for (const [startCol, startRow] of positions) {
		for (i = 0; i < 7; i++) {
			for (j = 0; j < 7; j++) {
				const x = (startCol + i) * pixelSize;
				const y = (startRow + j) * pixelSize;

				const isOuterBorder = i === 0 || i === 6 || j === 0 || j === 6;
				const isCenter3x3 = i >= 2 && i <= 4 && j >= 2 && j <= 4;

				if (isOuterBorder || isCenter3x3) {
					grid[startCol + i][startRow + j] = 1;
				} else {
					grid[startCol + i][startRow + j] = 0;
				}
				reserved[startCol + i][startRow + j] = true;
			}
		}
	}
}

function alignments(startX, startY) {
	for (const [r, c] of alignmentCenters) {
		for (i = -2; i <= 2; i++) {
			for (j = -2; j <= 2; j++) {
				const x = c * pixelSize + i * pixelSize;
				const y = r * pixelSize + j * pixelSize;
				const isOuterBorder = i === -2 || i === 2 || j === -2 || j === 2;
				const isCenter = i == 0 && j == 0;

				if (isOuterBorder || isCenter) {
					grid[r + i][c + j] = 1;
				} else {
					grid[r + i][c + j] = 0;
				}
				reserved[r + i][c + j] = true;
			}
		}
	}
}

function timing() {
	// Horizontal
	for (x = 7; x <= size - 8; x++) {
		if (x % 2 == 0) {
			grid[6][x] = 1;
		} else {
			grid[6][x] = 0;
		}
		reserved[6][x] = true;
	}
	// Vertical
	for (y = 7; y <= size - 8; y++) {
		if (y % 2 == 0) {
			grid[y][6] = 1;
		} else {
			grid[y][6] = 0;
		}
		reserved[y][6] = true;
	}
}

function darkModule() {
	grid[4 * version + 9][8] = 1;
	reserved[4 * version + 9][8] = true;
}

function setup() {
	createCanvas(width, width);
	noLoop();
	background(255, 205, 0);
}

function draw() {
	finders();
	alignments();
	timing();
	darkModule();

	fill("black");
	for (row = 0; row < size; row++) {
		for (col = 0; col < size; col++) {
			if (grid[row][col] === 1) {
				square(col * pixelSize, row * pixelSize, pixelSize);
			}
		}
	}
}
