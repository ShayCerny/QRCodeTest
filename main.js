/**
 * Application entry point.
 *
 * Wires the UI controls (data input and error correction level selector) to the
 * QR encoder and p5 rendering layer. Text input is debounced so the encoder and
 * canvas only update after the user stops typing for 500ms. ECL changes from the
 * dropdown take effect immediately.
 */

import p5 from "p5";
import { sketch, setQR } from "./sketch.js";
import { QR } from "./qr-generator.js";
import { detectMode, encodeData } from "./encoder.js";
import { generateErrorCorrection } from "./error-correction.js";
import { selectBestMask, applyMask } from "./mask-evaluator.js";

const dataInput    = document.getElementById("data");
const ecLevelInput = document.getElementById("ecLevel");
const p5Instance   = new p5(sketch);

let debounceTimer;

/**
 * Reads the current UI values, runs the full encoder pipeline, and triggers a redraw.
 * Falls back to "Hello There" when the data field is empty.
 */
const handleValue = () => {
	const data    = dataInput.value === "" ? "Hello There" : dataInput.value;
	const ecLevel = ecLevelInput.value;
	const mode    = detectMode(data);
	const encoded = encodeData(data, mode, ecLevel);
	const codewords = generateErrorCorrection(encoded.codewords, encoded.version, ecLevel);

	const qr = new QR(encoded.version);
	qr.placeData(codewords);
	const bestMask = selectBestMask(qr);
	applyMask(qr, bestMask);
	qr.writeFormatInfo(ecLevel, bestMask);
	setQR(qr);
	p5Instance.redraw();
};

// Debounce text input: wait 500ms after the user stops typing before re-encoding
dataInput.addEventListener("input", () => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(handleValue, 500);
});

// ECL changes take effect immediately since they come from a controlled dropdown
ecLevelInput.addEventListener("change", () => {
	clearTimeout(debounceTimer);
	handleValue();
});
