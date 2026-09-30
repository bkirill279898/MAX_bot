#!/usr/bin/env python3
"""
Bnovo -> Яндекс Алиса (умный дом): сценарии по домам и датчикам.

Логика: для каждого дома/номера смотрим в Bnovo, живёт ли там кто-то сегодня.
  - живут  -> для каждого датчика запускается сценарий "on"  (вкл)
  - пусто  -> для каждого датчика запускается сценарий "off" (выкл)
Сценарий запускается только когда состояние изменилось (или при первом запуске),
поэтому Алиса не дёргается каждую минуту. Состояние хранится в rooms_state.json.

Запуск:
    python termo.py            # работает в цикле, раз в минуту
    python termo.py --once     # одна проверка и выход
    python termo.py --show     # только показать, кто сегодня живёт (Алису не трогает)
    python termo.py --dry      # ничего не запускает, только показывает, что бы сделал
    python termo.py --debug    # подробный вывод ответов Bnovo
    python termo.py --install  # установить как службу (автозапуск, root, Linux)

Секреты берутся из .env рядом со скриптом:
    BNOVO_ID, BNOVO_PASSWORD, YANDEX_TOKEN
"""

import os
import re
import sys
import json
import time
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / "rooms_state.json"

INTERVAL = 60  # секунд между проверками
TIMEZONE = "Europe/Moscow"


# =====================================================================
# ДОМА / НОМЕРА -> ДАТЧИКИ -> СЦЕНАРИИ
# Название дома должно совпадать с названием в Bnovo (поле room_name).
# "on"  = ID сценария "включить",  "off" = ID сценария "выключить".
# Пустая строка "" = сценарий не привязан (пропускается).
# Нужно больше датчиков в доме — скопируйте строку "Датчик N" и поменяйте номер.
# =====================================================================
ROOMS = {
    "Коттедж №1": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Коттедж №2": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Коттедж №3": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Коттедж №4": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Коттедж №5": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Коттедж №6": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №1": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №2": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №3": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №4": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №5": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №6": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

    "Мотель №7": {
        "Датчик 1": {"on": "", "off": ""},
        "Датчик 2": {"on": "", "off": ""},
    },

}


# =====================================================================


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

BNOVO_URL = "https://api.pms.bnovo.ru/api/v1"
YANDEX_URL = "https://api.iot.yandex.net/v1.0"

DEBUG = "--debug" in sys.argv
DRY = "--dry" in sys.argv
ONCE = "--once" in sys.argv
SHOW = "--show" in sys.argv


def now_local() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(TIMEZONE))
    except Exception:
        return datetime.now()


def today_local() -> date:
    return now_local().date()


def norm(name: str) -> str:
    """Нормализация названия для сравнения: регистр и лишние пробелы не важны."""
    return re.sub(r"\s+", " ", str(name or "")).strip().lower()


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
    token = data.get("access_token") or (data.get("data") or {}).get("access_token")
    if not token:
        raise RuntimeError(f"В ответе Bnovo нет access_token: {data}")
    return token


def extract_bookings(payload) -> list:
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


def booking_date(b: dict, kind: str) -> str:
    """kind = 'arrival' | 'departure'. Возвращает YYYY-MM-DD или ''."""
    dates = b.get("dates") if isinstance(b.get("dates"), dict) else {}
    raw = dates.get(kind) or b.get(kind) or b.get(f"{kind}_date") or ""
    return str(raw)[:10]


def is_cancelled(b: dict) -> bool:
    status = b.get("status")
    if isinstance(status, dict):
        status = status.get("name") or status.get("title")
    s = str(status or "").lower()
    return "cancel" in s or "отмен" in s or "annul" in s


def get_bookings(token: str) -> list:
    today_d = today_local()
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
        if not r.ok:
            print(r.text[:3000])
        r.raise_for_status()

        items = extract_bookings(r.json())
        found.extend(items)
        if len(items) < limit:
            break
        offset += limit
        if offset >= 1000:  # предохранитель
            break
    return found


def occupied_rooms(bookings: list) -> set:
    """Множество нормализованных названий домов/номеров, где сегодня кто-то живёт."""
    today = today_local().isoformat()
    result = set()
    for b in bookings:
        if not isinstance(b, dict) or is_cancelled(b):
            continue
        arr, dep = booking_date(b, "arrival"), booking_date(b, "departure")
        if not (arr and dep):
            continue
        # Правило "живут сегодня": заезд <= сегодня <= выезд.
        # Если в день выезда уже нужно считать номер пустым — замените <= dep на < dep.
        if arr <= today <= dep:
            result.add(norm(b.get("room_name")))
    return result


# ---------------------------------------------------------------- Яндекс
def run_yandex_scenario(scenario_id: str) -> bool:
    try:
        r = requests.post(
            f"{YANDEX_URL}/scenarios/{scenario_id}/actions",
            headers={"Authorization": f"Bearer {YANDEX_TOKEN}"},
            timeout=20,
        )
    except requests.RequestException as e:
        print("   Yandex: ошибка сети:", repr(e))
        return False
    print("   Yandex scenario:", r.status_code, r.text[:200])
    return r.ok


# ---------------------------------------------------------------- состояние
def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- основная логика
_token = None


def fetch_bookings_with_relogin() -> list:
    global _token
    if not _token:
        _token = bnovo_auth()
    try:
        return get_bookings(_token)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code in (401, 403):
            _token = bnovo_auth()
            return get_bookings(_token)
        raise


def check_once():
    bookings = fetch_bookings_with_relogin()
    busy = occupied_rooms(bookings)
    print(f"Броней получено: {len(bookings)}, занято сейчас: {len(busy)}")

    known = {norm(r) for r in ROOMS}
    unknown = busy - known
    if unknown:
        print("В Bnovo есть брони на номера, которых нет в ROOMS:", sorted(unknown))

    state = load_state()
    changed = False

    for room, sensors in ROOMS.items():
        want = "on" if norm(room) in busy else "off"
        room_state = state.setdefault(room, {})

        for sensor, scenarios in sensors.items():
            if room_state.get(sensor) == want:
                continue  # уже в нужном состоянии

            scenario_id = (scenarios.get(want) or "").strip()
            label = "ВКЛ" if want == "on" else "ВЫКЛ"

            if not scenario_id:
                # сценарий не привязан — считаем выполненным, чтобы не шуметь каждую минуту
                room_state[sensor] = want
                changed = True
                continue

            print(f"{room} / {sensor}: {label}")
            if DRY:
                print("   [dry] сценарий был бы запущен")
                continue

            if run_yandex_scenario(scenario_id):
                room_state[sensor] = want
                changed = True
            else:
                print("   не удалось, повторим через минуту")

    if changed and not DRY:
        save_state(state)


def show_report():
    """Проверка данных: кто и где сегодня живёт. Ничего не запускает."""
    bookings = fetch_bookings_with_relogin()
    today = today_local().isoformat()

    cancelled, active, other = [], [], []
    for b in bookings:
        if not isinstance(b, dict):
            continue
        if is_cancelled(b):
            cancelled.append(b)
            continue
        arr, dep = booking_date(b, "arrival"), booking_date(b, "departure")
        if arr and dep and arr <= today <= dep:
            active.append(b)
        else:
            other.append(b)

    print(f"\nСегодня: {today}")
    print(f"Получено броней: {len(bookings)} "
          f"(идут сегодня: {len(active)}, не сегодня: {len(other)}, отменённых: {len(cancelled)})")

    print("\n--- Брони, которые идут сегодня ---")
    if not active:
        print("нет")
    for b in sorted(active, key=lambda x: str(x.get("room_name"))):
        cust = b.get("customer") or {}
        status = (b.get("status") or {}).get("name", "?")
        print(f"{str(b.get('room_name')):<16} {booking_date(b, 'arrival')} -> "
              f"{booking_date(b, 'departure')}  {status:<10} {cust.get('surname', '')} {cust.get('name', '')}".rstrip())

    busy = occupied_rooms(bookings)
    known = {norm(r) for r in ROOMS}

    print("\n--- По домам и номерам ---")
    by_cat = {}
    for room in ROOMS:
        is_busy = norm(room) in busy
        cat = room.split(" №")[0]
        by_cat.setdefault(cat, [0, 0])
        by_cat[cat][0 if is_busy else 1] += 1
        print(f"{room:<16} {'ЖИВУТ' if is_busy else 'пусто'}")

    print("\n--- По категориям ---")
    for cat, (b_cnt, e_cnt) in by_cat.items():
        print(f"{cat}: занято {b_cnt}, пусто {e_cnt}")

    unknown = busy - known
    if unknown:
        print("\nВНИМАНИЕ: брони на номера, которых нет в ROOMS:", sorted(unknown))
        print("Проверьте, как они называются в Bnovo, и поправьте ROOMS.")


def install_service():
    """Ставит программу как systemd-службу: автозапуск и перезапуск при сбоях."""
    if os.geteuid() != 0:
        sys.exit("Для --install нужны права root.")
    unit = f"""[Unit]
Description=Bnovo -> Alice scenarios
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
    for cmd in (["systemctl", "daemon-reload"],
                ["systemctl", "enable", "--now", "bnovo-alice"]):
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
        "YANDEX_TOKEN": YANDEX_TOKEN,
    }.items() if not v]
    if missing:
        sys.exit(f"Не заданы переменные: {', '.join(missing)} (см. .env)")

    if SHOW:
        try:
            show_report()
        except Exception as e:
            print("Ошибка:", repr(e))
        return

    total = sum(len(s) * 2 for s in ROOMS.values())
    empty = sum(1 for s in ROOMS.values() for sc in s.values() for k in ("on", "off") if not sc.get(k))
    print(f"Домов/номеров: {len(ROOMS)}, сценариев не привязано: {empty} из {total}")

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