// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const gridSlider = document.getElementById('gridSlider');
const scaleSlider = document.getElementById('scaleSlider');
const colorSlider = document.getElementById('colorSlider');
const aspectRatioCheckbox = document.getElementById('aspectRatio');
const ditheringCheckbox = document.getElementById('dithering');
const downscaleModeRadios = document.querySelectorAll('input[name="downscaleMode"]');
const gridValue = document.getElementById('gridValue');
const scaleValue = document.getElementById('scaleValue');
const colorValue = document.getElementById('colorValue');
const workCanvas = document.getElementById('workCanvas');
const outCanvas = document.getElementById('outCanvas');
const placeholder = document.getElementById('placeholder');
const downloadSection = document.getElementById('downloadSection');
const downloadSmall = document.getElementById('downloadSmall');
const downloadScaled = document.getElementById('downloadScaled');

// Canvas contexts
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
const outCtx = outCanvas.getContext('2d');

// Global state
let currentImage = null;
let worker = null;
let renderTimeout = null;

// Initialize Web Worker
try {
    worker = new Worker('worker.js');
    worker.onmessage = function(e) {
        const { imageData } = e.data;
        workCtx.putImageData(imageData, 0, 0);

        // Upscale to output canvas
        const scale = parseInt(scaleSlider.value);
        outCanvas.width = imageData.width * scale;
        outCanvas.height = imageData.height * scale;
        outCtx.imageSmoothingEnabled = false;
        outCtx.drawImage(workCanvas, 0, 0, imageData.width, imageData.height,
                         0, 0, imageData.width * scale, imageData.height * scale);
    };
} catch (e) {
    console.warn('Web Worker not available, using main thread fallback');
}

// Debounce function for performance
function debounce(func, wait) {
    return function executedFunction(...args) {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => func(...args), wait);
    };
}

// Update slider value displays
gridSlider.addEventListener('input', () => {
    gridValue.textContent = gridSlider.value;
});

scaleSlider.addEventListener('input', () => {
    scaleValue.textContent = scaleSlider.value + 'x';
});

colorSlider.addEventListener('input', () => {
    colorValue.textContent = colorSlider.value;
});

// File input handler
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    }
});

// Upload section click handler
uploadSection.addEventListener('click', () => {
    fileInput.click();
});

// Drag and drop handlers
uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('dragover');
});

uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('dragover');
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    }
});

// Load image from file
function loadImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
        currentImage = img;
        URL.revokeObjectURL(url);
        render();

        // Show download buttons
        placeholder.style.display = 'none';
        downloadSection.classList.add('active');
    };

    img.onerror = () => {
        alert('Failed to load image. Please try another file.');
        URL.revokeObjectURL(url);
    };

    img.src = url;
}

// Main render function
function render() {
    if (!currentImage) return;

    const gridSize = parseInt(gridSlider.value);
    const scale = parseInt(scaleSlider.value);
    const colorCount = parseInt(colorSlider.value);
    const preserveAspectRatio = aspectRatioCheckbox.checked;
    const enableDithering = ditheringCheckbox.checked;
    const downscaleMode = document.querySelector('input[name="downscaleMode"]:checked').value;

    // Calculate grid dimensions
    let gw, gh;
    if (preserveAspectRatio) {
        const aspectRatio = currentImage.width / currentImage.height;
        if (aspectRatio >= 1) {
            gw = gridSize;
            gh = Math.round(gridSize / aspectRatio);
        } else {
            gh = gridSize;
            gw = Math.round(gridSize * aspectRatio);
        }
    } else {
        gw = gh = gridSize;
    }

    // Ensure minimum dimensions
    gw = Math.max(1, gw);
    gh = Math.max(1, gh);

    // Set work canvas dimensions and draw image
    workCanvas.width = gw;
    workCanvas.height = gh;

    // Apply downscale mode
    if (downscaleMode === 'sharp') {
        workCtx.imageSmoothingEnabled = false;
    } else {
        workCtx.imageSmoothingEnabled = true;
    }

    workCtx.drawImage(currentImage, 0, 0, gw, gh);

    // Apply palette-based color reduction
    applyPaletteQuantization(colorCount, enableDithering);
}

// Debounced render function for sliders
const debouncedRender = debounce(render, 50);

// Median Cut Quantization - builds a palette of N colors
function medianCutQuantization(imageData, maxColors) {
    const pixels = [];
    const data = imageData.data;

    // Collect all unique colors
    for (let i = 0; i < data.length; i += 4) {
        pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

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
function applyDithering(imageData, palette) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

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

// Apply palette quantization with optional dithering
function applyPaletteQuantization(colorCount, enableDithering) {
    const imageData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);

    // Use Web Worker if available for better performance
    if (worker) {
        // Clone the image data for transfer to worker
        const clonedData = new Uint8ClampedArray(imageData.data);
        const clonedImageData = new ImageData(clonedData, imageData.width, imageData.height);

        worker.postMessage({
            imageData: clonedImageData,
            colorCount: Math.max(2, colorCount),
            enableDithering
        }, [clonedData.buffer]);
    } else {
        // Fallback to main thread processing
        const data = imageData.data;

        // Generate palette using median cut
        const palette = medianCutQuantization(imageData, Math.max(2, colorCount));

        if (enableDithering) {
            // Apply Floyd-Steinberg dithering
            applyDithering(imageData, palette);
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

        // Write modified pixel data back
        workCtx.putImageData(imageData, 0, 0);

        // Upscale to output canvas
        const scale = parseInt(scaleSlider.value);
        outCanvas.width = imageData.width * scale;
        outCanvas.height = imageData.height * scale;
        outCtx.imageSmoothingEnabled = false;
        outCtx.drawImage(workCanvas, 0, 0, imageData.width, imageData.height,
                         0, 0, imageData.width * scale, imageData.height * scale);
    }
}

// Download small (grid size) version
downloadSmall.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `pixel-art-small-${workCanvas.width}x${workCanvas.height}.png`;
    link.href = workCanvas.toDataURL('image/png');
    link.click();
});

// Download scaled (preview size) version
downloadScaled.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `pixel-art-scaled-${outCanvas.width}x${outCanvas.height}.png`;
    link.href = outCanvas.toDataURL('image/png');
    link.click();
});

// Re-render when controls change
// Use debounced render for sliders to improve performance
gridSlider.addEventListener('input', debouncedRender);
colorSlider.addEventListener('input', debouncedRender);

// No debounce for scale slider (it's just upscaling, not heavy processing)
scaleSlider.addEventListener('input', render);

// No debounce for checkboxes and radio buttons
aspectRatioCheckbox.addEventListener('change', render);
ditheringCheckbox.addEventListener('change', render);

downscaleModeRadios.forEach(radio => {
    radio.addEventListener('change', render);
});
