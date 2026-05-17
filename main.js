import p5 from "p5";
import { sketch } from "./index.js";
import { detectMode, encodeData } from "./encoder.js";

const dataInput = document.getElementById("data");
const ECLInput = document.getElementById("ECL");
const p5Instance = new p5(sketch);

let debounceTimer;
const handleValue = () => {
	const data = dataInput.value === "" ? "Hello There" : dataInput.value;
	const ecl = ECLInput.value;
	console.log("Data:", data, "| ECL:", ecl);
	const mode = detectMode(data);
	encodeData(data, mode, ecl);
	p5Instance.redraw();
};

dataInput.addEventListener("input", () => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(handleValue, 500);
});

dataInput.addEventListener("blur", () => {
	clearTimeout(debounceTimer);
	handleValue();
});

ECLInput.addEventListener("change", () => {
	clearTimeout(debounceTimer);
	handleValue();
});
