from flask import Flask

app = Flask(__name__)


@app.route("/")
def home():
    return """
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LoRaMINT Test</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1 { color: #2c3e50; }
            .status {
                background-color: #27ae60;
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                display: inline-block;
            }
        </style>
    </head>
    <body>
        <h1>LoRaMINT Test-Webseite</h1>
        <p class="status">Container laeuft!</p>
        <p>Diese Seite dient zum Testen der Docker- und Traefik-Konfiguration.</p>
    </body>
    </html>
    """


@app.route("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
