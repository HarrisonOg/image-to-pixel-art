// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const gridSlider = document.getElementById('gridSlider');
const scaleSlider = document.getElementById('scaleSlider');
const colorSlider = document.getElementById('colorSlider');
const aspectRatioCheckbox = document.getElementById('aspectRatio');
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
    workCtx.imageSmoothingEnabled = true;
    workCtx.drawImage(currentImage, 0, 0, gw, gh);

    // Apply color reduction (posterize)
    applyPosterize(colorCount);

    // Set output canvas dimensions
    outCanvas.width = gw * scale;
    outCanvas.height = gh * scale;

    // Draw to output canvas with nearest-neighbor scaling
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(workCanvas, 0, 0, gw, gh, 0, 0, gw * scale, gh * scale);
}

// Posterize color reduction algorithm
function applyPosterize(colorCount) {
    const imageData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
    const data = imageData.data;

    // Calculate step size for posterization
    const steps = Math.max(2, colorCount);
    const stepSize = 255 / (steps - 1);

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
        // Posterize each color channel
        data[i] = Math.round(data[i] / stepSize) * stepSize;     // Red
        data[i + 1] = Math.round(data[i + 1] / stepSize) * stepSize; // Green
        data[i + 2] = Math.round(data[i + 2] / stepSize) * stepSize; // Blue
        // Alpha channel (data[i + 3]) remains unchanged
    }

    // Write modified pixel data back
    workCtx.putImageData(imageData, 0, 0);
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
gridSlider.addEventListener('input', render);
scaleSlider.addEventListener('input', render);
colorSlider.addEventListener('input', render);
aspectRatioCheckbox.addEventListener('change', render);
