/**
 * p5.js rendering sketch for the QR code canvas.
 *
 * Reads the module grid produced by qr-generator.js and renders each dark module
 * (value 1) as a filled black square. The canvas is static by default (noLoop)
 * and only redraws when p5Instance.redraw() is called from main.js.
 *
 * Coordinate mapping:
 *   grid[row][col]  →  canvas position (col * pixelSize + padding, row * pixelSize + padding)
 *   Row 0 is the top; col 0 is the left.
 */

import { grid, size, pixelSize, width, padding, generate } from './qr-generator.js';

/**
 * Defines the p5.js sketch. Pass this function to `new p5(sketch)` to mount
 * the canvas and start the render cycle.
 *
 * @param {import('p5')} p - The p5 instance provided by the p5 constructor
 */
export const sketch = (p) => {
	p.setup = () => {
		p.createCanvas(width, width);
		p.noLoop(); // render on demand only; call p5Instance.redraw() to update
	};

	p.draw = () => {
		generate();

		p.fill('black');
		for (let row = 0; row < size; row++) {
			for (let col = 0; col < size; col++) {
				if (grid[row][col] === 1) {
					p.square(col * pixelSize + padding, row * pixelSize + padding, pixelSize);
				}
			}
		}
	};
};
