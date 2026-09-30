#!/usr/bin/env python3
"""
Bnovo -> Яндекс Алиса (умный дом).

Программа работает сама, без cron: раз в минуту спрашивает Bnovo, и если сегодня
кто-то живёт (есть неотменённая бронь, идущая сегодня) — запускает сценарий Алисы.

Запуск:
    python bnovo_alice.py            # работает в цикле, раз в минуту
    python bnovo_alice.py --once     # одна проверка и выход
    python bnovo_alice.py --dry      # цикл, но Алису не запускает (проверка)
    python bnovo_alice.py --debug    # подробный вывод ответов Bnovo
    python bnovo_alice.py --install  # установить как службу (автозапуск, root, Linux)

Секреты берутся из .env рядом со скриптом:
    BNOVO_ID, BNOVO_PASSWORD, YANDEX_TOKEN, YANDEX_SCENARIO_ID
"""

import os
import sys
import json
import time
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent


# ---------------------------------------------------------------- config
def load_env():
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

BNOVO_ID = os.getenv("BNOVO_ID", "")
BNOVO_PASSWORD = os.getenv("BNOVO_PASSWORD", "")
YANDEX_TOKEN = os.getenv("YANDEX_TOKEN", "")
YANDEX_SCENARIO_ID = os.getenv("YANDEX_SCENARIO_ID", "")

BNOVO_URL = "https://api.pms.bnovo.ru/api/v1"
YANDEX_URL = "https://api.iot.yandex.net/v1.0"

DEBUG = "--debug" in sys.argv
DRY = "--dry" in sys.argv
ONCE = "--once" in sys.argv
INTERVAL = 60  # секунд между проверками
TIMEZONE = "Europe/Moscow"


def now_local() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(TIMEZONE))
    except Exception:
        return datetime.now()


def today_local() -> date:
    return now_local().date()


# ---------------------------------------------------------------- Bnovo
def bnovo_auth() -> str:
    r = requests.post(
        f"{BNOVO_URL}/auth",
        json={"id": int(BNOVO_ID) if BNOVO_ID.isdigit() else BNOVO_ID,
              "password": BNOVO_PASSWORD},
        timeout=20,
    )
    print("Bnovo auth:", r.status_code)
    if DEBUG or not r.ok:
        print(r.text[:1000])
    r.raise_for_status()

    data = r.json()
    # токен может лежать на верхнем уровне или внутри "data"
    token = data.get("access_token") or (data.get("data") or {}).get("access_token")
    if not token:
        raise RuntimeError(f"В ответе Bnovo нет access_token: {data}")
    return token


def extract_bookings(payload) -> list:
    """Достаёт список броней из разных возможных форматов ответа."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("bookings", "items", "results"):
            if isinstance(payload.get(key), list):
                return payload[key]
        data = payload.get("data")
        if data is not None:
            return extract_bookings(data)
    return []


def booking_arrival(b: dict) -> str:
    """Возвращает дату заезда как YYYY-MM-DD (или пустую строку)."""
    dates = b.get("dates") if isinstance(b.get("dates"), dict) else {}
    raw = (
        b.get("arrival")
        or b.get("arrival_date")
        or b.get("date_arrival")
        or b.get("check_in")
        or dates.get("arrival")
        or dates.get("check_in")
        or ""
    )
    return str(raw)[:10]


def is_cancelled(b: dict) -> bool:
    status = b.get("status")
    if isinstance(status, dict):
        status = status.get("name") or status.get("title")
    s = str(status or "").lower()
    return "cancel" in s or "отмен" in s or "annul" in s


def booking_departure(b: dict) -> str:
    dates = b.get("dates") if isinstance(b.get("dates"), dict) else {}
    raw = (
        b.get("departure")
        or b.get("departure_date")
        or b.get("date_departure")
        or b.get("check_out")
        or dates.get("departure")
        or dates.get("check_out")
        or ""
    )
    return str(raw)[:10]


def get_todays_arrivals(token: str) -> list:
    """Брони, которые идут сегодня (заезд <= сегодня <= выезд), кроме отменённых."""
    today_d = today_local()
    today = today_d.isoformat()
    headers = {"Authorization": f"Bearer {token}"}

    found = []
    offset, limit = 0, 50  # у Bnovo максимум 50
    while True:
        r = requests.get(
            f"{BNOVO_URL}/bookings",
            headers=headers,
            params={
                "date_from": (today_d - timedelta(days=60)).isoformat(),
                "date_to": (today_d + timedelta(days=1)).isoformat(),
                "limit": limit,
                "offset": offset,
            },
            timeout=20,
        )
        print("Bnovo bookings:", r.status_code)
        if DEBUG or not r.ok:
            print(r.text[:3000])
        r.raise_for_status()

        items = extract_bookings(r.json())
        found.extend(items)
        if len(items) < limit:
            break
        offset += limit
        if offset >= 1000:  # предохранитель
            break

    active = []
    for b in found:
        if not isinstance(b, dict) or is_cancelled(b):
            continue
        arr, dep = booking_arrival(b), booking_departure(b)
        if arr and dep:
            if arr <= today <= dep:
                active.append(b)
        else:
            # даты не распознали — для теста считаем бронь подходящей
            active.append(b)

    print(f"Всего получено броней: {len(found)}, идут сегодня: {len(active)}")
    return active


# ---------------------------------------------------------------- Яндекс
def run_yandex_scenario():
    r = requests.post(
        f"{YANDEX_URL}/scenarios/{YANDEX_SCENARIO_ID}/actions",
        headers={"Authorization": f"Bearer {YANDEX_TOKEN}"},
        timeout=20,
    )
    print("Yandex scenario:", r.status_code, r.text)
    r.raise_for_status()


# ---------------------------------------------------------------- main
_token = None


def check_once():
    global _token

    if not _token:
        _token = bnovo_auth()
    try:
        active = get_todays_arrivals(_token)
    except requests.HTTPError as e:
        # токен мог протухнуть — авторизуемся заново и повторяем
        if e.response is not None and e.response.status_code in (401, 403):
            _token = bnovo_auth()
            active = get_todays_arrivals(_token)
        else:
            raise

    if not active:
        print("Активных броней на сегодня нет — сценарий не запускаем.")
        return

    if DEBUG:
        print(json.dumps(active[0], ensure_ascii=False, indent=2)[:2000])

    if DRY:
        print("[dry] Есть активные брони — сценарий был бы запущен.")
        return

    run_yandex_scenario()
    print("Готово: сценарий запущен.")


def install_service():
    """Ставит программу как systemd-службу: автозапуск при старте сервера и перезапуск при сбоях."""
    if os.geteuid() != 0:
        sys.exit("Для --install нужны права root.")
    unit = f"""[Unit]
Description=Bnovo -> Alice scenario
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory={BASE_DIR}
ExecStart={sys.executable} {Path(__file__).resolve()}
Restart=always
RestartSec=10
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
"""
    Path("/etc/systemd/system/bnovo-alice.service").write_text(unit)
    for cmd in (
        ["systemctl", "daemon-reload"],
        ["systemctl", "enable", "--now", "bnovo-alice"],
    ):
        subprocess.run(cmd, check=True)
    print("Служба установлена и запущена.")
    print("Логи:      journalctl -u bnovo-alice -f")
    print("Остановка: systemctl stop bnovo-alice")


def main():
    if "--install" in sys.argv:
        install_service()
        return

    missing = [n for n, v in {
        "BNOVO_ID": BNOVO_ID, "BNOVO_PASSWORD": BNOVO_PASSWORD,
        "YANDEX_TOKEN": YANDEX_TOKEN, "YANDEX_SCENARIO_ID": YANDEX_SCENARIO_ID,
    }.items() if not v]
    if missing:
        sys.exit(f"Не заданы переменные: {', '.join(missing)} (см. .env)")

    while True:
        print("\n=== Проверка:", now_local().strftime("%Y-%m-%d %H:%M:%S"), "===", flush=True)
        try:
            check_once()
        except Exception as e:  # сеть/сервер недоступны — не падаем, попробуем через минуту
            print("Ошибка:", repr(e), flush=True)
        if ONCE:
            break
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()