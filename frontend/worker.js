// frontend/worker.js – с постобработкой после модели
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');

let model = null;
let abortFlag = false;
const MODEL_URL = '/static/model/model.json';

async function loadModel() {
    if (model) return model;
    self.postMessage({ type: 'progress', progress: 10 });
    try {
        model = await tf.loadLayersModel(MODEL_URL);
        console.log('LayersModel загружен');
    } catch (e) {
        model = await tf.loadGraphModel(MODEL_URL);
        console.log('GraphModel загружен');
    }
    self.postMessage({ type: 'progress', progress: 30 });
    return model;
}

function resizeImageDataPreserveAspect(imageData, targetSize) {
    const canvas = new OffscreenCanvas(targetSize, targetSize);
    const ctx = canvas.getContext('2d');
    const tempCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, targetSize, targetSize);
    return ctx.getImageData(0, 0, targetSize, targetSize);
}

// Постобработка: контраст, насыщенность, резкость
function enhanceImage(imageData) {
    const data = imageData.data;
    const out = new Uint8ClampedArray(data);
    const width = imageData.width;
    const height = imageData.height;

    // Параметры усиления (можно менять)
    const contrast = 1.25;      // >1 увеличивает контраст
    const saturation = 1.3;     // >1 увеличивает насыщенность
    const brightness = 10;      // добавляем яркость (0-50)
    const sharpness = 0.8;      // сила резкости (0-1)

    // 1. Яркость, контраст, насыщенность
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        // Яркость
        r = Math.min(255, Math.max(0, r + brightness));
        g = Math.min(255, Math.max(0, g + brightness));
        b = Math.min(255, Math.max(0, b + brightness));
        // Контраст
        r = 128 + (r - 128) * contrast;
        g = 128 + (g - 128) * contrast;
        b = 128 + (b - 128) * contrast;
        // Насыщенность
        const gray = 0.299*r + 0.587*g + 0.114*b;
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;
        out[i] = Math.min(255, Math.max(0, r));
        out[i+1] = Math.min(255, Math.max(0, g));
        out[i+2] = Math.min(255, Math.max(0, b));
        out[i+3] = data[i+3];
    }

    // 2. Повышение резкости (unsharp mask) – если sharpness > 0
    if (sharpness > 0) {
        const sharpData = new Uint8ClampedArray(out);
        const kernel = [1/16, 2/16, 1/16, 2/16, 4/16, 2/16, 1/16, 2/16, 1/16];
        for (let y = 1; y < height-1; y++) {
            for (let x = 1; x < width-1; x++) {
                for (let c = 0; c < 3; c++) {
                    let blur = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y+ky)*width + (x+kx))*4 + c;
                            blur += sharpData[idx] * kernel[(ky+1)*3 + (kx+1)];
                        }
                    }
                    const idx = (y*width + x)*4 + c;
                    let sharp = sharpData[idx] + sharpness * (sharpData[idx] - blur);
                    out[idx] = Math.min(255, Math.max(0, sharp));
                }
                out[(y*width + x)*4 + 3] = sharpData[(y*width + x)*4 + 3];
            }
        }
    }

    return new ImageData(out, width, height);
}

self.onmessage = async (event) => {
    const { type, imageData } = event.data;
    if (type === 'abort') { abortFlag = true; return; }
    if (type === 'process') {
        abortFlag = false;
        try {
            self.postMessage({ type: 'progress', progress: 5 });

            const model = await loadModel();
            if (abortFlag) { self.postMessage({ type: 'aborted' }); return; }

            const origW = imageData.width, origH = imageData.height;
            const TARGET = 256;

            const resized = resizeImageDataPreserveAspect(imageData, TARGET);
            const { width, height, data } = resized;

            const floatData = new Float32Array(data.length);
            for (let i = 0; i < data.length; i++) floatData[i] = data[i] / 255.0;

            let tensor = tf.tensor(floatData, [height, width, 4], 'float32');
            tensor = tensor.slice([0, 0, 0], [height, width, 3]);
            tensor = tensor.expandDims(0);

            self.postMessage({ type: 'progress', progress: 50 });
            if (abortFlag) { tf.dispose(tensor); self.postMessage({ type: 'aborted' }); return; }

            const output = model.predict(tensor);
            self.postMessage({ type: 'progress', progress: 75 });
            if (abortFlag) { tf.dispose([tensor, output]); self.postMessage({ type: 'aborted' }); return; }

            const squeezed = output.squeeze();
            const smallCanvas = new OffscreenCanvas(TARGET, TARGET);
            await tf.browser.toPixels(squeezed, smallCanvas);
            self.postMessage({ type: 'progress', progress: 85 });

            // Масштабируем до исходного размера
            const resultCanvas = new OffscreenCanvas(origW, origH);
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(smallCanvas, 0, 0, origW, origH);

            // Применяем постобработку (усиление контраста, насыщенности, резкости)
            const rawImageData = ctx.getImageData(0, 0, origW, origH);
            const enhanced = enhanceImage(rawImageData);
            ctx.putImageData(enhanced, 0, 0);

            const blob = await resultCanvas.convertToBlob({ type: 'image/png' });
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });

            tf.dispose([tensor, output, squeezed]);
            self.postMessage({ type: 'progress', progress: 100 });
            self.postMessage({ type: 'result', data: dataUrl });

        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
            console.error('Worker ошибка:', error);
        }
    }
};