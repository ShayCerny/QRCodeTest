import qrData from "./qr_data.json" assert { type: "json" };
const characterCapacities = qrData.characterCapacities;
const alphanumericValues = qrData.alphanumericValues;

const MODES = {
	numeric: 0b0001, //1
	alphanumeric: 0b0010, //2
	byte: 0b0100, //4
	kanji: 0b1000, //8
};

const CHAR_COUNT_BITS = {
	numeric: [10, 12, 14],
	alphanumeric: [9, 11, 13],
	byte: [8, 16, 16],
	kanji: [8, 10, 12],
};

function getCharCountBits(mode, version) {
	const i = version <= 9 ? 0 : version <= 26 ? 1 : 2;
	return CHAR_COUNT_BITS[mode][i];
}

function encodeNumeric(data) {
	const groups = data.match(/.{1,3}/g);

	return groups
		.map((group) => {
			const bits = group.length === 3 ? 10 : group.length == 2 ? 7 : 4;
			return parseInt(group, 10).toString(2).padStart(bits, "0");
		})
		.join("");
}

function encodeAlpha(data) {
	const pairs = data.match(/.{1,2}/g);

	return pairs
		.map((pair) => {
			if (pair.length === 2) {
				const val = alphanumericValues[pair[0]] * 45 + alphanumericValues[pair[1]];
				return val.toString(2).padStart(11, "0");
			} else {
				return alphanumericValues[pair[0]].toString(2).padStart(6, "0");
			}
		})
		.join("");
}

function encodeByte(data) {
	return data
		.split("")
		.map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
		.join("");
}

// TODO KANJI

export function detectMode(data) {
	if (/^\d+$/.test(data)) return "numeric";
	if (/^[0-9A-Z $%*+\-./:]+$/.test(data)) return "alphanumeric";
	if (/^[\x00-\xFF]+$/.test(data)) return "byte";
	// TODO: Kanji Mode
	throw new Error("Data cannot be encoded in a standard QR mode");
}

export function encodeData(data, mode, ECL) {
	const len = data.length;
	let v = 1;
	while (characterCapacities[v][ECL][mode] < len) {
		v++;
	}

	const modeInd = MODES[mode].toString(2).padStart(4, "0");
	const lenBitPad = getCharCountBits(mode, v);
	const lenInd = len.toString(2).padStart(lenBitPad, "0");

	console.log(v, modeInd, lenInd);

	let encoding = "";

	switch (mode) {
		case "numeric":
			encoding = encodeNumeric(data);
			break;
		case "alphanumeric":
			encoding = encodeAlpha(data);
			break;
		case "byte":
			encoding = encodeByte(data);
		default:
			break;
	}

	
}
