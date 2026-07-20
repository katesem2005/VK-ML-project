import os
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.model_selection import train_test_split
import cv2

BEFORE_DIR = "../dataset/low"
AFTER_DIR = "../dataset/high"
IMG_SIZE = 256
BATCH_SIZE = 4
EPOCHS = 40

def load_images(before_dir, after_dir, size=IMG_SIZE):
    before_files = sorted([f for f in os.listdir(before_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    after_files = sorted([f for f in os.listdir(after_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    X, y = [], []
    for b_name, a_name in zip(before_files, after_files):
        b_path = os.path.join(before_dir, b_name)
        a_path = os.path.join(after_dir, a_name)
        img_b = cv2.imread(b_path)
        if img_b is None: continue
        img_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2RGB)
        img_b = cv2.resize(img_b, (size, size)) / 255.0
        img_a = cv2.imread(a_path)
        if img_a is None: continue
        img_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2RGB)
        img_a = cv2.resize(img_a, (size, size)) / 255.0
        X.append(img_b); y.append(img_a)
    return np.array(X), np.array(y)

print("Загрузка...")
X, y = load_images(BEFORE_DIR, AFTER_DIR)
print(f"Загружено {len(X)} пар")
if len(X) == 0:
    raise ValueError("Нет изображений!")

X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

def create_model():
    inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    c1 = layers.Conv2D(32, 3, activation='relu', padding='same')(inputs)
    c1 = layers.Conv2D(32, 3, activation='relu', padding='same')(c1)
    p1 = layers.MaxPooling2D(2)(c1)
    c2 = layers.Conv2D(64, 3, activation='relu', padding='same')(p1)
    c2 = layers.Conv2D(64, 3, activation='relu', padding='same')(c2)
    p2 = layers.MaxPooling2D(2)(c2)
    c3 = layers.Conv2D(128, 3, activation='relu', padding='same')(p2)
    c3 = layers.Conv2D(128, 3, activation='relu', padding='same')(c3)
    p3 = layers.MaxPooling2D(2)(c3)
    c4 = layers.Conv2D(256, 3, activation='relu', padding='same')(p3)
    c4 = layers.Conv2D(256, 3, activation='relu', padding='same')(c4)
    u5 = layers.UpSampling2D(2)(c4)
    u5 = layers.concatenate([u5, c3])
    c5 = layers.Conv2D(128, 3, activation='relu', padding='same')(u5)
    c5 = layers.Conv2D(128, 3, activation='relu', padding='same')(c5)
    u6 = layers.UpSampling2D(2)(c5)
    u6 = layers.concatenate([u6, c2])
    c6 = layers.Conv2D(64, 3, activation='relu', padding='same')(u6)
    c6 = layers.Conv2D(64, 3, activation='relu', padding='same')(c6)
    u7 = layers.UpSampling2D(2)(c6)
    u7 = layers.concatenate([u7, c1])
    c7 = layers.Conv2D(32, 3, activation='relu', padding='same')(u7)
    c7 = layers.Conv2D(32, 3, activation='relu', padding='same')(c7)
    outputs = layers.Conv2D(3, 3, activation='sigmoid', padding='same')(c7)
    model = keras.Model(inputs, outputs)
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    return model

model = create_model()
model.summary()

history = model.fit(X_train, y_train, validation_data=(X_val, y_val),
                    epochs=EPOCHS, batch_size=BATCH_SIZE, verbose=1)

model.save("enhance_model.h5")
print("✅ Сохранено")