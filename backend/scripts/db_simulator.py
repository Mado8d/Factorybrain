"""
DB Simulator — Writes sensor data directly to TimescaleDB (no MQTT needed).
Works on Windows without asyncio issues.

Usage:
    python -m scripts.db_simulator --mode healthy
    python -m scripts.db_simulator --mode degrading
    python -m scripts.db_simulator --backfill 7 --mode healthy
    python -m scripts.db_simulator --duration 60 --mode healthy
"""

import argparse
import math
import os
import random
import time
from datetime import datetime, timedelta, timezone

import psycopg2

DEV_TENANT_ID = "a0000000-0000-0000-0000-000000000001"
DEFAULT_DB_URL = "postgresql://factorybrain:changeme@localhost:5432/factorybrain"


def get_db_url() -> str:
    """Get database URL from env, stripping asyncpg driver if present."""
    url = os.environ.get("DATABASE_URL", DEFAULT_DB_URL)
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    return url


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


def generate_energysense(node_id: str, elapsed: float, ref_time: datetime = None) -> dict:
    if ref_time is None:
        ref_time = datetime.now()
    hour = ref_time.hour + ref_time.minute / 60
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


def insert_reading(cursor, tenant_id: str, reading: dict, ts: datetime = None):
    if ts is None:
        ts = datetime.now(timezone.utc)
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
            ts,
            tenant_id,
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


def run_backfill(cursor, tenant_id: str, machines: list, days: int, interval: float):
    """Generate historical data for the last N days at the given interval."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    total_seconds = int(days * 86400)
    total_ticks = total_seconds // int(interval)
    readings_per_tick = len(machines) + 1  # machines + 1 EnergySense
    total_readings = total_ticks * readings_per_tick

    print(f"[BACKFILL] Generating {total_readings:,} readings over {days} days "
          f"(interval={interval}s, {total_ticks:,} ticks)")

    count = 0
    elapsed = 0.0
    ts = start
    step = timedelta(seconds=interval)

    while ts < now:
        for node_id, mode in machines:
            reading = generate_vibesense(node_id, mode, elapsed)
            insert_reading(cursor, tenant_id, reading, ts)
            count += 1

        energy = generate_energysense("ES-001", elapsed, ref_time=ts)
        insert_reading(cursor, tenant_id, energy, ts)
        count += 1

        elapsed += interval
        ts += step

        # Progress every 10 000 readings
        if count % 10000 < readings_per_tick:
            pct = count / total_readings * 100 if total_readings > 0 else 100
            print(f"  [{pct:5.1f}%] {count:,} readings written ...")

    print(f"[BACKFILL] Done — {count:,} readings inserted.")
    return count


def main():
    parser = argparse.ArgumentParser(description="FactoryBrain DB Simulator")
    parser.add_argument("--mode", choices=["healthy", "degrading", "faulty"], default="healthy")
    parser.add_argument("--interval", type=float, default=5.0,
                        help="Seconds between readings (default: 5)")
    parser.add_argument("--tenant-id", default=DEV_TENANT_ID,
                        help="Tenant UUID to write data for")
    parser.add_argument("--duration", type=float, default=0,
                        help="Run for N minutes then exit (0 = infinite)")
    parser.add_argument("--backfill", type=int, default=0, metavar="DAYS",
                        help="Generate N days of historical data (30s intervals), then exit. "
                             "Combine with --interval for live simulation after backfill.")
    args = parser.parse_args()

    machines = [
        ("VS-001", args.mode),
        ("VS-002", "healthy"),
        ("VS-003", "healthy" if args.mode != "faulty" else "degrading"),
    ]

    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cursor = conn.cursor()

    print(f"[SIM] DB Simulator started - mode: {args.mode}, interval: {args.interval}s")
    print(f"      Tenant: {args.tenant_id}")
    print(f"      DB: {db_url.split('@')[-1] if '@' in db_url else '(local)'}")
    print(f"      Simulating {len(machines)} VibeSense + 1 EnergySense")

    # ── Backfill phase ──────────────────────────────────────────
    if args.backfill > 0:
        print()
        backfill_interval = 30.0  # fixed 30s for historical data
        run_backfill(cursor, args.tenant_id, machines, args.backfill, backfill_interval)

    # If backfill-only (no duration and default interval unchanged context), decide:
    # Continue to live sim if --interval was explicitly given or --duration set,
    # otherwise just exit after backfill.
    if args.backfill > 0 and args.duration == 0:
        # Check if we should continue to live simulation.
        # Convention: if invoked with --backfill only, exit after backfill.
        # If --backfill + --interval or --duration, continue to live sim.
        # We detect this by checking sys.argv for --interval or --duration.
        import sys
        has_live_args = any(a in sys.argv for a in ("--duration", "--interval"))
        if not has_live_args:
            print("[SIM] Backfill complete, exiting (pass --interval or --duration for live sim).")
            cursor.close()
            conn.close()
            return

    # ── Live simulation phase ───────────────────────────────────
    print()
    deadline = None
    if args.duration > 0:
        deadline = time.time() + args.duration * 60
        print(f"[SIM] Live simulation for {args.duration} minutes")
    else:
        print("[SIM] Live simulation running (Ctrl+C to stop)")
    print()

    start = time.time()
    try:
        while True:
            if deadline and time.time() >= deadline:
                print(f"\n[SIM] Duration reached ({args.duration} min), stopping.")
                break

            elapsed = time.time() - start

            for node_id, mode in machines:
                reading = generate_vibesense(node_id, mode, elapsed)
                insert_reading(cursor, args.tenant_id, reading)
                status = "[OK]" if mode == "healthy" else "[WARN]" if mode == "degrading" else "[CRIT]"
                print(
                    f"  {status} {node_id}: "
                    f"vib={reading['vib_rms_x']:.2f} "
                    f"anomaly={reading['anomaly_score']:.3f} "
                    f"temp={reading['temperature_1']}C"
                )

            energy = generate_energysense("ES-001", elapsed)
            insert_reading(cursor, args.tenant_id, energy)
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
