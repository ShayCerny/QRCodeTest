/**
 * p5.js rendering sketch for the QR code canvas.
 *
 * A QR instance is passed in via setQR() from main.js. The canvas resizes
 * automatically to match the version's module count on each redraw. The sketch
 * is static by default (noLoop) and only redraws when p5Instance.redraw() is
 * called.
 *
 * Coordinate mapping:
 *   grid[row][col]  →  canvas position (col * pixelSize + padding, row * pixelSize + padding)
 *   Row 0 is the top; col 0 is the left.
 */

let currentQR = null;

/**
 * Sets the QR instance to render on the next draw call.
 * @param {import('./qr-generator.js').QR} qr
 */
export function setQR(qr) {
	currentQR = qr;
}

/**
 * Defines the p5.js sketch. Pass this function to `new p5(sketch)` to mount
 * the canvas and start the render cycle.
 *
 * @param {import('p5')} p - The p5 instance provided by the p5 constructor
 */
export const sketch = (p) => {
	p.setup = () => {
		p.createCanvas(400, 400);
		p.noLoop();
	};

	p.draw = () => {
		if (!currentQR) return;

		const { size, grid } = currentQR;
		const pixelSize = Math.max(1, Math.floor((screen.width * 0.1) / size));
		const padding = pixelSize * 4;
		const canvasSize = size * pixelSize + padding * 2;

		if (p.width !== canvasSize) p.resizeCanvas(canvasSize, canvasSize);

		p.background(255);
		p.noStroke();
		p.fill("black");

		for (let row = 0; row < size; row++) {
			for (let col = 0; col < size; col++) {
				if (grid[row][col] === 1) {
					p.square(col * pixelSize + padding, row * pixelSize + padding, pixelSize);
				}
			}
		}
	};
};
