package rendering

import (
	"math"
)

// NoiseTextureSize is the side length of the procedural detail texture.
const NoiseTextureSize = 128

var noisePerm = [256]int{
	151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
	36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120,
	234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
	88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71,
	134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133,
	230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161,
	1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130,
	116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250,
	124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227,
	47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
	154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98,
	108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34,
	242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14,
	239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121,
	50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243,
	141, 128, 195, 78, 66, 215, 61, 156, 180,
}

func noiseGrad(hash int, x, y float64) float64 {
	h := hash & 15
	u := y
	if h < 8 {
		u = x
	}
	v := 0.0
	if h < 4 {
		v = y
	} else if h == 12 || h == 14 {
		v = x
	}
	if (h & 1) != 0 {
		u = -u
	}
	if (h & 2) != 0 {
		v = -v
	}
	return u + v
}

func noiseLerp(t, a, b float64) float64 {
	return a + t*(b-a)
}

func noisePerm512(i int) int {
	return noisePerm[i&255]
}

// noisePeriodic is periodic gradient (Perlin) noise over a fixed permutation
// table; the shaders' procedural detail expects exactly this hashing.
func noisePeriodic(x, y float64, period int) float64 {
	xi := int(math.Floor(x))
	yi := int(math.Floor(y))
	fx := x - float64(xi)
	fy := y - float64(yi)
	xi = xi % period
	yi = yi % period
	u := fx * fx * fx * (fx*(fx*6-15) + 10)
	v := fy * fy * fy * (fy*(fy*6-15) + 10)
	a := noisePerm512(xi) + yi
	aa := noisePerm512(a % 255)
	ab := noisePerm512((a + 1) % 255)
	b := noisePerm512((xi+1)%255) + yi
	ba := noisePerm512(b % 255)
	bb := noisePerm512((b + 1) % 255)
	return noiseLerp(v,
		noiseLerp(u, noiseGrad(noisePerm512(aa), fx, fy), noiseGrad(noisePerm512(ba), fx-1, fy)),
		noiseLerp(u, noiseGrad(noisePerm512(ab), fx, fy-1), noiseGrad(noisePerm512(bb), fx-1, fy-1)))
}

func noiseHash(x, y float64) float64 {
	n := math.Sin(x*12.9898+y*78.233) * 43758.5453
	return n - math.Floor(n)
}

// GenerateProceduralNoiseData builds the RGBA8 normal+height detail map (size*size*4 bytes).
func GenerateProceduralNoiseData(size int) []uint8 {
	data := make([]uint8, size*size*4)
	heightMap := make([]float32, size*size)
	fsize := float64(size)

	for i := 0; i < size*size; i++ {
		x := float64(i % size)
		y := float64(i / size)
		h := 0.0
		amp := 0.5
		freq := 4.0
		for k := 0; k < 4; k++ {
			h += noisePeriodic((x/fsize)*freq, (y/fsize)*freq, int(freq)) * amp
			amp *= 0.5
			freq *= 2.0
		}
		hh := h*0.5 + 0.5
		h = hh * hh * (3.0 - 2.0*hh)
		heightMap[i] = float32(math.Pow(h*0.8+noiseHash(x, y)*0.2, 1.5))
	}

	for i := 0; i < size*size; i++ {
		x := i % size
		y := i / size
		l := float64(heightMap[((x-1+size)%size)+y*size])
		r := float64(heightMap[((x+1)%size)+y*size])
		u := float64(heightMap[x+((y-1+size)%size)*size])
		d := float64(heightMap[x+((y+1)%size)*size])
		dx := (r - l) * 2.0
		dy := (d - u) * 2.0
		nz := 1.0
		ln := math.Sqrt(dx*dx + dy*dy + nz*nz)
		data[i*4] = uint8(((dx/ln)*0.5 + 0.5) * 255)
		data[i*4+1] = uint8(((dy/ln)*0.5 + 0.5) * 255)
		data[i*4+2] = uint8(((nz/ln)*0.5 + 0.5) * 255)
		data[i*4+3] = uint8(float64(heightMap[i]) * 255)
	}
	return data
}

// NewProceduralNoiseTexture uploads the detail map to b as a repeating, mipmapped texture.
func NewProceduralNoiseTexture(b *Backend, anisotropy int) *Texture {
	tex := NewTexture(b, &TextureDescriptor{
		Width:   NoiseTextureSize,
		Height:  NoiseTextureSize,
		Mipmaps: true,
		Data:    GenerateProceduralNoiseData(NoiseTextureSize),
	})
	if anisotropy > 1 {
		tex.anisotropy = anisotropy
	}
	tex.SetWrapMode("repeat")
	tex.GenerateMipmaps()
	return tex
}
