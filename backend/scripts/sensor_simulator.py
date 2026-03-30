"""
Sensor Simulator — Generates realistic VibeSense & EnergySense telemetry.

Usage:
    python -m scripts.sensor_simulator --mode healthy
    python -m scripts.sensor_simulator --mode degrading
    python -m scripts.sensor_simulator --mode faulty
"""

import argparse
import asyncio
import json
import math
import random
import time
from datetime import datetime, timezone

import aiomqtt


DEV_TENANT_ID = "a0000000-0000-0000-0000-000000000001"


def generate_vibesense_reading(
    node_id: str, machine_id: str, mode: str, elapsed_s: float
) -> dict:
    """Generate a realistic vibration sensor reading."""
    t = elapsed_s

    # Baseline vibration (healthy machine)
    base_rms = 1.5 + 0.3 * math.sin(t / 60)  # Slow oscillation
    base_freq = 42.0  # Normal dominant frequency (bearing characteristic)
    base_crest = 3.0

    if mode == "degrading":
        # Gradual increase over time (simulates bearing wear)
        degradation = min(t / 3600, 1.0)  # 0→1 over 1 hour
        base_rms += degradation * 2.5
        base_freq += degradation * 8  # Frequency shifts as bearing degrades
        base_crest += degradation * 2

    elif mode == "faulty":
        # Severe vibration with spikes
        base_rms = 5.0 + random.gauss(0, 1.5)
        base_freq = 47.5 + random.gauss(0, 3)
        base_crest = 7.0 + random.gauss(0, 1)
        # Occasional extreme spikes
        if random.random() < 0.05:
            base_rms *= 2

    # Add realistic noise
    rms_x = max(0, base_rms + random.gauss(0, 0.15))
    rms_y = max(0, (base_rms * 0.8) + random.gauss(0, 0.12))
    rms_z = max(0, (base_rms * 1.2) + random.gauss(0, 0.18))

    # Anomaly score: simple threshold-based for simulator
    anomaly = max(0, min(1, (rms_x - 2.5) / 3.0))

    # Power consumption
    base_current = 12.0 + random.gauss(0, 0.3)
    if mode == "faulty":
        base_current *= 1.15  # Faulty machines draw more power

    return {
        "ts": int(time.time()),
        "tenant_id": DEV_TENANT_ID,
        "node_id": node_id,
        "node_type": "vibesense",
        "machine_id": machine_id,
        "vibration": {
            "rms_x": round(rms_x, 3),
            "rms_y": round(rms_y, 3),
            "rms_z": round(rms_z, 3),
            "dominant_freq": round(base_freq + random.gauss(0, 0.5), 1),
            "crest_factor": round(max(1, base_crest + random.gauss(0, 0.3)), 2),
            "anomaly_score": round(anomaly, 3),
        },
        "power": {
            "current_rms": round(base_current, 2),
            "power_factor": round(0.85 + random.gauss(0, 0.02), 3),
            "energy_kwh": round(base_current * 0.4 * (1 / 60), 4),
        },
        "temp": round(55 + random.gauss(0, 3) + (5 if mode == "faulty" else 0), 1),
        "uptime": int(elapsed_s),
        "fw_version": "1.0.0",
    }


def generate_energysense_reading(node_id: str, elapsed_s: float) -> dict:
    """Generate a realistic home energy reading."""
    hour = datetime.now().hour + (elapsed_s / 3600)
    hour_of_day = hour % 24

    # Solar production (bell curve peaking at noon)
    solar_peak = 4200  # 4.2 kWp system
    if 6 < hour_of_day < 20:
        solar = solar_peak * math.exp(-0.5 * ((hour_of_day - 13) / 3) ** 2)
        solar *= (0.85 + random.gauss(0, 0.1))  # Cloud variation
    else:
        solar = 0

    # House consumption (baseline + patterns)
    base_load = 350 + random.gauss(0, 50)  # Always-on: fridge, standby, etc.
    if 7 < hour_of_day < 9 or 17 < hour_of_day < 21:
        base_load += 800 + random.gauss(0, 200)  # Morning/evening peaks

    grid = base_load - solar  # Positive = import, negative = export
    surplus = max(0, -grid)

    return {
        "ts": int(time.time()),
        "tenant_id": DEV_TENANT_ID,
        "node_id": node_id,
        "node_type": "energysense",
        "grid_power_w": round(grid, 1),
        "solar_power_w": round(max(0, solar), 1),
        "channel_1_w": round(random.choice([0, 0, 0, 2000]) if surplus > 1500 else 0, 0),
        "channel_2_w": 0,
        "channel_3_w": 0,
        "channel_4_w": 0,
        "voltage_v": round(230 + random.gauss(0, 2), 1),
        "temp": round(20 + random.gauss(0, 1), 1),
        "power": {"power_factor": round(0.95 + random.gauss(0, 0.02), 3)},
    }


async def run_simulator(mode: str, interval: float):
    """Publish simulated sensor data to MQTT."""
    start = time.time()

    machines = [
        ("VS-001", "EXT-01", mode),
        ("VS-002", "EXT-02", "healthy"),
        ("VS-003", "PRT-01", "healthy" if mode != "faulty" else "degrading"),
    ]

    print(f"[SIM] Sensor simulator started - mode: {mode}, interval: {interval}s")
    print(f"      Publishing to MQTT at localhost:1883")
    print(f"      Simulating {len(machines)} VibeSense nodes + 1 EnergySense node")
    print()

    async with aiomqtt.Client(hostname="localhost", port=1883) as client:
        while True:
            elapsed = time.time() - start

            # VibeSense nodes
            for node_id, machine_id, node_mode in machines:
                reading = generate_vibesense_reading(node_id, machine_id, node_mode, elapsed)
                topic = f"factory/{DEV_TENANT_ID}/machine/{machine_id}/telemetry"
                await client.publish(topic, json.dumps(reading))

                status = "[OK]" if node_mode == "healthy" else "[WARN]" if node_mode == "degrading" else "[CRIT]"
                print(
                    f"  {status} {node_id}: "
                    f"vib={reading['vibration']['rms_x']:.2f} "
                    f"freq={reading['vibration']['dominant_freq']} "
                    f"anomaly={reading['vibration']['anomaly_score']:.3f} "
                    f"temp={reading['temp']}C"
                )

            # EnergySense node
            energy = generate_energysense_reading("ES-001", elapsed)
            await client.publish(f"home/{DEV_TENANT_ID}/telemetry", json.dumps(energy))
            solar_icon = "[SUN]" if energy["solar_power_w"] > 100 else "[MOON]"
            grid_icon = "[DOWN]" if energy["grid_power_w"] > 0 else "[UP]"
            print(
                f"  {solar_icon} ES-001: "
                f"solar={energy['solar_power_w']:.0f}W "
                f"{grid_icon} grid={energy['grid_power_w']:.0f}W"
            )

            print(f"  --- tick {int(elapsed)}s ---")
            await asyncio.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="FactoryBrain Sensor Simulator")
    parser.add_argument(
        "--mode",
        choices=["healthy", "degrading", "faulty"],
        default="healthy",
        help="Simulation mode for the primary machine",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Seconds between readings (default: 5)",
    )
    args = parser.parse_args()

    # Windows needs SelectorEventLoop for aiomqtt compatibility
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_simulator(args.mode, args.interval))


if __name__ == "__main__":
    main()
