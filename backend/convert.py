import tensorflow as tf
import tensorflowjs as tfjs

# Загружаем модель без компиляции (чтобы избежать ошибок десериализации метрик)
model = tf.keras.models.load_model('enhance_model.h5', compile=False)
print("✅ Модель загружена")

# Конвертируем в TensorFlow.js
tfjs.converters.save_keras_model(model, '../frontend/model')
print("✅ Модель сконвертирована в папку ../frontend/model")