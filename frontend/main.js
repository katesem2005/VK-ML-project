const uploadInput = document.getElementById('uploadInput');
const originalImage = document.getElementById('originalImage');
const enhancedImage = document.getElementById('enhancedImage');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const downloadBtn = document.getElementById('downloadBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusBtn = document.getElementById('statusBtn');
const statusMessage = document.getElementById('statusMessage');

let currentTaskId = null;
let worker = null;

function createWorker() {
    if (worker) worker.terminate();
    worker = new Worker('worker.js');
    worker.onmessage = async (event) => {
        const msg = event.data;
        if (msg.type === 'progress') {
            progressBar.value = msg.progress;
            progressText.textContent = `${msg.progress}%`;
            if (currentTaskId) {
                const formData = new FormData();
                formData.append('progress', msg.progress);
                await fetch(`/api/progress/${currentTaskId}`, { method: 'POST', body: formData }).catch(console.warn);
            }
        } else if (msg.type === 'result') {
            enhancedImage.src = msg.data;
            downloadBtn.disabled = false;
            cancelBtn.disabled = true;
            progressText.textContent = 'Готово!';
            if (currentTaskId) {
                try {
                    const response = await fetch(msg.data);
                    const blob = await response.blob();
                    const formData = new FormData();
                    formData.append('file', blob, 'enhanced.jpg');
                    await fetch(`/api/result/${currentTaskId}`, { method: 'POST', body: formData });
                    statusMessage.innerHTML = `✅ Результат сохранён. <a href="/api/download/${currentTaskId}" target="_blank">Скачать</a>`;
                } catch (e) {
                    statusMessage.textContent = '❌ Ошибка при загрузке результата на сервер';
                    console.error(e);
                }
            }
        } else if (msg.type === 'error') {
            statusMessage.textContent = `❌ Ошибка: ${msg.error}`;
            progressText.textContent = 'Ошибка';
            cancelBtn.disabled = true;
        } else if (msg.type === 'aborted') {
            statusMessage.textContent = '⏹️ Обработка прервана';
            progressText.textContent = 'Отменено';
            cancelBtn.disabled = true;
        }
    };
    return worker;
}

uploadInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    enhancedImage.src = '#';
    downloadBtn.disabled = true;
    cancelBtn.disabled = true;
    progressBar.value = 0;
    progressText.textContent = '0%';
    statusMessage.textContent = 'Загрузка...';
    currentTaskId = null;

    try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadResponse.ok) throw new Error('Ошибка загрузки на сервер');
        const data = await uploadResponse.json();
        currentTaskId = data.taskId;
        statusMessage.textContent = `Задача создана. ID: ${currentTaskId}`;

        const imageResponse = await fetch(`/api/image/${currentTaskId}`);
        if (!imageResponse.ok) throw new Error('Не удалось получить изображение с сервера');
        const blob = await imageResponse.blob();
        const imageUrl = URL.createObjectURL(blob);

        originalImage.src = imageUrl;
        originalImage.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = originalImage.naturalWidth;
            canvas.height = originalImage.naturalHeight;
            ctx.drawImage(originalImage, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            if (!worker) createWorker();
            cancelBtn.disabled = false;
            worker.postMessage({ type: 'process', imageData: imageData });
        };
    } catch (error) {
        statusMessage.textContent = `❌ ${error.message}`;
        console.error(error);
    }
});

cancelBtn.addEventListener('click', () => {
    if (worker) {
        worker.postMessage({ type: 'abort' });
        cancelBtn.disabled = true;
        statusMessage.textContent = '⏹️ Отмена запрошена...';
    }
});

downloadBtn.addEventListener('click', () => {
    if (currentTaskId) window.open(`/api/download/${currentTaskId}`, '_blank');
});

statusBtn.addEventListener('click', async () => {
    if (!currentTaskId) { statusMessage.textContent = 'Нет активной задачи'; return; }
    try {
        const response = await fetch(`/api/status/${currentTaskId}`);
        const status = await response.json();
        statusMessage.innerHTML = `Статус: ${status.status}, Прогресс: ${status.progress}%`;
    } catch (e) {
        statusMessage.textContent = 'Ошибка получения статуса';
    }
});

createWorker();