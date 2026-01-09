// Web Worker for pixel art processing
// Handles median cut quantization and dithering off the main thread

// Median Cut Quantization - builds a palette of N colors
function medianCutQuantization(pixels, maxColors) {
    // Recursively split color space
    function splitBucket(bucket, depth) {
        if (depth === 0 || bucket.length <= 1) {
            // Calculate average color for this bucket
            const avg = [0, 0, 0];
            for (const pixel of bucket) {
                avg[0] += pixel[0];
                avg[1] += pixel[1];
                avg[2] += pixel[2];
            }
            return [[
                Math.round(avg[0] / bucket.length),
                Math.round(avg[1] / bucket.length),
                Math.round(avg[2] / bucket.length)
            ]];
        }

        // Find channel with greatest range
        const ranges = [0, 1, 2].map(channel => {
            const values = bucket.map(p => p[channel]);
            return Math.max(...values) - Math.min(...values);
        });
        const channel = ranges.indexOf(Math.max(...ranges));

        // Sort by the channel with greatest range
        bucket.sort((a, b) => a[channel] - b[channel]);

        // Split in half
        const mid = Math.floor(bucket.length / 2);
        const left = bucket.slice(0, mid);
        const right = bucket.slice(mid);

        return [
            ...splitBucket(left, depth - 1),
            ...splitBucket(right, depth - 1)
        ];
    }

    const depth = Math.ceil(Math.log2(maxColors));
    return splitBucket(pixels, depth).slice(0, maxColors);
}

// Find nearest color in palette
function findNearestColor(pixel, palette) {
    let minDist = Infinity;
    let nearest = palette[0];

    for (const color of palette) {
        const dr = pixel[0] - color[0];
        const dg = pixel[1] - color[1];
        const db = pixel[2] - color[2];
        const dist = dr * dr + dg * dg + db * db;

        if (dist < minDist) {
            minDist = dist;
            nearest = color;
        }
    }

    return nearest;
}

// Floyd-Steinberg Dithering
function applyDithering(data, width, height, palette) {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;

            const oldPixel = [data[i], data[i + 1], data[i + 2]];
            const newPixel = findNearestColor(oldPixel, palette);

            data[i] = newPixel[0];
            data[i + 1] = newPixel[1];
            data[i + 2] = newPixel[2];

            // Calculate error
            const errR = oldPixel[0] - newPixel[0];
            const errG = oldPixel[1] - newPixel[1];
            const errB = oldPixel[2] - newPixel[2];

            // Distribute error to neighboring pixels
            // Right pixel (x+1, y)
            if (x + 1 < width) {
                const idx = i + 4;
                data[idx] = Math.min(255, Math.max(0, data[idx] + errR * 7 / 16));
                data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + errG * 7 / 16));
                data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + errB * 7 / 16));
            }

            // Bottom-left pixel (x-1, y+1)
            if (x > 0 && y + 1 < height) {
                const idx = ((y + 1) * width + (x - 1)) * 4;
                data[idx] = Math.min(255, Math.max(0, data[idx] + errR * 3 / 16));
                data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + errG * 3 / 16));
                data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + errB * 3 / 16));
            }

            // Bottom pixel (x, y+1)
            if (y + 1 < height) {
                const idx = ((y + 1) * width + x) * 4;
                data[idx] = Math.min(255, Math.max(0, data[idx] + errR * 5 / 16));
                data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + errG * 5 / 16));
                data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + errB * 5 / 16));
            }

            // Bottom-right pixel (x+1, y+1)
            if (x + 1 < width && y + 1 < height) {
                const idx = ((y + 1) * width + (x + 1)) * 4;
                data[idx] = Math.min(255, Math.max(0, data[idx] + errR * 1 / 16));
                data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + errG * 1 / 16));
                data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + errB * 1 / 16));
            }
        }
    }
}

// Message handler
self.onmessage = function(e) {
    const { imageData, colorCount, enableDithering } = e.data;
    const { data, width, height } = imageData;

    // Collect all pixels
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    // Generate palette using median cut
    const palette = medianCutQuantization(pixels, Math.max(2, colorCount));

    if (enableDithering) {
        // Apply Floyd-Steinberg dithering
        applyDithering(data, width, height, palette);
    } else {
        // Simple nearest color mapping without dithering
        for (let i = 0; i < data.length; i += 4) {
            const pixel = [data[i], data[i + 1], data[i + 2]];
            const nearest = findNearestColor(pixel, palette);
            data[i] = nearest[0];
            data[i + 1] = nearest[1];
            data[i + 2] = nearest[2];
        }
    }

    // Send processed image data back
    self.postMessage({ imageData }, [imageData.data.buffer]);
};
