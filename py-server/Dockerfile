FROM python:3.9-slim-bullseye

COPY . /app

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip && \
  pip install --no-cache-dir -r /app/requirements.txt

CMD ["python", "./main.py"]
