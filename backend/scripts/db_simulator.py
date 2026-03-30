"""
DB Simulator — Writes sensor data directly to TimescaleDB (no MQTT needed).
Works on Windows without asyncio issues.

Usage:
    python -m scripts.db_simulator --mode healthy
    python -m scripts.db_simulator --mode degrading
"""

import argparse
import math
import random
import time
from datetime import datetime, timezone

import psycopg2

DEV_TENANT_ID = "a0000000-0000-0000-0000-000000000001"
DB_URL = "postgresql://factorybrain:changeme@localhost:5432/factorybrain"


def generate_vibesense(node_id: str, mode: str, elapsed: float) -> dict:
    t = elapsed
    base_rms = 1.5 + 0.3 * math.sin(t / 60)
    base_freq = 42.0
    base_crest = 3.0

    if mode == "degrading":
        d = min(t / 3600, 1.0)
        base_rms += d * 2.5
        base_freq += d * 8
        base_crest += d * 2
    elif mode == "faulty":
        base_rms = 5.0 + random.uniform(-0.5, 0.5)
        base_freq = 55.0 + random.uniform(-3, 3)
        base_crest = 6.0 + random.uniform(-0.5, 0.5)

    rms_x = base_rms + random.gauss(0, 0.15)
    rms_y = base_rms * 0.7 + random.gauss(0, 0.1)
    rms_z = base_rms * 0.5 + random.gauss(0, 0.08)
    anomaly = max(0, min(1, (rms_x - 2.5) / 3.0))
    temp = 55 + random.gauss(0, 3)
    if mode == "faulty":
        temp += 5

    return {
        "node_id": node_id,
        "node_type": "vibesense",
        "vib_rms_x": round(rms_x, 3),
        "vib_rms_y": round(rms_y, 3),
        "vib_rms_z": round(rms_z, 3),
        "dominant_freq": round(base_freq + random.gauss(0, 0.5), 1),
        "crest_factor": round(base_crest + random.gauss(0, 0.2), 2),
        "anomaly_score": round(anomaly, 4),
        "temperature_1": round(temp, 1),
        "current_rms": round(8.0 + rms_x * 1.5 + random.gauss(0, 0.3), 2),
    }


def generate_energysense(node_id: str, elapsed: float) -> dict:
    hour = datetime.now().hour + datetime.now().minute / 60
    solar_peak = 4200
    solar = max(0, solar_peak * math.sin(math.pi * (hour - 6) / 12)) if 6 < hour < 18 else 0
    solar += random.gauss(0, solar * 0.05) if solar > 0 else 0

    base_load = 350
    morning_peak = 800 * max(0, 1 - abs(hour - 8)) if 7 < hour < 9 else 0
    evening_peak = 800 * max(0, 1 - abs(hour - 19) / 2) if 17 < hour < 21 else 0
    total_consumption = base_load + morning_peak + evening_peak + random.gauss(0, 30)
    grid = total_consumption - solar

    return {
        "node_id": node_id,
        "node_type": "energysense",
        "grid_power_w": round(grid, 1),
        "solar_power_w": round(max(0, solar), 1),
        "channel_1_w": round(total_consumption * 0.4 + random.gauss(0, 10), 1),
        "channel_2_w": round(total_consumption * 0.25 + random.gauss(0, 8), 1),
        "channel_3_w": round(total_consumption * 0.2 + random.gauss(0, 5), 1),
        "channel_4_w": round(total_consumption * 0.15 + random.gauss(0, 3), 1),
        "voltage_v": round(230 + random.gauss(0, 2), 1),
        "power_factor": round(0.92 + random.gauss(0, 0.02), 3),
    }


def insert_reading(cursor, reading: dict):
    now = datetime.now(timezone.utc)
    cursor.execute(
        """
        INSERT INTO sensor_readings (
            time, tenant_id, node_id, node_type,
            vib_rms_x, vib_rms_y, vib_rms_z,
            dominant_freq, crest_factor, anomaly_score,
            temperature_1, current_rms, energy_kwh,
            grid_power_w, solar_power_w,
            channel_1_w, channel_2_w, channel_3_w, channel_4_w,
            voltage_v, power_factor
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        """,
        (
            now,
            DEV_TENANT_ID,
            reading["node_id"],
            reading["node_type"],
            reading.get("vib_rms_x"),
            reading.get("vib_rms_y"),
            reading.get("vib_rms_z"),
            reading.get("dominant_freq"),
            reading.get("crest_factor"),
            reading.get("anomaly_score"),
            reading.get("temperature_1"),
            reading.get("current_rms"),
            reading.get("energy_kwh"),
            reading.get("grid_power_w"),
            reading.get("solar_power_w"),
            reading.get("channel_1_w"),
            reading.get("channel_2_w"),
            reading.get("channel_3_w"),
            reading.get("channel_4_w"),
            reading.get("voltage_v"),
            reading.get("power_factor"),
        ),
    )


def main():
    parser = argparse.ArgumentParser(description="FactoryBrain DB Simulator")
    parser.add_argument("--mode", choices=["healthy", "degrading", "faulty"], default="healthy")
    parser.add_argument("--interval", type=float, default=5.0)
    args = parser.parse_args()

    machines = [
        ("VS-001", args.mode),
        ("VS-002", "healthy"),
        ("VS-003", "healthy" if args.mode != "faulty" else "degrading"),
    ]

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    print(f"[SIM] DB Simulator started - mode: {args.mode}, interval: {args.interval}s")
    print(f"      Writing directly to TimescaleDB")
    print(f"      Simulating {len(machines)} VibeSense + 1 EnergySense")
    print()

    start = time.time()
    try:
        while True:
            elapsed = time.time() - start

            for node_id, mode in machines:
                reading = generate_vibesense(node_id, mode, elapsed)
                insert_reading(cursor, reading)
                status = "[OK]" if mode == "healthy" else "[WARN]" if mode == "degrading" else "[CRIT]"
                print(
                    f"  {status} {node_id}: "
                    f"vib={reading['vib_rms_x']:.2f} "
                    f"anomaly={reading['anomaly_score']:.3f} "
                    f"temp={reading['temperature_1']}C"
                )

            energy = generate_energysense("ES-001", elapsed)
            insert_reading(cursor, energy)
            print(
                f"  [NRG] ES-001: "
                f"solar={energy['solar_power_w']:.0f}W "
                f"grid={energy['grid_power_w']:.0f}W"
            )

            print(f"  --- tick {int(elapsed)}s ---")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\nSimulator stopped.")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
