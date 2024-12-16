import Mesh from "./mesh.js";

const skybox = new Mesh(
	{
		indices: [
			{
				material: "none",
				array: [0, 1, 2, 3, 0, 2],
			},
			{
				material: "none",
				array: [4, 5, 6, 7, 4, 6],
			},
			{
				material: "none",
				array: [8, 9, 10, 11, 8, 10],
			},
			{
				material: "none",
				array: [12, 13, 14, 15, 12, 14],
			},
			{
				material: "none",
				array: [16, 17, 18, 19, 16, 18],
			},
			{
				material: "none",
				array: [20, 21, 22, 23, 20, 22],
			},
		],
		vertices: [
			// Front face
			1, 1, 1,    1, -1, 1,    -1, -1, 1,    -1, 1, 1,
			// Back face
			1, 1, -1,    -1, 1, -1,    -1, -1, -1,    1, -1, -1,
			// Top face
			1, 1, 1,    -1, 1, 1,    -1, 1, -1,    1, 1, -1,
			// Bottom face
			1, -1, 1,    1, -1, -1,    -1, -1, -1,    -1, -1, 1,
			// Right face
			1, 1, 1,    1, 1, -1,    1, -1, -1,    1, -1, 1,
			// Left face
			-1, 1, 1,    -1, -1, 1,    -1, -1, -1,    -1, 1, -1
		],
		uvs: [
			// Front face
			0, 0,    0, 1,    1, 1,    1, 0,
			// Back face
			1, 0,    0, 0,    0, 1,    1, 1,
			// Top face
			0, 0,    0, 1,    1, 1,    1, 0,
			// Bottom face
			0, 0,    0, 1,    1, 1,    1, 0,
			// Right face
			1, 0,    0, 0,    0, 1,    1, 1,
			// Left face
			0, 0,    0, 1,    1, 1,    1, 0
		],
	}
);

const screenQuad = new Mesh({
    vertices: [
        -1, -1, 0,
        1, -1, 0,
        -1, 1, 0,
        1, 1, 0,
    ],
    indices: [{
        array: [0, 1, 2, 2, 1, 3],
        material: "none"
    }]
});

const spotlightVolume = new Mesh({
    vertices: [
        // Apex of the cone (at z = 0)
        0.0, 0.0, 0.0,    // 0 (apex)

        // Generate 32 vertices around the base circle (at z = -1)
        ...[...Array(32)].map((_, i) => {
            const angle = (i * 2 * Math.PI) / 32;
            return [
                Math.cos(angle), // x
                Math.sin(angle), // y
                -1.0            // z
            ];
        }).flat()
    ],
    indices: [{
        array: [
            // Base triangles (forming the base of the cone)
            // Reversed winding order for the base
            ...[...Array(30)].map((_, i) => [
                1, i + 1, i + 2
            ]).flat(),

            // Connect last triangle of the base
            1, 32, 1,

            // Side triangles connecting apex to base
            // Reversed winding order for the sides
            ...[...Array(32)].map((_, i) => [
                0, ((i + 1) % 32) + 1, i + 1
            ]).flat()
        ],
        material: "none"
    }]
});

const pointLightVolume = new Mesh({
    vertices: [
        // Front face
        -1.0,  1.0,  1.0,    // 0
         1.0,  1.0,  1.0,    // 1
        -1.0, -1.0,  1.0,    // 2
         1.0, -1.0,  1.0,    // 3

        // Back face
        -1.0,  1.0, -1.0,    // 4
         1.0,  1.0, -1.0,    // 5
        -1.0, -1.0, -1.0,    // 6
         1.0, -1.0, -1.0,    // 7
    ],
    indices: [{
        array: [
            // Front face
            0, 1, 2,    2, 1, 3,
            // Back face
            5, 4, 7,    4, 6, 7,
            // Top face
            0, 4, 1,    4, 5, 1,
            // Bottom face
            2, 3, 6,    3, 7, 6,
            // Right face
            1, 5, 3,    5, 7, 3,
            // Left face
            4, 0, 6,    0, 2, 6
        ],
        material: "none"
    }]
});

export { screenQuad, skybox, pointLightVolume, spotlightVolume };
