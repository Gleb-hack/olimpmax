import json
import os
import requests
import csv
import io
from flask import Flask, request, jsonify

app = Flask(__name__)

# ===== НАСТРОЙКИ (из переменных окружения) =====
YANDEX_API_KEY = os.environ.get("YANDEX_API_KEY")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "b1g7eid7pb24mhqm8k49")
YANDEX_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
GOOGLE_SHEET_CSV_URL = os.environ.get("GOOGLE_SHEET_CSV_URL")
MAX_BOT_TOKEN = os.environ.get("MAX_BOT_TOKEN")

# ===== ЗАГРУЗКА СПИСКА ИЗ GOOGLE ТАБЛИЦЫ =====
def load_olympiads():
    try:
        response = requests.get(GOOGLE_SHEET_CSV_URL, timeout=15)
        response.raise_for_status()
        csv_file = io.StringIO(response.text)
        reader = csv.DictReader(csv_file)
        result = []
        for row in reader:
            if not row.get('name'):
                continue
            subjects = [s.strip() for s in row.get('subject', '').split(',')]
            result.append({
                'name': row.get('name', ''),
                'subjects': subjects,
                'classes': row.get('classes', ''),
                'level': row.get('level', ''),
                'url': row.get('url', '')
            })
        return result
    except Exception as e:
        print(f"Ошибка загрузки Google Таблицы: {e}")
        return []

olympiads = load_olympiads()

olympiads_text = "\n".join([
    f"{i+1}. {o['name']} | Предметы: {', '.join(o['subjects'])} | Классы: {o['classes']} | Уровень: {o['level']} | Ссылка: {o['url']}"
    for i, o in enumerate(olympiads)
])

SYSTEM_PROMPT = (
    "Ты — помощник по подбору олимпиад для школьников. "
    "Пользователь описывает свои интересы и класс. "
    "Ты должен порекомендовать 1-3 олимпиады из списка ниже, "
    "объяснить, почему они подходят, и напомнить про дедлайны. "
    "Если в списке нет подходящей олимпиады, честно скажи об этом. "
    f"Список олимпиад:\n{olympiads_text}\n"
    "Отвечай дружелюбно и по-русски. "
    "ВАЖНО: не используй Markdown, звёздочки, решётки или другие спецсимволы. "
    "Пиши обычным текстом, используй только переносы строк и цифры для списков."
)

# ===== API ДЛЯ МИНИ-ПРИЛОЖЕНИЯ =====
@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        user_message = request.json.get('message', '')

        messages = [
            {"role": "system", "text": SYSTEM_PROMPT},
            {"role": "user", "text": user_message}
        ]

        response = requests.post(
            YANDEX_URL,
            headers={
                "Authorization": f"Api-Key {YANDEX_API_KEY}",
                "x-folder-id": YANDEX_FOLDER_ID,
                "Content-Type": "application/json"
            },
            json={
                "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt-lite",
                "completionOptions": {
                    "stream": False,
                    "temperature": 0.6,
                    "maxTokens": 1500
                },
                "messages": messages
            },
            timeout=30
        )

        data = response.json()
        if 'result' in data:
            bot_reply = data['result']['alternatives'][0]['message']['text']
        else:
            bot_reply = f"Ошибка API: {data}"

        return jsonify({"reply": bot_reply})

    except Exception as e:
        return jsonify({"reply": f"Ошибка: {str(e)}"}), 500

# ===== WEBHOOK ДЛЯ ЧАТ-БОТА MAX =====
@app.route('/webhook', methods=['POST'])
def webhook():
    """Принимаем события от MAX и отвечаем 200."""
    try:
        data = request.json
        print("Получено событие от MAX:", data)

        # Проверяем, что пришло сообщение
        if data.get("update_type") == "message_created":
            message = data.get("message", {})
            text = message.get("body", {}).get("text", "")
            chat_id = message.get("chat", {}).get("chat_id")
            user_id = message.get("sender", {}).get("user_id")

            if text and chat_id and MAX_BOT_TOKEN:
                # Отправляем ответ через MAX API
                reply_text = f"Привет! Я получил твоё сообщение: «{text}». Загляни в мини-приложение, чтобы подобрать олимпиаду."
                send_max_message(chat_id, reply_text)

    except Exception as e:
        print(f"Ошибка обработки webhook: {e}")

    return jsonify({"ok": True}), 200

def send_max_message(chat_id, text):
    """Отправка сообщения через MAX Bot API."""
    try:
        requests.post(
            "https://platform-api2.max.ru/messages",
            params={"chat_id": chat_id},
            headers={
                "Authorization": MAX_BOT_TOKEN,
                "Content-Type": "application/json"
            },
            json={"text": text},
            timeout=10
        )
    except Exception as e:
        print(f"Ошибка отправки сообщения: {e}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
