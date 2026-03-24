const isFiniteNumber = (value) =>
	typeof value === "number" && Number.isFinite(value);

const isVec3 = (value) => {
	if (!value || typeof value.length !== "number" || value.length < 3) {
		return false;
	}

	return (
		isFiniteNumber(value[0]) &&
		isFiniteNumber(value[1]) &&
		isFiniteNumber(value[2])
	);
};

const copyVec3 = (target, source) => {
	target[0] = source[0];
	target[1] = source[1];
	target[2] = source[2];
	return target;
};

export { copyVec3, isVec3 };
