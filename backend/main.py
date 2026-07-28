import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import aiofiles
from pathlib import Path
from fastapi.staticfiles import StaticFiles

# Определяем абсолютный путь к папке frontend (на уровень выше от backend)
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# Монтируем статику
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("storage/uploads", exist_ok=True)
os.makedirs("storage/results", exist_ok=True)

tasks: Dict[str, dict] = {}

app.mount("/static", StaticFiles(directory="../frontend"), name="static")

@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    task_id = str(uuid.uuid4())
    file_path = f"storage/uploads/{task_id}.jpg"
    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)
    tasks[task_id] = {
        "status": "uploaded",
        "progress": 0,
        "original_path": file_path,
        "result_path": None
    }
    return {"taskId": task_id}

@app.get("/api/image/{task_id}")
async def get_image(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    file_path = tasks[task_id]["original_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(file_path)

@app.post("/api/progress/{task_id}")
async def update_progress(task_id: str, progress: int = Form(...)):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    tasks[task_id]["progress"] = progress
    tasks[task_id]["status"] = "processing" if progress < 100 else "processing_done"
    return {"ok": True}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@app.post("/api/result/{task_id}")
async def upload_result(task_id: str, file: UploadFile = File(...)):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    result_path = f"storage/results/{task_id}.jpg"
    async with aiofiles.open(result_path, "wb") as f:
        content = await file.read()
        await f.write(content)
    tasks[task_id]["result_path"] = result_path
    tasks[task_id]["status"] = "completed"
    return {"ok": True}

@app.get("/api/download/{task_id}")
async def download_result(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    result_path = tasks[task_id]["result_path"]
    if not result_path or not os.path.exists(result_path):
        raise HTTPException(status_code=404, detail="Result not ready or not found")
    return FileResponse(result_path, filename=f"enhanced_{task_id}.jpg")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)