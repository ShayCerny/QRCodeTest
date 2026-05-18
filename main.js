/**
 * Application entry point.
 *
 * Wires the UI controls (data input and error correction level selector) to the
 * QR encoder and p5 rendering layer. Text input is debounced so the encoder and
 * canvas only update after the user stops typing for 500ms. ECL changes from the
 * dropdown take effect immediately.
 */

import p5 from "p5";
import { sketch } from "./sketch.js";
import { detectMode, encodeData } from "./encoder.js";

const dataInput  = document.getElementById("data");
const ECLInput   = document.getElementById("ECL");
const p5Instance = new p5(sketch);

let debounceTimer;

/**
 * Reads the current UI values, runs the encoder pipeline, and triggers a redraw.
 * Falls back to "Hello There" when the data field is empty.
 */
const handleValue = () => {
	const data = dataInput.value === "" ? "Hello There" : dataInput.value;
	const ecl  = ECLInput.value;
	console.log("Data:", data, "| ECL:", ecl);
	const mode    = detectMode(data);
	const encoded = encodeData(data, mode, ecl);
	console.log(encoded);
	p5Instance.redraw();
};

// Debounce text input: wait 500ms after the user stops typing before re-encoding
dataInput.addEventListener("input", () => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(handleValue, 500);
});

// ECL changes take effect immediately since they come from a controlled dropdown
ECLInput.addEventListener("change", () => {
	clearTimeout(debounceTimer);
	handleValue();
});
