import { grid, size, pixelSize, width, padding, generate } from './qr-generator.js';

export const sketch = (p) => {
	p.setup = () => {
		p.createCanvas(width, width);
		p.noLoop();
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
